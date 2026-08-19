import { parseRooms } from "../util.js";
import { config } from "../../config.js";

// Qasa (qasa.com/fi) käyttää GraphQL-rajapintaa api.qasa.com/graphql.
// Sillä EI ole kaupunginosasuodatinta, joten haetaan Suomen uusimmat kohteet
// (server-side suodatus huoneet/neliöt/vuokra) ja rajataan Lauttasaareen
// koordinaattilaatikolla (config.area.bbox). Oletusjärjestys on uusin ensin.
const ENDPOINT = "https://api.qasa.com/graphql";

const QUERY = `query HomeSearch($limit: Int, $offset: Int, $params: HomeSearchParamsInput) {
  homeIndexSearch(params: $params) {
    documents(limit: $limit, offset: $offset) {
      totalCount
      nodes {
        id roomCount squareMeters rent monthlyCost petsAllowed homeType
        title description publishedOrBumpedAt
        location { locality route streetNumber point { lat lon } }
      }
    }
  }
}`;

async function gql(variables) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables }),
  });
  if (!r.ok) throw new Error(`Qasa HTTP ${r.status}`);
  const j = await r.json();
  if (j.errors) throw new Error(`Qasa GraphQL: ${j.errors[0].message}`);
  return j.data.homeIndexSearch.documents;
}

function inLauttasaari(point) {
  if (!point) return false;
  const b = config.area.bbox;
  return point.lat > b.minLat && point.lat < b.maxLat && point.lon > b.minLon && point.lon < b.maxLon;
}

export async function fetchQasa() {
  const params = {
    markets: ["finland"],
    minRoomCount: config.minRooms,
    minSquareMeters: config.minSize,
    maxRent: config.maxRent,
  };
  const cap = config.qasaMaxResults || 600;
  const results = [];
  for (let offset = 0; offset < cap; offset += 50) {
    const docs = await gql({ limit: 50, offset, params });
    const nodes = docs.nodes || [];
    for (const n of nodes) {
      if (!inLauttasaari(n.location?.point)) continue;
      const addr = [n.location?.route, n.location?.streetNumber].filter(Boolean).join(" ");
      const text = [n.title, n.description, n.homeType].filter(Boolean).join(" ");
      results.push({
        source: "qasa",
        id: String(n.id),
        url: `https://qasa.com/fi/fi/home/${n.id}`,
        rooms: typeof n.roomCount === "number" ? n.roomCount : parseRooms(null, null),
        size: n.squareMeters || null,
        rent: n.rent || n.monthlyCost || null,
        address: [addr, "Lauttasaari, Helsinki"].filter(Boolean).join(", "),
        district: "Lauttasaari",
        title: n.title || "Vuokra-asunto (Qasa)",
        text,
        image: null,
        published: n.publishedOrBumpedAt || null,
        // Qasalla on suora rakenteinen tieto:
        pets: n.petsAllowed === true ? "sallittu" : n.petsAllowed === false ? "kielletty?" : null,
      });
    }
    if (nodes.length < 50) break; // loppui kesken
  }
  return results;
}
