// Hakukriteerit. Muokkaa näitä vapaasti — koko sovellus lukee tästä.
export const config = {
  // --- Pakolliset suodattimet (kohteet joita EI täsmää, karsitaan pois) ---
  minRooms: 3, // 3h+k tarkoittaa vähintään 3 huonetta
  minSize: 55, // m²
  maxRent: 1800, // €/kk

  // --- Alue ---
  // Lauttasaari: postinumerot 00200 ja 00210.
  area: {
    oikotieLocation: [1669, 4, "Lauttasaari, Helsinki"], // Oikotien aluekoodi (haettu API:sta)
    postalCodes: ["00200", "00210"],
    // Vuokraovi ei aina anna postinumeroa listauksessa; täsmätään myös kaupunginosanimeen:
    districtNames: ["lauttasaari", "drumsö"],
    // Qasa ei tarjoa kaupunginosasuodatinta -> rajataan Lauttasaari lat/lon-laatikolla:
    bbox: { minLat: 60.148, maxLat: 60.172, minLon: 24.855, maxLon: 24.905 },
  },

  // --- Plussamerkinnät (eivät karsi, nostavat esiin) ---
  // Etsitään näitä sanoja otsikosta/kuvauksesta parhaan kyvyn mukaan.
  plusKeywords: {
    balcony: ["parveke", "parvekkeel", "balkong", "terassi", "lasitettu parveke"],
    parking: ["autopaikka", "autohalli", "autotalli", "parkki", "pysäköinti", "autopaikkam"],
  },

  // --- Lemmikit ---
  // ÄLÄ karsi "lemmikit kielletty" -kohteita. Merkitään vain lippu jos maininta löytyy.
  petKeywords: {
    allowed: ["lemmikit ok", "lemmikit sallittu", "lemmikkiystäväll", "kissa ok", "koira ok", "lemmikit tervetu"],
    forbidden: ["ei lemmikk", "lemmikit kielletty", "ei kotieläim", "lemmikkejä ei"],
  },

  // --- Portaalit joita seurataan ---
  portals: {
    oikotie: true,
    vuokraovi: true,
    qasa: true,
  },

  // Qasalla ei ole aluesuodatinta -> haetaan Suomen uusimmat (3h+/55m²+/≤1800€) ja
  // rajataan Lauttasaareen bbox:illa. Montako uusinta käydään läpi per ajo:
  qasaMaxResults: 600,

  // --- Ajastus watch-tilassa ---
  pollMinutes: 20,
};
