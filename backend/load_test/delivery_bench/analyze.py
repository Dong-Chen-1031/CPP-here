"""Summarise results uploaded to /bench/results.

  curl -s https://<host>/bench/results > results.json
  python3 analyze.py results.json [label ...]

Prints, per run (label) and condition, the median time until the wasm module
and JS are ready, with the request-level timings that explain it.
"""

import json
import statistics
import sys
from collections import defaultdict


def q(xs, p):
    xs = sorted(x for x in xs if isinstance(x, (int, float)))
    if not xs:
        return float("nan")
    i = (len(xs) - 1) * p
    lo, hi = int(i), min(int(i) + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (i - lo)


def med(xs):
    return q(xs, 0.5)


def get(r, key, field):
    return (r.get(key) or {}).get(field)


def main():
    records = json.load(open(sys.argv[1]))
    labels = set(sys.argv[2:])
    for rec in records:
        if labels and rec.get("label") not in labels:
            continue
        rs = rec.get("results", [])
        print(
            f"\n### {rec.get('label')} ({rec.get('source')}, edge {rec.get('colo')}, n={len(rs)})"
        )
        print(rec.get("env", {}).get("ua"))
        for c in rec.get("conns", []):
            print(
                f"  conn {c.get('when') or c.get('kind')}: {c.get('base')} colo={c.get('colo')} "
                f"total={c.get('ms', 0):.0f} dns={c.get('dns', 0):.0f} connect={c.get('connect', 0):.0f} "
                f"tls={c.get('tls', 0):.0f} ttfb={c.get('ttfb', 0):.0f} {c.get('proto')}"
            )
        groups = defaultdict(list)
        for r in rs:
            key = (
                r.get("profile", "-"),
                r.get("phase", "warm"),
                r["sample"],
                r["files"],
                r["mode"],
            )
            groups[key].append(r)
        print(
            f"  {'profile':7} {'phase':5} {'sample':9} {'files':11} {'mode':9} {'n':>3} | "
            f"{'ready':>6} {'p25':>6} {'p75':>6} | {'json':>6} {'b.ttfb':>6} {'w.ttfb':>6} {'j.ttfb':>6} "
            f"{'w.conn':>6} | {'bytes':>7}"
        )
        for key in sorted(groups):
            g = groups[key]
            ready = [r["ready_ms"] for r in g]
            nbytes = [
                sum((get(r, k, "transfer") or 0) for k in ("t_build", "t_wasm", "t_js"))
                for r in g
            ]
            print(
                f"  {key[0]:7} {key[1]:5} {key[2]:9} {key[3]:11} {key[4]:9} {len(g):3} | "
                f"{med(ready):6.0f} {q(ready, 0.25):6.0f} {q(ready, 0.75):6.0f} | "
                f"{med([r['json_ms'] for r in g]):6.0f} {med([get(r, 't_build', 'ttfb') for r in g]):6.0f} "
                f"{med([get(r, 't_wasm', 'ttfb') for r in g]):6.0f} {med([get(r, 't_js', 'ttfb') for r in g]):6.0f} "
                f"{med([get(r, 't_wasm', 'connect') for r in g]):6.0f} | {statistics.median(nbytes):7.0f}"
            )


if __name__ == "__main__":
    main()
