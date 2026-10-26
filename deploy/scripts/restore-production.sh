#!/bin/sh
set -eu

if [ "$#" -ne 2 ] || [ "$1" != "--confirm" ]; then
  echo "Usage: $0 --confirm gidravlika-YYYYMMDDTHHMMSSZ.dump" >&2
  echo "This replaces the production database and stops all application containers." >&2
  exit 1
fi

archive_name=$2
case "$archive_name" in
  gidravlika-[0-9]*T[0-9]*Z.dump) ;;
  *) echo "Invalid backup filename: $archive_name" >&2; exit 1 ;;
esac

repository_root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
environment_file=${ENV_FILE:-$repository_root/.env.production}

if [ ! -f "$environment_file" ]; then
  echo "Production environment file not found: $environment_file" >&2
  exit 1
fi

compose() {
  docker compose \
    --env-file "$environment_file" \
    --file "$repository_root/compose.production.yml" \
    "$@"
}

read_setting() {
  sed -n "s/^$1=//p" "$environment_file" | tail -n 1
}

originals_directory=$(read_setting MEDIA_ORIGINALS_DIR)
originals_directory=${originals_directory:-/var/lib/gidravlika-media/originals}
snapshot_name="originals-${archive_name#gidravlika-}"
snapshot_name=${snapshot_name%.dump}

compose exec -T backup test -f "/backups/$archive_name"
if ! compose exec -T backup test -d "/backups/$snapshot_name"; then
  echo "WARNING: /backups/$snapshot_name not found (archive made before originals were backed up); only the database is restored." >&2
fi
# Safety copy of the current state. The off-site upload is skipped: an
# unavailable bucket must not block an emergency restore.
compose exec -T -e BACKUP_SKIP_OFFSITE=true backup /usr/local/bin/backup.sh
compose stop api web crm backoffice backup

# Originals from the snapshot with the archive's timestamp are copied back
# without deleting newer files: extra files are harmless orphans, while the
# restored database must find every file it references (MEDIA-06).
compose run --rm --no-deps \
  --entrypoint /bin/sh \
  -e "RESTORE_ARCHIVE=/backups/$archive_name" \
  -e "RESTORE_SNAPSHOT=/backups/$snapshot_name" \
  --volume "$originals_directory:/restore/originals" \
  backup -c '
    set -eu
    case "$PGDATABASE" in ""|postgres|template0|template1) echo "Unsafe target database." >&2; exit 1;; esac
    pg_restore --list "$RESTORE_ARCHIVE" >/dev/null
    dropdb --if-exists --force "$PGDATABASE"
    createdb --owner="$PGUSER" "$PGDATABASE"
    pg_restore --exit-on-error --no-owner --no-privileges --dbname="$PGDATABASE" "$RESTORE_ARCHIVE"
    if [ -d "$RESTORE_SNAPSHOT" ]; then
      rsync -a "$RESTORE_SNAPSHOT/" /restore/originals/
      echo "Originals restored from $(basename "$RESTORE_SNAPSHOT")."
    fi
    /usr/local/bin/check-originals.sh "$PGDATABASE" /restore/originals
  '

# The API waits for db-roles and migrate, which give the restored objects
# back to db_owner and re-grant app_runtime.
compose up -d --wait backup api web crm backoffice nginx

SITE_URL=$(read_setting NEXT_PUBLIC_SITE_URL) \
API_PUBLIC_URL="https://$(read_setting API_HOST)" \
CRM_URL="https://$(read_setting CRM_HOST)" \
BACKOFFICE_URL="https://$(read_setting BACKOFFICE_HOST)" \
  "$repository_root/deploy/scripts/smoke-test.sh"
echo "Production database restored from $archive_name."
