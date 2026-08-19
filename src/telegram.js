// Telegram-lähetys ilman ulkoisia riippuvuuksia (Bot API + fetch).
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_IDS = (process.env.TELEGRAM_CHAT_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function telegramConfigured() {
  return Boolean(TOKEN && CHAT_IDS.length);
}

async function send(chatId, text) {
  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Telegram HTTP ${r.status}: ${body}`);
  }
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatListing(l) {
  const badges = [];
  if (l.balcony) badges.push("🌿 parveke");
  if (l.parking) badges.push("🅿️ autopaikka");
  if (l.pets === "sallittu") badges.push("🐾 lemmikit ok");
  else if (l.pets === "kielletty?") badges.push("🐾 lemmikit epävarma");

  const rooms = l.rooms != null ? `${l.rooms}h` : "?h";
  const size = l.size != null ? `${l.size} m²` : "? m²";
  const rent = l.rent != null ? `${l.rent} €/kk` : "? €/kk";
  const avail = l.availableFrom ? `📅 vapautuu ${esc(l.availableFrom)}` : null;

  // Kaikki lähteet linkkeinä
  const links = (l.sources || [{ source: l.source, url: l.url }])
    .map((s) => `${esc(s.source)}: ${esc(s.url)}`)
    .join("\n");

  return [
    `🏠 <b>${esc(l.title)}</b>`,
    `${rooms} · ${size} · ${rent}`,
    `📍 ${esc(l.address)}`,
    avail,
    badges.length ? badges.join("  ") : null,
    links,
  ]
    .filter(Boolean)
    .join("\n");
}

// Lähettää yhden ilmoituksen kaikille vastaanottajille.
export async function notifyNew(listing) {
  if (!telegramConfigured()) return false;
  const text = "🔔 <b>Uusi kohde Lauttasaaressa</b>\n\n" + formatListing(listing);
  for (const id of CHAT_IDS) await send(id, text);
  return true;
}

export async function notifyText(text) {
  if (!telegramConfigured()) return false;
  for (const id of CHAT_IDS) await send(id, text);
  return true;
}

// node src/telegram.js --test
if (process.argv.includes("--test")) {
  if (!telegramConfigured()) {
    console.error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_IDS puuttuu ympäristömuuttujista.");
    process.exit(1);
  }
  notifyText("✅ Lauttasaari-tutka: testiviesti. Yhteys toimii!")
    .then(() => console.log("Testiviesti lähetetty."))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
