#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <previous-image-tag>" >&2
  exit 1
fi

case "$1" in
  *[!A-Za-z0-9._-]*) echo "Image tag contains unsupported characters." >&2; exit 1 ;;
esac

repository_root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
environment_file=${ENV_FILE:-$repository_root/.env.production}

if [ ! -f "$environment_file" ]; then
  echo "Production environment file not found: $environment_file" >&2
  exit 1
fi

IMAGE_TAG=$1 docker compose \
  --env-file "$environment_file" \
  --file "$repository_root/compose.production.yml" \
  up -d --no-build --wait api web crm backoffice nginx

read_setting() {
  sed -n "s/^$1=//p" "$environment_file" | tail -n 1
}

SITE_URL=$(read_setting NEXT_PUBLIC_SITE_URL) \
API_PUBLIC_URL="https://$(read_setting API_HOST)" \
CRM_URL="https://$(read_setting CRM_HOST)" \
BACKOFFICE_URL="https://$(read_setting BACKOFFICE_HOST)" \
  "$repository_root/deploy/scripts/smoke-test.sh"
echo "Application containers rolled back to image tag $1. Database migrations were not reversed."
