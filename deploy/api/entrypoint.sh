#!/bin/sh
set -eu

cd /workspace/apps/api

# Migrations run in the separate one-shot "migrate" service with migrator
# credentials; the API connects as app_runtime and cannot change the schema.
echo "Starting API..."
exec node dist/src/main.js
