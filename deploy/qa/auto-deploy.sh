#!/usr/bin/env bash
# QA automatisch ausrollen: holt den Branch „qa“ und baut den QA-Container neu, wenn es einen neuen Commit gibt.
# Läuft jede Minute über den systemd-Timer lan-planner-qa-deploy.timer (ANLEITUNG-QA.md); von Hand: deploy/qa/auto-deploy.sh
# Liest nur mit dem Deploy-Key des VPS; nichts kommt von außen auf den Server.
set -euo pipefail

REPO="${QA_REPO:-/opt/lan-planner-qa}"
BRANCH="${QA_BRANCH:-qa}"
cd "$REPO"

# nie zwei Läufe gleichzeitig (ein Build kann länger als eine Minute dauern)
exec 9>"$REPO/.auto-deploy.lock"
flock -n 9 || exit 0

git fetch --quiet origin "$BRANCH"
local_rev=$(git rev-parse HEAD)
remote_rev=$(git rev-parse "origin/$BRANCH")
deployed=$(cat .deployed-rev 2>/dev/null || true)
[ "$remote_rev" = "$deployed" ] && [ "$local_rev" = "$remote_rev" ] && exit 0

echo "QA: $(git log -1 --format='%h %s' "origin/$BRANCH")"
# der QA-Ordner ist nur ein Abbild von origin/qa: lokale Änderungen gibt es hier nicht
git checkout --quiet --force -B "$BRANCH" "origin/$BRANCH"
docker compose -f deploy/qa/docker-compose.yml up -d --build --remove-orphans
echo "$remote_rev" > .deployed-rev
docker image prune -f --filter "dangling=true" > /dev/null
echo "QA läuft mit $(git rev-parse --short HEAD)"
