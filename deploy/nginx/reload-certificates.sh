#!/bin/sh

(
  while sleep 21600; do
    nginx -s reload || true
  done
) &
