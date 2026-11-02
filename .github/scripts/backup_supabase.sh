#!/usr/bin/env bash
#
# Sauvegarde complète du projet Supabase NVG.
# Appelé par .github/workflows/backup.yml.
#
# Variables obligatoires :
#   SUPABASE_ACCESS_TOKEN  jeton personnel Supabase (sbp_...)
#   SUPABASE_DB_URL        URL de connexion PostgreSQL (session pooler, mot de passe inclus)
#   BACKUP_PASSPHRASE      phrase secrète de chiffrement de l'archive
#
# Variables optionnelles :
#   SUPABASE_PROJECT_REF   référence du projet (défaut : fxewefwwpowhnacrxfdp)
#   BACKUP_STAMP           horodatage utilisé dans les noms de fichiers

set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?Le secret SUPABASE_ACCESS_TOKEN est requis}"
: "${SUPABASE_DB_URL:?Le secret SUPABASE_DB_URL est requis}"
: "${BACKUP_PASSPHRASE:?Le secret BACKUP_PASSPHRASE est requis}"

REF="${SUPABASE_PROJECT_REF:-fxewefwwpowhnacrxfdp}"
STAMP="${BACKUP_STAMP:-$(date -u +%Y-%m-%d_%H%M%S)}"
ROOT="${GITHUB_WORKSPACE:-$PWD}"
NAME="nvg-supabase-$STAMP"
OUT="$ROOT/backups/$NAME"
API="https://api.supabase.com/v1/projects/$REF"

mkdir -p "$OUT"/{db,functions,storage,config}

cleanup() {
  rm -rf "$OUT" "$ROOT/backups/$NAME.tar.gz"
}
trap cleanup EXIT

echo "== Sauvegarde $NAME =="

# ---------------------------------------------------------------------------
# 1. Base de données
# ---------------------------------------------------------------------------
echo "-- Base de données (pg_dump 17)"
docker run --rm \
  -e DB_URL="$SUPABASE_DB_URL" \
  -v "$OUT/db:/backup" \
  postgres:17 \
  bash -euc '
    # Sauvegarde complète, tous schémas confondus (archive personnalisée).
    pg_dump "$DB_URL" --no-owner --no-privileges --format=custom --file=/backup/full.dump

    # Version lisible pour une migration vers un autre hébergement.
    pg_dump "$DB_URL" --no-owner --no-privileges --schema-only --schema=public --file=/backup/public-schema.sql
    pg_dump "$DB_URL" --no-owner --no-privileges --data-only --schema=public --file=/backup/public-data.sql

    # Comptes et objets Storage (les fichiers eux-mêmes sont téléchargés à part).
    pg_dump "$DB_URL" --no-owner --no-privileges --data-only --schema=auth --file=/backup/auth-data.sql
    pg_dump "$DB_URL" --no-owner --no-privileges --data-only --schema=storage --file=/backup/storage-data.sql

    # Tâches planifiées (dont le nettoyage des notifications live).
    pg_dump "$DB_URL" --no-owner --no-privileges --schema-only --schema=cron --file=/backup/cron-schema.sql
    pg_dump "$DB_URL" --no-owner --no-privileges --data-only --schema=cron --file=/backup/cron-data.sql
  '

# ---------------------------------------------------------------------------
# 2. Fonctions Edge (source déployée)
# ---------------------------------------------------------------------------
echo "-- Fonctions Edge"
mkdir -p "$OUT/functions-work"
supabase functions download \
  --project-ref "$REF" \
  --use-api \
  --yes \
  --workdir "$OUT/functions-work"
mv "$OUT/functions-work/supabase/functions" "$OUT/functions"
rm -rf "$OUT/functions-work"

# ---------------------------------------------------------------------------
# 3. Fichiers Storage
# ---------------------------------------------------------------------------
echo "-- Storage"
(
  cd "$OUT/storage"
  curl -fsS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$API/storage/buckets" \
    | jq -r '.[].name' \
    | while read -r bucket; do
        [ -n "$bucket" ] || continue
        echo "   bucket $bucket"
        supabase storage cp -r "ss:///$bucket" . \
          --project-ref "$REF" --experimental --yes \
          || echo "   AVERTISSEMENT : bucket $bucket non téléchargé"
      done
)

# ---------------------------------------------------------------------------
# 4. Configuration du projet (peut contenir des secrets : archive chiffrée)
# ---------------------------------------------------------------------------
echo "-- Configuration"
fetch_config() {
  local path="$1" file="$2" url="$API"
  [ -n "$path" ] && url="$API/$path"
  curl -fsS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$url" \
    -o "$OUT/config/$file.json" \
    || echo "   AVERTISSEMENT : ${path:-projet} non récupéré"
}

fetch_config "" project
fetch_config "config/auth" auth
fetch_config "config/storage" storage
fetch_config "config/realtime" realtime
fetch_config "postgrest" postgrest
fetch_config "config/database/pooler" pooler
fetch_config "secrets" edge-secrets
fetch_config "api-keys" api-keys
fetch_config "storage/buckets" buckets

# ---------------------------------------------------------------------------
# 5. Manifeste
# ---------------------------------------------------------------------------
{
  echo "Sauvegarde Supabase — Normandy Viking Gaming"
  echo "Projet : $REF"
  echo "Date UTC : $(date -u +%FT%TZ)"
  echo "PostgreSQL : 17"
  echo
  echo "Fichiers :"
  find "$OUT" -type f ! -name MANIFEST.txt -printf '%P\t%s octets\n' | sort
} > "$OUT/MANIFEST.txt"

# ---------------------------------------------------------------------------
# 6. Archive + chiffrement
# ---------------------------------------------------------------------------
echo "-- Chiffrement"
(
  cd "$ROOT/backups"
  tar -czf "$NAME.tar.gz" "$NAME"
  printf '%s' "$BACKUP_PASSPHRASE" \
    | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 \
        --symmetric --cipher-algo AES256 \
        --output "$NAME.tar.gz.gpg" "$NAME.tar.gz"
  sha256sum "$NAME.tar.gz.gpg" > "$NAME.tar.gz.gpg.sha256"
  rm -f "$NAME.tar.gz"
)

echo "== Terminé : backups/$NAME.tar.gz.gpg =="
