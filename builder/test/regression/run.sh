#!/bin/bash
# Regression test for the builder image. Runs inner.sh inside the image with
# the same sandbox settings as the backend's build containers
# (backend/services/build.py) and exits non-zero on any failure.
#
# Usage: builder/test/regression/run.sh [image]   (default: safe-cpp2wasm)
set -euo pipefail

IMAGE=${1:-safe-cpp2wasm}
DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$DIR/../../.." && pwd)

# The output cap is enforced by stdout_lib.js and checked again by the
# frontend; they must agree
lib=$(grep -oE 'limit: [0-9]+' "$ROOT/builder/docker/js_lib/stdout_lib.js" | grep -oE '[0-9]+')
expr=$(grep -oE 'OUTPUT_LIMIT_BYTES = [0-9 *]+' "$ROOT/frontend/src/config/runLimits.ts" | cut -d= -f2)
front=$(python3 -c "print($expr)")
if [ "$lib" != "$front" ]; then
    echo "✗ output limit: stdout_lib.js has $lib, frontend runLimits.ts has $front" >&2
    exit 1
fi

docker run --rm \
    --network none \
    --cpus=1.0 \
    --memory=1g \
    --pids-limit 256 \
    --ulimit fsize=50000000:50000000 \
    --cap-drop ALL \
    --security-opt no-new-privileges:true \
    -v "$DIR:/tests:ro" \
    -v "$ROOT/backend/assets/worker.js:/worker.js:ro" \
    --entrypoint bash \
    "$IMAGE" /tests/inner.sh
