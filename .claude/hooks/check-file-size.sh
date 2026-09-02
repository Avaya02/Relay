#!/bin/sh
# Enforces CLAUDE.md's 1000-line hard cap, mechanically.
#
# A convention that lives only in a document is a convention that erodes: this
# file was missing from disk for a while and app/globals.css reached 2713 lines
# without anything objecting.
#
# Advisory by design — it reports, it does not block. The right fix for an
# oversized file is a considered split by concern, never a hurried one made to
# get past a failing hook.

CAP=1000

file=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty' 2>/dev/null)
[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0

case "$file" in
  */node_modules/*|*/dist/*|*/.next/*|*/generated/*|*.lock|*lock.yaml|*.json) exit 0 ;;
esac

lines=$(wc -l < "$file" | tr -d ' ')
[ "$lines" -gt "$CAP" ] || exit 0

jq -n --arg f "$file" --arg n "$lines" --arg cap "$CAP" \
  '{systemMessage: ("\($f) is \($n) lines, past the \($cap)-line cap in CLAUDE.md — find the seam and split it by concern into a named folder.")}'
