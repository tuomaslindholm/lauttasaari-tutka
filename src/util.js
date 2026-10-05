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

// Parsii hinnan mahdollisesti sotkuisesta merkkijonosta, esim. "389 000 €" -> 389000.
// Otetaan vain ensimmäinen lukuryhmä, ettei "389 000 € (vel. 120 000)" muutu yhdeksi isoksi luvuksi.
export function parsePrice(v) {
  if (typeof v === "number") return v;
  if (!v) return null;
  const m = String(v).match(/\d[\d\s .]*/);
  const digits = m ? m[0].replace(/\D/g, "") : "";
  return digits ? parseInt(digits, 10) : null;
}

// Palauttaa ensimmäisen löytyvän arvon annetuista poluista, esim. pick(card, ["buildingData.year", "year"]).
export function pick(obj, paths) {
  for (const p of paths) {
    const v = p.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

// Rakenteinen kyllä/ei -tieto portaalilta: true / false, tai null jos tietoa ei ole.
export function toBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v > 0;
  if (typeof v === "string") {
    if (/^(1|true|kyllä|yes|on)$/i.test(v.trim())) return true;
    if (/^(0|false|ei|no|off)$/i.test(v.trim())) return false;
  }
  return null;
}

export function containsAny(text, words) {
  if (!text) return false;
  const t = text.toLowerCase();
  return words.some((w) => t.includes(w.toLowerCase()));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
