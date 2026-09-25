#!/usr/bin/env python3
"""主機編譯效能測試：量這台主機的編譯效能、建議的容器 pool 數，並給一個綜合分數。

直接使用 backend 的 ContainerPool 與 build()（不經過 HTTP），所以容器設定、
pool 補充邏輯、cpp-here-build、取回產物的流程都和正式環境相同。

在要測的主機上，只需要 Docker（腳本已經在後端映像檔裡）：

    docker run --rm -t -v /var/run/docker.sock:/var/run/docker.sock \\
        ghcr.io/dong-chen-1031/cpp-here/backend python load_test/host_bench.py

    # 快速版（每級 10 秒）、存 JSON 結果到目前目錄
    docker run --rm -t -v /var/run/docker.sock:/var/run/docker.sock -v "$PWD:/out" \\
        ghcr.io/dong-chen-1031/cpp-here/backend \\
        python load_test/host_bench.py --quick --out /out

在 repo 裡用 backend 的虛擬環境執行也可以：
    cd backend && python load_test/host_bench.py

會在主機上開出和正式環境一樣的編譯容器（1 CPU / 1 GB），測試期間主機會滿載；
正在服務使用者的主機上跑，結果會偏低，也會拖慢線上的編譯。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import math
import os
import random
import shutil
import statistics
import sys
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

import aiodocker  # noqa: E402
from rich.console import Console, Group  # noqa: E402
from rich.live import Live  # noqa: E402
from rich.panel import Panel  # noqa: E402
from rich.progress import (  # noqa: E402
    BarColumn,
    DownloadColumn,
    Progress,
    TimeRemainingColumn,
    TransferSpeedColumn,
)
from rich.spinner import Spinner  # noqa: E402
from rich.table import Table  # noqa: E402
from rich.text import Text  # noqa: E402

import services.build as B  # noqa: E402
from services.resource_manager import resource_manager  # noqa: E402
from settings import settings  # noqa: E402

# ── 固定的測試負載 ────────────────────────────────────────────────────────
# 分數只有在負載相同時才能比較：改動程式碼或權重就要把版本加一。
WORKLOAD_VERSION = 1

TYPICAL_CPP17 = r"""#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    vector<long long> a(n);
    for (auto &x : a) cin >> x;
    sort(a.begin(), a.end());
    map<long long, int> cnt;
    for (auto x : a) cnt[x]++;
    priority_queue<long long> pq(a.begin(), a.end());
    long long best = 0;
    for (auto [k, v] : cnt) best = max(best, k * v);
    cout << best << ' ' << pq.top() << ' ' << __gcd(12, 18) << '\n';
}
"""

RANGES_CPP20 = r"""#include <bits/stdc++.h>
using namespace std;
int main() {
    vector<int> v(100);
    iota(v.begin(), v.end(), 0);
    auto odd = v | views::filter([](int x) { return x % 2; })
                 | views::transform([](int x) { return x * x; });
    long long s = 0;
    for (int x : odd) s += x;
    set<int> st(v.begin(), v.end());
    cout << s << ' ' << st.contains(42) << ' ' << popcount(255u) << '\n';
}
"""

SMALL_IOSTREAM = r"""#include <iostream>
#include <string>
int main() {
    std::string name;
    std::cin >> name;
    std::cout << "Hello, " << name << "!\n";
}
"""

TEMPLATE_HEAVY = r"""#include <array>
#include <iostream>
#include <tuple>
#include <utility>
template <int N> struct Fib {
    static constexpr long long value = Fib<N - 1>::value + Fib<N - 2>::value;
};
template <> struct Fib<0> { static constexpr long long value = 0; };
template <> struct Fib<1> { static constexpr long long value = 1; };
template <std::size_t N> constexpr std::array<long long, N> sieve_sums() {
    std::array<long long, N> out{};
    for (std::size_t i = 0; i < N; ++i) {
        long long acc = 0;
        for (std::size_t j = 2; j <= i; ++j)
            if (i % j == 0) acc += static_cast<long long>(j);
        out[i] = acc;
    }
    return out;
}
template <std::size_t... Is> void print_fibs(std::index_sequence<Is...>) {
    ((std::cout << Fib<Is>::value << ' '), ...);
    std::cout << '\n';
}
int main() {
    print_fibs(std::make_index_sequence<40>{});
    constexpr auto sums = sieve_sums<256>();
    long long total = 0;
    for (long long s : sums) total += s;
    std::cout << total << '\n';
}
"""

# (名稱, -std, 權重, 程式碼)：權重大約是實際使用的比例
WORKLOAD = [
    ("cp_typical", "c++17", 45, TYPICAL_CPP17),
    ("cp_ranges", "c++20", 20, RANGES_CPP20),
    ("small_iostream", "c++17", 15, SMALL_IOSTREAM),
    ("template_heavy", "c++20", 20, TEMPLATE_HEAVY),
]
HEAVIEST = WORKLOAD[3]

# 綜合分數的基準：1000 分 = Apple M4（10 核，OrbStack 預設 8 GB），workload v1
REF_THROUGHPUT = 165.0  # 建議 pool 數下的持續吞吐量（次/分鐘）
REF_LATENCY = 0.55  # 單一編譯延遲中位數（秒）

LEVEL_CANDIDATES = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64]
COOLDOWN_S = 3  # 級距之間的間隔，讓上一級刪除容器等收尾先做完


# ── 輸出 ──────────────────────────────────────────────────────────────────
# 沒有 TTY 時（docker run 沒加 -t）rich 不會畫動畫與即時表格，改成逐行印進度
console = Console(highlight=False)


def done(msg: str) -> None:
    console.print(f"[green]✓[/] {msg}")


def sweep_table(results: list[dict], recommended: int | None = None) -> Table:
    table = Table(title="同時編譯數掃描（pool 數 = 同時編譯數）", title_justify="left")
    table.add_column("同時", justify="right")
    table.add_column("吞吐量/分", justify="right")
    table.add_column("p50", justify="right")
    table.add_column("p95", justify="right")
    table.add_column("冷啟動", justify="right")
    table.add_column("錯誤", justify="right")
    best = max((r["throughput_per_min"] for r in results), default=0)
    for r in results:
        rec = r["concurrency"] == recommended
        tput = f"{r['throughput_per_min']:.0f}"
        if r["throughput_per_min"] == best:
            tput = f"[bold]{tput}[/]"
        errors = f"[red]{r['errors']}[/]" if r["errors"] else "0"
        table.add_row(
            f"{'★ ' if rec else ''}{r['concurrency']}",
            tput,
            f"{r['p50_s']:.2f} s",
            f"{r['p95_s']:.2f} s",
            f"{r['cold_ratio'] * 100:.0f}%",
            errors,
            style="green" if rec else None,
        )
    return table


def fmt_bytes(n: float) -> str:
    return f"{n / 1024**3:.1f} GiB" if n >= 1024**3 else f"{n / 1024**2:.0f} MiB"


def host_load() -> float | None:
    """主機的 1 分鐘 load average。在容器裡跑時 /proc/loadavg 就是主機（或
    Docker Desktop / OrbStack VM）的核心，所以一樣準。"""
    try:
        return float(Path("/proc/loadavg").read_text().split()[0])
    except (OSError, ValueError):
        try:
            return os.getloadavg()[0]
        except OSError:
            return None


def pct(values: list[float], p: float) -> float:
    if not values:
        return math.nan
    s = sorted(values)
    return s[min(len(s) - 1, max(0, math.ceil(p / 100 * len(s)) - 1))]


# ── 容器相關的量測 ────────────────────────────────────────────────────────
async def exec_in(container, cmd: str) -> str:
    """在容器裡執行 sh -c，回傳 stdout + stderr。"""
    execute = await container.exec(["sh", "-c", cmd], stdout=True, stderr=True)
    parts = []
    async with execute.start(detach=False) as stream:
        while (msg := await stream.read_out()) is not None:
            parts.append(msg.data.decode(errors="replace"))
    return "".join(parts)


async def measure_containers(pool: B.ContainerPool, parallel: int) -> dict:
    """容器冷啟動時間、並行建立速率、閒置與編譯時的記憶體。"""
    # 逐一建立再刪除：一次冷啟動（pool 空了時使用者要多等的時間）
    create_s = []
    for _ in range(5):
        t = time.monotonic()
        c = await pool._create_container()
        create_s.append(time.monotonic() - t)
        await pool._destroy(c)

    # 同時建立：pool 補充的速度上限
    t = time.monotonic()
    containers = await asyncio.gather(
        *[pool._create_container() for _ in range(parallel)]
    )
    create_rate = parallel / (time.monotonic() - t)

    # 記憶體：容器上限（backend 設定的）、閒置容器、編譯最重的程式時的峰值
    # （cgroup v2 的 memory.peak，包含 page cache，只當作參考）
    c = containers[0]
    limit = (await c.show())["HostConfig"].get("Memory") or 0
    idle = await exec_in(c, "cat /sys/fs/cgroup/memory.current 2>/dev/null")
    code = HEAVIEST[3].replace("'", "'\\''")
    peak = await exec_in(
        c,
        f"printf '%s' '{code}' > /tmp/s.cpp && "
        f"cpp-here-build {HEAVIEST[1]} /tmp/s.cpp /tmp/o.js >/dev/null 2>&1; "
        "cat /sys/fs/cgroup/memory.peak 2>/dev/null",
    )
    await asyncio.gather(*[pool._destroy(x) for x in containers])

    def as_int(s: str) -> int | None:
        s = s.strip().splitlines()[-1] if s.strip() else ""
        return int(s) if s.isdigit() else None

    return {
        "container_memory_limit_bytes": limit,
        "cold_start_s": statistics.median(create_s),
        "create_rate_per_s": create_rate,
        "idle_memory_bytes": as_int(idle),
        # 讀不到（cgroup v1）時用容器上限當保守估計
        "build_peak_memory_bytes": as_int(peak) or limit or 1024**3,
        "memory_measured": as_int(peak) is not None,
    }


async def measure_raw_compile(docker: aiodocker.Docker, ncpu: int) -> dict:
    """不經過容器管理的純編譯上限：在一個容器裡用 xargs 平行跑 cpp-here-build。

    和完整流程的差距，就是 docker exec、每次 build 建立與刪除容器、補充 pool
    的開銷。
    """
    code = TYPICAL_CPP17.replace("'", "'\\''")
    container = await docker.containers.run(
        config={
            "Image": B.BUILDER_IMAGE,
            "Cmd": ["sleep", "600"],
            "Labels": {"app": "cpp-here", "component": "host-bench"},
            "HostConfig": {
                "AutoRemove": True,
                "NetworkMode": "none",
                "NanoCpus": ncpu * 1_000_000_000,
                "CapDrop": ["ALL"],
                "SecurityOpt": ["no-new-privileges:true"],
            },
        },
        # 用 worker 的名稱前綴，萬一沒刪到，backend 啟動時的 orphan sweep 會清掉
        name=f"{B.WORKER_NAME_PREFIX}bench-{os.urandom(4).hex()}",
    )
    try:
        out = await exec_in(
            container,
            f"printf '%s' '{code}' > /tmp/s.cpp && "
            "cpp-here-build c++17 /tmp/s.cpp /tmp/w.js >/dev/null 2>&1; "
            f"for p in 1 {ncpu}; do n=$((p*4)); s=$(date +%s%N); "
            "seq $n | xargs -P $p -I{} sh -c "
            "'mkdir -p /tmp/{} && cpp-here-build c++17 /tmp/s.cpp /tmp/{}/o.js >/dev/null 2>&1'; "
            'echo "$p $n $(( ($(date +%s%N)-s)/1000000 ))"; done',
        )
    finally:
        await container.delete(force=True)
    rates = {}
    for line in out.strip().splitlines():
        p, n, ms = (int(x) for x in line.split())
        rates[p] = n / ms * 60_000
    return {
        "single_per_min": rates.get(1, math.nan),
        "all_cpus_per_min": rates.get(ncpu, math.nan),
    }


async def ensure_builder_image(docker: aiodocker.Docker) -> None:
    """本機沒有 builder 映像檔時 pull，並顯示下載進度。

    和 ContainerPool._ensure_image() 做一樣的事，但那個是靜默的：映像檔約
    360 MB，沒有進度的話看起來像卡住。
    """
    try:
        await docker.images.inspect(B.BUILDER_IMAGE)
        done("builder 映像檔已在本機")
        return
    except aiodocker.DockerError as e:
        if e.status != 404:
            raise

    console.print(
        f"[cyan]↓[/] 本機沒有 builder 映像檔，開始 pull [bold]{B.BUILDER_IMAGE}[/]"
    )
    start = time.monotonic()
    layers: dict[str, tuple[int, int]] = {}  # layer id -> (已下載, 總大小)
    columns = (
        BarColumn(),
        DownloadColumn(),
        TransferSpeedColumn(),
        TimeRemainingColumn(),
    )
    # 沒有 TTY 時不畫進度條（rich 會多印空行），改成每 10 秒印一行
    progress = Progress(
        *columns, console=console, transient=True, disable=not console.is_terminal
    )
    last_line = start
    with progress:
        task = progress.add_task("pull", total=None)
        async for event in docker.images.pull(B.BUILDER_IMAGE, stream=True):
            if "error" in event:
                raise aiodocker.DockerError(500, str(event["error"]))
            layer, detail = str(event.get("id")), event.get("progressDetail") or {}
            if event.get("status") == "Downloading" and detail.get("total"):
                layers[layer] = (detail.get("current", 0), detail["total"])
            elif event.get("status") in ("Download complete", "Already exists"):
                if layer in layers:
                    layers[layer] = (layers[layer][1], layers[layer][1])
            if not layers:
                continue
            got = sum(c for c, _ in layers.values())
            total = sum(t for _, t in layers.values())
            progress.update(task, completed=got, total=total)
            if not console.is_terminal and time.monotonic() - last_line >= 10:
                last_line = time.monotonic()
                console.print(f"  已下載 {fmt_bytes(got)} / {fmt_bytes(total)}")
    size = sum(t for _, t in layers.values())
    done(f"pull 完成（{fmt_bytes(size)}，{time.monotonic() - start:.0f} 秒）")


async def remove_leftovers(docker: aiodocker.Docker) -> int:
    """刪掉這次測試建立、但還沒被刪的 worker（owner 標籤是這個行程的）。"""
    containers = await docker.containers.list(
        all=True, filters={"label": [f"owner={B.INSTANCE_ID}"]}
    )
    await asyncio.gather(
        *[x.delete(force=True) for x in containers], return_exceptions=True
    )
    return len(containers)


# ── 壓力測試的一個級距 ────────────────────────────────────────────────────
async def run_level(concurrency: int, duration: float, seed: int) -> dict:
    """pool 數 = 同時編譯數 = concurrency，封閉迴圈持續編譯 duration 秒。"""
    settings.DOCKER_POOL_SIZE = concurrency
    pool = B.ContainerPool()
    B.container_pool = pool  # build() 用的是模組層級的 container_pool
    await asyncio.gather(*[pool._replenish() for _ in range(concurrency)])

    names = [w[0] for w in WORKLOAD]
    weights = [w[2] for w in WORKLOAD]
    by_name = {w[0]: w for w in WORKLOAD}
    records: list[dict] = []
    t0 = time.monotonic()
    end = t0 + duration

    async def worker(i: int) -> None:
        rnd = random.Random(seed * 1000 + i)
        while time.monotonic() < end:
            name = rnd.choices(names, weights)[0]
            _, std, _, code = by_name[name]
            cold = pool.pool.qsize() == 0
            out = Path(tempfile.mkdtemp(prefix="host-bench-"))
            start = time.monotonic()
            error = None
            try:
                await B.build(code, name="out.js", output_dir=out, cpp_version=std)
            except Exception as e:  # BuildError、DockerError 都算失敗
                error = f"{type(e).__name__}: {e}"
            finally:
                shutil.rmtree(out, ignore_errors=True)
            finish = time.monotonic()
            if finish <= end:
                records.append(
                    {
                        "sample": name,
                        "latency": finish - start,
                        "cold": cold,
                        "error": error,
                    }
                )

    try:
        await asyncio.gather(*[worker(i) for i in range(concurrency)])
    finally:
        await pool.shutdown()

    ok = [r for r in records if not r["error"]]
    lat = [r["latency"] for r in ok]
    return {
        "concurrency": concurrency,
        "duration_s": duration,
        "completed": len(ok),
        "errors": len(records) - len(ok),
        "error_samples": [r["error"] for r in records if r["error"]][:3],
        "throughput_per_min": len(ok) / duration * 60,
        "p50_s": pct(lat, 50),
        "p95_s": pct(lat, 95),
        "cold_ratio": (sum(r["cold"] for r in records) / len(records))
        if records
        else 0,
        "per_sample_p50_s": {
            n: pct([r["latency"] for r in ok if r["sample"] == n], 50) for n in names
        },
    }


# ── 主流程 ────────────────────────────────────────────────────────────────
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="主機編譯效能測試")
    p.add_argument(
        "--duration", type=float, default=30, help="每個級距的秒數（預設 30）"
    )
    p.add_argument("--quick", action="store_true", help="快速版：每級 10 秒")
    p.add_argument(
        "--max", type=int, default=0, help="最多測到幾個同時編譯（預設依 CPU 與記憶體）"
    )
    p.add_argument("--out", default="", help="把 JSON 結果存到這個目錄")
    p.add_argument("--seed", type=int, default=1)
    return p.parse_args()


async def main() -> int:
    args = parse_args()
    duration = 10 if args.quick else args.duration
    # backend 的 log 會洗版，只留錯誤
    logging.getLogger().setLevel(logging.ERROR)

    resource_manager.docker = docker = aiodocker.Docker()
    try:
        info = await docker.system.info()
        ncpu, mem_total = info["NCPU"], info["MemTotal"]
        header = Table.grid(padding=(0, 2))
        header.add_column(style="dim")
        header.add_column()
        header.add_row(
            "主機",
            f"{info.get('Name')}（{info.get('OperatingSystem')}，{info.get('Architecture')}）",
        )
        header.add_row(
            "資源", f"{ncpu} CPU、{fmt_bytes(mem_total)} 記憶體（Docker 看到的）"
        )
        header.add_row("映像檔", B.BUILDER_IMAGE)
        header.add_row("負載", f"workload v{WORKLOAD_VERSION}，每級 {duration:.0f} 秒")
        console.print(
            Panel(header, title="[bold]C++ Here 主機編譯效能測試", expand=False)
        )
        busy = host_load()
        if busy is not None and busy > 0.25 * ncpu:
            console.print(
                f"[yellow]⚠ 主機目前的 load average 是 {busy:.1f}（{ncpu} CPU），結果會偏低"
            )

        pool = B.ContainerPool()
        try:
            await ensure_builder_image(docker)
        except aiodocker.DockerError as e:
            console.print(
                Panel(
                    f"{e.message}\n\n"
                    "這個後端映像檔 pin 的 builder tag 還沒推上 registry：builder 映像檔在"
                    " main 或同 repo 的 PR 才會推送（builder-docker.yml），等那個 workflow"
                    " 跑完再試；或在這台主機上自己 build：\n\n"
                    f"  docker build -t {B.BUILDER_IMAGE} \\\n"
                    "      https://github.com/Dong-Chen-1031/CPP-here.git#<分支>:builder/docker",
                    title="[bold red]拿不到 builder 映像檔",
                    border_style="red",
                )
            )
            return 1

        with console.status("量測容器啟動速度與記憶體…"):
            cont = await measure_containers(pool, parallel=min(8, ncpu))
        done(
            f"容器：冷啟動 [bold]{cont['cold_start_s'] * 1000:.0f} ms[/]、"
            f"並行建立 [bold]{cont['create_rate_per_s']:.1f}[/] 個/秒、"
            f"編譯峰值記憶體 [bold]{fmt_bytes(cont['build_peak_memory_bytes'])}[/]"
            + ("" if cont["memory_measured"] else "（讀不到，以上限估計）")
        )

        # 掃描範圍用實測的峰值估計；建議值則用容器的記憶體上限算最壞情況
        # （使用者的程式可能把每個容器都用到上限），兩者都最多用到 80%
        mem_cap = max(1, int(mem_total * 0.8 // cont["build_peak_memory_bytes"]))
        limit = cont["container_memory_limit_bytes"] or 1024**3
        worst_cap = max(1, int(mem_total * 0.8 // limit))
        max_c = args.max or min(2 * ncpu, mem_cap)
        levels = [c for c in LEVEL_CANDIDATES if c <= max_c] or [1]
        done(
            f"記憶體：最壞情況（每個編譯用滿 {fmt_bytes(limit)}）最多同時 "
            f"[bold]{worst_cap}[/] 個；測試級距 {', '.join(map(str, levels))}"
        )
        console.print()

        results: list[dict] = []
        best = 0.0
        stale = 0

        def running(c: int) -> Group:
            return Group(
                sweep_table(results),
                Spinner("dots", text=f" 測試 {c} 個同時編譯（{duration:.0f} 秒）…"),
            )

        with Live(running(levels[0]), console=console, transient=True) as live:
            for c in levels:
                live.update(running(c))
                r = await run_level(c, duration, args.seed)
                r["leaked_containers"] = await remove_leftovers(docker)
                results.append(r)
                if not console.is_terminal:
                    console.print(
                        f"  {c} 個同時：{r['throughput_per_min']:.0f} 次/分鐘、"
                        f"p50 {r['p50_s']:.2f} s、p95 {r['p95_s']:.2f} s、錯誤 {r['errors']}"
                    )
                for e in r["error_samples"]:
                    console.print(f"  [red]! {e[:110]}")
                # 吞吐量連續兩級沒有再成長 3% 以上，就表示已經過了飽和點；至少測到
                # 4 個同時，避免低級距的雜訊讓測試太早結束
                stale = 0 if r["throughput_per_min"] > best * 1.03 else stale + 1
                best = max(best, r["throughput_per_min"])
                if stale >= 2 and c >= 4:
                    break
                live.update(Group(sweep_table(results), Text(" 冷卻中…", style="dim")))
                await asyncio.sleep(COOLDOWN_S)
        done(f"同時編譯數掃描完成（測到 {results[-1]['concurrency']} 個同時）")

        # 放在掃描之後：這段會把所有 CPU 吃滿，放在前面會拖慢掃描（筆電還會降頻）
        with console.status("量測純編譯上限（不含容器管理開銷）…"):
            raw = await measure_raw_compile(docker, ncpu)
        done(
            f"純編譯上限：1 個同時 [bold]{raw['single_per_min']:.0f}[/] 次/分鐘、"
            f"{ncpu} 個同時 [bold]{raw['all_cpus_per_min']:.0f}[/] 次/分鐘"
        )
        console.print()

        # 建議 pool 數：沒有錯誤、吞吐量達到最高值 90% 的最小同時編譯數
        clean = [r for r in results if r["errors"] == 0] or results
        peak = max(r["throughput_per_min"] for r in clean)
        rec = min(
            (r for r in clean if r["throughput_per_min"] >= 0.9 * peak),
            key=lambda r: r["concurrency"],
        )
        single = results[0]
        build_rate = rec["throughput_per_min"] / 60
        pool_size = min(rec["concurrency"], worst_cap)
        overhead = 1 - peak / raw["all_cpus_per_min"]

        score = (
            1000
            * (rec["throughput_per_min"] / REF_THROUGHPUT) ** 0.7
            * (REF_LATENCY / single["p50_s"]) ** 0.3
        )

        console.print(sweep_table(results, recommended=rec["concurrency"]))
        console.print()

        samples = Table.grid(padding=(0, 2))
        samples.add_column(style="dim")
        samples.add_column(justify="right")
        for n, v in single["per_sample_p50_s"].items():
            samples.add_row(n, f"{v:.2f} s")

        summary = Table.grid(padding=(0, 2))
        summary.add_column(style="bold")
        summary.add_column()
        summary.add_row(
            "建議 pool 數",
            f"[bold green]DOCKER_POOL_SIZE={pool_size}[/]"
            f"  [dim]（{rec['throughput_per_min']:.0f} 次/分鐘，p95 {rec['p95_s']:.2f} s）",
        )
        color = "green" if score >= 1000 else "yellow" if score >= 500 else "red"
        summary.add_row(
            "綜合分數",
            f"[bold {color}]{score:.0f}[/]"
            "  [dim]（1000 = Apple M4 10 核 + OrbStack；吞吐量占 70%、延遲占 30%）",
        )
        summary.add_row("", "")
        summary.add_row("最高吞吐量", f"{peak:.0f} 次/分鐘")
        summary.add_row(
            "純編譯上限",
            f"{raw['all_cpus_per_min']:.0f} 次/分鐘"
            f"  [dim]（容器管理等開銷吃掉 {overhead * 100:.0f}%）",
        )
        summary.add_row("單一編譯延遲", f"p50 {single['p50_s']:.2f} s")
        summary.add_row("", samples)
        console.print(
            Panel(summary, title="[bold]結果", border_style="green", expand=False)
        )

        warnings = []
        if build_rate > cont["create_rate_per_s"]:
            warnings.append(
                f"持續滿載時每秒要 {build_rate:.1f} 個新容器，但 Docker 每秒只建得出 "
                f"{cont['create_rate_per_s']:.1f} 個：pool 會被用光，之後的請求要等冷啟動"
                f"（約 {cont['cold_start_s']:.1f} s）。"
            )
        if rec["cold_ratio"] > 0.2:
            warnings.append(
                f"建議級距下有 {rec['cold_ratio'] * 100:.0f}% 的編譯拿到冷容器，"
                "瓶頸在容器建立，不在編譯。"
            )
        if pool_size < rec["concurrency"]:
            warnings.append(
                f"效能上 {rec['concurrency']} 個同時編譯最好，但記憶體只夠最壞情況下的 "
                f"{worst_cap} 個，所以建議值降到 {pool_size}。"
            )
        leaked = sum(r["leaked_containers"] for r in results)
        if leaked:
            warnings.append(f"測試中有 {leaked} 個容器沒被 pool 刪掉（已清除）。")
        if results[-1]["concurrency"] == max_c and rec["concurrency"] == max_c:
            warnings.append(f"測到上限 {max_c} 仍未飽和，可以用 --max 測更高。")
        if warnings:
            console.print(
                Panel(
                    "\n".join(f"• {w}" for w in warnings),
                    title="[bold yellow]注意",
                    border_style="yellow",
                    expand=False,
                )
            )

        report = {
            "time": datetime.now(UTC).isoformat(),
            "workload_version": WORKLOAD_VERSION,
            "host": {
                "name": info.get("Name"),
                "os": info.get("OperatingSystem"),
                "arch": info.get("Architecture"),
                "ncpu": ncpu,
                "memory_bytes": mem_total,
                "docker": info.get("ServerVersion"),
            },
            "builder_image": B.BUILDER_IMAGE,
            "containers": cont,
            "raw_compile": raw,
            "container_overhead_ratio": overhead,
            "levels": results,
            "recommended_pool_size": pool_size,
            "best_concurrency": rec["concurrency"],
            "peak_throughput_per_min": peak,
            "single_build_p50_s": single["p50_s"],
            "score": round(score),
            "warnings": warnings,
        }
        if args.out:
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            path = Path(args.out) / f"host_bench-{info.get('Name')}-{stamp}.json"
            path.write_text(json.dumps(report, indent=2, ensure_ascii=False))
            done(f"結果已存到 {path}")
        return 0
    finally:
        try:
            await remove_leftovers(docker)
        finally:
            await docker.close()


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except KeyboardInterrupt:
        console.print(
            "\n[yellow]已中斷；還沒刪掉的測試容器會在 backend 下次啟動時被清掉。"
        )
        sys.exit(130)
