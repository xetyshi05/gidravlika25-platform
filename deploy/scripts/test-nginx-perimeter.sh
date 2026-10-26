#!/bin/sh
# Starts the production Nginx configuration against a stub upstream and checks
# the public perimeter: only allowlisted API routes reach the API, everything
# else is a 404 from Nginx, and security headers are present on every response.
# Requires Docker, curl and openssl. Used by CI; safe to run locally.
set -eu

repository_root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
nginx_image=$(sed -n 's/^    image: \(nginx:[^ ]*\)$/\1/p' "$repository_root/compose.production.yml" | head -n 1)
suffix="perimeter-test-$$"
network="$suffix"
upstream="$suffix-upstream"
proxy="$suffix-proxy"
temporary_directory=$(mktemp -d)

cleanup() {
  docker rm --force "$proxy" "$upstream" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  rm -rf "$temporary_directory"
}
trap cleanup EXIT INT TERM

mkdir -p "$temporary_directory/letsencrypt/live/perimeter"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=perimeter.test" \
  -keyout "$temporary_directory/letsencrypt/live/perimeter/privkey.pem" \
  -out "$temporary_directory/letsencrypt/live/perimeter/fullchain.pem" >/dev/null 2>&1

# The stub answers for api, web, crm and backoffice and echoes what it received.
# It also sends the headers Nginx must hide or de-duplicate.
cat >"$temporary_directory/upstream.conf" <<'EOF'
server {
    listen 3000;
    listen 4000;
    location / {
        add_header X-Powered-By stub;
        add_header Strict-Transport-Security "max-age=1";
        add_header X-Frame-Options SAMEORIGIN;
        default_type text/plain;
        return 200 "upstream:$server_port $request_method $request_uri\n";
    }
}
EOF

docker network create "$network" >/dev/null
docker run --detach --name "$upstream" --network "$network" \
  --network-alias api --network-alias web --network-alias crm --network-alias backoffice \
  --volume "$temporary_directory/upstream.conf:/etc/nginx/conf.d/default.conf:ro" \
  "$nginx_image" >/dev/null

docker run --detach --name "$proxy" --network "$network" --publish 127.0.0.1::443 \
  --env SITE_HOST=site.test --env SITE_WWW_HOST=www.site.test --env API_HOST=api.test \
  --env CRM_HOST=crm.test --env BACKOFFICE_HOST=admin.test --env TLS_CERT_NAME=perimeter \
  --env 'NGINX_ENVSUBST_FILTER=^(SITE_HOST|SITE_WWW_HOST|API_HOST|CRM_HOST|BACKOFFICE_HOST|TLS_CERT_NAME)$' \
  --volume "$repository_root/deploy/nginx/production.conf:/etc/nginx/templates/default.conf.template:ro" \
  --volume "$repository_root/deploy/nginx/proxy-common.conf:/etc/nginx/conf.d/proxy-common.conf:ro" \
  --volume "$repository_root/deploy/nginx/access:/etc/nginx/access:ro" \
  --volume "$temporary_directory/letsencrypt:/etc/letsencrypt:ro" \
  "$nginx_image" >/dev/null

port=$(docker port "$proxy" 443/tcp | head -n 1 | sed 's/.*://')
failures=0

call() {
  # call METHOD HOST PATH [curl arguments...]; prints the status code and
  # leaves headers and body in the temporary directory.
  method=$1
  host=$2
  path=$3
  shift 3
  curl --silent --insecure --path-as-is --max-time 10 \
    --resolve "$host:$port:127.0.0.1" --request "$method" \
    --dump-header "$temporary_directory/headers" --output "$temporary_directory/body" \
    --write-out '%{http_code}' "$@" "https://$host:$port$path" || true
}

attempt=0
until [ "$(call GET site.test /)" = "200" ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Nginx did not start:" >&2
    docker logs "$proxy" >&2
    exit 1
  fi
  sleep 1
done

fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

expect() {
  # expect STATUS METHOD HOST PATH [curl arguments...]
  expected=$1
  shift
  label="$1 $2$3"
  status=$(call "$@")
  if [ "$status" != "$expected" ]; then
    fail "$label returned $status instead of $expected"
    return
  fi
  if [ "$expected" = "200" ] && ! grep -q '^upstream:' "$temporary_directory/body"; then
    fail "$label did not reach the upstream"
  fi
  if [ "$expected" = "404" ]; then
    if grep -q '^upstream:' "$temporary_directory/body"; then
      fail "$label reached the upstream"
    elif ! grep -q '"statusCode":404' "$temporary_directory/body"; then
      fail "$label did not return the JSON 404 body"
    fi
  fi
}

header_count() {
  grep -ic "^$1:" "$temporary_directory/headers" || true
}

# Public API allowlist.
expect 200 GET api.test /health
expect 200 HEAD api.test /health
expect 200 GET api.test /ready
expect 200 GET api.test '/catalog/products?limit=1'
expect 200 GET api.test /catalog/products/some-slug
expect 200 GET api.test /site-media
expect 200 GET api.test '/address/suggestions?query=test'
expect 200 GET api.test /requests/challenge
expect 200 GET api.test /ops/status
expect 200 POST api.test /requests/cart --data '{}'
expect 200 POST api.test /requests/custom --data '{}'
expect 200 POST api.test /requests/wholesale --data '{}'
expect 200 OPTIONS api.test /requests/cart --header 'Origin: https://site.test' \
  --header 'Access-Control-Request-Method: POST'

# Everything else on the API host stays internal.
expect 404 GET api.test /
expect 404 GET api.test /metrics
expect 404 POST api.test /ops/status --data '{}'
expect 404 GET api.test /ops
expect 404 GET api.test /ops/status/
expect 404 GET api.test /customers
expect 404 GET api.test /customers/1/personal-data
expect 404 POST api.test /auth/login --data '{}'
expect 404 GET api.test /auth/me
expect 404 GET api.test /auth/bootstrap-status
expect 404 GET api.test /backoffice/me
expect 404 GET api.test /backoffice/media
expect 404 GET api.test /requests
expect 404 GET api.test /requests/stats
expect 404 GET api.test /requests/cart
expect 404 POST api.test /requests/challenge --data '{}'
expect 404 POST api.test /requests/1/comments --data '{}'
expect 404 PATCH api.test /requests/1/status --data '{}'
expect 404 POST api.test /catalog/products --data '{}'
expect 404 DELETE api.test /catalog/products/1
expect 404 POST api.test /site-media --data '{}'
expect 404 GET api.test /catalog
expect 404 GET api.test /health/
expect 404 GET api.test /CUSTOMERS
expect 404 GET api.test /Requests/cart
expect 404 GET api.test /catalog/../customers
expect 404 GET api.test /catalog/%2e%2e/metrics
expect 404 GET api.test /requests/cart/../stats

# The public API no longer accepts uploads; request bodies stay small.
large_body="$temporary_directory/large.json"
head -c 204800 /dev/zero | tr '\0' 'a' >"$large_body"
status=$(call POST api.test /requests/cart --data-binary "@$large_body")
[ "$status" = "413" ] || fail "200 KB request body returned $status instead of 413"

# Security headers are set by Nginx on its own responses and on proxied ones,
# exactly once, without upstream duplicates or version disclosure.
for target in "GET api.test /metrics" "GET api.test /health" "GET site.test /" \
  "GET crm.test /login" "GET admin.test /login"; do
  # shellcheck disable=SC2086
  call $target >/dev/null
  for header in Strict-Transport-Security X-Content-Type-Options X-Frame-Options; do
    count=$(header_count "$header")
    [ "$count" = "1" ] || fail "$target has $count $header headers instead of 1"
  done
  grep -qi '^Strict-Transport-Security: max-age=31536000; includeSubDomains' \
    "$temporary_directory/headers" || fail "$target does not send the Nginx HSTS policy"
  grep -qi '^X-Frame-Options: DENY' "$temporary_directory/headers" ||
    fail "$target does not send X-Frame-Options: DENY"
  [ "$(header_count X-Powered-By)" = "0" ] || fail "$target discloses X-Powered-By"
  if grep -Eqi '^Server: .*[0-9]' "$temporary_directory/headers"; then
    fail "$target discloses the Nginx version"
  fi
done

# CRM and Back Office stay reachable from the internet (owner decision D4).
expect 200 GET crm.test /login
expect 200 GET admin.test /login
expect 200 GET admin.test /api/backoffice/me

if [ "$failures" -gt 0 ]; then
  echo "$failures perimeter check(s) failed." >&2
  exit 1
fi
echo "Nginx perimeter checks passed."
