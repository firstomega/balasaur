#!/bin/bash
# Installs what a Claude Code on the web session needs before it starts working.
#
# Written because this project's remote containers are reclaimed and re-cloned
# often, and every fresh one arrives without node_modules. Without this, the
# first `bun test` or `bunx tsc` of a session fails on missing modules and the
# session spends its first minutes reinstalling by hand.
#
# Idempotent: safe to run repeatedly. Local checkouts are left alone.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# --frozen-lockfile matches CI, so a session never silently resolves different
# versions than the build that gates the merge.
bun install --frozen-lockfile

# scripts/layout-check.ts renders every route at three widths with Playwright,
# which is the only gate that catches a page scrolling sideways. It is not a
# package.json dependency because it ships nothing to the browser, so CI adds
# it per-run and so does this. The version is pinned to match .github/workflows/
# layout.yml: an unpinned install pulls a build that expects a newer bundled
# chromium than the image provides, and every launch then fails.
#
# No `playwright install` here: this image preinstalls browsers and sets
# PLAYWRIGHT_BROWSERS_PATH, so downloading again would waste minutes of startup.
bun add --no-save playwright@1.62.1

# Two overrides that make `bun run layout` runnable in a remote sandbox. Both
# are read only if set, so CI and local checkouts keep their defaults.
#   CHROMIUM_PATH   this image ships chromium-1194 while playwright 1.62.1 wants
#                   chromium-1234, and it cannot download the difference with no
#                   outbound network, so point it at the browser that is here.
#   LAYOUT_DEV_HOST vite picks "::" here and the dev server dies with
#                   EAFNOSUPPORT before printing a URL.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    [ -x /opt/pw-browsers/chromium ] && echo 'export CHROMIUM_PATH=/opt/pw-browsers/chromium'
    echo 'export LAYOUT_DEV_HOST=127.0.0.1'
  } >> "$CLAUDE_ENV_FILE"
fi
