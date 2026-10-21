# Clan LAN Planner auf einen VPS bringen

Am Ende läuft auf dem VPS:

- **app**: der Clan LAN Planner (Nuxt), intern auf Port 3000

Davor sitzt ein **Traefik**, der auf dem VPS schon läuft (z. B. als eigener Container mit dem Zertifikats-Resolver `letsencrypt`). Er nimmt Anfragen auf Port 80/443 an, holt das HTTPS-Zertifikat von Let's Encrypt und leitet die Domain an die App weiter. Das steuern die `labels` in `docker-compose.yml`. Am Traefik selbst musst du nichts ändern, andere Container dahinter laufen unverändert weiter.

Datenbank und Bilder liegen auf dem VPS im Projektordner unter `data/` (`data/db` und `data/uploads`).

Die Befehle unten gehen davon aus, dass du als `root` per SSH auf dem VPS bist und die App unter `/opt/clan-lan-planner` liegt. Statt `planner.example.de` setzt du überall deine Domain ein.

---

## 1. VPS vorbereiten

Im Panel deines Anbieters (bei Hostinger: hPanel → VPS) die IP-Adresse des VPS nachsehen, dann per SSH verbinden:

```bash
ssh root@DEINE-VPS-IP
```

Docker und Traefik sind schon installiert. Es fehlt nur `sqlite3` für das Backup:

```bash
docker compose version
apt update && apt install -y sqlite3
```

**Firewall**: Ports 80 und 443 sind schon offen, sonst würde Traefik nicht funktionieren. Hier ist nichts zu tun.

## 2. Domain auf den VPS zeigen lassen

Dort, wo deine Domain verwaltet wird (bei Hostinger: hPanel → *Domains* → deine Domain → *DNS / Nameserver*), einen DNS-Eintrag anlegen:

| Typ  | Name                                     | Ziel                 |
|------|------------------------------------------|----------------------|
| A    | `planner` (für planner.deine-domain.de)  | IPv4-Adresse des VPS |
| AAAA | `planner`                                | IPv6-Adresse des VPS (nur, wenn der VPS eine hat) |

Für die Hauptdomain selbst ist der Name `@`. Prüfen, ob der Eintrag schon wirkt (kann ein paar Minuten bis Stunden dauern):

```bash
# auf dem VPS
dig +short planner.example.de A       # muss die IPv4 des VPS zeigen
dig +short planner.example.de AAAA    # IPv6 des VPS oder leer, keine Strato-Adresse
```

```powershell
# oder auf dem PC (PowerShell)
Resolve-DnsName planner.example.de -Type A
Resolve-DnsName planner.example.de -Type AAAA
```

Traefik kann das Zertifikat erst holen, wenn die Domain auf den VPS zeigt.

## 3. Discord-Anwendung einrichten

Login und Bot sind **eine** Anwendung. Im [Discord Developer Portal](https://discord.com/developers/applications) auf *New Application* klicken (z. B. „Clan LAN Planner“) oder die vorhandene öffnen:

1. **OAuth2** (linkes Menü):
   - *Client ID* kopieren und *Client Secret* über *Reset Secret* erzeugen und kopieren. Das Secret wird nur einmal angezeigt.
   - Unter *Redirects* → *Add Redirect* genau diese Adresse eintragen und speichern:
     `https://planner.example.de/auth/discord`
   - Scopes musst du hier nicht einstellen. Die App fragt beim Login nur `identify` an (ID und Name, keine E-Mail). `guilds.join` fragt sie nur bei der Registrierung an, wenn jemand noch nicht auf eurem Server ist und dem Beitritt zustimmt.
2. **Bot** (linkes Menü):
   - *Reset Token* → Token kopieren. Das ist `NUXT_DISCORD_BOT_TOKEN`, ein Passwort, also nirgends posten.
   - Unter *Privileged Gateway Intents* den **Server Members Intent** einschalten und speichern. Den braucht die Mitgliedersuche in `/orga`, also Teilnehmer anlegen und Kontaktpersonen ernennen. Die anderen Intents bleiben aus.
   - *Public Bot* kannst du ausschalten. Dann kann nur noch die Besitzerin bzw. der Besitzer der Anwendung ihn auf Server holen.
3. **General Information** (linkes Menü), für die Knöpfe in den Bot-Nachrichten („Bin dabei“, „Ich habe gebucht“, „Platz annehmen“ …):
   - *Public Key* kopieren. Das ist `NUXT_DISCORD_PUBLIC_KEY` (kein Geheimnis, aber ohne ihn gehen die Knöpfe nicht).
   - Bei *Interactions Endpoint URL* diese Adresse eintragen und speichern:
     `https://planner.example.de/api/discord/interactions`

     Discord schickt beim Speichern eine Prüfanfrage. Das klappt erst, wenn die App mit dem Public Key in der `.env` läuft (Schritt 6). Schlägt das Speichern fehl, also erst starten und dann hier eintragen.
   - Ohne Public Key schickt der Bot statt der Knöpfe nur einen Link zur Seite.
4. **Bot auf euren Server einladen**: *OAuth2 → URL Generator* → Scope **`bot`** anhaken. Darunter bei *Bot Permissions* genau diese Berechtigungen anhaken:
   - **„Create Instant Invite“** (Einladung erstellen): Damit fügt der Bot Leute bei der Registrierung mit ihrer Zustimmung eurem Server hinzu.
   - **„Manage Events“** (Veranstaltungen verwalten): Damit erzeugt der Bot aus einem Event ein Discord-Event.
   - **„Manage Roles“** (Rollen verwalten): Damit gibt der Bot den Zugesagten die Event-Rolle und nimmt sie bei Absage wieder weg.
   - Für die Ankündigung in #organisation mit privatem Thread: **„View Channels“** (Kanäle ansehen), **„Send Messages“** (Nachrichten senden), **„Mention @everyone, @here, and All Roles“** (@everyone erwähnen), **„Create Private Threads“** (private Threads erstellen), **„Send Messages in Threads“** (Nachrichten in Threads senden) und **„Manage Threads“** (Threads verwalten, zum Herausnehmen bei Absage). Diese kannst du statt serverweit auch nur für #organisation in den Kanal-Berechtigungen der Bot-Rolle setzen.

   Den erzeugten Link öffnen, euren Server wählen und autorisieren. Direkt geht es auch so:
   `https://discord.com/oauth2/authorize?client_id=DEINE-CLIENT-ID&scope=bot&permissions=369635757057`

   Ist der Bot schon auf dem Server, kannst du den Link einfach erneut öffnen. Alternativ gibst du der Bot-Rolle in Discord unter *Servereinstellungen → Rollen* die fehlenden Berechtigungen.
5. **Rollenreihenfolge** in Discord unter *Servereinstellungen → Rollen*, von unten nach oben:
   - ganz unten `@everyone`,
   - direkt darüber die **Event-Rolle** (`NUXT_DISCORD_EVENT_ROLE_ID`),
   - direkt darüber die **Rolle des Bots** (heißt meist wie die Anwendung),
   - darüber alle anderen Rollen, auch die Orga-Rolle.

   Discord lässt einen Bot nur Rollen vergeben, die **unter** seiner eigenen stehen. So kann der Bot technisch nur die Event-Rolle anfassen, selbst wenn im Planner etwas falsch eingestellt wäre. Der Planner prüft zusätzlich vor jedem Aufruf, dass es genau die Event-Rolle ist, setzt sie nur einzeln (nie die ganze Rollenliste eines Mitglieds) und legt nie Rollen an, ändert oder löscht sie. Steht die Bot-Rolle zu tief, meldet „Rolle abgleichen“ in `/orga` das verständlich.
6. **IDs kopieren**: In Discord *Einstellungen → Erweitert → Entwicklermodus* einschalten. Dann Rechtsklick auf dich → *User-ID kopieren* (für `NUXT_LEADER_DISCORD_ID`) und Rechtsklick auf den Server → *Server-ID kopieren* (für `NUXT_DISCORD_GUILD_ID`).

Direktnachrichten kommen nur an, wenn der Empfänger auf eurem Server ist und DMs von Servermitgliedern erlaubt (Discord: *Privatsphäre-Einstellungen des Servers → Direktnachrichten*). Fehlgeschlagene Zustellungen siehst du in `/orga/nachrichten`.

## 4. Projekt auf den VPS kopieren

Der Code liegt unter [Golorus/clan-lan-planner](https://github.com/Golorus/clan-lan-planner). Ist das Repository öffentlich, reicht ein einfaches Klonen:

```bash
git clone https://github.com/Golorus/clan-lan-planner.git /opt/clan-lan-planner
```

Für einen privaten Fork bekommt der VPS einen eigenen **Deploy-Key**: einen SSH-Schlüssel, der nur dieses eine Repo lesen kann.

**a) Schlüssel auf dem VPS erzeugen:**

```bash
ssh-keygen -t ed25519 -N "" -C "planner-vps" -f ~/.ssh/planner_deploy
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/planner_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh-keyscan github.com >> ~/.ssh/known_hosts
cat ~/.ssh/planner_deploy.pub     # diese eine Zeile kopieren
```

**b) Öffentlichen Schlüssel bei GitHub eintragen.** Entweder auf dem PC (PowerShell, im Projektordner, die kopierte Zeile einsetzen):

```powershell
Set-Content -Encoding ascii planner_deploy.pub "ssh-ed25519 AAAA... planner-vps"
& "C:\Program Files\GitHub CLI\gh.exe" repo deploy-key add planner_deploy.pub --title "Hostinger-VPS"
Remove-Item planner_deploy.pub
```

oder im Browser: Repo → *Settings → Deploy keys → Add deploy key*, Titel `Hostinger-VPS`, Zeile einfügen, *Allow write access* **nicht** anhaken.

Der öffentliche Schlüssel (`.pub`) ist nicht geheim. Der private Teil `~/.ssh/planner_deploy` bleibt auf dem VPS.

**c) Auf dem VPS prüfen und klonen:**

```bash
ssh -T git@github.com            # „Hi Golorus/clan-lan-planner! You've successfully authenticated…“
git clone git@github.com:Golorus/clan-lan-planner.git /opt/clan-lan-planner
```

Ohne Git geht es auch per `scp` von Windows (PowerShell), dabei ohne `node_modules`, `.nuxt`, `.output`, `data` und `.env`:

```powershell
ssh root@DEINE-VPS-IP "mkdir -p /opt/clan-lan-planner"
scp -r app server shared layers scripts deploy package.json package-lock.json nuxt.config.ts drizzle.config.ts tsconfig.json Dockerfile docker-compose.yml .dockerignore .env.example root@DEINE-VPS-IP:/opt/clan-lan-planner/
```

## 5. Umgebungsvariablen setzen

```bash
cd /opt/clan-lan-planner
cp .env.example .env
openssl rand -base64 48        # Ergebnis als NUXT_SESSION_PASSWORD verwenden
nano .env
chmod 600 .env
```

In `.env` ausfüllen:

| Variable | Wert |
|---|---|
| `DOMAIN` | `planner.example.de` (ohne `https://`) |
| `NUXT_SESSION_PASSWORD` | das Ergebnis von `openssl rand -base64 48` |
| `NUXT_LEADER_DISCORD_ID` | deine Discord-User-ID (Notzugang zu `/orga`, auch ohne Rolle) |
| `NUXT_OAUTH_DISCORD_CLIENT_ID` / `_SECRET` | aus Schritt 3 |
| `NUXT_OAUTH_DISCORD_REDIRECT_URL` | `https://planner.example.de/auth/discord` (genau wie in Discord eingetragen) |
| `NUXT_DISCORD_BOT_TOKEN` | Bot-Token aus Schritt 3 |
| `NUXT_DISCORD_GUILD_ID` | Server-ID |
| `NUXT_DISCORD_ORGA_ROLE_ID` | ID eurer Orga-Rolle: wer diese Rolle auf eurem Server hat, kommt in `/orga` |
| `NUXT_DISCORD_MEMBER_ROLE_ID` | ID eurer Clan-Rolle: wer sie hat, darf ohne Freigabe mitmachen. Alle anderen fragen im Planner eine Freigabe an, die ihre Kontaktperson per Discord-Knopf oder die Orga unter *Teilnehmer* erteilt. Leer = jedes Mitglied eures Servers. Unbekannte holt der Planner erst nach der Freigabe auf euren Server. In /orga › Teilnehmer › Freigaben änderbar (jedes Server-Mitglied, nur Clan-Rolle oder niemand ohne Freigabe); das gilt dann statt der .env |
| `NUXT_DISCORD_EVENT_ROLE_ID` | ID der Event-Rolle, die der Bot den Zugesagten gibt. Nie dieselbe ID wie die Orga-Rolle, sonst gilt keine von beiden. Lässt sich auch in `/orga` umstellen |
| `NUXT_PUBLIC_APP_NAME`, `NUXT_PUBLIC_EVENT_ROLE_NAME` | optional: Name der App und wie die Event-Rolle in den Texten heißt (leer = „Clan LAN Planner“ und „Event-Rolle“) |
| `NUXT_DISCORD_PUBLIC_KEY` | Public Key aus Schritt 3 (*General Information*), für die Knöpfe in den Nachrichten |
| `NUXT_PUBLIC_IMPRESSUM_NAME`, `_STREET`, `_CITY`, `_EMAIL` (optional `_NOTE`) | Angaben fürs Impressum unter `/impressum`: Name, Straße mit Hausnummer, PLZ und Ort, E-Mail |
| `NUXT_APP_URL` | leer lassen; nur setzen, wenn Links in Nachrichten nicht auf `https://DOMAIN/` zeigen sollen |

Wichtig: Wenn du `NUXT_SESSION_PASSWORD` später änderst, sind alle abgemeldet.

## 6. Starten

```bash
cd /opt/clan-lan-planner
mkdir -p data/db data/uploads
chown -R 1000:1000 data          # die App läuft im Container als Benutzer „node“ (1000)
docker compose up -d --build
docker compose logs -f           # Strg+C beendet nur die Anzeige
```

Beim ersten Start legt die App die Datenbank an. Traefik erkennt den neuen Container von selbst und holt beim ersten Aufruf der Domain das Zertifikat. Das dauert ein paar Sekunden. Zeigt die Seite dauerhaft eine Zertifikatswarnung, steht der Grund im Traefik-Log:

```bash
docker logs traefik-traefik-1 --since 10m
```

Prüfen:

1. `https://planner.example.de` öffnen. Du siehst die Startseite mit „Mit Discord anmelden“. Den Sitzplan sehen nur angemeldete Mitglieder eures Discord-Servers (und Gäste, die du in `/orga` einträgst).
2. Anmelden. Oben erscheint „Orga“, und `/orga` zeigt die Orga-Übersicht.
3. Unter **Discord** (`/orga/discord`) **Test-Nachricht senden** klicken. Du bekommst eine DM vom Bot.

### Sitzplan einrichten

In `/orga` führt eine Checkliste durch die Schritte. Der Ablauf hat zwei Phasen, wie bei LANs mit Platzbuchung über den Veranstalter üblich:

- **Bedarfsabfrage** bis zur Frist „Bedarfsabfrage bis“: Jeder sagt „Bin dabei“ oder „Bin nicht dabei“ und wählt einen Platz. Wer schon einmal dabei war, steht im neuen Event automatisch als „offen“ und wird erinnert (z. B. 14, 7 und 2 Tage vor der Frist, mit Knöpfen direkt in der Discord-Nachricht). Danach: keine neuen Zusagen mehr, nur noch Warteliste; Plätze ändert nur noch die Orga; absagen geht weiter. Die Zahl und die Platz-IDs für den Veranstalter stehen unter **Zusagen & Buchung › Meldung an den Veranstalter**.
- **Buchung**: Buchungscode, Link und „Buchen bis“ unter **Events › Fristen & Buchung** eintragen, dann unter **Zusagen & Buchung** auf **Buchung freigeben**. Alle Zugesagten bekommen ihren Code, den Link und ihren geplanten Platz. Wer gebucht hat, meldet das per Knopf; Abweichungen vom Plan siehst du dort und kannst sie übernehmen.
- **Gemeldeter Bereich**: Nach der Bedarfsabfrage markierst du unter **Sitzplan** den Block, den du dem Veranstalter meldest (Plätze anklicken, Umschalt+Klick für von–bis), und fixierst ihn. Wer außerhalb sitzt, verliert seinen Platz und bekommt eine Nachricht; Teilnehmer setzen sich dann nur noch, wenn sie keinen Platz haben, Kontaktpersonen setzen und tauschen ihre Leute frei – alles nur im Bereich –, und es gibt höchstens so viele Zusagen wie Plätze im Bereich.
- **Warteliste**: ab dem Ende der Bedarfsabfrage (oder wenn eine Höchstzahl erreicht ist). Sagt jemand ab, bekommt der Erste auf der Warteliste den Platz angeboten, mit Frist (Standard 48 Stunden). Verwalten unter **Warteliste**.
- Erinnerungen und Angebote verschickt die App jede Minute von selbst (auch nach einem Neustart nicht doppelt).

Die Schritte:

1. **Events**: Event anlegen mit Name, Beginn und Ende (mit Uhrzeit), Ort und Beschreibung. Ab dem zweiten Event kannst du die Reihen vom vorigen übernehmen. Mit **„Discord-Event erstellen“** wird daraus ein Discord-Event mit Zeitraum, Ort, Beschreibung und Link zum Sitzplan. Ein erneuter Klick aktualisiert dasselbe Discord-Event.
2. **Sitzplan**: Reihen anlegen, z. B. Reihe A ab 81. Jede Reihe hat 40 Plätze, zusätzlich stellst du den Teppich vorn, hinten oder beidseitig ein.
3. **Kontaktpersonen**: aus den Discord-Mitgliedern ernennen. Sie gelten für alle künftigen Events.
4. **Personen**: Personen bleiben über alle Events bestehen (Nick, Discord, Kontaktperson, Avatar). Gäste legst du unter **Personen** an; sie stehen dann als „offen“ im Event. Den Status kannst du unter **Teilnehmer** jederzeit setzen.
5. **Events › Fristen & Buchung**: „Bedarfsabfrage bis“ (optional früher „Sitzplatzwahl bis“), Erinnerungs-Zeitpunkte, Warteliste, Höchstzahl; später Buchungscode und Link. Dann in der Übersicht die **Bedarfsabfrage öffnen**. Der Schalter schließt sie bei Bedarf auch vorzeitig.
6. **Event-Rolle** in der Übersicht prüfen und **Rolle abgleichen**. Der Bot gibt sie den Zugesagten des aktuellen Events; wird ein neues Event aktuell, nimmt er sie allen, die dort (noch) nicht zugesagt haben.
7. **Info-Nachricht**: Wer zusagt, bekommt automatisch eine Direktnachricht mit Event, Platz und Link zur App. Alle Texte der automatischen Nachrichten änderst du unter **Nachrichten**.

Kontaktpersonen sehen unter `/kontakt` dieselbe Übersicht für ihre Leute, können sie erinnern und den Buchungsstatus setzen; bei Absagen und beim Nachrücken bekommen sie eine Nachricht. Teilnahmen bleiben auch nach dem Event erhalten. Jeder kann seine Daten auf der Startseite unter *Meine Daten* selbst löschen und dort auch Erinnerungen abbestellen.

### Aktualisieren

```bash
cd /opt/clan-lan-planner
git pull                          # bzw. neue Dateien per scp kopieren
docker compose up -d --build
```

Neue Datenbank-Migrationen werden beim Start automatisch angewendet.

## 7. Backup von Datenbank und Uploads

`deploy/backup.sh` erstellt eine Datei `planner-JJJJ-MM-TT_HHMM.tar.gz` mit Datenbank und allen Bildern und löscht Sicherungen, die älter als 14 Tage sind:

```bash
chmod +x /opt/clan-lan-planner/deploy/backup.sh
/opt/clan-lan-planner/deploy/backup.sh                   # nach /root/backups/clan-lan-planner
```

Jede Nacht um 3 Uhr automatisch:

```bash
crontab -e
# diese Zeile hinzufügen:
0 3 * * * /opt/clan-lan-planner/deploy/backup.sh >> /var/log/planner-backup.log 2>&1
```

Ein Backup auf dem gleichen VPS hilft nicht, wenn der VPS weg ist. Hol dir die Sicherungen deshalb regelmäßig auf deinen PC (PowerShell):

```powershell
scp "root@DEINE-VPS-IP:/root/backups/clan-lan-planner/*.tar.gz" "$HOME\Backups\clan-lan-planner\"
```

Zusätzlich kannst du im hPanel die Snapshot-/Backup-Funktion des VPS nutzen.

### Wiederherstellen

```bash
cd /opt/clan-lan-planner
docker compose stop app
mkdir -p /tmp/restore && tar -xzf /root/backups/clan-lan-planner/planner-DATUM.tar.gz -C /tmp/restore
rm -f data/db/planner.sqlite-wal data/db/planner.sqlite-shm
cp /tmp/restore/planner.sqlite data/db/planner.sqlite
rm -rf data/uploads && cp -r /tmp/restore/uploads data/uploads
chown -R 1000:1000 data
docker compose start app
```

---

## Lokal entwickeln (Windows)

```powershell
npm install            # falls npm mit „edgesOut“ abbricht: npx npm@11 install
copy .env.example .env # NUXT_SESSION_PASSWORD und NUXT_LEADER_DISCORD_ID reichen lokal
npm run dev
```

Ohne Discord-Zugangsdaten meldet `http://localhost:3000/auth/dev-login` dich als Projektleiter an, `…/auth/dev-login?as=123456789012345678&name=Anna` als beliebige andere Person. Diese Route gibt es nur in `npm run dev`, nicht im Docker-Build. Ohne Bot-Token überspringt der Dev-Server die Prüfung, ob jemand auf dem Discord-Server ist. Nachrichten landen dann als Fehler in `/orga/nachrichten`.

Tests:

- `npm test`: Unit-Tests in `tests/*.test.ts`, je Datei ein Modul (Sitzplan, Registrierung, Checkliste, Nachrichtentexte, Knöpfe, Einrichtung, Rollenschutz, Signaturprüfung …), ohne Server
- `npm run test:e2e`: Rechte und Abläufe über die echte API, nach Themen in `tests/e2e/01-…` bis `10-…`. Startet dafür selbst einen Dev-Server mit eigener Datenbank, ohne echten Discord-Bot und mit dem Test-Schlüssel für die Knöpfe, und beendet ihn danach (`tests/e2e/run.mjs`)
- Testdaten ansehen: Nach `npm run test:e2e` liegen die Testdaten in `test-out/sitzplan.sqlite`. Mit `NUXT_DB_PATH=./test-out/sitzplan.sqlite` und `NUXT_LEADER_DISCORD_ID=410000000000000001` in der lokalen `.env` zeigt `npm run dev` sie an (Anmeldung über `/auth/dev-login`). Läuft der Dev-Server während des Tests, bleiben die alten Testdaten stehen, der Test sagt dann Bescheid.
- `npm run test:e2e:server`: dasselbe gegen einen schon laufenden Dev-Server (`BASE=…`); der muss so gestartet sein wie in `tests/e2e/run.mjs`

Nuxt 4.6 verlangt Node ≥ 22.21 oder 24; der Container nutzt Node 24.
