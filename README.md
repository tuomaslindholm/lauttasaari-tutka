# 🛰️ Lauttasaari-tutka

Asuntotutka Lauttasaareen: kerää **myytävät asunnot Oikotieltä**, suodattaa kriteereillä,
**rikastaa** jokaisen kohteen tarkoilla tiedoilla (velaton hinta, parveke, rakennusvuosi,
kerros, postinumero), **pisteyttää** kohteet plussien mukaan, lähettää **Telegram-hälytyksen**
heti uudesta kohteesta ja tarjoaa **PWA-selailunäkymän** puhelimeen.

> Haku on muutettu vuokra-asunnoista myytäviin. Vuokrausportaalit (Vuokraovi, Qasa) on poistettu.
> Toistaiseksi lähteenä on vain Oikotie; Etuovi on listattu Vaihe 3 -ideoihin.

## Näin se toimii

Jokaisella hakukierroksella ([`src/index.js`](src/index.js)):

1. **Hae** myytävät kohteet portaaleista (Oikotie: kortti-API, aluekoodilla rajattu Lauttasaareen).
   Yhden portaalin hajoaminen ei kaada muita.
2. **Suodata** kriteereillä (3h+, velaton hinta ≤475 000 €). Puuttuvaa tietoa ei karsita.
3. **Deduplikoi** portaalien välillä (katuosoite + neliöt) → sama asunto yhtenä, kaikki linkit.
   Saman portaalin kaksi ilmoitusta pidetään erillisinä (saman talon samankokoiset huoneistot).
4. **Rikasta** Oikotien kohdetiedoista: parveke, rakennusvuosi, kerros, postinumero,
   vapautumispäivä. Tarkka velaton hinta karsitaan vielä uudelleen rikastuksen jälkeen.
5. **Pisteytä ja järjestä** plussien mukaan (ks. alla).
6. **Hälytä** Telegramiin vain *uusista* kohteista (tila `data/seen.json`).
7. **Tallenna** feed (`data/listings.json` + `pwa/listings.json`) PWA:ta varten.

## Kriteerit (muokattavissa)

Kaikki on tiedostossa [`config.js`](config.js):

**Pakolliset (karsivat):**

- vähintään **3 huonetta**
- **velaton hinta enintään 475 000 €**
- alue **Lauttasaari** (postinumerot 00200 ja 00210)

**Plussat (eivät karsi, nostavat kohteen ylemmäs listassa).** Painot ovat `config.js`:n
`weights`-kohdassa; suurempi pistemäärä = ylemmäs.

| Plussa | Pisteet | Huomio |
| --- | --- | --- |
| 🌿 **Parveke** | 50 | "Aika oleellinen": painaa enemmän kuin kaikki muut plussat yhteensä (46), mutta parvekkeeton kohde ei putoa pois |
| 💰 **Hinta** | 0–20 | Täydet pisteet ≤400 000 €, laskee lineaarisesti nollaan 475 000 €:ssa |
| 🔝 **Ylin kerros** | 10 | Rakenteinen kerrostieto (esim. 5/5) tai maininta kuvauksessa |
| 📮 **00200** | 8 | 00210 kelpaa mutta ei saa plussaa |
| 🏛️ **Rakennettu ≤1960** | 8 | |

Parvekkeeksi ei lasketa mainintaa "ei parveketta" / "ilman parveketta". Yhteinen kattoterassi
ei myöskään laske parvekkeeksi (avainsanana vain `parvek`, `balkong`).

## 1. Telegram-botin luonti (kertaluontoinen, ~3 min)

1. Avaa Telegram, etsi **@BotFather**, lähetä `/newbot`. Anna botille nimi. Saat **tokenin**
   (muotoa `123456789:AAH...`). Tämä on `TELEGRAM_BOT_TOKEN`.
2. Selvitä chat-id:t (kenelle viestit menevät):
   - Helpoin tapa molemmille: luo **Telegram-ryhmä**, lisää sinne botti ja te molemmat.
     Lähetä ryhmään joku viesti, avaa selaimessa
     `https://api.telegram.org/bot<TOKEN>/getUpdates` ja etsi `"chat":{"id":-123...}`.
     Ryhmän id on **negatiivinen** luku.
   - Tai erikseen: te molemmat avaatte botin ja painatte **Start**, sitten sama `getUpdates`
     antaa kummankin henkilökohtaisen (positiivisen) id:n. Laita ne pilkulla eroteltuna.
3. `TELEGRAM_CHAT_IDS` = esim. `-1002345678` (ryhmä) tai `11111111,22222222` (kaksi henkilöä).

## 2. Aja koneella (testi)

Node 20+ vaaditaan.

```bash
cd lauttasaari-tutka
cp .env.example .env      # täytä token + chat-id:t
node --env-file=.env src/telegram.js --test   # lähettää testiviestin
node --env-file=.env src/index.js             # yksi hakukierros
node --env-file=.env src/index.js --watch     # jää seuraamaan (20 min välein)
```

Ensimmäisellä ajolla tutka **ei spämmää** koko listaa — se lähettää vain "käynnistetty"-viestin
ja hälyttää jatkossa vain **uusista** kohteista. Vanha vuokra-asuntojen tila (`data/seen.json`)
hylätään automaattisesti, joten siirtymä myytäviin alkaa puhtaalta pöydältä.

### Tarkista ensimmäisen oikean ajon jälkeen

Oikotien rajapinta ei ole julkinen eikä dokumentoitu. Rakennusvuoden, kerroksen, postinumeron
ja parvekkeen kenttänimet on kirjoitettu useina vaihtoehtoina ([`src/portals/oikotie.js`](src/portals/oikotie.js)),
ja ajon loki kertoo kuinka monelta kohteelta kukin tieto löytyi:

```
✚ rikastettu 24/24 kohdetta; tieto löytyi portaalilta: parveke 22, rakennusvuosi 24, kerros 24, postinumero 24
```

Jos jokin luku on 0, loki varoittaa (`⚠️ rakennusvuosi: ei löytynyt…`). Silloin kenttänimi
täytyy lisätä `buildingInfo()`-funktioon; kohteita ei silti karsita tiedon puutteen vuoksi,
vain kyseinen plussa jää antamatta.

## 3. Ilmainen jatkuva ajo (GitHub Actions + Pages)

Jotta tutka pyörii vaikka kone on kiinni:

1. Luo GitHub-repo ja työnnä tämä kansio sinne.
2. Repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_IDS`
3. Repo → **Settings → Pages → Source: GitHub Actions**.
4. Valmis. [`.github/workflows/tutka.yml`](.github/workflows/tutka.yml) ajaa kerääjän n. 20 min
   välein, lähettää hälytykset, tallentaa tilan ja julkaisee PWA:n. Voit myös ajaa käsin:
   repo → **Actions → Lauttasaari-tutka → Run workflow**.

PWA löytyy sitten osoitteesta `https://<käyttäjä>.github.io/<repo>/`.

## 4. PWA:n asennus puhelimeen

Avaa PWA-osoite puhelimen selaimessa → **Lisää aloitusnäyttöön**. Sovellus:

- listaa kaikki täsmäävät kohteet (parhaat pisteet ylhäällä)
- välilehdet: Kaikki · ❤️ Kiinnostaa · ✨ Uudet · 🌿 Parveke · 🔝 Ylin kerros · 🗑️ Piilotetut
- jokaisesta suorat linkit portaaleihin + karttaan
- "Kiinnostaa/Piilota" tallentuu puhelimeen (kummallakin oma näkymä)

## Rakenne

```
config.js            # hakukriteerit
src/index.js         # pääputki: hae → suodata → deduplikoi → hälytä → tallenna
src/portals/         # oikotie.js (helppo lisätä uusia)
src/filter.js        # karsinta + plussamerkinnät + pisteytys
src/telegram.js      # Telegram-lähetys
src/store.js         # tila (seen.json) + feed (listings.json)
pwa/                 # asennettava selailunäkymä
.github/workflows/   # ilmainen ajastettu ajo
data/                # generoitu: seen.json, listings.json
```

## Uuden portaalin lisääminen

Tee `src/portals/uusi.js`, joka vie funktion palauttaen taulukon näitä olioita:

```js
{ source, id, url, rooms, size, price, address, district, title, text, image, published,
  yearBuilt, floor, floorCount, postalCode }   // price = velaton hinta; kolme viimeistä valinnaisia
```

Kytke se [`src/index.js`](src/index.js):n `collect()`-funktioon ja `config.portals`-lippuun.
Deduplikointi (osoite + neliöt) yhdistää saman asunnon eri portaaleista automaattisesti.
Puuttuvat kentät saa jättää `null`:ksi — niitä ei karsita.

## Vaihe 3 -ideat

- **Facebook**: puoliautomaatti (appi avaa valmiit ryhmähaut) — ToS-syistä ei täysautomaattia.
- **WhatsApp-hälytykset** Telegramin rinnalle (Twilio).
- **Etuovi** toiseksi myyntilähteeksi (suurin myyntiportaali; osa kohteista on vain siellä).
  Dedupe yhdistää sen Oikotien kanssa osoitteen + neliöiden perusteella.
- **Hintahistoria / hinnanlasku-hälytys** (nyt hälytetään vain uudesta kohteesta).
- **Postinumeron varmistus**: jos Oikotie ei anna postinumeroa, 00200-plussa jää antamatta.

## Huomioita

- Portaalien käyttöehdot yleensä rajoittavat automaattista kaavintaa. Tämä on tarkoitettu
  **henkilökohtaiseen, pienimuotoiseen** käyttöön harvalla taajuudella. Jos portaali muuttuu tai
  estää, yhden hajoaminen ei kaada muita (virheet siedetään kerääjässä).
- Älä laita `.env`-tiedostoa julkiseen repoon (se on `.gitignore`ssa).
