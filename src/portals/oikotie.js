import { fetchText, fetchJson, parseRent } from "../util.js";
import { config } from "../../config.js";

const FRONT = "https://asunnot.oikotie.fi/vuokrattavat-asunnot/helsinki";

// Oikotien kortti-API vaatii tokenit, jotka luetaan etusivun meta-tageista.
export async function getAuthHeaders() {
  const html = await fetchText(FRONT);
  const grab = (name) => {
    const m =
      html.match(new RegExp(`<meta[^>]*name="${name}"[^>]*content="([^"]*)"`)) ||
      html.match(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*name="${name}"`));
    return m ? m[1] : null;
  };
  const token = grab("api-token");
  const loaded = grab("loaded");
  const cuid = grab("cuid");
  if (!token || !loaded || !cuid) throw new Error("Oikotie: tokeneita ei löytynyt meta-tageista (sivu muuttunut?)");
  return { "OTA-token": token, "OTA-loaded": loaded, "OTA-cuid": cuid };
}

// Hakee yksittäisen kohteen rakenteiset lisätiedot (parveke, autopaikka, lemmikit,
// vapautumispäivä). Palauttaa null jos ei saada.
export async function fetchOikotieDetail(id, headers) {
  try {
    const j = await fetchJson(`https://asunnot.oikotie.fi/api/card/${id}`, { headers });
    const ad = j.adData || {};
    const parking = Boolean(
      ad.parkingSpaceType ||
        (ad.parkingSpaceTypes && ad.parkingSpaceTypes.length) ||
        (ad.aiParkingSpaceTypes && ad.aiParkingSpaceTypes.length) ||
        ad.parkingSpaceInfo ||
        ad.carStorageInfo ||
        ad.parkingFee
    );
    let availableFrom = ad.availabilityDate || null;
    if (!availableFrom && ad.availabilityInfo) {
      const m = String(ad.availabilityInfo).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (m) availableFrom = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      else if (/heti|vapaa$/i.test(ad.availabilityInfo)) availableFrom = "heti";
    }
    return {
      balcony: ad.balcony === 1 || ad.balcony === true,
      parking,
      pets: ad.petsAllowed === 1 ? "sallittu" : ad.petsAllowed === 0 ? "kielletty?" : null,
      availableFrom,
    };
  } catch {
    return null;
  }
}

// Palauttaa normalisoidut kohteet Lauttasaaresta.
export async function fetchOikotie() {
  const headers = await getAuthHeaders();
  const [code, type, label] = config.area.oikotieLocation;
  const results = [];
  const limit = 100;
  let offset = 0;
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({
      cardType: "101", // 101 = vuokra-asunnot
      locations: `[[${code},${type},"${label}"]]`,
      limit: String(limit),
      offset: String(offset),
      sortBy: "published_sort_desc",
    });
    const j = await fetchJson(`https://asunnot.oikotie.fi/api/cards?${params}`, { headers });
    const cards = j.cards || [];
    for (const c of cards) {
      const text = [c.description, c.roomConfiguration].filter(Boolean).join(" ");
      results.push({
        source: "oikotie",
        id: String(c.id),
        url: c.url,
        rooms: typeof c.rooms === "number" ? c.rooms : null,
        size: typeof c.size === "number" ? c.size : parseFloat(c.size) || null,
        rent: parseRent(c.price),
        address: [c.buildingData?.address, c.district, "Helsinki"].filter(Boolean).join(", ") || label,
        district: c.district || "Lauttasaari",
        title: c.description || c.roomConfiguration || "Vuokra-asunto",
        text,
        image: c.images?.small || c.images?.url || null,
        published: c.published || null,
      });
    }
    if (cards.length < limit) break;
    offset += limit;
  }
  return results;
}
