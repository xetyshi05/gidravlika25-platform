#!/bin/sh
set -u

interval=${BACKUP_INTERVAL_SECONDS:-86400}

case "$interval" in
  *[!0-9]*|0) echo "BACKUP_INTERVAL_SECONDS must be a positive integer." >&2; exit 1 ;;
esac

while true; do
  if ! /usr/local/bin/backup.sh; then
    echo "Database backup failed; retrying after the configured interval." >&2
  fi
  sleep "$interval"
done
