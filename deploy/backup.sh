#!/usr/bin/env bash
# Sichert Datenbank und hochgeladene Bilder in eine .tar.gz-Datei.
#   ./deploy/backup.sh                         → /root/backups/clan-lan-planner
#   ./deploy/backup.sh /pfad/zum/ziel          → anderes Ziel
# Ältere Sicherungen als KEEP_DAYS (Standard 14) werden gelöscht.
# Braucht sqlite3 auf dem VPS:  apt install -y sqlite3
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="${1:-/root/backups/clan-lan-planner}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y-%m-%d_%H%M)"
mkdir -p "$DEST"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# .backup statt Datei kopieren: konsistent, auch während die App läuft
sqlite3 data/db/planner.sqlite ".backup '$TMP/planner.sqlite'"
tar -czf "$DEST/planner-$STAMP.tar.gz" -C "$TMP" planner.sqlite -C "$PWD/data" uploads

find "$DEST" -name 'planner-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "Gesichert: $DEST/planner-$STAMP.tar.gz"
