#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" && -z "${DATABASE_URL:-}" ]]; then
  echo "SUPABASE_DB_URL or DATABASE_URL must be set" >&2
  exit 1
fi

CONNECTION_STRING="${SUPABASE_DB_URL:-${DATABASE_URL}}"
OUTPUT_DIR=${1:-backups}
mkdir -p "$OUTPUT_DIR"
FILENAME="${OUTPUT_DIR%/}/dam-backup-$(date +%Y%m%d-%H%M%S).sql"

echo "Dumping database to $FILENAME"
pg_dump "$CONNECTION_STRING" > "$FILENAME"
echo "Done"
