# 🛰️ Lauttasaari-tutka

Vuokra-asuntotutka Lauttasaareen: kerää kohteet **Oikotieltä**, **Vuokraovelta** ja
**Qasasta**, suodattaa teidän kriteereillä, **rikastaa** jokaisen kohteen tarkoilla tiedoilla
(parveke, autopaikka, lemmikit, vapautumispäivä), lähettää **Telegram-hälytyksen** heti
uudesta kohteesta ja tarjoaa **PWA-selailunäkymän** puhelimeen.

> Vaihe 2 valmis: 3 portaalia + tarkka parveke/autopaikka/lemmikit/vapautuu-rikastus +
> Telegram + PWA. Seuraavaksi (Vaihe 3): Facebook (puoliautomaatti), WhatsApp, hintahistoria.

## Näin se toimii

Jokaisella hakukierroksella ([`src/index.js`](src/index.js)):

1. **Hae** kohteet kaikista portaaleista rinnakkain. Yhden portaalin hajoaminen ei kaada muita.
   - *Oikotie*: kortti-API, aluekoodilla rajattu Lauttasaareen.
   - *Vuokraovi*: Next.js-datarajapinta, Lauttasaari-rajattu reitti.
   - *Qasa*: GraphQL-rajapinta; koska siinä ei ole kaupunginosasuodatinta, haetaan Suomen
     uusimmat (server-side 3h+/55m²+/≤1800€) ja rajataan Lauttasaari koordinaattilaatikolla.
2. **Suodata** kriteereillä (3h+k, 55 m²+, ≤1800 €). Puuttuvaa tietoa ei karsita.
3. **Deduplikoi** portaalien välillä (katuosoite + neliöt) → sama asunto yhtenä, molemmat linkit.
4. **Rikasta** Oikotien yksityiskohdista: parveke, autopaikka, lemmikit, **vapautumispäivä**.
5. **Järjestä** niin että parvekkeelliset + autopaikalliset + lemmikit-ok nousevat kärkeen.
6. **Hälytä** Telegramiin vain *uusista* kohteista (tila `data/seen.json`).
7. **Tallenna** feed (`data/listings.json` + `pwa/listings.json`) PWA:ta varten.

## Kriteerit (muokattavissa)

Kaikki on tiedostossa [`config.js`](config.js):

- vähintään **3h+k**, vähintään **55 m²**, vuokra enintään **1800 €/kk**
- alue **Lauttasaari** (postinumerot 00200, 00210)
- **parveke** ja **autopaikka** nostavat kohteen esiin (eivät karsi)
- **lemmikit**: "kielletty"-kohteita EI karsita, ne merkitään vain lipulla (neuvoteltavissa)

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
ja hälyttää jatkossa vain **uusista** kohteista.

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

- listaa kaikki täsmäävät kohteet (uusimmat/parhaat ylhäällä)
- välilehdet: Kaikki · ❤️ Kiinnostaa · ✨ Uudet · 🌿 Parveke · 🗑️ Piilotetut
- jokaisesta suorat linkit portaaleihin + karttaan
- "Kiinnostaa/Piilota" tallentuu puhelimeen (kummallakin oma näkymä)

## Rakenne

```
config.js            # hakukriteerit
src/index.js         # pääputki: hae → suodata → deduplikoi → hälytä → tallenna
src/portals/         # oikotie.js, vuokraovi.js, qasa.js (helppo lisätä uusia)
src/filter.js        # karsinta + plussamerkinnät + lemmikkilippu
src/telegram.js      # Telegram-lähetys
src/store.js         # tila (seen.json) + feed (listings.json)
pwa/                 # asennettava selailunäkymä
.github/workflows/   # ilmainen ajastettu ajo
data/                # generoitu: seen.json, listings.json
```

## Uuden portaalin lisääminen

Tee `src/portals/uusi.js`, joka vie funktion palauttaen taulukon näitä olioita:

```js
{ source, id, url, rooms, size, rent, address, district, title, text, image, published }
```

Kytke se [`src/index.js`](src/index.js):n `collect()`-funktioon ja `config.portals`-lippuun.
Deduplikointi (osoite + neliöt) yhdistää saman asunnon eri portaaleista automaattisesti.

## Vaihe 3 -ideat

- **Facebook**: puoliautomaatti (appi avaa valmiit ryhmähaut) — ToS-syistä ei täysautomaattia.
- **WhatsApp-hälytykset** Telegramin rinnalle (Twilio).
- **Lisää lähteitä**: Lumo (Kojamo), SATO, M2-Kodit (huom: nämä listaavat usein jo Oikotiessä).
- **Hintahistoria / vuokran lasku -hälytys**.
- **Qasan tarkka aluerajaus**: nyt bbox + Suomen uusimpien läpikäynti (`config.qasaMaxResults`).
  Voisi tarkentua jos Qasan alue-uid saadaan selvitettyä (vaatii kirjautuneen sessiokaappauksen).

## Huomioita

- Portaalien käyttöehdot yleensä rajoittavat automaattista kaavintaa. Tämä on tarkoitettu
  **henkilökohtaiseen, pienimuotoiseen** käyttöön harvalla taajuudella. Jos portaali muuttuu tai
  estää, yhden hajoaminen ei kaada muita (virheet siedetään kerääjässä).
- Älä laita `.env`-tiedostoa julkiseen repoon (se on `.gitignore`ssa).
