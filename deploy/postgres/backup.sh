#!/bin/sh
# Daily and pre-deploy backup (REL-01, MEDIA-06, DATA-07). Any failure exits
# non-zero; deploy.sh does not migrate without a successful run.
#
#  1. PostgreSQL custom archive and its SHA-256.
#  2. Snapshot of the private originals with the same timestamp. Unchanged
#     files are hard links to the previous snapshot and take no extra space.
#  3. Restore of the archive into a temporary database, checked against the
#     snapshot: every original referenced by the database must exist.
#  4. With BACKUP_S3_URI: off-site copy. Everything is encrypted with age to
#     BACKUP_AGE_RECIPIENT first; the owner keeps the private key. The job only
#     uploads (PutObject): no listing, reading or deleting in the bucket.
#  5. Local retention by the timestamp in the name.
set -eu
umask 077

backup_root=/backups
originals_source=${BACKUP_ORIGINALS_DIR:-/media/originals}
retention_days=${BACKUP_RETENTION_DAYS:-14}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
archive_name="gidravlika-$timestamp.dump"
archive_path="$backup_root/$archive_name"
snapshot_path="$backup_root/originals-$timestamp"
temporary_path="$backup_root/.$archive_name.$$"
temporary_snapshot="$backup_root/.originals-$timestamp.$$"
temporary_offsite="$backup_root/.offsite.$$"

# aws-cli 2.23+ sends CRC checksums by default, which several S3-compatible
# providers reject; checksums stay on where the API requires them.
export AWS_REQUEST_CHECKSUM_CALCULATION=${AWS_REQUEST_CHECKSUM_CALCULATION:-when_required}
export AWS_RESPONSE_CHECKSUM_VALIDATION=${AWS_RESPONSE_CHECKSUM_VALIDATION:-when_required}

case "$retention_days" in
  "" | *[!0-9]*) echo "BACKUP_RETENTION_DAYS must be a non-negative integer." >&2; exit 1 ;;
esac

offsite=false
if [ -n "${BACKUP_S3_URI:-}" ]; then
  if [ "${BACKUP_SKIP_OFFSITE:-false}" = "true" ]; then
    echo "WARNING: off-site copy skipped (BACKUP_SKIP_OFFSITE=true); this backup exists only on this server." >&2
  else
    case "${BACKUP_AGE_RECIPIENT:-}" in
      age1*) ;;
      *)
        echo "BACKUP_AGE_RECIPIENT must be an age public key (age1...) when BACKUP_S3_URI is set; nothing is uploaded unencrypted." >&2
        exit 1
        ;;
    esac
    offsite=true
  fi
else
  echo "Off-site copy is disabled (BACKUP_S3_URI is empty); backups stay on this server only." >&2
fi

if [ ! -d "$originals_source" ]; then
  echo "Originals directory $originals_source is not mounted." >&2
  exit 1
fi

mkdir -p "$backup_root"
# flock is released when the process dies, so a killed backup leaves no stale lock.
rmdir "$backup_root/.backup.lock" 2>/dev/null || true
lock_wait=${BACKUP_LOCK_WAIT_SECONDS:-0}
case "$lock_wait" in
  "" | *[!0-9]*) echo "BACKUP_LOCK_WAIT_SECONDS must be a non-negative integer." >&2; exit 1 ;;
esac
exec 9>"$backup_root/.backup.flock"
lock_deadline=$(($(date +%s) + lock_wait))
until flock -n 9; do
  if [ "$(date +%s)" -ge "$lock_deadline" ]; then
    echo "Another backup is already running." >&2
    exit 1
  fi
  sleep 5
done

cleanup() {
  rm -f "$temporary_path"
  rm -rf "$temporary_snapshot" "$temporary_offsite"
}
trap cleanup EXIT INT TERM

# 1. Database archive.
pg_dump \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="$temporary_path"
pg_restore --list "$temporary_path" >/dev/null
mv "$temporary_path" "$archive_path"
sha256sum "$archive_path" >"$archive_path.sha256"

# 2. Originals snapshot, taken after the dump so it contains every file the
# dump references (keys are immutable; files are only added or deleted).
previous_snapshot=$(find "$backup_root" -maxdepth 1 -type d -name 'originals-*' | sort | tail -n 1)
if [ -n "$previous_snapshot" ]; then
  rsync -a --link-dest="$previous_snapshot" "$originals_source/" "$temporary_snapshot/"
else
  rsync -a "$originals_source/" "$temporary_snapshot/"
fi
mv "$temporary_snapshot" "$snapshot_path"

# 3. Restore check, including the database-to-files reconciliation.
if [ "${VERIFY_BACKUP_RESTORE:-true}" = "true" ]; then
  /usr/local/bin/verify-restore.sh "$archive_path" "$snapshot_path"
fi

# 4. Off-site copy: originals first, so an archive in the bucket never refers
# to originals that are not there yet.
upload() {
  aws s3 cp "$1" "$remote_prefix/$2" --only-show-errors
}

encrypt() {
  age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$2" "$1"
}

if [ "$offsite" = "true" ]; then
  remote_prefix=${BACKUP_S3_URI%/}
  mkdir -p "$temporary_offsite"

  # The manifest lists originals already uploaded ("size mtime path"), so each
  # file is uploaded once without listing the bucket. Its first line is the
  # destination: a new bucket or prefix starts from scratch.
  manifest="$backup_root/.originals-offsite.manifest"
  if [ ! -f "$manifest" ] || [ "$(head -n 1 "$manifest")" != "$remote_prefix" ]; then
    printf '%s\n' "$remote_prefix" >"$manifest"
  fi
  (cd "$snapshot_path" && find . -type f -exec stat -c '%s %Y %n' {} +) |
    sed 's# \./# #' | sort >"$temporary_offsite/current"
  tail -n +2 "$manifest" | sort >"$temporary_offsite/uploaded"
  comm -23 "$temporary_offsite/current" "$temporary_offsite/uploaded" >"$temporary_offsite/pending"

  uploaded_originals=0
  while IFS= read -r entry; do
    relative_path=${entry#* }
    relative_path=${relative_path#* }
    encrypt "$snapshot_path/$relative_path" "$temporary_offsite/original.age"
    upload "$temporary_offsite/original.age" "originals/$relative_path.age"
    printf '%s\n' "$entry" >>"$manifest"
    uploaded_originals=$((uploaded_originals + 1))
  done <"$temporary_offsite/pending"
  echo "Off-site originals: $uploaded_originals uploaded."

  encrypted_archive="$temporary_offsite/$archive_name.age"
  encrypt "$archive_path" "$encrypted_archive"
  (cd "$temporary_offsite" && sha256sum "$archive_name.age" >"$archive_name.age.sha256")
  upload "$encrypted_archive" "db/$archive_name.age"
  upload "$encrypted_archive.sha256" "db/$archive_name.age.sha256"
  echo "Off-site archive: db/$archive_name.age uploaded."
fi

# 5. Retention. Names carry the creation time; rsync copies directory mtimes
# from the source, so mtime cannot be used for snapshots.
cutoff=$(date -u -d "@$(($(date +%s) - retention_days * 86400))" +%Y%m%d%H%M%S)
for path in "$backup_root"/gidravlika-*.dump "$backup_root"/gidravlika-*.dump.sha256 "$backup_root"/originals-*; do
  [ -e "$path" ] || continue
  stamp=${path##*/}
  stamp=${stamp#gidravlika-}
  stamp=${stamp#originals-}
  stamp=${stamp%%Z*}
  stamp=$(printf '%s' "$stamp" | tr -d T)
  case "$stamp" in
    [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]) ;;
    *) continue ;;
  esac
  if [ "$stamp" -lt "$cutoff" ]; then
    rm -rf "$path"
  fi
done

# 6. Heartbeat for GET /ops/status and the production monitor (REL-03). Written
# only after every step above succeeded; a failure here is reported but does
# not discard a good backup (the monitor then alerts on a stale heartbeat).
if ! psql --quiet --no-psqlrc -v ON_ERROR_STOP=1 \
  -v archive="$archive_name" -v offsite="$offsite" >/dev/null <<'SQL'
INSERT INTO "OperationHeartbeat" ("name", "succeededAt", "details")
VALUES (
  'backup',
  (now() AT TIME ZONE 'UTC')::timestamp(3),
  jsonb_build_object('archive', :'archive', 'offsite', :'offsite' = 'true')
)
ON CONFLICT ("name") DO UPDATE
SET "succeededAt" = EXCLUDED."succeededAt", "details" = EXCLUDED."details";
SQL
then
  echo "WARNING: could not record the backup heartbeat; the monitor will report the backup as stale." >&2
fi

echo "Backup completed: $archive_name, originals-$timestamp"
