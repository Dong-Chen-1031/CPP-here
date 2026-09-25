#!/bin/bash
# Runs inside the builder image (see run.sh). For every case in cases/ and
# every -std it lists: compile with cpp-here-build (what the backend runs),
# run the output through the real worker.js with runner.mjs, and check the
# result. Sources that include <bits/stdc++.h> (which cpp-here-build compiles
# with the PCH) are also built with --no-pch: the two .wasm must be identical.
#
# Directives in the first lines of a case (all optional):
#   // @std: c++17 c++20             default: c++11 c++14 c++17 c++20 c++23
#   // @expect: ok                   default; stdout must equal NAME.out
#   // @expect: compile-error <ERE>  compiler output must match <ERE>
#   // @expect: runtime-error <ERE>  runner's error message must match <ERE>
#   // @expect: limit-output | limit-memory
# NAME.in, if present, is fed to stdin.
set -u

TESTS=$(cd "$(dirname "$0")" && pwd)
CACHE=/emsdk/upstream/emscripten/cache
PCH_DIR=/emsdk/pch
WORK=/tmp/regression
WORKER_JS=/worker.js
mkdir -p "$WORK"

pass=0
fail=0
failures=()
ok() { pass=$((pass + 1)); }
bad() {
    fail=$((fail + 1))
    failures+=("$1")
    echo "  ✗ $1"
    [ -n "${2:-}" ] && sed 's/^/      /' <<<"$2" | head -15 | cut -c1-200
}
ms() { echo $((($(date +%s%N) - $1) / 1000000)); }

# ---------- image checks ----------
echo "== image"
[ "$(id -u)" = 1001 ] && ok || bad "runs as uid 1001 (got $(id -u))"
touch /emsdk/upstream/bin/clang 2>/dev/null && bad "compiler must not be writable by sandbox_user" || ok
touch "$CACHE/.probe" 2>/dev/null && { rm -f "$CACHE/.probe"; ok; } || bad "cache must be writable by sandbox_user"
for std in c++11 c++14 c++17 c++20 c++23; do
    [ -f "$PCH_DIR/stdc++-$std.pch" ] && ok || bad "missing $PCH_DIR/stdc++-$std.pch"
done
touch "$WORK/stamp"

# ---------- cases ----------
# compile <src> <std> <out-base> <mode>; sets COMPILE_LOG, COMPILE_RC, COMPILE_MS
# mode: default (exactly what the backend runs) or no-pch
compile() {
    local extra=()
    [ "$4" = no-pch ] && extra=(--no-pch)
    local s
    s=$(date +%s%N)
    COMPILE_LOG=$(cpp-here-build "$2" "$1" "$3.js" "${extra[@]}" 2>&1)
    COMPILE_RC=$?
    COMPILE_MS=$(ms "$s")
}

declare -A time_plain time_pch

for src in "$TESTS"/cases/*.cpp; do
    name=$(basename "$src" .cpp)
    stds=$(grep -m1 -oP '^// @std:\s*\K.*' "$src" || echo "c++11 c++14 c++17 c++20 c++23")
    expect=$(grep -m1 -oP '^// @expect:\s*\K.*' "$src" || echo ok)
    kind=${expect%% *}
    pattern=""
    [ "$kind" != "$expect" ] && pattern=${expect#* }
    input=/dev/null
    [ -f "$TESTS/cases/$name.in" ] && input="$TESTS/cases/$name.in"

    uses_bits=""
    grep -qE '^\s*#\s*include\s*[<"]bits/stdc\+\+\.h[>"]' "$src" && uses_bits=1

    for std in $stds; do
        label="$name [$std]"
        echo "== $label"
        modes=(default)
        [ -n "$uses_bits" ] && [ -f "$PCH_DIR/stdc++-$std.pch" ] && modes+=(no-pch)

        for mode in "${modes[@]}"; do
            out="$WORK/$name-$std-$mode"
            compile "$src" "$std" "$out" "$mode"

            if [ "$kind" = compile-error ]; then
                if [ $COMPILE_RC = 0 ]; then
                    bad "$label ($mode): expected a compile error"
                elif ! grep -qE "$pattern" <<<"$COMPILE_LOG"; then
                    bad "$label ($mode): compile error does not match /$pattern/" "$COMPILE_LOG"
                else ok; fi
                continue
            fi
            if [ $COMPILE_RC != 0 ]; then
                bad "$label ($mode): compile failed (rc=$COMPILE_RC)" "$COMPILE_LOG"
                continue
            fi
            if [ "${#modes[@]}" = 2 ]; then
                if [ "$mode" = default ]; then
                    time_pch[$std]=$((${time_pch[$std]:-0} + COMPILE_MS))
                else
                    time_plain[$std]=$((${time_plain[$std]:-0} + COMPILE_MS))
                fi
            fi

            timeout 20s node "$TESTS/runner.mjs" "$out.js" "$out.wasm" "$WORKER_JS" <"$input" >"$out.stdout" 2>"$out.stderr"
            rc=$?
            status=$(grep -oP '^STATUS: \K.*' "$out.stderr" | tail -1)
            [ $rc = 124 ] && status="timeout"

            case "$kind" in
            ok)
                if [ "$status" != exit ]; then
                    bad "$label ($mode): expected exit, got $status" "$(head -c 2000 "$out.stderr")"
                elif ! diff -q "$TESTS/cases/$name.out" "$out.stdout" >/dev/null; then
                    bad "$label ($mode): wrong output" "$(diff "$TESTS/cases/$name.out" "$out.stdout" | head -20)"
                else ok; fi
                ;;
            limit-output | limit-memory)
                want="limit:${kind#limit-}"
                [ "$status" = "$want" ] && ok || bad "$label ($mode): expected $want, got $status"
                ;;
            runtime-error)
                if [[ "$status" == error:* ]] && grep -qE "$pattern" <<<"${status#error:}"; then ok
                else bad "$label ($mode): expected runtime error /$pattern/, got $status"; fi
                ;;
            *) bad "$label: unknown @expect '$expect'" ;;
            esac
        done

        if [ "${#modes[@]}" = 2 ] && [ "$kind" != compile-error ] &&
            [ -f "$WORK/$name-$std-default.wasm" ] && [ -f "$WORK/$name-$std-no-pch.wasm" ]; then
            cmp -s "$WORK/$name-$std-default.wasm" "$WORK/$name-$std-no-pch.wasm" && ok ||
                bad "$label: .wasm differs with and without the PCH"
        fi
    done
done

# ---------- after all builds ----------
echo "== cache"
written=$(find "$CACHE" -newer "$WORK/stamp" -type f ! -name cache.lock)
[ -z "$written" ] && ok || bad "builds wrote to the emscripten cache (missing library variant or stale symbol list / PCH flags?)" "$written"

echo
echo "compile time of <bits/stdc++.h> cases (sum, ms):"
for std in c++11 c++14 c++17 c++20 c++23; do
    [ -n "${time_plain[$std]:-}" ] && printf '  %-6s no PCH %6s   PCH %6s\n' "$std" "${time_plain[$std]}" "${time_pch[$std]:-–}"
done

echo
echo "passed: $pass  failed: $fail"
if [ $fail -gt 0 ]; then
    printf '  %s\n' "${failures[@]}"
    exit 1
fi
