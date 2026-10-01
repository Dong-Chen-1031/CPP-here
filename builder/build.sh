#!/bin/bash

# 1. Check input
if [ -z "$1" ]; then
    echo "❌ Error: Please provide a C++ file to compile."
    echo "💡 Usage: ./build.sh <your_source.cpp>"
    exit 1
fi

INPUT_FILE="$1"
BUILDER_DIR=$(cd "$(dirname "$0")" && pwd)
FILENAME=$(basename "$INPUT_FILE")
BASENAME="${FILENAME%.*}"

mkdir -p output
ARCHIVE=$(mktemp)
trap 'rm -f "$ARCHIVE"' EXIT

echo "🔒 Launching sandbox, compiling: $FILENAME ..."

# The source goes in via stdin; the output comes back as a tar on stdout (the
# compiler's messages go to stderr). Nothing is mounted: the image runs as
# sandbox_user (uid 1001), which can't write to a host directory owned by the
# current user on Linux.
docker run \
  --rm -i \
  --network none \
  --cpus="1.0" \
  --memory="1g" \
  --pids-limit 256 \
  --ulimit fsize=50000000:50000000 \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -e CPP_STD="${CPP_STD:-c++17}" \
  safe-cpp2wasm \
  sh -c '
    cat > /tmp/source.cpp &&
    mkdir /tmp/out &&
    cpp-here-build "$CPP_STD" /tmp/source.cpp "/tmp/out/$1.js" >&2 &&
    tar -C /tmp/out -cf - .
  ' _ "$BASENAME" <"$INPUT_FILE" >"$ARCHIVE"

EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
    tar -xf "$ARCHIVE" -C output || EXIT_CODE=1
fi

# Validate result and clean up
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Compilation succeeded!"
    chmod -x "output/$BASENAME."* 2>/dev/null
    echo "📂 Output files are located in the output/ directory:"
    ls -lh "output/$BASENAME."*
    # Built exactly like the backend does, so it only runs inside C++ Here's
    # web worker (-sENVIRONMENT=worker, stdin/stdout from worker.js); runner.mjs
    # simulates that worker in node
    echo "▶️  Run it (stdin from input.txt):"
    echo "   node '$BUILDER_DIR/test/regression/runner.mjs' 'output/$BASENAME.js' 'output/$BASENAME.wasm' '$(dirname "$BUILDER_DIR")/backend/assets/worker.js' < input.txt"
elif [ $EXIT_CODE -eq 124 ]; then
    echo "⏱️ 🚨 Compilation failed: Timeout exceeded (30 seconds)!"
else
    echo "🚨 Compilation failed (exit code: $EXIT_CODE). Possible syntax error or sandbox restriction triggered."
fi

exit $EXIT_CODE
