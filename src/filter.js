import { config } from "../config.js";
import { containsAny } from "./util.js";

// Palauttaa { keep, listing } — rikastaa kohteen plussamerkinnöillä ja lemmikkilipulla.
export function evaluate(listing) {
  const reasons = [];

  // Pakolliset suodattimet. Jos jokin tieto puuttuu, EI karsita (varovaisuus),
  // mutta merkitään epävarmaksi.
  if (listing.rooms != null && listing.rooms < config.minRooms) reasons.push("liian vähän huoneita");
  if (listing.size != null && listing.size < config.minSize) reasons.push("liian pieni");
  if (listing.rent != null && listing.rent > config.maxRent) reasons.push("liian kallis");

  const keep = reasons.length === 0;

  // Plussamerkinnät (eivät vaikuta karsintaan)
  const balcony = containsAny(listing.text, config.plusKeywords.balcony);
  const parking = containsAny(listing.text, config.plusKeywords.parking);

  // Lemmikit: EI karsita koskaan. Vain lippu.
  // Kunnioita portaalin rakenteista tietoa (esim. Qasa) jos se on jo asetettu.
  let pets = listing.pets || "epävarma";
  if (pets === "epävarma") {
    if (containsAny(listing.text, config.petKeywords.allowed)) pets = "sallittu";
    else if (containsAny(listing.text, config.petKeywords.forbidden)) pets = "kielletty?";
  }

  return {
    keep,
    reasons,
    listing: { ...listing, balcony, parking, pets },
  };
}

// Pistemäärä feedin järjestämiseen: parveke + autopaikka nostavat, uudempi ylös.
export function score(l) {
  let s = 0;
  if (l.balcony) s += 10;
  if (l.parking) s += 6;
  if (l.pets === "sallittu") s += 4;
  return s;
}
