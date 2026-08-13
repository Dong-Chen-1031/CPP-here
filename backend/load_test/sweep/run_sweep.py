#!/usr/bin/env python3
"""編譯壓力測試掃描器 — 找出「每分鐘編譯請求數」與延遲、錯誤率的關聯。

對每個 RPM 級距跑一次固定到達率（constant-arrival-rate）的 k6 測試，
逐級距收集 p50 / p95 / p99 延遲與錯誤率，最後彙整成 JSON + CSV + HTML 報告。

用法：
    python3 run_sweep.py --url http://localhost:8000 --rpm 6,12,30,60,120

要編譯的程式碼從檔案載入（可指定檔案或整個目錄，可重複指定）：
    python3 run_sweep.py --code samples/ --code /path/to/my_case.cpp

只依賴標準函式庫，需要 PATH 上有 k6。
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import report as report_mod

HERE = Path(__file__).resolve().parent
SWEEP_JS = HERE / "sweep.js"
CPP_SUFFIXES = {".cpp", ".cc", ".cxx", ".c++", ".C"}


# ── 參數解析 ──────────────────────────────────────────────────────────────
def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="掃描不同 RPM 下的編譯延遲與錯誤率",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument(
        "--url",
        default=os.environ.get("BASE_URL", "http://localhost:8000"),
        help="後端 base URL",
    )
    p.add_argument(
        "--rpm",
        default="6,12,30,60,120",
        help="要掃描的每分鐘編譯請求數，逗號分隔（由低到高）",
    )
    p.add_argument("--duration", default="60s", help="每個級距的持續時間")
    p.add_argument(
        "--cooldown", default="20s", help="級距之間的冷卻時間，讓上一輪的隊列排空"
    )
    p.add_argument(
        "--code",
        action="append",
        default=[],
        help="要編譯的 .cpp 檔或目錄（可重複指定；預設為 ./samples）",
    )
    p.add_argument(
        "--cpp-version",
        default="c++17",
        help="檔案未用 // @cpp_version 指定時的預設標準",
    )
    p.add_argument(
        "--token",
        default=os.environ.get("CAPTCHA_TEST_TOKEN", ""),
        help="CAPTCHA_TEST_TOKEN（後端設 BYPASS_CAPTCHA=true 時可省略）",
    )

    p.add_argument(
        "--allow-cache",
        action="store_true",
        help="不在程式碼前加唯一標記，允許命中後端快取（測快取路徑用）",
    )
    p.add_argument(
        "--est-latency",
        type=float,
        default=15.0,
        help="第一個級距的編譯延遲預估（秒），用來配置 VU 數",
    )
    p.add_argument("--max-vus", type=int, default=300, help="單一級距的 VU 上限")
    p.add_argument("--timeout", default="120s", help="單一 /build 請求的逾時")

    p.add_argument(
        "--error-threshold",
        type=float,
        default=0.01,
        help="錯誤率超過此值即判定該級距劣化",
    )
    p.add_argument(
        "--p95-multiplier",
        type=float,
        default=2.0,
        help="p95 超過基準級距的幾倍即判定劣化",
    )
    p.add_argument(
        "--stop-after-breaches",
        type=int,
        default=2,
        help="連續幾個級距劣化後提前結束（設 0 表示不提前結束）",
    )

    p.add_argument(
        "--max-errors-per-level",
        type=int,
        default=500,
        help="每個級距最多保留幾筆錯誤明細（0 表示不限）",
    )
    p.add_argument(
        "--max-errors-per-vu",
        type=int,
        default=40,
        help="每個 VU 最多記錄幾筆錯誤明細，避免後端整個倒掉時寫出巨大日誌",
    )

    p.add_argument("--out", default=str(HERE / "results"), help="結果輸出目錄")
    p.add_argument("--name", default="", help="這次執行的名稱（預設用時間戳）")
    p.add_argument("--dry-run", action="store_true", help="只印出要執行的 k6 指令")
    return p.parse_args(argv)


# ── 載入待編譯的原始碼 ────────────────────────────────────────────────────
def collect_code_files(specs: list[str]) -> list[Path]:
    """把 --code 給的檔案／目錄展開成一份 .cpp 清單。"""
    if not specs:
        specs = [str(HERE / "samples")]

    files: list[Path] = []
    for spec in specs:
        path = Path(spec).expanduser()
        if not path.is_absolute():
            path = (Path.cwd() / path).resolve()
        if path.is_dir():
            found = sorted(f for f in path.rglob("*") if f.suffix in CPP_SUFFIXES)
            if not found:
                sys.exit(f"目錄裡沒有找到 C++ 原始碼：{path}")
            files.extend(found)
        elif path.is_file():
            files.append(path)
        else:
            sys.exit(f"找不到檔案或目錄：{spec}")

    # k6 的 CODE_FILES 用逗號分隔，路徑含逗號會被切壞
    bad = [f for f in files if "," in str(f)]
    if bad:
        sys.exit(f"檔案路徑不能包含逗號：{bad[0]}")

    deduped = list(dict.fromkeys(files))
    if not deduped:
        sys.exit("沒有任何要編譯的程式碼")
    return deduped


def describe_sample(path: Path, default_version: str) -> dict[str, str]:
    """讀出檔案裡的 // @cpp_version / // @label 指令，與 sweep.js 的解析保持一致。"""
    text = path.read_text(encoding="utf-8", errors="replace")
    version = re.search(
        r"^[ \t]*//[ \t]*@cpp[_-]?version[ \t]*[:=]?[ \t]*(c\+\+\d+)", text, re.I | re.M
    )
    label = re.search(r"^[ \t]*//[ \t]*@label[ \t]*[:=]?[ \t]*(\S+)", text, re.I | re.M)
    # 與 sweep.js 的清洗規則保持一致，否則對不上子指標的標籤
    raw_label = label.group(1) if label else path.stem
    return {
        "path": str(path),
        "label": re.sub(r"[^\w.-]", "_", raw_label),
        "cpp_version": version.group(1) if version else default_version,
        "bytes": str(len(text.encode("utf-8"))),
    }


# ── 執行單一級距 ──────────────────────────────────────────────────────────
def parse_duration(spec: str) -> float:
    m = re.fullmatch(r"([\d.]+)(ms|s|m|h)?", spec.strip())
    if not m:
        sys.exit(f"看不懂的時間格式：{spec}")
    return (
        float(m.group(1)) * {"ms": 0.001, "s": 1, "m": 60, "h": 3600}[m.group(2) or "s"]
    )


def plan_vus(rpm: int, est_latency_s: float, max_vus: int) -> int:
    """Little's Law：併發量 ≈ 到達率 × 服務時間。多留 50% 餘裕吸收抖動。"""
    concurrency = (rpm / 60.0) * max(est_latency_s, 0.1)
    return max(1, min(max_vus, math.ceil(concurrency * 1.5) + 2))


ERROR_SENTINEL = "##K6ERR##"


def parse_error_log(log_path: Path, cap: int) -> tuple[list[dict[str, Any]], int]:
    """從 k6 日誌撈出錯誤明細，回傳 (保留的明細, 因為超過上限被丟掉的筆數)。"""
    if not log_path.exists():
        return [], 0

    errors: list[dict[str, Any]] = []
    dropped = 0
    for line in log_path.read_text(encoding="utf-8", errors="replace").splitlines():
        index = line.find(ERROR_SENTINEL)
        if index < 0:
            continue  # k6 自己的警告，不是我們記的錯誤
        try:
            entry = json.loads(line[index + len(ERROR_SENTINEL) :])
        except json.JSONDecodeError:
            continue
        if cap and len(errors) >= cap:
            dropped += 1
            continue
        errors.append(entry)

    errors.sort(key=lambda e: e.get("time", ""))
    return errors, dropped


def run_level(
    args: argparse.Namespace,
    rpm: int,
    code_files: list[Path],
    est_latency_s: float,
    out_dir: Path,
) -> dict[str, Any] | None:
    summary_path = out_dir / f"level_{rpm}rpm.json"
    pre_vus = plan_vus(rpm, est_latency_s, args.max_vus)

    env = os.environ.copy()
    env.update(
        {
            "BASE_URL": args.url,
            "CAPTCHA_TEST_TOKEN": args.token,
            "RPM": str(rpm),
            "DURATION": args.duration,
            "PRE_ALLOCATED_VUS": str(pre_vus),
            "MAX_VUS": str(args.max_vus),
            "GRACEFUL_STOP": args.timeout,
            "REQ_TIMEOUT": args.timeout,
            "CPP_VERSION": args.cpp_version,
            "UNIQUE": "false" if args.allow_cache else "true",
            "SUMMARY_OUT": str(summary_path),
            "LEVEL_LABEL": f"{rpm}rpm",
            "CODE_FILES": ",".join(str(f) for f in code_files),
            "MAX_ERRORS_PER_VU": str(args.max_errors_per_vu),
        }
    )

    # sweep.js 把每筆錯誤的現場用 console.error 印出來。--log-format=raw 讓訊息
    # 原樣輸出（不加 logfmt 的引號跳脫），--log-output=file 則把它跟 k6 自己的
    # 進度輸出分開，解析時不必跟終端機的雜訊搏鬥。
    log_path = out_dir / f"level_{rpm}rpm.k6log"
    cmd = [
        "k6",
        "run",
        "--quiet",
        "--no-usage-report",
        "--log-format=raw",
        f"--log-output=file={log_path}",
        str(SWEEP_JS),
    ]

    if args.dry_run:
        shown = " ".join(
            f"-e {k}={v}"
            for k, v in sorted(env.items())
            if k in {"RPM", "DURATION", "PRE_ALLOCATED_VUS", "CODE_FILES"}
        )
        print(f"  [dry-run] k6 run {shown} {SWEEP_JS}")
        return None

    print(
        f"  ▶ {rpm} rpm — 預配 {pre_vus} VU（依上一級距 p95 推算），"
        f"持續 {args.duration}",
        flush=True,
    )
    proc = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if proc.stdout.strip():
        print(proc.stdout.rstrip(), flush=True)

    if summary_path.exists():
        summary = json.loads(summary_path.read_text())
        summary["errors"], summary["errors_dropped"] = parse_error_log(
            log_path, args.max_errors_per_level
        )
        # error_count 是 k6 直接算的失敗筆數，比用錯誤率回推準
        summary["errors_total"] = summary.get(
            "error_count", round(summary["error_rate"] * summary["requests"])
        )
        summary_path.write_text(
            json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        log_path.unlink(missing_ok=True)
        return summary

    print(f"  ✗ {rpm} rpm 沒有產出摘要，k6 退出碼 {proc.returncode}", file=sys.stderr)
    if proc.stderr.strip():
        print(proc.stderr.rstrip()[-2000:], file=sys.stderr)
    if log_path.exists():
        print(log_path.read_text(errors="replace")[-2000:], file=sys.stderr)
    return None


# ── 判定 ──────────────────────────────────────────────────────────────────
def evaluate(levels: list[dict[str, Any]], args: argparse.Namespace) -> dict[str, Any]:
    """標出每個級距是否劣化，並找出拐點與安全容量。"""
    baseline_p95 = levels[0]["latency_ok_ms"]["p95"] if levels else None

    for lv in levels:
        reasons = []
        if lv["error_rate"] > args.error_threshold:
            reasons.append(f"錯誤率 {lv['error_rate'] * 100:.1f}%")
        p95 = lv["latency_ok_ms"]["p95"]
        if baseline_p95 and p95 and p95 > baseline_p95 * args.p95_multiplier:
            reasons.append(f"p95 為基準的 {p95 / baseline_p95:.1f}×")
        if lv["dropped_iterations"] > 0:
            reasons.append(f"丟棄 {lv['dropped_iterations']} 個請求")
        lv["breach"] = " · ".join(reasons)

    knee = next((lv for lv in levels if lv["breach"]), None)
    if knee is None:
        safe_rpm = levels[-1]["target_rpm"] if levels else None
    else:
        before = [lv for lv in levels if lv["target_rpm"] < knee["target_rpm"]]
        safe_rpm = before[-1]["target_rpm"] if before else None

    worst = max(levels, key=lambda lv: lv["error_rate"]) if levels else None
    kinds: dict[str, int] = {}
    for lv in levels:
        for err in lv.get("errors") or []:
            kinds[err["kind"]] = kinds.get(err["kind"], 0) + 1

    return {
        "baseline_p95": baseline_p95,
        "knee_rpm": knee["target_rpm"] if knee else None,
        "knee_reason": knee["breach"] if knee else "",
        "safe_rpm": safe_rpm,
        "max_error_rate": worst["error_rate"] if worst else None,
        "max_error_rpm": worst["target_rpm"] if worst else None,
        "errors_total": sum(lv.get("errors_total", 0) for lv in levels),
        "errors_recorded": sum(len(lv.get("errors") or []) for lv in levels),
        "error_kinds": kinds,
    }


def rollup_samples(
    levels: list[dict[str, Any]], samples: list[dict[str, str]]
) -> dict[str, Any]:
    """把每支程式碼跨所有級距的完成狀態彙總起來。"""
    out: dict[str, Any] = {}
    for meta in samples:
        label = meta["label"]
        per_level = [
            lv["per_sample"][label]
            for lv in levels
            if label in lv.get("per_sample", {})
        ]
        requests = sum(s["requests"] for s in per_level)
        successful = sum(s["successful"] for s in per_level)
        out[label] = {
            "label": label,
            "path": meta["path"],
            "cpp_version": meta["cpp_version"],
            "requests": requests,
            "successful": successful,
            "failed": requests - successful,
            "error_rate": (requests - successful) / requests if requests else 0.0,
            # 逐級距的資料留著，報告要靠它畫每支程式碼自己的延遲曲線
            "levels": [
                {"target_rpm": lv["target_rpm"], **lv["per_sample"][label]}
                for lv in levels
                if label in lv.get("per_sample", {})
            ],
        }
    return out


# ── 輸出 ──────────────────────────────────────────────────────────────────
CSV_COLUMNS = [
    "target_rpm",
    "achieved_rpm",
    "offered_rpm",
    "requests",
    "successful_requests",
    "dropped_iterations",
    "p50_ms",
    "p90_ms",
    "p95_ms",
    "p99_ms",
    "avg_ms",
    "max_ms",
    "error_rate",
    "http_error_rate",
    "compile_error_rate",
    "vus_max",
    "breach",
]


def write_csv(levels: list[dict[str, Any]], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for lv in levels:
            lat = lv["latency_ok_ms"]
            writer.writerow(
                {
                    "target_rpm": lv["target_rpm"],
                    "achieved_rpm": round(lv["achieved_rpm"], 2)
                    if lv["achieved_rpm"]
                    else 0,
                    "offered_rpm": round(lv["offered_rpm"], 2)
                    if lv["offered_rpm"]
                    else 0,
                    "requests": lv["requests"],
                    "successful_requests": lv["successful_requests"],
                    "dropped_iterations": lv["dropped_iterations"],
                    "p50_ms": round(lat["p50"], 1) if lat["p50"] else "",
                    "p90_ms": round(lat["p90"], 1) if lat["p90"] else "",
                    "p95_ms": round(lat["p95"], 1) if lat["p95"] else "",
                    "p99_ms": round(lat["p99"], 1) if lat["p99"] else "",
                    "avg_ms": round(lat["avg"], 1) if lat["avg"] else "",
                    "max_ms": round(lat["max"], 1) if lat["max"] else "",
                    "error_rate": round(lv["error_rate"], 4),
                    "http_error_rate": round(lv["http_error_rate"], 4),
                    "compile_error_rate": round(lv["compile_error_rate"], 4),
                    "vus_max": lv["vus_max"],
                    "breach": lv["breach"],
                }
            )


ERROR_CSV_COLUMNS = [
    "time",
    "target_rpm",
    "sample",
    "cpp_version",
    "kind",
    "status",
    "duration_ms",
    "error",
    "error_code",
    "marker",
    "detail",
]


def write_error_log(levels: list[dict[str, Any]], out_dir: Path) -> int:
    """把所有級距的錯誤明細寫成 JSONL（完整）與 CSV（好用試算表看）。"""
    errors = [err for lv in levels for err in lv.get("errors") or []]
    if not errors:
        return 0

    with (out_dir / "errors.jsonl").open("w", encoding="utf-8") as fh:
        for err in errors:
            fh.write(json.dumps(err, ensure_ascii=False) + "\n")

    with (out_dir / "errors.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=ERROR_CSV_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        for err in errors:
            writer.writerow(err)
    return len(errors)


def print_table(levels: list[dict[str, Any]]) -> None:
    header = f"{'rpm':>6} {'實際rpm':>9} {'p50':>9} {'p95':>9} {'p99':>9} {'錯誤率':>8}  判定"
    print("\n" + header)
    print("─" * 72)
    for lv in levels:
        lat = lv["latency_ok_ms"]
        fmt = lambda v: f"{v / 1000:.2f}s" if v else "—"  # noqa: E731
        print(
            f"{lv['target_rpm']:>6} {lv['achieved_rpm'] or 0:>9.1f} "
            f"{fmt(lat['p50']):>9} {fmt(lat['p95']):>9} {fmt(lat['p99']):>9} "
            f"{lv['error_rate'] * 100:>7.2f}%  {lv['breach'] or 'OK'}"
        )


def print_samples(rollup: dict[str, Any]) -> None:
    print(f"\n{'程式碼':<20} {'請求':>7} {'成功':>7} {'失敗':>7} {'錯誤率':>8}")
    print("─" * 56)
    for s in rollup.values():
        print(
            f"{s['label']:<20} {s['requests']:>7} {s['successful']:>7} "
            f"{s['failed']:>7} {s['error_rate'] * 100:>7.2f}%"
        )


# ── 主流程 ────────────────────────────────────────────────────────────────
def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if not shutil.which("k6") and not args.dry_run:
        sys.exit("找不到 k6，請先安裝：brew install k6")
    if not SWEEP_JS.exists():
        sys.exit(f"找不到 {SWEEP_JS}")

    try:
        rpm_levels = sorted({int(x) for x in args.rpm.split(",") if x.strip()})
    except ValueError:
        sys.exit(f"--rpm 只能是整數清單，收到：{args.rpm}")
    if not rpm_levels:
        sys.exit("--rpm 不能是空的")

    code_files = collect_code_files(args.code)
    samples = [describe_sample(f, args.cpp_version) for f in code_files]

    run_name = args.name or datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = Path(args.out).expanduser().resolve() / run_name
    if not args.dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)

    print(f"目標：{args.url}/build")
    print(
        f"級距：{', '.join(str(r) for r in rpm_levels)} rpm"
        f"（每級 {args.duration}，冷卻 {args.cooldown}）"
    )
    print(
        f"樣本：{', '.join(s['label'] + ' [' + s['cpp_version'] + ']' for s in samples)}"
    )
    print(f"輸出：{out_dir}\n")

    started_at = datetime.now()
    cooldown_s = parse_duration(args.cooldown)
    est_latency_s = args.est_latency
    levels: list[dict[str, Any]] = []
    consecutive_breaches = 0

    for index, rpm in enumerate(rpm_levels):
        summary = run_level(args, rpm, code_files, est_latency_s, out_dir)
        if args.dry_run:
            continue
        if summary is None:
            print(f"  跳過 {rpm} rpm（沒有資料）", file=sys.stderr)
            continue

        levels.append(summary)

        # 用這一級距量到的 p95 推算下一級距要幾個 VU，比固定值準得多
        p95 = summary["latency_ok_ms"]["p95"]
        if p95:
            est_latency_s = max(p95 / 1000.0, 0.1)

        # 提前結束：後端已經連續倒了，再往上加壓只是浪費時間
        if args.stop_after_breaches:
            degraded = (
                summary["error_rate"] > args.error_threshold
                or summary["dropped_iterations"] > 0
            )
            consecutive_breaches = consecutive_breaches + 1 if degraded else 0
            if consecutive_breaches >= args.stop_after_breaches:
                print(f"\n連續 {consecutive_breaches} 個級距劣化，提前結束掃描。")
                break

        if index < len(rpm_levels) - 1 and cooldown_s > 0:
            print(f"  … 冷卻 {args.cooldown}", flush=True)
            time.sleep(cooldown_s)

    if args.dry_run:
        return 0
    if not levels:
        print("沒有收集到任何級距資料。", file=sys.stderr)
        return 1

    verdict = evaluate(levels, args)
    run = {
        "started_at": started_at.isoformat(),
        "finished_at": datetime.now().isoformat(),
        "config": {
            "base_url": args.url,
            "rpm_levels": rpm_levels,
            "duration": args.duration,
            "cooldown": args.cooldown,
            "unique_code": not args.allow_cache,
            "cpp_version_default": args.cpp_version,
            "error_threshold": args.error_threshold,
            "p95_multiplier": args.p95_multiplier,
            "max_vus": args.max_vus,
            "samples": samples,
        },
        "levels": levels,
        "verdict": verdict,
        "per_sample": rollup_samples(levels, samples),
    }

    (out_dir / "summary.json").write_text(
        json.dumps(run, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    write_csv(levels, out_dir / "summary.csv")
    error_count = write_error_log(levels, out_dir)
    (out_dir / "report.html").write_text(report_mod.build_report(run), encoding="utf-8")

    print_table(levels)
    print_samples(run["per_sample"])
    print()
    if verdict["errors_total"]:
        kinds = "、".join(f"{k} {v}" for k, v in sorted(verdict["error_kinds"].items()))
        print(
            f"錯誤共 {verdict['errors_total']} 筆，記錄明細 {error_count} 筆"
            f"{f'（{kinds}）' if kinds else ''}"
        )
    if verdict["knee_rpm"] is None:
        print(f"掃描範圍內未出現劣化，安全容量至少 {verdict['safe_rpm']} rpm。")
    else:
        print(f"拐點：{verdict['knee_rpm']} rpm（{verdict['knee_reason']}）")
        print(
            f"安全容量：{verdict['safe_rpm'] if verdict['safe_rpm'] is not None else '低於最低測試級距'} rpm"
        )
    print(f"\n報告：{out_dir / 'report.html'}")
    print(f"數據：{out_dir / 'summary.csv'}")
    if error_count:
        print(f"錯誤：{out_dir / 'errors.csv'}（完整明細見 errors.jsonl）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
