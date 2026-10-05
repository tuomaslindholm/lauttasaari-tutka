import { config } from "../config.js";
import { containsAny } from "./util.js";

// Pakolliset suodattimet. Jos jokin tieto puuttuu, EI karsita (varovaisuus).
// Palauttaa karsintasyyt (tyhjä taulukko = kohde täsmää).
export function rejectReasons(l) {
  const reasons = [];
  if (l.rooms != null && l.rooms < config.minRooms) reasons.push("liian vähän huoneita");
  if (l.price != null && l.price > config.maxPrice) reasons.push("liian kallis");
  if (config.minSize != null && l.size != null && l.size < config.minSize) reasons.push("liian pieni");
  return reasons;
}

// "ei parveketta" / "ilman parveketta" ei saa laskea parvekkeeksi.
function hasBalcony(text) {
  const positive = String(text || "").replace(/\b(?:ei|ilman)\s+(?:\S+\s+)?(?:parvek|balkong)\S*/gi, " ");
  return containsAny(positive, config.plusKeywords.balcony);
}

// Rakenteinen kerrostieto (esim. 5/5) voittaa tekstihaun. Alle 2-kerroksista taloa ei lasketa,
// koska 1/1 on usein vain puuttuvan tiedon oletusarvo.
function isTopFloor(l) {
  if (l.floor != null && l.floorCount != null) return l.floorCount >= 2 && l.floor >= l.floorCount;
  return containsAny(l.text, config.plusKeywords.topFloor);
}

function yearFromText(text) {
  const m = String(text || "").match(/(?:rakennusvuosi|rakennettu|valmistunut|valmistumisvuosi|rak\.?\s?vuosi)\D{0,15}(1[89]\d\d|20\d\d)/i);
  return m ? parseInt(m[1], 10) : null;
}

// Johtaa plusliput kohteen tiedoista. Kutsutaan uudelleen rikastuksen jälkeen,
// kun tarkat kerros-/rakennusvuositiedot ovat tulleet.
export function deriveFlags(l) {
  return {
    balcony: hasBalcony(l.text),
    topFloor: isTopFloor(l),
    yearBuilt: l.yearBuilt ?? yearFromText(l.text),
  };
}

// Palauttaa { keep, reasons, listing } — rikastaa kohteen plusmerkinnöillä.
export function evaluate(listing) {
  const reasons = rejectReasons(listing);
  return { keep: reasons.length === 0, reasons, listing: { ...listing, ...deriveFlags(listing) } };
}

// Hintapisteiden kerroin 0..1: täydet pisteet idealPricen alla, nolla maxPricessa.
function priceFactor(price) {
  const { idealPrice } = config.plus;
  if (price <= idealPrice) return 1;
  if (price >= config.maxPrice) return 0;
  return (config.maxPrice - price) / (config.maxPrice - idealPrice);
}

// Pistemäärä feedin järjestämiseen (painot: config.weights).
export function score(l) {
  const w = config.weights;
  let s = 0;
  if (l.balcony) s += w.balcony;
  if (l.topFloor) s += w.topFloor;
  if (l.postalCode === config.plus.postalCode) s += w.postalCode;
  if (l.yearBuilt != null && l.yearBuilt <= config.plus.maxBuildYear) s += w.buildYear;
  if (l.price != null) s += w.price * priceFactor(l.price);
  return s;
}

// Kriteerit tekstinä lokiin, Telegramiin ja PWA:n alatunnisteeseen.
export function describeCriteria() {
  const eur = (n) => n.toLocaleString("fi-FI");
  const parts = [`${config.minRooms}h+`, `≤${eur(config.maxPrice)} € (velaton)`];
  if (config.minSize != null) parts.push(`${config.minSize} m²+`);
  return parts.join(" · ");
}
