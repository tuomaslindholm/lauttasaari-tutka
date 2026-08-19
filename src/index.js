import { config } from "../config.js";
import { fetchOikotie, fetchOikotieDetail, getAuthHeaders } from "./portals/oikotie.js";
import { fetchVuokraovi } from "./portals/vuokraovi.js";
import { fetchQasa } from "./portals/qasa.js";
import { evaluate, score } from "./filter.js";
import { loadSeen, saveSeen, saveFeed } from "./store.js";
import { notifyNew, notifyText, telegramConfigured } from "./telegram.js";
import { sleep } from "./util.js";

async function collect() {
  const jobs = [];
  if (config.portals.oikotie) jobs.push(["oikotie", fetchOikotie]);
  if (config.portals.vuokraovi) jobs.push(["vuokraovi", fetchVuokraovi]);
  if (config.portals.qasa) jobs.push(["qasa", fetchQasa]);

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
// + neliöt pyöristettynä. Näin Oikotie- ja Vuokraovi-versiot yhdistyvät.
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
    balcony: primary.balcony || other.balcony,
    parking: primary.parking || other.parking,
    pets: primary.pets === "sallittu" || other.pets === "sallittu" ? "sallittu"
      : primary.pets === "kielletty?" || other.pets === "kielletty?" ? "kielletty?" : "epävarma",
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

  // Deduplikointi portaalien välillä (yhdistetään saman asunnon versiot)
  const byDedupe = new Map();
  for (const l of kept) {
    const dk = dedupeKey(l);
    const existing = byDedupe.get(dk);
    byDedupe.set(dk, existing ? mergeListings(existing, l) : { ...l, sources: [{ source: l.source, url: l.url }] });
  }
  const unique = [...byDedupe.values()];

  // Rikastus: haetaan Oikotien yksityiskohdista tarkat parveke/autopaikka/lemmikit/vapautumispäivä.
  // Vain uniikeille osumille (muutama kpl) -> kevyt kuormitus.
  if (config.portals.oikotie) {
    try {
      const auth = await getAuthHeaders();
      let enriched = 0;
      for (const l of unique) {
        const oiko = (l.sources || []).find((s) => s.source === "oikotie");
        const id = oiko?.url.match(/\/(\d+)(?:$|\?)/)?.[1];
        if (!id) continue;
        const d = await fetchOikotieDetail(id, auth);
        if (d) {
          l.balcony = d.balcony;
          l.parking = d.parking;
          if (d.pets) l.pets = d.pets; // säilyy: EI karsita koskaan
          if (d.availableFrom) l.availableFrom = d.availableFrom;
          enriched++;
        }
        await sleep(300);
      }
      console.log(`  ✚ rikastettu ${enriched} kohteen tarkat tiedot (parveke/autopaikka/lemmikit/vapautuu)`);
    } catch (e) {
      console.error(`  Rikastus ohitettu: ${e.message}`);
    }
  }

  // Järjestetään vasta rikastuksen jälkeen (parveke/autopaikka nostavat).
  unique.sort((a, b) => {
    const s = score(b) - score(a);
    if (s !== 0) return s;
    return new Date(b.published || 0) - new Date(a.published || 0);
  });

  console.log(`  → ${unique.length} täsmäävää kohdetta (kriteerit: ${config.minRooms}h+, ${config.minSize}m²+, ≤${config.maxRent}€)`);

  // Uudet kohteet -> hälytys
  const seen = await loadSeen();
  const newOnes = [];
  for (const l of unique) {
    const k = dedupeKey(l); // vakaa avain per asunto (osoite+neliöt)
    if (!seen[k]) {
      seen[k] = new Date().toISOString();
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
        `✅ Lauttasaari-tutka käynnistetty. Seurataan ${config.minRooms}h+, ${config.minSize}m²+, ≤${config.maxRent}€/kk. ` +
          `Löytyi nyt ${unique.length} täsmäävää kohdetta — ilmoitan jatkossa vain uusista.`
      );
    }
  } else {
    console.log("  Ei uusia kohteita.");
  }

  await saveSeen(seen);
  await saveFeed(unique);
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
