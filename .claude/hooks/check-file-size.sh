#!/bin/sh
# Flags source files over the CLAUDE.md line cap after a Write/Edit.
# Reads the PostToolUse hook payload on stdin; silent unless the cap is passed.

LIMIT=1000

f=$(jq -r '.tool_response.filePath // .tool_input.file_path' 2>/dev/null)
[ -n "$f" ] && [ -f "$f" ] || exit 0

case "$f" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;;
  *) exit 0 ;;
esac

n=$(wc -l < "$f" | tr -d ' ')
[ "$n" -gt "$LIMIT" ] || exit 0

printf '{"systemMessage":"%s is %s lines — over the %s-line cap. Split it into a folder divided by concern.","hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"%s is now %s lines, over the %s-line cap in CLAUDE.md. Split it into a named folder divided by concern before moving on."}}' \
  "$f" "$n" "$LIMIT" "$f" "$n" "$LIMIT"
