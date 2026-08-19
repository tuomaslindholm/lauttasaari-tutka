export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function fetchText(url, opts = {}) {
  const r = await fetch(url, { headers: { "User-Agent": UA, ...(opts.headers || {}) }, ...opts });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.text();
}

export async function fetchJson(url, opts = {}) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.json();
}

// Parsii vuokran mahdollisesti sotkuisesta merkkijonosta, esim. "1 795 € / kk" -> 1795
export function parseRent(v) {
  if (typeof v === "number") return v;
  if (!v) return null;
  const digits = String(v).replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : null;
}

// Vuokraoven roomCount-enumit numeroksi (varakeino jos roomStructurea ei voi parsia)
const ROOM_ENUM = {
  ONE_ROOM: 1, TWO_ROOMS: 2, THREE_ROOMS: 3, FOUR_ROOMS: 4,
  FIVE_ROOMS: 5, SIX_ROOMS: 6, MORE_THAN_SIX_ROOMS: 7,
};

// Yrittää päätellä huoneluvun. roomStructure esim "3h + k + s" -> 3
export function parseRooms(roomStructure, roomCountEnum) {
  if (roomStructure) {
    const m = String(roomStructure).match(/(\d+)\s*h/i);
    if (m) return parseInt(m[1], 10);
  }
  if (roomCountEnum && ROOM_ENUM[roomCountEnum]) return ROOM_ENUM[roomCountEnum];
  return null;
}

export function containsAny(text, words) {
  if (!text) return false;
  const t = text.toLowerCase();
  return words.some((w) => t.includes(w.toLowerCase()));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
