#!/bin/sh
# One-shot migration job (compose service "migrate"). DATABASE_URL must use the
# migrator role; database-roles.sql has already run as a superuser.
set -eu

cd /workspace/apps/api

echo "Applying database migrations..."
./node_modules/.bin/prisma migrate deploy

echo "Granting runtime privileges..."
./node_modules/.bin/prisma db execute --file prisma/runtime-grants.sql

echo "Database migrations completed."
