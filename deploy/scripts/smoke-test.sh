#!/bin/sh
set -eu

site_url=${SITE_URL:-https://gidravlika25.ru}
api_url=${API_PUBLIC_URL:-https://api.gidravlika25.ru}
crm_url=${CRM_URL:-https://crm.gidravlika25.ru}
backoffice_url=${BACKOFFICE_URL:-https://bo.gidravlika25.ru}

temporary_directory=$(mktemp -d)
cleanup() { rm -rf "$temporary_directory"; }
trap cleanup EXIT INT TERM

fetch() {
  name=$1
  url=$2
  output=$3
  status=$(curl --silent --show-error --location --max-time 20 --output "$output" --write-out '%{http_code}' "$url")
  if [ "$status" != "200" ]; then
    echo "$name failed with HTTP $status: $url" >&2
    exit 1
  fi
  echo "$name: ok"
}

fetch "Public site" "$site_url/" "$temporary_directory/site.html"
fetch "Catalog" "$site_url/catalog" "$temporary_directory/catalog.html"
fetch "robots.txt" "$site_url/robots.txt" "$temporary_directory/robots.txt"
fetch "sitemap.xml" "$site_url/sitemap.xml" "$temporary_directory/sitemap.xml"
fetch "API liveness" "$api_url/health" "$temporary_directory/health.json"
fetch "API readiness" "$api_url/ready" "$temporary_directory/ready.json"
fetch "CRM login" "$crm_url/login" "$temporary_directory/crm.html"
fetch "Back Office login" "$backoffice_url/login" "$temporary_directory/backoffice.html"

grep -Fq "$site_url/" "$temporary_directory/sitemap.xml"
grep -Fq "Sitemap: $site_url/sitemap.xml" "$temporary_directory/robots.txt"
grep -q '"status":"ok"' "$temporary_directory/ready.json"

request_status=$(curl --silent --show-error --max-time 20 \
  --output "$temporary_directory/request.json" \
  --write-out '%{http_code}' \
  --header 'Content-Type: application/json' \
  --request POST \
  --data '{}' \
  "$api_url/requests/custom")
if [ "$request_status" != "400" ]; then
  echo "Public request validation returned HTTP $request_status instead of 400." >&2
  exit 1
fi
echo "Public request validation: ok"

# Internal API routes must not be reachable through the public API host.
for internal_path in / /metrics /customers /auth/me /backoffice/me /requests/stats; do
  internal_status=$(curl --silent --show-error --max-time 20 --output /dev/null \
    --write-out '%{http_code}' "$api_url$internal_path")
  if [ "$internal_status" != "404" ]; then
    echo "Internal API route $internal_path returned HTTP $internal_status instead of 404." >&2
    exit 1
  fi
done
echo "Internal API routes closed: ok"

challenge_status=$(curl --silent --show-error --max-time 20 --output "$temporary_directory/challenge.json" \
  --write-out '%{http_code}' "$api_url/requests/challenge")
if [ "$challenge_status" != "200" ] || ! grep -q '"signature"' "$temporary_directory/challenge.json"; then
  echo "Anti-spam challenge returned HTTP $challenge_status." >&2
  exit 1
fi
echo "Anti-spam challenge: ok"

catalog_json=$(curl --silent --show-error --max-time 20 "$api_url/catalog/products?limit=1")
image_url=$(printf '%s' "$catalog_json" | sed -n 's/.*"imagePath":"\([^"]*\)".*/\1/p')
if [ -n "$image_url" ]; then
  curl --silent --show-error --fail --location --max-time 20 \
    --range 0-1023 --output /dev/null "$image_url"
  echo "Catalog image: ok"
fi
