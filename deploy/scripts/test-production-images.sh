#!/bin/sh
# Builds the production images from compose.production.yml and runs them the
# way deploy.sh does (REL-02): PostgreSQL, db-roles, migrate, API,
# image-worker, web, CRM and Back Office, then checks each container from the
# inside. Nginx is covered by test-nginx-perimeter.sh, backups by
# test-backup.sh.
# Usage: test-production-images.sh [--no-build]
#   --no-build  use images that are already built (CI builds them with cache).
# Values come from deploy/ci/production-images.env; IMAGE_TAG and
# CONTAINER_IMAGE_PREFIX may be overridden from the environment.
set -eu

repository_root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
build=true
if [ "${1:-}" = "--no-build" ]; then
  build=false
fi

temporary_directory=$(mktemp -d)
environment_file="$temporary_directory/production.env"
cp "$repository_root/deploy/ci/production-images.env" "$environment_file"
mkdir -p "$temporary_directory/originals" "$temporary_directory/backups"
{
  [ -z "${IMAGE_TAG:-}" ] || echo "IMAGE_TAG=$IMAGE_TAG"
  [ -z "${CONTAINER_IMAGE_PREFIX:-}" ] || echo "CONTAINER_IMAGE_PREFIX=$CONTAINER_IMAGE_PREFIX"
  echo "MEDIA_ORIGINALS_DIR=$temporary_directory/originals"
  echo "BACKUP_DIRECTORY=$temporary_directory/backups"
} >>"$environment_file"
project="images-test-$$"

compose() {
  docker compose --project-name "$project" --env-file "$environment_file" \
    --file "$repository_root/compose.production.yml" "$@"
}

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    compose ps --all >&2 || true
    compose logs --no-color --tail=80 db-roles migrate api image-worker web crm backoffice >&2 || true
  fi
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$temporary_directory"
  exit "$status"
}
trap cleanup EXIT INT TERM

echo "Validating compose.production.yml..."
compose config --quiet

if [ "$build" = "true" ]; then
  echo "Building production images..."
  compose build api web crm backoffice image-worker backup
fi

echo "Starting the production stack without Nginx..."
compose up --detach --wait --no-build api image-worker web crm backoffice

failures=0
fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

# check SERVICE PORT PATH EXPECTED_STATUS [BODY_PATTERN [COOKIE [AUTHORIZATION [ACCEPT]]]]:
# request from inside the container, so the check covers the image, not the host network.
check() {
  service=$1
  port=$2
  path=$3
  expected=$4
  pattern=${5:-}
  cookie=${6:-}
  authorization=${7:-}
  accept=${8:-*/*}
  result=$(compose exec -T "$service" node -e "
    fetch('http://127.0.0.1:$port$path', { redirect: 'manual', headers: { cookie: '$cookie', authorization: '$authorization', accept: '$accept' } })
      .then(async (response) => console.log(response.status + ' ' + (await response.text()).slice(0, 2000)))
      .catch((error) => console.log('ERROR ' + error.message));
  ")
  status=${result%% *}
  if [ "$status" != "$expected" ]; then
    fail "$service $path returned $status instead of $expected: $(printf '%s' "$result" | head -c 300)"
  elif [ -n "$pattern" ] && ! printf '%s' "$result" | grep -Eq "$pattern"; then
    fail "$service $path does not contain $pattern"
  else
    echo "$service $path: $status"
  fi
}

# API: health, readiness and Prisma queries through the packaged client.
check api 4000 /health 200 '"status":"ok"'
check api 4000 /ready 200 '"database":"up"'
check api 4000 '/catalog/products?limit=1' 200 '^200 \['
check api 4000 /catalog/settings 200
check api 4000 /auth/bootstrap-status 200
check api 4000 /requests/challenge 200 '"algorithm":"PBKDF2/SHA-256"'
# Operations status for the monitor (REL-03): token required; S3 and the backup
# heartbeat do not exist in this stack, the database check must pass.
ops_token=$(sed -n 's/^OPS_STATUS_TOKEN=//p' "$environment_file")
check api 4000 /ops/status 401
check api 4000 /ops/status 200 '"database":\{"status":"ok"' '' "Bearer $ops_token"

# The API runs as the DML-only role created by db-roles.
runtime_role=$(compose exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT DISTINCT usename FROM pg_stat_activity WHERE datname = current_database() AND usename <> current_user"')
[ "$runtime_role" = "app_runtime" ] || fail "API connects as '$runtime_role' instead of app_runtime"

# image-worker: the model is baked into the image and removes a background offline.
if compose exec -T image-worker python -c "
from io import BytesIO
from urllib.request import Request, urlopen
from PIL import Image
source = BytesIO()
Image.new('RGB', (64, 64), (200, 30, 30)).save(source, format='PNG')
request = Request('http://127.0.0.1:8000/remove-background', data=source.getvalue(), headers={'Content-Type': 'image/png'})
with urlopen(request, timeout=120) as response:
    result = Image.open(BytesIO(response.read()))
    assert response.status == 200 and result.mode == 'RGBA', (response.status, result.mode)
"; then
  echo "image-worker /remove-background: 200"
else
  fail "image-worker cannot remove a background"
fi

# Next.js standalone servers render through the API inside the network.
check web 3000 / 200 '<html'
check web 3000 /catalog 200 '<html'
check web 3000 /robots.txt 200 'Sitemap: https://site.example.test/sitemap.xml'
# WEB-01/WEB-07: the image optimizer (sharp) works in the standalone image.
# A browser that accepts WebP gets WebP (others get JPEG).
check web 3000 '/_next/image?url=%2Fimages%2Fproduction%2Fmain-1.webp&w=640&q=75' 200 'WEBP' '' '' 'image/webp,*/*'
check crm 3000 /login 200 '<html'
check backoffice 3000 /login 200 '<html'
check backoffice 3000 /api/backoffice/me 307
# An unknown session passes the Back Office proxy and is rejected by the API
# itself, so the BFF reaches the API inside the network.
check backoffice 3000 /api/backoffice/me 401 '' 'backoffice_session=unknown'

# Graceful shutdown (REL-03): node is dumb-init's direct child in the Next
# images (a shell in between would exit first and take node down with it) ...
for service in web crm backoffice; do
  if compose exec -T "$service" node -e "
    const { readdirSync, readFileSync } = require('node:fs');
    // Children of dumb-init (PID 1); the Next server renames itself to next-server.
    const children = readdirSync('/proc').filter((pid) => /^\\d+$/.test(pid)).flatMap((pid) => {
      try {
        const stat = readFileSync('/proc/' + pid + '/stat', 'utf8');
        return stat.split(') ')[1].split(' ')[1] === '1' ? [readFileSync('/proc/' + pid + '/comm', 'utf8').trim()] : [];
      } catch { return []; }
    });
    process.exit(children.length > 0 && !children.includes('sh') ? 0 : 1);
  "; then
    echo "$service: node runs directly under dumb-init"
  else
    fail "$service: the Next server is not a direct child of dumb-init"
  fi
done
# ... and the API finishes on SIGTERM by itself, well within stop_grace_period.
compose stop --timeout 60 api >/dev/null
api_exit=$(docker inspect --format '{{.State.ExitCode}}' "$(compose ps --all --quiet api)")
if [ "$api_exit" = "0" ] && compose logs --no-color api | grep -q '"event":"application.shutdown_completed"'; then
  echo "api: graceful shutdown on SIGTERM"
else
  fail "api did not shut down gracefully on SIGTERM (exit code $api_exit)"
fi

if [ "$failures" -gt 0 ]; then
  echo "$failures production image check(s) failed." >&2
  exit 1
fi
echo "Production image checks passed."
