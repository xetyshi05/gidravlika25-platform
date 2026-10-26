#!/bin/sh
set -eu

# Usage: verify-restore.sh ARCHIVE [ORIGINALS_SNAPSHOT]
archive_path=${1:-}
originals_snapshot=${2:-}
case "$archive_path" in
  /backups/gidravlika-*.dump) ;;
  *) echo "Pass a backup from /backups/gidravlika-*.dump." >&2; exit 1 ;;
esac

if [ ! -f "$archive_path" ]; then
  echo "Backup does not exist: $archive_path" >&2
  exit 1
fi

verification_database="gidravlika_restore_check_$(date -u +%Y%m%d%H%M%S)_$$"

cleanup() {
  dropdb --if-exists "$verification_database" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

createdb "$verification_database"
pg_restore \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  --dbname="$verification_database" \
  "$archive_path"
psql --dbname="$verification_database" --tuples-only --no-align \
  --command='SELECT count(*) FROM "_prisma_migrations";' >/dev/null
if [ -n "$originals_snapshot" ]; then
  /usr/local/bin/check-originals.sh "$verification_database" "$originals_snapshot"
fi

echo "Backup restore verification passed: $(basename "$archive_path")"
