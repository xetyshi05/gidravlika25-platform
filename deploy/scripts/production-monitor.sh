#!/usr/bin/env bash
# External production checks (REL-03), run by .github/workflows/production-monitor.yml
# and usable by hand. Writes a JSON array of results to RESULTS_FILE (default:
# stdout); every result has a stable id and title, so the workflow opens one
# issue per problem and closes it when the check passes again.
#
#   uptime:<name>  the page answers 200 (API: /ready reports "status":"ok");
#   tls:<host>     the certificate is valid for at least TLS_MIN_DAYS more days;
#   ops:<check>    every check of GET /ops/status (DB, S3, 5xx, latency, DaData,
#                  backup age, file cleanup) is "ok"; needs OPS_STATUS_TOKEN.
#
# Exit code: 0 when every check passed, 1 otherwise.
set -uo pipefail

domain=${MONITOR_DOMAIN:-gidravlika25.ru}
uptime_urls=${MONITOR_URLS:-"site=https://$domain/ api=https://api.$domain/ready crm=https://crm.$domain/login admin=https://bo.$domain/login"}
tls_hosts=${MONITOR_TLS_HOSTS:-"$domain www.$domain api.$domain crm.$domain bo.$domain"}
tls_min_days=${TLS_MIN_DAYS:-14}
ops_url=${OPS_STATUS_URL:-"https://api.$domain/ops/status"}
ops_token=${OPS_STATUS_TOKEN:-}
results_file=${RESULTS_FILE:-/dev/stdout}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
results="$work/results.jsonl"
: >"$results"
failed=0

add() {
  # add ID OK(true|false) TITLE DETAILS
  jq -cn --arg id "$1" --argjson ok "$2" --arg title "$3" --arg details "$4" \
    '{id: $id, ok: $ok, title: $title, details: $details}' >>"$results"
  [ "$2" = true ] || failed=1
}

fetch() {
  # fetch URL [curl arguments...] -> prints the HTTP status, body in $work/body
  local url=$1
  shift
  curl --silent --show-error --location --retry 2 --retry-all-errors --connect-timeout 10 \
    --max-time 20 --output "$work/body" --write-out '%{http_code}' "$@" "$url" 2>"$work/error" ||
    true
}

for entry in $uptime_urls; do
  name=${entry%%=*}
  url=${entry#*=}
  # The API check keeps the title of the earlier readiness monitor, so issues
  # opened by it are closed by this one.
  title="$name недоступен"
  [ "$name" = api ] && title="API readiness check failed"
  status=$(fetch "$url")
  if [ "$status" != 200 ]; then
    add "uptime:$name" false "$title" "$url ответил ${status:-000}. $(tail -n 1 "$work/error" | head -c 300)"
  elif [ "$name" = api ] && ! grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' "$work/body"; then
    add "uptime:$name" false "$title" "$url ответил 200 без \"status\":\"ok\"."
  else
    add "uptime:$name" true "$title" "$url отвечает."
  fi
done

for host in $tls_hosts; do
  title="TLS-сертификат $host скоро истекает"
  if ! openssl s_client -connect "$host:443" -servername "$host" </dev/null >"$work/tls" 2>/dev/null ||
    ! openssl x509 -in "$work/tls" -noout -enddate >"$work/enddate" 2>/dev/null; then
    add "tls:$host" false "$title" "Не удалось получить сертификат $host:443."
    continue
  fi
  not_after=$(sed 's/^notAfter=//' "$work/enddate")
  if openssl x509 -in "$work/tls" -noout -checkend $((tls_min_days * 86400)) >/dev/null; then
    add "tls:$host" true "$title" "Действует до $not_after."
  else
    add "tls:$host" false "$title" "Действует до $not_after — меньше $tls_min_days дней. Проверьте certbot-renew."
  fi
done

if [ -z "$ops_token" ]; then
  echo "OPS_STATUS_TOKEN is not set: /ops/status is not checked." >&2
else
  status=$(fetch "$ops_url" --header "Authorization: Bearer $ops_token")
  if [ "$status" != 200 ] || ! jq -e '.checks | type == "object"' "$work/body" >/dev/null 2>&1; then
    add "ops:request" false "Статус эксплуатации недоступен" \
      "$ops_url ответил ${status:-000}. $(tail -n 1 "$work/error" | head -c 300)"
  else
    add "ops:request" true "Статус эксплуатации недоступен" "$ops_url отвечает."
    while IFS= read -r check; do
      name=$(jq -r '.name' <<<"$check")
      ok=$(jq -r '.status == "ok"' <<<"$check")
      add "ops:$name" "$ok" "Эксплуатация: $name" \
        "[$(jq -r '.status' <<<"$check")] $(jq -r '.message' <<<"$check")"
    done < <(jq -c '.checks | to_entries[] | {name: .key, status: .value.status, message: .value.message}' "$work/body")
  fi
fi

jq -s '.' "$results" >"$results_file"
exit "$failed"
