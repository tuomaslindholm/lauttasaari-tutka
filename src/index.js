import { config } from "../config.js";
import { fetchOikotie, fetchOikotieDetail, getAuthHeaders } from "./portals/oikotie.js";
import { evaluate, deriveFlags, rejectReasons, score, describeCriteria } from "./filter.js";
import { loadSeen, saveSeen, saveFeed } from "./store.js";
import { notifyNew, notifyText, telegramConfigured } from "./telegram.js";
import { sleep } from "./util.js";

async function collect() {
  const jobs = [];
  if (config.portals.oikotie) jobs.push(["oikotie", fetchOikotie]);

  const all = [];
  for (const [name, fn] of jobs) {
    try {
      const items = await fn();
      console.log(`  ${name}: ${items.length} kohdetta haettu`);
      all.push(...items);
    } catch (e) {
      // Yhden portaalin hajoaminen ei kaada muita.
      console.error(`  ${name}: VIRHE — ${e.message}`);
    }
  }
  return all;
}

// Deduplikointi: sama asunto voi olla monessa portaalissa.
// Avain = katuosoite (ennen ensimmäistä pilkkua, ilman kaupunkia/kaupunginosaa)
// + neliöt pyöristettynä. Yhdistetään vain PORTAALIEN välillä: saman portaalin kaksi
// ilmoitusta samasta osoitteesta ja koosta ovat usein eri asuntoja (saman talon
// samanlaiset huoneistot, kun huoneistonumeroa ei ilmoiteta).
function dedupeKey(l) {
  const street = (l.address || "").split(",")[0].toLowerCase().replace(/[^a-zåäö0-9]/g, "");
  const size = l.size != null ? Math.round(l.size) : "?";
  return `${street}|${size}`;
}

// Yhdistää kaksi saman asunnon versiota: säilyttää parhaan (kuva + kuvaus)
// ja kerää molempien lähteiden linkit.
function mergeListings(a, b) {
  // Oikotiellä on kuva ja pidempi kuvaus -> parempi "pää". Muuten a.
  const primary = a.image || (a.source === "oikotie" && !b.image) ? a : b.source === "oikotie" ? b : a;
  const other = primary === a ? b : a;
  const sources = [
    { source: primary.source, url: primary.url },
    { source: other.source, url: other.url },
  ];
  return {
    ...primary,
    price: primary.price ?? other.price,
    balcony: primary.balcony || other.balcony,
    topFloor: primary.topFloor || other.topFloor,
    yearBuilt: primary.yearBuilt ?? other.yearBuilt,
    floor: primary.floor ?? other.floor,
    floorCount: primary.floorCount ?? other.floorCount,
    postalCode: primary.postalCode ?? other.postalCode,
    sources,
  };
}

async function runOnce() {
  console.log(`\n[${new Date().toLocaleString("fi-FI")}] Haetaan...`);
  const raw = await collect();

  // Arvioi + karsi
  const kept = [];
  for (const l of raw) {
    const { keep, listing } = evaluate(l);
    if (keep) kept.push(listing);
  }

  // Deduplikointi portaalien välillä (yhdistetään saman asunnon versiot).
  // `key` on asunnon vakaa tunniste hälytyksille (seen) ja PWA:n suosikeille.
  const byKey = new Map();
  for (const l of kept) {
    const dk = dedupeKey(l);
    const existing = byKey.get(dk);
    if (!existing) {
      byKey.set(dk, { ...l, key: dk, sources: [{ source: l.source, url: l.url }] });
    } else if (existing.sources.some((s) => s.source === l.source)) {
      const uk = `${dk}|${l.source}:${l.id}`;
      byKey.set(uk, { ...l, key: uk, sources: [{ source: l.source, url: l.url }] });
    } else {
      byKey.set(dk, { ...mergeListings(existing, l), key: dk });
    }
  }
  let unique = [...byKey.values()];

  // Rikastus: haetaan Oikotien kohdetiedoista tarkka velaton hinta, parveke, rakennusvuosi,
  // kerros, postinumero ja vapautumispäivä. Vain karsinnan läpäisseille -> kevyt kuormitus.
  if (config.portals.oikotie) {
    try {
      const auth = await getAuthHeaders();
      const found = { parveke: 0, rakennusvuosi: 0, kerros: 0, postinumero: 0 };
      let enriched = 0;
      for (const l of unique) {
        const oiko = (l.sources || []).find((s) => s.source === "oikotie");
        const id = oiko?.url.match(/\/(\d+)(?:$|\?)/)?.[1];
        if (!id) continue;
        const d = await fetchOikotieDetail(id, auth);
        if (d) {
          // Rakenteinen tieto voittaa kortin arvauksen.
          if (d.price != null) l.price = d.price;
          for (const k of ["yearBuilt", "floor", "floorCount", "postalCode", "availableFrom"]) {
            if (d[k] != null) l[k] = d[k];
          }
          // Pitkä kuvaus mukaan tekstihakuun. Parveke: rakenteinen "kyllä" TAI maininta tekstissä
          // (ilmoittajat jättävät kentän usein täyttämättä, ja parvekkeen puuttuminen maksaa eniten).
          const flags = deriveFlags({ ...l, text: `${l.text} ${d.description}` });
          l.balcony = d.balcony === true || flags.balcony;
          l.topFloor = flags.topFloor;
          l.yearBuilt = flags.yearBuilt;
          enriched++;
          if (d.balcony != null) found.parveke++;
          if (l.yearBuilt != null) found.rakennusvuosi++;
          if (l.floor != null && l.floorCount != null) found.kerros++;
          if (l.postalCode) found.postinumero++;
        }
        await sleep(300);
      }
      const summary = Object.entries(found).map(([k, n]) => `${k} ${n}`).join(", ");
      console.log(`  ✚ rikastettu ${enriched}/${unique.length} kohdetta; tieto löytyi portaalilta: ${summary}`);
      // Nolla löytöä kaikilta = kenttänimi todennäköisesti väärä (portaalin JSON muuttunut / arvaus meni ohi).
      if (enriched > 0) {
        for (const [k, n] of Object.entries(found)) {
          if (n === 0) console.warn(`  ⚠️  ${k}: ei löytynyt yhdeltäkään kohteelta — tarkista kenttänimet (src/portals/oikotie.js)`);
        }
      }
    } catch (e) {
      console.error(`  Rikastus ohitettu: ${e.message}`);
    }
  }

  // Tarkka velaton hinta voi poiketa kortin hinnasta -> karsitaan uudelleen rikastuksen jälkeen.
  const before = unique.length;
  unique = unique.filter((l) => rejectReasons(l).length === 0);
  if (unique.length < before) console.log(`  − ${before - unique.length} kohdetta karsittu tarkan hinnan perusteella`);

  // Järjestetään vasta rikastuksen jälkeen (parveke, hinta, ylin kerros, 00200, vuosi nostavat).
  unique.sort((a, b) => {
    const s = score(b) - score(a);
    if (s !== 0) return s;
    return new Date(b.published || 0) - new Date(a.published || 0);
  });

  console.log(`  → ${unique.length} täsmäävää kohdetta (kriteerit: ${describeCriteria()})`);

  // Uudet kohteet -> hälytys
  const seen = await loadSeen();
  const newOnes = [];
  for (const l of unique) {
    if (!seen[l.key]) {
      seen[l.key] = new Date().toISOString();
      newOnes.push(l);
    }
  }

  const firstRun = Object.keys(seen).length === newOnes.length;

  if (newOnes.length) {
    console.log(`  🔔 ${newOnes.length} UUTTA kohdetta`);
    if (telegramConfigured() && !firstRun) {
      for (const l of newOnes) {
        try {
          await notifyNew(l);
          await sleep(400); // kevyt tahdistus Telegramin rate limitille
        } catch (e) {
          console.error("  Telegram-virhe:", e.message);
        }
      }
    } else if (firstRun && telegramConfigured()) {
      // Ensimmäisellä ajolla ei spämmätä koko listaa — vain kerrotaan että tutka on päällä.
      await notifyText(
        `✅ Lauttasaari-tutka käynnistetty (myytävät asunnot). Seurataan: ${describeCriteria()}. ` +
          `Löytyi nyt ${unique.length} täsmäävää kohdetta — ilmoitan jatkossa vain uusista.`
      );
    }
  } else {
    console.log("  Ei uusia kohteita.");
  }

  await saveSeen(seen);
  await saveFeed(unique, describeCriteria());
  return { unique, newOnes };
}

async function main() {
  const watch = process.argv.includes("--watch");
  if (!telegramConfigured()) {
    console.log("⚠️  Telegram ei konfiguroitu (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_IDS). Ajetaan silti, hälytykset pois päältä.");
  }
  await runOnce();
  if (watch) {
    const ms = config.pollMinutes * 60 * 1000;
    console.log(`\n⏱  Watch-tila: seuraava haku ${config.pollMinutes} min välein.`);
    setInterval(() => runOnce().catch((e) => console.error("runOnce virhe:", e.message)), ms);
  }
}

main().catch((e) => {
  console.error("Kohtalokas virhe:", e);
  process.exit(1);
});
