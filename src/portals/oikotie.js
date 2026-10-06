import { fetchText, fetchJson, parsePrice, pick, toBool } from "../util.js";
import { config } from "../../config.js";

const FRONT = "https://asunnot.oikotie.fi/myytavat-asunnot/helsinki";

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

// Rakennusvuosi, kerros ja postinumero löytyvät kortista ja kohdetiedoista (adData) osin eri
// kenttänimillä, joten kokeillaan useita. Puuttuva tieto palautuu null:na eikä karsi kohdetta.
// Tarkoituksella EI skannata koko oliota: ilmoittajan/välittäjän toimiston postinumero
// ei saa sekoittua asunnon omaan.
function intOrNull(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function buildingInfo(o) {
  const year = intOrNull(
    pick(o, ["buildingData.year", "buildingData.buildYear", "buildYear", "buildingYear", "constructionYear", "yearOfConstruction", "year"])
  );

  // Kerros voi olla lukuna (3), merkkijonona ("3") tai parina ("3/5").
  const rawFloor = pick(o, ["buildingData.floor", "floor", "floorNumber"]);
  let floor = null;
  let floorCount = null;
  if (typeof rawFloor === "string" && rawFloor.includes("/")) {
    [floor, floorCount] = rawFloor.split("/").map(intOrNull);
  } else {
    floor = intOrNull(rawFloor);
  }
  floorCount ??= intOrNull(
    pick(o, ["buildingData.floorCount", "buildingData.floors", "floorCount", "buildingFloorCount", "floors", "numberOfFloors"])
  );

  const zip = pick(o, [
    "buildingData.zipCode", "buildingData.postalCode", "buildingData.zip",
    "zipCode", "postalCode", "zip", "postcode",
    "location.zipCode", "location.postalCode",
  ]);
  const postalCode =
    String(zip ?? "").match(/\b\d{5}\b/)?.[0] ||
    String(pick(o, ["buildingData.address", "address"]) ?? "").match(/\b\d{5}\b/)?.[0] ||
    null;

  return { yearBuilt: year >= 1800 && year <= 2100 ? year : null, floor, floorCount, postalCode };
}

// Hakee yksittäisen kohteen rakenteiset lisätiedot (parveke, velaton hinta, rakennusvuosi,
// kerros, postinumero, vapautumispäivä). Palauttaa null jos ei saada.
export async function fetchOikotieDetail(id, headers) {
  try {
    const j = await fetchJson(`https://asunnot.oikotie.fi/api/card/${id}`, { headers });
    const ad = j.adData || {};
    let availableFrom = ad.availabilityDate || null;
    if (!availableFrom && ad.availabilityInfo) {
      const m = String(ad.availabilityInfo).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (m) availableFrom = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      else if (/heti|vapaa$/i.test(ad.availabilityInfo)) availableFrom = "heti";
    }
    return {
      balcony: toBool(ad.balcony), // null = portaali ei kerro -> jää tekstihaun varaan
      // Vain jos portaali nimeää hinnan velattomaksi; muuten jää voimaan kortin hinta.
      price: parsePrice(pick(ad, ["debtFreePrice", "priceUnencumbered", "unencumberedPrice"])),
      description: [ad.description, ad.freeText].filter((s) => typeof s === "string").join(" "),
      availableFrom,
      ...buildingInfo(ad),
    };
  } catch {
    return null;
  }
}

// Palauttaa normalisoidut myytävät kohteet Lauttasaaresta.
export async function fetchOikotie() {
  const headers = await getAuthHeaders();
  const [code, type, label] = config.area.oikotieLocation;
  const results = [];
  const limit = 100;
  let offset = 0;
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({
      cardType: "100", // 100 = myytävät asunnot
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
        // Velaton hinta (korttien price-kenttä; tarkentuu rikastuksessa).
        price: parsePrice(pick(c, ["debtFreePrice", "priceUnencumbered", "price"])),
        address: [c.buildingData?.address, c.district, "Helsinki"].filter(Boolean).join(", ") || label,
        district: c.district || "Lauttasaari",
        title: c.description || c.roomConfiguration || "Myytävä asunto",
        text,
        image: c.images?.small || c.images?.url || null,
        published: c.published || null,
        ...buildingInfo(c),
      });
    }
    if (cards.length < limit) break;
    offset += limit;
  }
  return results;
}
