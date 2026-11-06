#!/usr/bin/env bash
# Decides whether tonight's catalog writes landed, from the freshness value
# every sync pass returns (`catalogMaxUpdatedAt`, the newest media.fetched_at).
#
#   catalog-freshness.sh <file> [max_age_hours] [now_epoch_seconds]
#
# <file> holds one value per line, one line per pass. Blank lines and "null"
# (a pass whose freshness read failed) are skipped, and the NEWEST value across
# all passes is judged, so one slow read on the last pass no longer fails a
# night whose writes all landed (1 to 4 Nov 2026).
#
# Prints "newest=<value> age_h=<hours> passes=<n with a value>/<n lines>".
# Exit 0: fresh. Exit 1: no pass returned a value. Exit 2: newest is too old.
set -u

file=${1:?usage: catalog-freshness.sh <file> [max_age_hours] [now_epoch]}
max_h=${2:-48}
now=${3:-$(date -u +%s)}

best_epoch=0
best=""
lines=0
seen=0
if [ -f "$file" ]; then
  while IFS= read -r ts || [ -n "$ts" ]; do
    lines=$((lines + 1))
    case "$ts" in '' | null) continue ;; esac
    epoch=$(date -u -d "$ts" +%s 2>/dev/null) || continue
    seen=$((seen + 1))
    if [ "$epoch" -gt "$best_epoch" ]; then
      best_epoch=$epoch
      best=$ts
    fi
  done <"$file"
fi

if [ -z "$best" ]; then
  echo "newest= age_h= passes=0/$lines"
  exit 1
fi
age_h=$(((now - best_epoch) / 3600))
echo "newest=$best age_h=$age_h passes=$seen/$lines"
[ "$age_h" -gt "$max_h" ] && exit 2
exit 0
