#!/bin/sh
# Database-to-files reconciliation for private originals (MEDIA-06).
# Usage: check-originals.sh DATABASE ORIGINALS_DIRECTORY
# Reports originals referenced by Product.imageOriginalKey and
# SiteMedia.originalKey that are missing in the directory, and files nobody
# references. Missing files are reported, not fatal: they may predate the
# backup, and the owner decides whether to re-upload them.
set -eu

database=${1:?database}
directory=${2:?originals directory}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

psql --dbname="$database" --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --command='
  SELECT "imageOriginalKey" FROM "Product" WHERE "imageOriginalKey" IS NOT NULL
  UNION
  SELECT "originalKey" FROM "SiteMedia" WHERE "originalKey" IS NOT NULL
' | sort -u >"$work/referenced"
(cd "$directory" && find . -type f) | sed 's#^\./##' | sort >"$work/files"

comm -23 "$work/referenced" "$work/files" >"$work/missing"
referenced=$(grep -c . "$work/referenced" || true)
missing=$(grep -c . "$work/missing" || true)
unreferenced=$(comm -13 "$work/referenced" "$work/files" | grep -c . || true)

head -n 20 "$work/missing" | sed 's/^/  missing original: /'
[ "$missing" -le 20 ] || echo "  ... and $((missing - 20)) more"
if [ "$missing" -gt 0 ]; then
  echo "WARNING: Originals check: $referenced referenced, $missing missing, $unreferenced not referenced in $directory."
else
  echo "Originals check: $referenced referenced, $missing missing, $unreferenced not referenced in $directory."
fi
