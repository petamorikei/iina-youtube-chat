#!/bin/bash
[ "$(jq -r '.stop_hook_active')" = "true" ] && exit 0

ERRORS=""
BIOME=$(pnpm exec biome check --no-errors-on-unmatched . 2>&1) || ERRORS+="$BIOME"$'\n'
# All projects (plugin, chat UI, tests, configs) via the references in tsconfig.json.
TSC=$(pnpm exec tsc -b 2>&1) || ERRORS+="$TSC"$'\n'

if [ -n "$ERRORS" ]; then
  jq -n --arg reason "$ERRORS" '{"decision":"block","reason":$reason}'
fi
