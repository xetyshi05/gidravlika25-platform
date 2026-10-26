#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
environment_file=${1:-$repository_root/.env.production}

if [ ! -f "$environment_file" ]; then
  echo "Production environment file not found: $environment_file" >&2
  exit 1
fi

read_setting() {
  sed -n "s/^$1=//p" "$environment_file" | tail -n 1
}

certbot_email=$(read_setting CERTBOT_EMAIL)
site_host=$(read_setting SITE_HOST)
site_www_host=$(read_setting SITE_WWW_HOST)
crm_host=$(read_setting CRM_HOST)
backoffice_host=$(read_setting BACKOFFICE_HOST)
api_host=$(read_setting API_HOST)
tls_cert_name=$(read_setting TLS_CERT_NAME)

for required_value in \
  "$certbot_email" \
  "$site_host" \
  "$site_www_host" \
  "$crm_host" \
  "$backoffice_host" \
  "$api_host" \
  "$tls_cert_name"; do
  if [ -z "$required_value" ]; then
    echo "Set CERTBOT_EMAIL and all public host/TLS variables in $environment_file." >&2
    exit 1
  fi
done

compose() {
  docker compose \
    --env-file "$environment_file" \
    --file "$repository_root/compose.production.yml" \
    "$@"
}

compose --file "$repository_root/compose.tls-bootstrap.yml" up -d --build nginx
compose --profile tools run --rm certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --email "$certbot_email" \
  --agree-tos \
  --no-eff-email \
  --cert-name "$tls_cert_name" \
  -d "$site_host" \
  -d "$site_www_host" \
  -d "$crm_host" \
  -d "$backoffice_host" \
  -d "$api_host"
compose up -d --force-recreate nginx certbot-renew

echo "TLS is configured for $site_host and application subdomains."
