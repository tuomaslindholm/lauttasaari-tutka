import { fetchText, fetchJson, parseRent, parseRooms, containsAny } from "../util.js";
import { config } from "../../config.js";

// Vuokraovi on Next.js-sovellus. Haetaan tuore buildId etusivulta ja
// kysytään sen _next/data-rajapinnasta. buildId vaihtuu deployn yhteydessä.
//
// HUOM: koko-Helsingin _next/data-endpoint palauttaa vain 30 uusinta eikä
// tue sivutusta. Siksi kysytään suoraan Lauttasaari-rajattua reittiä
// (/vuokra-asunnot/Lauttasaari), jolloin kaikki ~30 tulosta ovat Lauttasaarta.
async function getBuildId() {
  const html = await fetchText("https://www.vuokraovi.com/vuokra-asunnot/Lauttasaari");
  const m = html.match(/"buildId":"([^"]+)"/);
  if (!m) throw new Error("Vuokraovi: buildId ei löytynyt (sivu muuttunut?)");
  return m[1];
}

export async function fetchVuokraovi() {
  const buildId = await getBuildId();
  const url =
    `https://www.vuokraovi.com/_next/data/${buildId}/vuokra-asunnot/Lauttasaari.json` +
    `?locationName=Lauttasaari`;
  const j = await fetchJson(url);
  const anns = j?.pageProps?.initialAnnouncements?.announcements || [];

  const results = [];
  for (const a of anns) {
    const district = a.addressLine2 || a.location || "";
    // Varmistus: pysytään Lauttasaaressa (Helsinki), ei muiden kuntien Lauttasaari-nimisiä.
    if (!containsAny(district, config.area.districtNames)) continue;
    const text = [a.roomStructure, a.addressLine1, district, a.office?.name].filter(Boolean).join(" ");
    results.push({
      source: "vuokraovi",
      id: String(a.id),
      // Oikea kohdesivu käyttää friendlyId:tä (esim. gp2286).
      url: a.friendlyId ? `https://www.vuokraovi.com/kohde/${a.friendlyId}` : `https://www.vuokraovi.com/vuokra-asunnot/kohde/${a.id}`,
      rooms: parseRooms(a.roomStructure, a.roomCount),
      size: a.area || a.totalArea || null,
      rent: parseRent(a.searchRent),
      address: [a.addressLine1, a.addressLine2].filter(Boolean).join(", "),
      district,
      title: [a.roomStructure, a.addressLine1].filter(Boolean).join(" — "),
      text,
      image: null,
      published: a.publishingTime || null,
    });
  }
  return results;
}
