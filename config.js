// Hakukriteerit (myytävät asunnot). Muokkaa näitä vapaasti — koko sovellus lukee tästä.
export const config = {
  // --- Pakolliset suodattimet (kohteet joita EI täsmää, karsitaan pois) ---
  minRooms: 3, // vähintään 3 huonetta
  maxPrice: 475000, // € — VELATON hinta (ei myyntihinta + velkaosuus)
  minSize: null, // m², null = ei rajausta

  // --- Alue ---
  // Lauttasaari: postinumerot 00200 (Lauttasaari) ja 00210 (Vattuniemi).
  area: {
    oikotieLocation: [1669, 4, "Lauttasaari, Helsinki"], // Oikotien aluekoodi (haettu API:sta)
    postalCodes: ["00200", "00210"],
  },

  // --- Plussat (eivät karsi, nostavat kohteen ylemmäs listassa) ---
  plus: {
    idealPrice: 400000, // € — tähän asti täydet hintapisteet, ylärajaa (maxPrice) kohti pisteet laskevat nollaan
    postalCode: "00200", // tämä postinumero on plussaa (00210 kelpaa mutta ei saa plussaa)
    maxBuildYear: 1960, // tätä vanhempi (tai tasan tämä) talo on plussaa
  },

  // Pisteytys (suurempi = ylemmäs). Parveke on "melkein pakollinen": se painaa enemmän kuin
  // kaikki muut plussat yhteensä (50 > 46), mutta parvekkeeton kohde ei silti putoa pois listalta.
  weights: {
    balcony: 50,
    price: 20, // maksimi, skaalautuu idealPrice → maxPrice
    topFloor: 10,
    postalCode: 8,
    buildYear: 8,
  },

  // Etsitään näitä sanoja otsikosta/kuvauksesta parhaan kyvyn mukaan, jos portaalin
  // rakenteinen tieto puuttuu. "parvek" kattaa taivutukset (parveke, parvekkeella, parveketta).
  plusKeywords: {
    balcony: ["parvek", "balkong"],
    topFloor: ["ylin kerros", "ylimmässä kerroksessa", "ylimmän kerroksen", "ylimmästä kerroksesta", "kattohuoneisto"],
  },

  // --- Portaalit joita seurataan ---
  // (Vuokraovi ja Qasa ovat vuokrausportaaleja, joten ne on poistettu myyntihausta.)
  portals: {
    oikotie: true,
  },

  // --- Ajastus watch-tilassa ---
  pollMinutes: 20,
};
