import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const PWA_DIR = join(__dirname, "..", "pwa");
const SEEN_FILE = join(DATA_DIR, "seen.json"); // { "dedupeKey": firstSeenISO }
const FEED_FILE = join(DATA_DIR, "listings.json"); // nykyiset aktiiviset osumat
const PWA_FEED_FILE = join(PWA_DIR, "listings.json"); // sama, PWA:n vieressä tarjottavaksi

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

export async function loadSeen() {
  await mkdir(DATA_DIR, { recursive: true });
  return readJson(SEEN_FILE, {});
}

export async function saveSeen(seen) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(SEEN_FILE, JSON.stringify(seen, null, 2));
}

// Tallentaa nykyisen feedin (kaikki aktiiviset osumat) PWA:ta varten.
export async function saveFeed(listings) {
  await mkdir(DATA_DIR, { recursive: true });
  const payload = { updatedAt: new Date().toISOString(), count: listings.length, listings };
  const json = JSON.stringify(payload, null, 2);
  await writeFile(FEED_FILE, json);
  try {
    await mkdir(PWA_DIR, { recursive: true });
    await writeFile(PWA_FEED_FILE, json);
  } catch {
    /* PWA-kansio valinnainen */
  }
}

export function keyOf(l) {
  return `${l.source}:${l.id}`;
}
