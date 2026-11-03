#!/bin/sh
# Local Docker convenience: create a persistent session secret on first run so
# `docker compose up` needs no .env or manual secret generation.
set -eu

if [ -z "${JWT_SECRET:-}" ]; then
  secret_file="${JWT_SECRET_FILE:-.data/jwt-secret}"
  if [ ! -s "$secret_file" ]; then
    mkdir -p "$(dirname "$secret_file")"
    (umask 077; node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" > "$secret_file")
    echo "Generated a local session secret at $secret_file." >&2
  fi
  JWT_SECRET="$(cat "$secret_file")"
  export JWT_SECRET
fi

exec "$@"
