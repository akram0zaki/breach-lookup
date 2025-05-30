#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <directory> <pattern1> [pattern2 ...]"
  exit 1
fi

DIR="$1"; shift
PATTERNS=("$@")

# Build up grep args for multiple fixed-string searches
GREP_ARGS=()
for pat in "${PATTERNS[@]}"; do
  GREP_ARGS+=( -e "$pat" )
done

# Timestamped logfile in cwd
LOGFILE="$(pwd)/grep_$(date +'%Y%m%d_%H%M%S').log"

# Reset bash timer
SECONDS=0

{
  echo "=== Grep Benchmark ==="
  echo "Directory: $DIR"
  echo "Patterns:  ${PATTERNS[*]}"
  echo "Start:     $(date +'%Y-%m-%d %H:%M:%S')"
  echo

  # Recursive, filename:line, fixed-string grep
  grep -R -H -F "${GREP_ARGS[@]}" "$DIR" || true

  echo
  echo "End:       $(date +'%Y-%m-%d %H:%M:%S')"
  echo "Duration:  ${SECONDS} seconds"
} &> "$LOGFILE"

# Summary to console
echo "Grep complete. Results + timing in $LOGFILE"
