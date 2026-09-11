#!/usr/bin/env bash
# Checks the plugin rules that typecheck and vitest cannot see: manifest shape,
# runtime import boundaries, and the mobile audit. Run it locally with
# `npm run check`; CI runs it on every push and pull request.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

status=0
pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1"; status=1; }
detail() { printf '%s\n' "$1" | sed 's/^/         /'; }

# 1. Manifest: Paseo refuses to load a plugin whose id or requirements range is
#    malformed, and a missing requirements block silently means "<0.8.0".
if manifest_error=$(node -e '
  const fs = require("node:fs");
  const m = JSON.parse(fs.readFileSync("paseo-plugin.json", "utf8"));
  if (!/^[a-z0-9][a-z0-9-]*$/.test(m.id ?? "")) throw new Error("id must be lowercase letters, numbers and hyphens; got " + JSON.stringify(m.id));
  const range = m.requirements?.paseo;
  if (typeof range !== "string" || range.trim() === "") throw new Error("requirements.paseo must be a non-empty semver range");
  if (m.build !== undefined && (!Array.isArray(m.build) || m.build.some((c) => !Array.isArray(c) || c.length === 0))) throw new Error("build must be a list of non-empty argv arrays");
' 2>&1); then
  pass "paseo-plugin.json declares a valid id and requirements.paseo"
else
  fail "paseo-plugin.json is invalid"
  detail "$manifest_error"
fi

# 2. At least one runtime entry must exist, and the plugin root holds no other code.
if [ -f index.client.tsx ] || [ -f index.server.ts ]; then
  pass "a runtime entry exists"
else
  fail "no index.client.tsx or index.server.ts in the plugin root"
fi

root_modules=$(find . -maxdepth 1 \( -name '*.ts' -o -name '*.tsx' \) \
  ! -name 'index.client.tsx' ! -name 'index.server.ts' ! -name 'vitest.config.ts' | sort)
if [ -z "$root_modules" ]; then
  pass "the plugin root holds only its entries"
else
  fail "code modules in the plugin root must move into client/, server/ or shared/"
  detail "$root_modules"
fi

# 3. Import boundaries. Client and shared code is bundled for the app, including
#    mobile, so a server/ or node: import there is a load failure, not a warning.
client_leaks=$(grep -rEn 'from "[^"]*[./]server/|from "node:' client shared index.client.tsx 2>/dev/null)
if [ -z "$client_leaks" ]; then
  pass "client and shared code imports no server/ module and no node: builtin"
else
  fail "client or shared code reaches into the server runtime"
  detail "$client_leaks"
fi

server_leaks=$(grep -rEn 'from "[^"]*client/' server index.server.ts 2>/dev/null)
if [ -z "$server_leaks" ]; then
  pass "server code imports no client/ module"
else
  fail "server code imports client-only modules"
  detail "$server_leaks"
fi

# 4. DOM types would let web-only code typecheck and then crash on mobile.
if grep -Eqi '"dom"' tsconfig.json; then
  fail "tsconfig.json pulls in the DOM lib; plugin client code is React Native"
else
  pass "tsconfig.json does not include the DOM lib"
fi

# 5. Mobile audit. client/web.ts is the one module allowed to touch web globals,
#    and every export there is gated on Platform.OS === "web".
web_apis=$(grep -rEn 'document\.|window\.|localStorage|navigator\.|<(div|span|button|a|p|ul|li|input|form|img|h[1-6])[ >/]|className=|onClick=' \
  client index.client.tsx 2>/dev/null | grep -v '^client/web\.ts:')
if [ -z "$web_apis" ]; then
  pass "no web-only API or HTML element outside client/web.ts"
else
  fail "web-only code outside client/web.ts will break the mobile client"
  detail "$web_apis"
fi

# 6. Nothing credential-shaped is tracked. The gitleaks job in CI is the real
#    scan; this just catches the obvious mistake before it is ever pushed.
tracked_env=$(git ls-files | grep -E '(^|/)\.env' || true)
if [ -z "$tracked_env" ]; then
  pass "no .env file is tracked"
else
  fail "an environment file is tracked; the Linear API key must never be committed"
  detail "$tracked_env"
fi

exit $status
