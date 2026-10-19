# Clan LAN Planner

Planungs-Tool für einen Clan auf einer LAN-Party oder Messe, mit Login über Discord: wer kommt mit, wer sitzt wo, wer hat gebucht.

- **Sitzplan**: Reihen mit Tischen zu zweit, Plätze selbst aussuchen, Doppelplätze, Kontaktpersonen als Farben
- **Freigabe**: Unbekannte kommen erst rein, wenn ihre Kontaktperson per Discord-Knopf zustimmt (oder die Orga)
- **Bedarfsabfrage**: Zusage und Absage mit Fristen, Warteliste mit automatischem Nachrücken, Platzwahl bis zum Buchungsstart
- **Buchung**: Buchungscode und -link nur für Zugesagte, Abhaken „gebucht“ mit dem tatsächlichen Platz
- **Discord-Bot**: Direktnachrichten und Erinnerungen, Ankündigung mit privatem Thread, Event-Rolle für alle Zugesagten
- **Orga-Bereich**: Teilnehmer, Nachrichten, Protokoll, Import und Export

## Eigene Erweiterungen

Was nur für deinen Clan sinnvoll ist, baust du als [Nuxt-Layer](https://nuxt.com/docs/guide/going-further/layers) in einen Ordner unter `layers/`, ohne den Planner selbst zu ändern. Nuxt bindet jeden Ordner dort von selbst ein.

- Ein Layer bringt eigene Seiten, APIs und Server-Routen mit.
- Links hängt er über `moduleLinks` in seiner `app/app.config.ts` in die Kopfleiste (`header`) und die Orga-Reiter (`orga`); mit `flag` lässt sich ein Link über einen Schalter in `runtimeConfig.public` ausblenden.
- Weitere Skript-Quellen für die CSP ergänzt er über `runtimeConfig.csp.scriptSrc`.
- Daten legt er im allgemeinen Modul-Speicher ab (Tabellen `docs` und `assets` in `server/database/schema.ts`), damit es bei einer Kette von Migrationen bleibt.

Alternativ bindest du den Planner in deinem eigenen Repository per `extends: ['github:Golorus/clan-lan-planner#<tag>']` ein und legst dort nur deine Layer ab.

## Kein Support

**Dieses Projekt wird ohne jeden Support veröffentlicht.** Du kannst es benutzen, verändern und weitergeben, aber:

- Es gibt keine Hilfe bei Einrichtung, Betrieb, Updates oder Fehlern, weder per Discord noch per E-Mail noch über Issues.
- Issues und Pull Requests werden eventuell nie beantwortet.
- Es gibt keine Zusage, dass es Updates gibt oder dass ein Update zu deiner Installation passt.
- Du betreibst deine Instanz selbst und bist selbst verantwortlich, auch für Impressum, Datenschutz und die Daten deiner Leute.

Wenn du nicht selbst einen Server mit Docker betreiben und Fehler selbst eingrenzen willst, ist das Tool nichts für dich.

## Voraussetzungen

Jeder Clan betreibt eine eigene Instanz. Bevor du anfängst, brauchst du:

**Server**
- einen Linux-Server (ein kleiner VPS reicht) mit Docker und Docker Compose
- eine Domain oder Subdomain, die auf den Server zeigt
- einen Reverse Proxy mit HTTPS davor (die mitgelieferte `docker-compose.yml` ist für Traefik ausgelegt)
- `sqlite3` auf dem Server für das Backup der Datenbank

**Discord**
- einen eigenen Discord-Server für deinen Clan, auf dem du Rollen und Berechtigungen verwalten darfst
- eine eigene Discord-Anwendung im [Developer Portal](https://discord.com/developers/applications) mit
  - OAuth2-Redirect `https://<deine-domain>/auth/discord` (Login fragt nur `identify` an)
  - Bot mit eingeschaltetem **Server Members Intent**
  - *Interactions Endpoint URL* `https://<deine-domain>/api/discord/interactions` (für die Knöpfe in den Nachrichten)
- den Bot auf deinem Server mit den Rechten: Einladung erstellen, Veranstaltungen verwalten, Rollen verwalten sowie im Ankündigungskanal Kanäle ansehen, Nachrichten senden, @everyone erwähnen, private Threads erstellen, in Threads schreiben und Threads verwalten
- drei Rollen: eine **Orga-Rolle** (kommt in `/orga`), optional eine **Clan-Rolle** (darf ohne Freigabe mitmachen) und eine **Event-Rolle**, die der Bot den Zugesagten gibt. Die Event-Rolle steht ganz unten, die Bot-Rolle direkt darüber.

**Für die Entwicklung**: Node 24 (oder ≥ 22.21).

Was genau wo einzutragen ist, steht Schritt für Schritt in [ANLEITUNG-VPS.md](ANLEITUNG-VPS.md).

## Selbst hosten

Die Schritt-für-Schritt-Anleitung steht in [ANLEITUNG-VPS.md](ANLEITUNG-VPS.md). Sie geht von einem Server aus, auf dem schon ein **Traefik** als Reverse Proxy läuft, darauf sind die `labels` in [docker-compose.yml](docker-compose.yml) ausgelegt. Mit einem anderen Reverse Proxy (Caddy, nginx …) passt du das selbst an. Die App lauscht im Container auf Port 3000. Eine Testumgebung mit ausgedachten Daten, die sich bei jedem Commit auf `qa` selbst neu ausrollt, beschreibt [ANLEITUNG-QA.md](ANLEITUNG-QA.md).

Alle Einstellungen stehen in [.env.example](.env.example). Kopiere sie nach `.env` und fülle sie aus. Name der App und der Event-Rolle legst du mit `NUXT_PUBLIC_APP_NAME` und `NUXT_PUBLIC_EVENT_ROLE_NAME` fest, ohne den Code zu ändern.

Lokal entwickeln: `npm install`, `.env` anlegen, `npm run dev`. Tests: `npm test` (Unit-Tests) und `npm run test:e2e` (über die echte API, startet selbst einen Test-Server ohne echten Discord-Bot).

## Lizenz

MIT, siehe [LICENSE](LICENSE). Der Sitzplan ist nach dem Vorbild des Seat-Planners von Tobias Brinke (MIT) gebaut, siehe [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
