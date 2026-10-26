#!/bin/sh
# Production deploy (REL-01). Every step must succeed before the next one:
#   1. environment check;
#   2. images are built;
#   3. backup: database archive + checksum + restore check, originals
#      snapshot and, when BACKUP_S3_URI is set, the encrypted off-site copy;
#   4. database roles and migrations;
#   5. new containers;
#   6. smoke tests.
# Usage: deploy.sh [--skip-offsite] [ENVIRONMENT_FILE]
# --skip-offsite is for emergencies only: the local backup and its restore
# check stay mandatory, only the off-site upload is skipped.
set -eu

repository_root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
skip_offsite=false
if [ "${1:-}" = "--skip-offsite" ]; then
  skip_offsite=true
  shift
fi
environment_file=${1:-$repository_root/.env.production}

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

# 1. Environment.
echo "[1/6] Checking the environment..."
missing=""
for name in IMAGE_TAG POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD DB_MIGRATOR_PASSWORD \
  DB_RUNTIME_PASSWORD BOOTSTRAP_SECRET TOTP_ENCRYPTION_KEY CATALOG_REVALIDATION_SECRET ALTCHA_HMAC_SECRET OPS_STATUS_TOKEN \
  SITE_HOST API_HOST CRM_HOST BACKOFFICE_HOST TLS_CERT_NAME; do
  [ -n "$(read_setting "$name")" ] || missing="$missing $name"
done
if [ -n "$(read_setting BACKUP_S3_URI)" ]; then
  for name in BACKUP_AGE_RECIPIENT BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY; do
    [ -n "$(read_setting "$name")" ] || missing="$missing $name"
  done
  case "$(read_setting BACKUP_AGE_RECIPIENT)" in
    "" | age1*) ;;
    *) echo "BACKUP_AGE_RECIPIENT must be an age public key (age1...)." >&2; exit 1 ;;
  esac
else
  echo "WARNING: BACKUP_S3_URI is empty: backups stay on this server only (owner decision D5)." >&2
fi
if [ -n "$missing" ]; then
  echo "Required settings are empty in $environment_file:$missing" >&2
  exit 1
fi
originals_directory=$(read_setting MEDIA_ORIGINALS_DIR)
originals_directory=${originals_directory:-/var/lib/gidravlika-media/originals}
if [ ! -d "$originals_directory" ]; then
  echo "MEDIA_ORIGINALS_DIR does not exist: $originals_directory" >&2
  exit 1
fi
compose config --quiet

backup_directory=$(read_setting BACKUP_DIRECTORY)
backup_directory=${backup_directory:-./backups}
case "$backup_directory" in
  /*) ;;
  *) backup_directory="$repository_root/${backup_directory#./}" ;;
esac
mkdir -p "$backup_directory"
chmod 0700 "$backup_directory"

# 2. Images.
echo "[2/6] Building images..."
# One image at a time: a parallel build of all of them next to the running
# site used up the RAM of the production server and froze it.
built_services=$(compose config | awk '
  /^services:/ { in_services = 1; next }
  in_services && /^[^ ]/ { in_services = 0 }
  in_services && /^  [a-z0-9_-]+:$/ { name = substr($1, 1, length($1) - 1) }
  in_services && /^    build:/ { print name }
')
if [ -z "$built_services" ]; then
  echo "No services with a build section found in compose config." >&2
  exit 1
fi
for service in $built_services; do
  echo "  $service"
  compose build "$service"
done

# 3. Backup gate. A new installation has nothing to back up yet.
echo "[3/6] Backing up the database and originals..."
compose up -d --wait postgres
database_initialised=$(compose exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT to_regclass('"'"'public._prisma_migrations'"'"') IS NOT NULL"')
if [ "$database_initialised" = "t" ]; then
  compose run --rm --no-deps \
    --entrypoint /usr/local/bin/backup.sh \
    -e VERIFY_BACKUP_RESTORE=true \
    -e BACKUP_LOCK_WAIT_SECONDS=1800 \
    -e "BACKUP_SKIP_OFFSITE=$skip_offsite" \
    backup
else
  echo "The database has no migrations yet (new installation); nothing to back up."
fi

# 4. Roles and migrations run as separate one-shot jobs before the new API
# starts (INF-01). The API depends on them as well, so `compose up` alone
# cannot start it on an unmigrated schema.
echo "[4/6] Applying database roles and migrations..."
compose run --rm migrate

# 5. Containers.
echo "[5/6] Starting containers..."
compose up -d --remove-orphans --wait

# 6. Smoke tests.
echo "[6/6] Running smoke tests..."
SITE_URL=$(read_setting NEXT_PUBLIC_SITE_URL) \
API_PUBLIC_URL="https://$(read_setting API_HOST)" \
CRM_URL="https://$(read_setting CRM_HOST)" \
BACKOFFICE_URL="https://$(read_setting BACKOFFICE_HOST)" \
  "$repository_root/deploy/scripts/smoke-test.sh"

echo "Deployment and smoke tests completed successfully."
