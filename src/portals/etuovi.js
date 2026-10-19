import { config } from "../../config.js";
import { UA, parsePrice, pick, sleep } from "../util.js";

// Etuovin oma selainrajapinta (sama jota etuovi.com-sivu käyttää), ei kirjautumista.
// Varmistettu oikealla datalla 19.10.2026: hakuehdot (searchDto) -> {countOfAllResults, announcements[]}.
const SEARCH_URL = "https://www.etuovi.com/api/v3/announcements/search/listpage";
const DETAIL_URL = "https://www.etuovi.com/api/v2/announcement/details";
const REFERER = "https://www.etuovi.com/myytavat-asunnot/lauttasaari";
const PAGE_SIZE = 30;
const MAX_PAGES = 8;
const HEADERS = { "User-Agent": UA, "Accept-Language": "fi-FI,fi;q=0.9,en;q=0.8" };

// Hakuehdot samassa muodossa kuin selain lähettää. Kentät ovat mukana tyhjinä, koska
// rajapinta on tiukka puuttuvista kentistä; karsinta tehdään paikallisesti (config.js).
function searchDto(term, page, extra = {}) {
  return {
    propertyType: "RESIDENTIAL",
    locationSearchCriteria: { unclassifiedLocationTerms: [], classifiedLocationTerms: [] },
    sellerType: "ALL",
    bidType: "ALL",
    publishingTimeSearchCriteria: "ANY_DAY",
    freeTextSearch: term,
    pagination: {
      firstResult: (page - 1) * PAGE_SIZE,
      maxResults: PAGE_SIZE,
      page,
      sortingOrder: { property: "PUBLISHED_OR_UPDATED_AT", direction: "DESC" },
    },
    residentialPropertyTypes: [],
    roomCounts: [],
    yearMin: null,
    yearMax: null,
    priceSquareMeterMin: null,
    priceSquareMeterMax: null,
    maintenanceChargeMin: null,
    maintenanceChargeMax: null,
    apartmentHasSauna: null,
    apartmentHasNoSauna: null,
    housingCompanyHasSauna: null,
    apartmentHasBalcony: null,
    housingCompanyHasElevator: null,
    newBuildingSearchCriteria: "ALL_PROPERTIES",
    ownershipTypes: [],
    heatingSystems: null,
    overallConditions: null,
    plotHoldingTypes: null,
    plotAreaMin: null,
    plotAreaMax: null,
    floorPositionInHighrise: null,
    residentialFloorCountType: null,
    carParkingFeatures: null,
    ...extra,
  };
}

// Hakee kaikki sivut yhdelle hakusanalle.
async function searchAll(term, extra) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        ...HEADERS,
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://www.etuovi.com",
        Referer: REFERER,
      },
      body: JSON.stringify(searchDto(term, page, extra)),
    });
    if (!r.ok) throw new Error(`Etuovi haku HTTP ${r.status}`);
    const j = await r.json();
    const items = j.announcements || [];
    all.push(...items);
    if (!items.length || all.length >= (j.countOfAllResults ?? 0)) break;
    await sleep(600);
  }
  return all;
}

// Lauttasaari: kaupunginosan nimi tai koordinaattilaatikko.
function inArea(a) {
  const name = String(a.addressLine2 || "").toLowerCase();
  if (config.area.districtNames.some((d) => name.includes(d))) return true;
  const b = config.area.bbox;
  return a.latitude > b.minLat && a.latitude < b.maxLat && a.longitude > b.minLon && a.longitude < b.maxLon;
}

const ROOM_WORDS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7 };
// roomCount-enum (esim. TWO_ROOMS) ensin, sitten "3 h, kk" -tekstistä; muuten null (ei karsita).
function roomsOf(a) {
  const word = String(a.roomCount || "").match(/^(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN)/)?.[1];
  if (word) return ROOM_WORDS[word];
  const n = parseInt(String(a.roomStructure || "").match(/(\d+)\s*h/i)?.[1], 10);
  return Number.isFinite(n) ? n : null;
}

// Palauttaa normalisoidut myytävät kohteet Lauttasaaresta ja Vattuniemestä.
export async function fetchEtuovi() {
  const byId = new Map();
  const withBalcony = new Set();
  for (const term of config.area.etuoviSearchTerms) {
    for (const a of await searchAll(term)) byId.set(a.id, a);
    await sleep(600);
    // Parveke: hakusuodatin palauttaa vain parvekkeelliset (listaus ei kerro parveketta muuten).
    for (const a of await searchAll(term, { apartmentHasBalcony: true })) withBalcony.add(a.id);
    await sleep(600);
  }

  const results = [];
  for (const a of byId.values()) {
    if (!inArea(a)) continue;
    const street = a.addressLine1 || "";
    results.push({
      source: "etuovi",
      id: String(a.id),
      url: `https://www.etuovi.com/kohde/${a.friendlyId}`,
      rooms: roomsOf(a),
      size: typeof a.area === "number" ? a.area : null,
      // searchPrice = velaton hinta (sama arvo kuin Oikotien price 9/9 vertailtavassa kohteessa).
      price: typeof a.searchPrice === "number" ? a.searchPrice : null,
      address: [street, a.addressLine2].filter(Boolean).join(", "),
      district: "Lauttasaari",
      title: [a.roomStructure, street].filter(Boolean).join(" — ") || "Myytävä asunto (Etuovi)",
      text: [a.roomStructure, street, a.addressLine2].filter(Boolean).join(" "),
      image: null,
      published: a.publishingTime || null,
      yearBuilt: Number.isFinite(a.constructionFinishedYear) ? a.constructionFinishedYear : null,
      floor: Number.isFinite(a.floorLevel) ? a.floorLevel : null,
      floorCount: Number.isFinite(a.housingCompanyFloorCount) ? a.housingCompanyFloorCount : null,
      postalCode: null, // ei listauksessa; haetaan kohdetiedoista vain Etuovi-yksinoloille
      balcony: withBalcony.has(a.id) ? true : undefined, // undefined = ei tietoa -> tekstihaku
    });
  }
  return results;
}

// Kohdetiedot (postinumero, tarkka velaton hinta). Käytetään vain kohteille, joita ei löydy Oikotiesta.
// Palauttaa null jos ei saada. Vastauksen muoto: sama kuin sivun state.item.data.
export async function fetchEtuoviDetail(friendlyId) {
  try {
    const r = await fetch(`${DETAIL_URL}?friendlyId=${encodeURIComponent(friendlyId)}`, {
      headers: { ...HEADERS, Accept: "application/json", Referer: REFERER },
    });
    if (!r.ok) return null;
    const j = await r.json();
    const d = j.data ?? j;
    // postCode-olion arvoista etsitään viisinumeroinen koodi (kentän nimeä ei ole varmistettu).
    const pc = d?.property?.postCode;
    const postalCode =
      Object.values(pc && typeof pc === "object" ? pc : {})
        .map((v) => String(v))
        .find((v) => /^\d{5}$/.test(v)) ?? null;
    return {
      // "debfFreePrice" on rajapinnan oma kirjoitusvirhe; molemmat kirjoitusasut sallitaan.
      price: parsePrice(pick(d, ["debfFreePrice", "debtFreePrice"])),
      postalCode,
      balcony: null,
      description: "",
    };
  } catch {
    return null;
  }
}
