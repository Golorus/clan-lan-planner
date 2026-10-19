# QA-Umgebung: Testseite mit ausgedachten Daten

Neben der Live-App läuft auf dem VPS eine zweite Instanz aus dem Branch **`qa`**, z. B. unter `qa.planner.example.de`.
Neue Funktionen landen zuerst dort. Erst wenn sie passen, kommt `qa` per Pull Request nach `main` und damit live.

- **Ausgedachte Daten:** Die QA-Instanz hat keine Volumes. Jeder Deploy startet mit leerer Datenbank und legt ein Demo-Event mit Kontaktpersonen, Teilnehmern, Plätzen und einer offenen Freigabe an (`server/utils/demo.ts`). Echte Daten kommen nie nach QA.
- **Ohne Discord testen:** Auf der Startseite kann man sich als *Demo-Orga*, *Demo-Kontakt*, *Demo-Teilnehmer* oder *Demo-Neu* anmelden. Das geht nur mit `NUXT_PUBLIC_DEMO=true`, also nur in QA. Nachrichten an Demo-Personen werden nicht verschickt, sind aber unter *Orga › Nachrichten* zu lesen.
- **Passwortschutz:** Die ganze Seite liegt hinter Basic Auth (Traefik). Nur die Discord-Knöpfe (`/api/discord/interactions`) gehen ohne; die prüft der Planner selbst per Signatur.
- **Automatisch ausrollen:** Ein systemd-Timer schaut jede Minute, ob es auf `qa` einen neuen Commit gibt, und baut dann neu (`deploy/qa/auto-deploy.sh`). Er liest mit dem Deploy-Key, den der VPS schon hat. Es liegen keine Geheimnisse bei GitHub.

## Einmal einrichten

### 1. Subdomain

Beim Domain-Anbieter einen A-Eintrag `qa.planner` auf dieselbe IP wie `planner` setzen (wie in ANLEITUNG-VPS.md, Schritt 2).

### 2. Branch `qa` anlegen

Auf GitHub oder lokal: `git push origin main:qa`. Danach entsteht jede Änderung zuerst auf `qa`.

### 3. Zweiten Checkout auf dem VPS

```bash
git clone -b qa git@github.com:Golorus/clan-lan-planner.git /opt/lan-planner-qa
cd /opt/lan-planner-qa
cp deploy/qa/.env.example deploy/qa/.env
nano deploy/qa/.env
```

In `deploy/qa/.env` mindestens `DOMAIN`, `QA_BASIC_AUTH`, `NUXT_SESSION_PASSWORD` und `NUXT_APP_URL` ausfüllen. Das Passwort für die Testseite erzeugst du so (`apt install apache2-utils`, falls `htpasswd` fehlt):

```bash
htpasswd -nbB qa 'DEIN-PASSWORT'
```

Die ausgegebene Zeile in **einfachen** Anführungszeichen eintragen: `QA_BASIC_AUTH='qa:$2y$05$...'`.

### 4. Discord für QA (optional, aber nötig für Discord-Login, Nachrichten und Knöpfe)

**Nie die Live-Anwendung oder den Live-Bot eintragen.** QA würde sonst euren Leuten echte Nachrichten schicken.

1. Unter https://discord.com/developers/applications eine **neue** Anwendung anlegen, z. B. „Clan LAN Planner QA“.
2. Einen kleinen **Test-Server** in Discord anlegen und den Bot der QA-Anwendung dort einladen (wie in ANLEITUNG-VPS.md, Schritt 3, nur mit der QA-Anwendung).
3. Bei *OAuth2 › Redirects* `https://qa.planner.example.de/auth/discord` eintragen und bei *Interactions Endpoint URL* `https://qa.planner.example.de/api/discord/interactions`.
4. Client-ID, Secret, Bot-Token, Server-ID des Test-Servers und Public Key in `deploy/qa/.env` eintragen.

Ohne diesen Schritt läuft QA trotzdem: Dann meldet man sich nur als Demo-Person an.

### 5. Timer einschalten

```bash
cp /opt/lan-planner-qa/deploy/qa/lan-planner-qa-deploy.service /opt/lan-planner-qa/deploy/qa/lan-planner-qa-deploy.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now lan-planner-qa-deploy.timer
systemctl start lan-planner-qa-deploy.service      # gleich einmal ausrollen
journalctl -u lan-planner-qa-deploy.service -f     # zusehen (Strg+C beendet nur die Anzeige)
```

Danach ist QA unter deiner Subdomain erreichbar. Jeder neue Commit auf `qa` ist nach spätestens einer Minute plus Bauzeit dort zu sehen.

## Alltag

- **Was läuft gerade?** `cat /opt/lan-planner-qa/.deployed-rev` oder `journalctl -u lan-planner-qa-deploy.service -n 20`
- **Demo-Daten zurücksetzen:** `cd /opt/lan-planner-qa && docker compose -f deploy/qa/docker-compose.yml up -d --force-recreate`
- **Timer anhalten:** `systemctl stop lan-planner-qa-deploy.timer` (wieder an: `start`)
- **Logs der QA-App:** `docker logs lan-planner-qa-app-1 --since 10m`

Die Live-App (`/opt/clan-lan-planner`) wird weiter wie in ANLEITUNG-VPS.md von Hand aktualisiert. Wenn QA sich bewährt, kann derselbe Timer später auch `main` ausrollen.
