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

echo "🔒 Launching sandbox, compiling: $FILENAME ..."

# Pass source code via STDIN and use /tmp for cache isolation
cat "$INPUT_FILE" | docker run \
  --rm -i \
  --network none \
  --cpus="1.0" \
  --memory="1g" \
  --pids-limit 256 \
  --ulimit fsize=50000000:50000000 \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -v "$(pwd)/output:/out:rw" \
  -e CPP_STD="${CPP_STD:-c++17}" \
  safe-cpp2wasm \
  sh -c "
    cat > /tmp/source.cpp
    cpp-here-build \"\$CPP_STD\" /tmp/source.cpp /out/${BASENAME}.js
  "

EXIT_CODE=$?

# Validate result and clean up
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Compilation succeeded!"
    chmod -x output/${BASENAME}.* 2>/dev/null
    echo "📂 Output files are located in the output/ directory:"
    ls -lh "output/$BASENAME."*
    # Built exactly like the backend does, so it only runs inside C++ Here's
    # web worker (-sENVIRONMENT=worker, stdin/stdout from worker.js); runner.mjs
    # simulates that worker in node
    echo "▶️  Run it (stdin from input.txt):"
    echo "   node $BUILDER_DIR/test/regression/runner.mjs output/$BASENAME.js output/$BASENAME.wasm $(dirname "$BUILDER_DIR")/backend/assets/worker.js < input.txt"
elif [ $EXIT_CODE -eq 124 ]; then
    echo "⏱️ 🚨 Compilation failed: Timeout exceeded (30 seconds)!"
else
    echo "🚨 Compilation failed (exit code: $EXIT_CODE). Possible syntax error or sandbox restriction triggered."
fi