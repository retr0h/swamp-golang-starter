#!/usr/bin/env bash
# Record the adversarial review at the path swamp expects.
#
# The report is bound to a content hash of the source, so the path moves on
# every change — including a reformat. Run `swamp extension fmt` first, or the
# report is stale before you finish writing it.
#
# Usage: scripts/record-review.sh scripts/review-verdicts.json
set -euo pipefail

VERDICTS="${1:?usage: record-review.sh <verdicts.json>}"
BASE="$PWD/.swamp-review"

# The override is a base directory; swamp writes swamp-extension-review/ inside
# it. It must be absolute — a relative path is ignored without a word.
WANTED=$(SWAMP_EXTENSION_REVIEW_DIR="$BASE" \
  swamp extension push manifest.yaml --dry-run --json 2>&1 |
  grep -oE '"[^"]*swamp-extension-review/[^"]*\.json"' | head -1 | tr -d '"')

if [[ -z "$WANTED" ]]; then
  echo "Could not determine the report path. Is the manifest valid?" >&2
  exit 1
fi

mkdir -p "$(dirname "$WANTED")"
find "$BASE" -name '*.json' -delete 2>/dev/null || true
cp "$VERDICTS" "$WANTED"
echo "recorded: ${WANTED#"$PWD/"}"
