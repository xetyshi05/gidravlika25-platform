#!/bin/sh
# Builds the backup image and runs backup.sh against a disposable PostgreSQL,
# a private originals directory and a disposable S3 bucket (S3Mock). Checks the
# local archive and originals snapshot, the database-to-files reconciliation,
# that off-site objects are encrypted and decryptable only with the owner's
# key, incremental originals upload and the failure paths deploy.sh relies on.
# Requires Docker. Used by CI; safe to run locally.
set -eu

repository_root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
suffix="backup-test-$$"
network="$suffix"
postgres="$suffix-postgres"
s3="$suffix-s3"
image="gidravlika-backup-test:$$"
# MinIO images are no longer publicly pullable; S3Mock covers what backup.sh
# uses (create bucket, put, list, get) and accepts any credentials.
s3_image=adobe/s3mock:5.2.3@sha256:ab01a6946750f451ca215a47e91030695b260e4003b8a5a6201d25029b8fca92
temporary_directory=$(mktemp -d)
backups="$temporary_directory/backups"
originals="$temporary_directory/originals"
keys="$temporary_directory/keys"
failures=0

cleanup() {
  docker rm --force "$postgres" "$s3" "$suffix-holder" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  # Files are written by root inside the containers.
  docker run --rm --volume "$temporary_directory:/cleanup" alpine:3@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6 rm -rf /cleanup/backups /cleanup/keys >/dev/null 2>&1 || true
  docker image rm "$image" >/dev/null 2>&1 || true
  rm -rf "$temporary_directory"
}
trap cleanup EXIT INT TERM

fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

mkdir -p "$backups" "$originals/catalog/product-1" "$originals/site/hero" "$keys"
printf 'catalog original' >"$originals/catalog/product-1/first.jpg"
printf 'hero original' >"$originals/site/hero/hero.png"
printf 'not referenced' >"$originals/site/hero/orphan.png"

docker build --quiet --tag "$image" "$repository_root/deploy/postgres" >/dev/null
docker network create "$network" >/dev/null
docker run --detach --name "$postgres" --network "$network" \
  --env POSTGRES_USER=gidravlika --env POSTGRES_PASSWORD=backup_test_password \
  --env POSTGRES_DB=gidravlika postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873 >/dev/null
docker run --detach --name "$s3" --network "$network" "$s3_image" >/dev/null

# backup_run [docker run options...] -- [command...]; runs in the backup image
# with the production environment of the backup service.
backup_run() {
  options=""
  while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do
    options="$options $1"
    shift
  done
  [ "$#" -gt 0 ] && shift
  # shellcheck disable=SC2086
  docker run --rm --network "$network" \
    --env PGHOST="$postgres" --env PGPORT=5432 --env PGDATABASE=gidravlika \
    --env PGUSER=gidravlika --env PGPASSWORD=backup_test_password \
    --env BACKUP_RETENTION_DAYS=14 --env VERIFY_BACKUP_RESTORE=true \
    --env AWS_ENDPOINT_URL="http://$s3:9090" --env AWS_DEFAULT_REGION=us-east-1 \
    --env AWS_ACCESS_KEY_ID=backupadmin --env AWS_SECRET_ACCESS_KEY=backup_test_password \
    --volume "$backups:/backups" --volume "$originals:/media/originals:ro" \
    --volume "$keys:/keys" $options --entrypoint /bin/sh "$image" -c "$*"
}

attempt=0
until docker exec "$postgres" pg_isready -U gidravlika -d gidravlika >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || { echo "PostgreSQL did not start." >&2; exit 1; }
  sleep 1
done
attempt=0
until backup_run -- "aws s3 ls" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || { echo "S3Mock did not start." >&2; docker logs "$s3" >&2; exit 1; }
  sleep 1
done
sleep 2
docker exec -i "$postgres" psql -q -U gidravlika -d gidravlika -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
CREATE TABLE "_prisma_migrations" ("id" text PRIMARY KEY);
INSERT INTO "_prisma_migrations" VALUES ('init');
CREATE TABLE "Product" ("id" text PRIMARY KEY, "imageOriginalKey" text);
CREATE TABLE "SiteMedia" ("id" text PRIMARY KEY, "originalKey" text);
CREATE TABLE "OperationHeartbeat" ("name" text PRIMARY KEY, "succeededAt" timestamp(3) NOT NULL, "details" jsonb);
INSERT INTO "Product" VALUES ('p1', 'catalog/product-1/first.jpg'), ('p2', NULL);
INSERT INTO "SiteMedia" VALUES ('m1', 'site/hero/hero.png'), ('m2', 'site/gallery/lost.jpg');
SQL

backup_run -- 'age-keygen -o /keys/owner.key 2>/dev/null && age-keygen -y /keys/owner.key >/keys/owner.pub' || {
  echo "FAIL: the backup image has no age" >&2
  exit 1
}
recipient=$(cat "$keys/owner.pub")
backup_run -- "aws s3 mb s3://offsite" >/dev/null

offsite="--env BACKUP_S3_URI=s3://offsite/gidravlika --env BACKUP_AGE_RECIPIENT=$recipient"

# 1. A recipient is mandatory for off-site copies: nothing leaves unencrypted.
if backup_run --env BACKUP_S3_URI=s3://offsite/gidravlika -- /usr/local/bin/backup.sh \
  >"$temporary_directory/no-recipient.log" 2>&1; then
  fail "backup without BACKUP_AGE_RECIPIENT succeeded"
fi
[ -z "$(ls "$backups")" ] || fail "backup without a recipient wrote files before failing"

# 2. A stale lock left by a killed backup of the previous version does not
# block the next one.
mkdir "$backups/.backup.lock"

# 3. First full backup.
if ! backup_run $offsite -- /usr/local/bin/backup.sh >"$temporary_directory/first.log" 2>&1; then
  cat "$temporary_directory/first.log" >&2
  fail "first backup failed"
fi
[ -n "${BACKUP_TEST_VERBOSE:-}" ] && cat "$temporary_directory/first.log" "$temporary_directory/no-recipient.log" >&2
first_dump=$(cd "$backups" && ls gidravlika-*.dump 2>/dev/null | head -n 1)
first_stamp=${first_dump#gidravlika-}
first_stamp=${first_stamp%.dump}
[ -n "$first_dump" ] || fail "no database archive"
[ -f "$backups/$first_dump.sha256" ] || fail "no archive checksum"
[ -f "$backups/originals-$first_stamp/catalog/product-1/first.jpg" ] ||
  fail "originals snapshot does not match the archive timestamp"
grep -q 'WARNING: Originals check: 3 referenced, 1 missing, 1 not referenced' "$temporary_directory/first.log" ||
  fail "database-to-files reconciliation did not report the missing original"
grep -q 'missing original: site/gallery/lost.jpg' "$temporary_directory/first.log" ||
  fail "reconciliation did not name the missing original"
heartbeat() {
  docker exec "$postgres" psql -qAt -U gidravlika -d gidravlika -c \
    "SELECT \"details\"->>'archive', \"details\"->>'offsite', \"succeededAt\" > (now() AT TIME ZONE 'UTC') - interval '5 minutes' FROM \"OperationHeartbeat\" WHERE \"name\" = 'backup'"
}
[ "$(heartbeat)" = "$first_dump|true|t" ] ||
  fail "successful backup did not record its heartbeat (got: $(heartbeat))"

backup_run -- 'aws s3 ls --recursive s3://offsite/gidravlika/' >"$temporary_directory/objects-1"
[ "$(grep -c . "$temporary_directory/objects-1")" = "5" ] ||
  fail "expected 5 off-site objects, got: $(cat "$temporary_directory/objects-1")"
if sed 's/.* //' "$temporary_directory/objects-1" | grep -v '\.age$' | grep -v '\.age\.sha256$' | grep -q .; then
  fail "an off-site object is not encrypted"
fi
grep -q "gidravlika/db/$first_dump.age$" "$temporary_directory/objects-1" || fail "no encrypted archive off-site"
grep -q "gidravlika/originals/site/hero/hero.png.age$" "$temporary_directory/objects-1" ||
  fail "no encrypted original off-site"

# The owner's key decrypts the archive and the originals; the checksum matches.
if ! backup_run -- "
  set -e
  cd /tmp
  aws s3 cp --only-show-errors s3://offsite/gidravlika/db/$first_dump.age .
  aws s3 cp --only-show-errors s3://offsite/gidravlika/db/$first_dump.age.sha256 .
  sha256sum -c $first_dump.age.sha256
  age --decrypt --identity /keys/owner.key --output restored.dump $first_dump.age
  pg_restore --list restored.dump | grep -q SiteMedia
  aws s3 cp --only-show-errors s3://offsite/gidravlika/originals/catalog/product-1/first.jpg.age .
  test \"\$(age --decrypt --identity /keys/owner.key first.jpg.age)\" = 'catalog original'
  ! age --decrypt --identity /dev/null first.jpg.age 2>/dev/null
" >"$temporary_directory/decrypt.log" 2>&1; then
  cat "$temporary_directory/decrypt.log" >&2
  fail "off-site copy cannot be verified and decrypted with the owner's key"
fi

# 4. Second backup: unchanged originals are hard links, only new ones upload.
printf 'second catalog original' >"$originals/catalog/product-1/second.jpg"
sleep 1
if ! backup_run $offsite -- /usr/local/bin/backup.sh >"$temporary_directory/second.log" 2>&1; then
  cat "$temporary_directory/second.log" >&2
  fail "second backup failed"
fi
second_stamp=$(cd "$backups" && ls -d originals-* | sort | tail -n 1)
second_stamp=${second_stamp#originals-}
[ "$second_stamp" != "$first_stamp" ] || fail "second backup reused the first timestamp"
links=$(backup_run -- "stat -c %h /backups/originals-$second_stamp/site/hero/hero.png")
[ "$links" = "2" ] || fail "unchanged original is not hard-linked between snapshots (links: $links)"
grep -q 'Off-site originals: 1 uploaded' "$temporary_directory/second.log" ||
  fail "second backup did not upload exactly the new original"

# 5. Off-site failure fails the backup; BACKUP_SKIP_OFFSITE is an explicit override.
heartbeat_before=$(heartbeat)
if backup_run $offsite --env AWS_ENDPOINT_URL=http://127.0.0.1:9 -- /usr/local/bin/backup.sh \
  >"$temporary_directory/offline.log" 2>&1; then
  fail "backup succeeded although the off-site upload failed"
fi
[ "$(heartbeat)" = "$heartbeat_before" ] || fail "a failed backup updated the heartbeat"
if ! backup_run $offsite --env AWS_ENDPOINT_URL=http://127.0.0.1:9 --env BACKUP_SKIP_OFFSITE=true \
  -- /usr/local/bin/backup.sh >"$temporary_directory/skip.log" 2>&1; then
  cat "$temporary_directory/skip.log" >&2
  fail "BACKUP_SKIP_OFFSITE=true did not allow a local backup"
fi
grep -q 'off-site copy skipped' "$temporary_directory/skip.log" || fail "skipped off-site copy is not reported"

# 6. A missing originals mount fails the backup instead of silently skipping it.
if docker run --rm --network "$network" --env PGHOST="$postgres" --env PGDATABASE=gidravlika \
  --env PGUSER=gidravlika --env PGPASSWORD=backup_test_password --volume "$backups:/backups" \
  --entrypoint /usr/local/bin/backup.sh "$image" >"$temporary_directory/no-originals.log" 2>&1; then
  fail "backup succeeded without the originals directory"
fi

# 7. Retention removes archives and snapshots by their timestamp, not mtime.
backup_run -- '
  mkdir -p /backups/originals-20000101T000000Z
  touch /backups/gidravlika-20000101T000000Z.dump /backups/gidravlika-20000101T000000Z.dump.sha256
  touch -d "2000-01-01 00:00:00" /backups/originals-'"$second_stamp"'
'
backup_run -- /usr/local/bin/backup.sh >"$temporary_directory/retention.log" 2>&1 || {
  cat "$temporary_directory/retention.log" >&2
  fail "retention backup failed"
}
[ ! -e "$backups/originals-20000101T000000Z" ] || fail "expired originals snapshot was kept"
[ ! -e "$backups/gidravlika-20000101T000000Z.dump" ] || fail "expired archive was kept"
[ ! -e "$backups/gidravlika-20000101T000000Z.dump.sha256" ] || fail "expired checksum was kept"
[ -d "$backups/originals-$second_stamp" ] || fail "recent snapshot with an old mtime was deleted"

# 8. A running backup blocks another one; deploy.sh waits for it instead.
docker run --detach --name "$suffix-holder" --volume "$backups:/backups" --entrypoint /bin/sh \
  "$image" -c 'exec 9>/backups/.backup.flock; flock -n 9 && sleep 12' >/dev/null
sleep 2
if backup_run -- /usr/local/bin/backup.sh >"$temporary_directory/locked.log" 2>&1; then
  fail "backup ran while another backup held the lock"
fi
grep -q 'Another backup is already running' "$temporary_directory/locked.log" ||
  fail "lock conflict is not reported"
if ! backup_run --env BACKUP_LOCK_WAIT_SECONDS=60 -- /usr/local/bin/backup.sh \
  >"$temporary_directory/waited.log" 2>&1; then
  cat "$temporary_directory/waited.log" >&2
  fail "backup did not wait for the running one"
fi

if [ "$failures" -gt 0 ]; then
  echo "$failures backup check(s) failed." >&2
  exit 1
fi
echo "Backup checks passed."
