# 🛰️ Lauttasaari-tutka

Asuntotutka Lauttasaareen: kerää **myytävät asunnot Oikotieltä**, suodattaa kriteereillä,
**rikastaa** jokaisen kohteen tarkoilla tiedoilla (velaton hinta, parveke, rakennusvuosi,
kerros, postinumero), **pisteyttää** kohteet plussien mukaan, lähettää **Telegram-hälytyksen**
heti uudesta kohteesta ja tarjoaa **PWA-selailunäkymän** puhelimeen.

> Haku on muutettu vuokra-asunnoista myytäviin. Vuokrausportaalit (Vuokraovi, Qasa) on poistettu.
> Lähteinä ovat Oikotie ja Etuovi. Oikotie on laajempi: 19.10.2026 kaikki 9 Etuovin kriteereihin
> täsmäävää kohdetta löytyivät jo Oikotiesta samalla hinnalla, joten Etuovi tuo lähinnä varmuutta
> ja mahdolliset vain-Etuovessa-kohteet.

## Näin se toimii

Jokaisella hakukierroksella ([`src/index.js`](src/index.js)):

1. **Hae** myytävät kohteet portaaleista. Yhden portaalin hajoaminen ei kaada muita.
   - *Oikotie*: kortti-API, aluekoodilla rajattu Lauttasaareen.
   - *Etuovi*: selainrajapinta (`/api/v3/announcements/search/listpage`, ei kirjautumista). Haetaan
     vapaatekstillä "lauttasaari" ja "vattuniemi" (jälkimmäinen löytää kohteita, joita edellinen ei),
     ja tulokset rajataan kaupunginosan nimellä tai koordinaattilaatikolla, koska haku palauttaa
     myös muita paikkakuntia. Parveke saadaan erillisellä `apartmentHasBalcony`-haulla.
2. **Suodata** kriteereillä (3h+, velaton hinta ≤475 000 €). Puuttuvaa tietoa ei karsita.
3. **Deduplikoi** portaalien välillä → sama asunto yhtenä, kaikki linkit. Sama asunto tunnistetaan
   osoitteesta + neliöistä tai (kun osoitteet ovat eri tarkkuudella) samasta talosta, neliöistä ±1
   ja täsmälleen samasta velattomasta hinnasta. Saman portaalin kaksi ilmoitusta pidetään erillisinä
   (saman talon samankokoiset huoneistot).
4. **Rikasta** Oikotien kohdetiedoista: parveke, rakennusvuosi, kerros, postinumero,
   vapautumispäivä. Tarkka velaton hinta karsitaan vielä uudelleen rikastuksen jälkeen.
   Jo haetut tiedot pysyvät välimuistissa 12 h (ks. "Kuorma portaaleille" alla).
5. **Pisteytä ja järjestä** plussien mukaan (ks. alla).
6. **Hälytä** Telegramiin vain *uusista* kohteista (tila `data/seen.json`). Uuden portaalin
   ensimmäisellä ajolla sen valmiit kohteet merkitään hiljaa nähdyiksi, ettei koko lista lähde
   hälytyksinä. Hälytyksiä lähetetään vain `main`-haarasta, jotta koe-ajot eivät hälytä tuplia.
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

### Oikotien kentät (varmistettu oikealla datalla 6.10.2026)

Oikotien rajapinta ei ole julkinen eikä dokumentoitu, joten kenttänimet voivat muuttua.
Tutka lukee ne näin ([`src/portals/oikotie.js`](src/portals/oikotie.js)):

| Tieto | Lähde |
| --- | --- |
| Velaton hinta | kortin `price` (= kohdetietojen `priceData.price`; `priceSell` on myyntihinta ilman velkaosuutta) |
| Rakennusvuosi, kerros | kortin `buildingData.year`, `floor`, `floorCount` |
| Postinumero | kohdetietojen `adData.zipCodeInfo` (kortissa ei ole) |
| Parveke | kohdetietojen `adData.balcony` + maininta kuvauksessa |

Ajon loki kertoo kuinka monelta kohteelta kukin tieto löytyi:

```
✚ rikastettu 26/26 kohdetta; tieto löytyi portaalilta: parveke 24, rakennusvuosi 26, kerros 26, postinumero 26
```

Etuovin kentät ([`src/portals/etuovi.js`](src/portals/etuovi.js)): hinta `searchPrice` (= velaton, sama
kuin Oikotien), huoneet `roomCount`, neliöt `area`, kerros `floorLevel`/`housingCompanyFloorCount`,
rakennusvuosi `constructionFinishedYear`, parveke hakusuodattimesta. Postinumeroa listaus ei kerro;
se haetaan kohdetiedoista vain Etuovi-yksinoloille (Oikotien kohdetiedot kattavat muut).

Jos jokin luku putoaa nollaan, loki varoittaa (`⚠️ postinumero: ei löytynyt…`): silloin Oikotie
on todennäköisesti muuttanut kenttää, ja uusi nimi lisätään `buildingInfo()`-funktioon.
Kohteita ei silti karsita tiedon puutteen vuoksi, vain kyseinen plussa jää antamatta.

## 3. Ilmainen jatkuva ajo (GitHub Actions + Pages)

Jotta tutka pyörii vaikka kone on kiinni:

1. Luo GitHub-repo ja työnnä tämä kansio sinne.
2. Repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_IDS`
3. Repo → **Settings → Pages → Source: GitHub Actions**.
4. Valmis. [`.github/workflows/tutka.yml`](.github/workflows/tutka.yml) ajaa kerääjän, lähettää
   hälytykset, tallentaa tilan ja julkaisee PWA:n. Voit myös ajaa käsin:
   repo → **Actions → Lauttasaari-tutka → Run workflow**.
5. Ota käyttöön ulkoinen ajastin (alla), jotta ajot tulevat luotettavasti ja tiheään.

PWA löytyy sitten osoitteesta `https://<käyttäjä>.github.io/<repo>/`.

### Ajastin: cron-job.org (käytössä 23.10.2026 alkaen)

GitHubin oma `schedule`-ajastus ei riitä: tässä repossa se ajoi tutkaa vain 3–8 kertaa päivässä
(mitattu 29.9.–19.10.2026: ajoväli mediaaniltaan 4,8 h, pisimmillään 9,9 h), vaikka työnkulussa
lukee `*/20`. Uusi kohde saattoi siis odottaa hälytystä monta tuntia. Siksi ajon käynnistää
ulkoinen palvelu, [cron-job.org](https://cron-job.org) (ilmainen), **15 minuutin välein**.

Ajastin kutsuu GitHubin rajapintaa, joka käynnistää työnkulun (`workflow_dispatch`):

| Asetus | Arvo |
| --- | --- |
| URL | `https://api.github.com/repos/tuomaslindholm/lauttasaari-tutka/actions/workflows/tutka.yml/dispatches` |
| Menetelmä | `POST`, pyynnön sisältö `{"ref":"main"}` |
| Otsikot | `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `Content-Type: application/json` |
| Aikataulu | 15 minuutin välein (Europe/Helsinki) |
| Onnistunut vastaus | `204 No Content` |

- **Token ei kuulu repoon** (repo on julkinen). Se on vain cron-job.org:n Authorization-otsikossa.
  Se on GitHubin *fine-grained personal access token* `tutka-ajastin`, jolla on ainoastaan tämän repon
  oikeus *Actions: Read and write*.
- **Token vanhenee 30.1.2027.** Silloin cron-job.org lähettää epäonnistumisilmoituksen (401) ja
  tutka palaa GitHubin hitaaseen omaan ajastukseen. Uusiminen: GitHub →
  [Settings → Developer settings → Fine-grained tokens](https://github.com/settings/personal-access-tokens)
  → `tutka-ajastin` → **Regenerate token**, ja liitä uusi arvo cron-job.org:n Authorization-otsikkoon
  muodossa `Bearer <token>`. Samalla kannattaa tarkistaa `X-GitHub-Api-Version`: GitHub ilmoittaa
  version `2022-11-28` poistuvan käytöstä 10.3.2028.
- GitHubin oma `schedule` jää varmistukseksi. Työnkulun `concurrency` estää päällekkäiset ajot.
- Jokainen ajo tallentaa tilan repoon, joten botin `tutka: päivitä tila` -committeja kertyy
  noin 96 vuorokaudessa. Se on tarkoituksellista.

### Kuorma portaaleille

Ajoja on tiheään, joten jo haettuja kohdetietoja (parveke, rakennusvuosi, kerros, postinumero)
ei haeta joka kerta uudestaan: edellisen ajon feed toimii välimuistina, ja kohde haetaan uudelleen
vasta `config.detailRefreshHours` (12 h) jälkeen. **Uudet kohteet ja hinnanmuutokset haetaan heti**,
joten hälytykset eivät hidastu. Jos haku epäonnistuu, käytetään edellisen ajon tietoja. Lokista
näkee tilanteen: `rikastettu 24/24 kohdetta (haettu 0, välimuistista 24)`.

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
src/portals/         # oikotie.js, etuovi.js (helppo lisätä uusia)
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
- **Hintahistoria / hinnanlasku-hälytys** (nyt hälytetään vain uudesta kohteesta).

## Huomioita

- Portaalien käyttöehdot yleensä rajoittavat automaattista kaavintaa. Tämä on tarkoitettu
  **henkilökohtaiseen, pienimuotoiseen** käyttöön harvalla taajuudella. Jos portaali muuttuu tai
  estää, yhden hajoaminen ei kaada muita (virheet siedetään kerääjässä).
- Älä laita `.env`-tiedostoa julkiseen repoon (se on `.gitignore`ssa).
