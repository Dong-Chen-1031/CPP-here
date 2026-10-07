#!/usr/bin/env bash
# Starts the frontend image the way docker/frontend/docker-compose.yml does and
# checks that the site builds on container start and is served. The build only
# runs at container start, so a broken image still builds and pushes fine; this
# is what catches it.
#
#   frontend/test/docker-smoke.sh <image>
#
# TIMEOUT (seconds, default 600) and PORT (default 14321) can be overridden.
set -euo pipefail

image=${1:?usage: $0 <image>}
timeout=${TIMEOUT:-600}
port=${PORT:-14321}
name=cpp-here-frontend-smoke
base=http://127.0.0.1:$port

# Matching on captured output, not a pipe: with pipefail, `grep -q` exiting early
# would fail the producer with SIGPIPE and the check with it.
logs() { docker logs "$name" 2>&1; }
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() {
    echo "FAIL: $*" >&2
    echo "--- container log (tail) ---" >&2
    logs | tail -80 >&2
    exit 1
}

cleanup
docker run -d --name "$name" -e CI=true \
    -p "127.0.0.1:$port:4321" "$image" >/dev/null

# The CMD chains the build and Caddy with &&, so a failed build stops the container.
deadline=$((SECONDS + timeout))
until grep -q "serving initial configuration" <<<"$(logs)"; do
    [ "$(docker inspect -f '{{.State.Running}}' "$name")" = true ] ||
        fail "container exited before serving (the build on start failed)"
    [ "$SECONDS" -lt "$deadline" ] || fail "not serving after ${timeout}s"
    sleep 3
done
echo "Serving after ${SECONDS}s"

for path in / /editor/; do
    page=$(curl -fsSL "$base$path") || fail "$path not served"
    grep -qi "</html>" <<<"$page" || fail "$path did not return a full HTML page"
done

echo "OK: $image"
