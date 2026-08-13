"""把 sweep 結果渲染成一份自帶樣式的 HTML 報告（不依賴任何外部資源）。

圖表刻意拆成三張共用 X 軸的圖，而不是把延遲和錯誤率疊在雙 Y 軸上：
雙軸圖的兩條線交叉點沒有任何物理意義，只會誤導人。
"""

from __future__ import annotations

import html
import json
import math
from datetime import datetime
from typing import Any

# ── 調色盤 ────────────────────────────────────────────────────────────────
# 延遲的三條線是「有序」的（p50 < p95 < p99），所以用單一藍色深淺階，
# 而不是三個不同色相 — 深淺本身就承載了「越後面的百分位越極端」。
LATENCY_COLORS = [
    ("#86b6ef", "#9ec5f4"),  # p50   (light, dark)
    ("#2a78d6", "#3987e5"),  # p95
    ("#104281", "#184f95"),  # p99
]
CRITICAL = ("#d03b3b", "#d03b3b")
SERIES_1 = ("#2a78d6", "#3987e5")
SERIES_2 = ("#eb6834", "#d95926")

PAD_L, PAD_R, PAD_T, PAD_B = 64, 24, 16, 42
VW, VH = 760, 300


def _nice_ticks(lo: float, hi: float, count: int = 5) -> list[float]:
    """挑出人類看得懂的軸刻度（1 / 2 / 2.5 / 5 的倍數）。"""
    if hi <= lo:
        hi = lo + 1
    raw = (hi - lo) / max(count - 1, 1)
    mag = 10.0 ** math.floor(math.log10(raw))
    step = next(
        (mag * mult for mult in (1, 2, 2.5, 5, 10) if mag * mult >= raw), mag * 10
    )
    start = math.floor(lo / step) * step
    ticks: list[float] = []
    value = start
    while value <= hi + step * 0.5:
        if value >= lo - step * 1e-9:
            ticks.append(round(value, 10))
        value += step
    return ticks or [lo, hi]


def _fmt_ms(value: float | None) -> str:
    if value is None:
        return "—"
    if value >= 10_000:
        return f"{value / 1000:,.1f}s"
    return f"{value:,.0f}ms"


def _fmt_pct(value: float | None) -> str:
    return "—" if value is None else f"{value * 100:.2f}%"


def _fmt_num(value: float | None) -> str:
    return "—" if value is None else f"{value:,.1f}"


def _line_chart(
    chart_id: str,
    title: str,
    subtitle: str,
    x_values: list[float],
    series: list[dict[str, Any]],
    y_label: str,
    value_fmt,
    y_min_zero: bool = True,
) -> str:
    """畫一張折線圖。series: [{name, colors, values, dashed}]。"""
    all_y = [v for s in series for v in s["values"] if v is not None]
    if not all_y:
        all_y = [0.0]
    y_hi = max(all_y)
    y_lo = 0.0 if y_min_zero else min(all_y)
    if y_hi == y_lo:
        y_hi = y_lo + 1

    # 尾端的直接標籤畫在資料點上方，先在頂端留出空間，免得標籤被擠出畫面
    y_ticks = _nice_ticks(y_lo, y_hi + (y_hi - y_lo) * 0.12)
    y_top = max(y_ticks[-1], y_hi)
    x_lo, x_hi = min(x_values), max(x_values)
    if x_hi == x_lo:
        x_hi = x_lo + 1

    plot_w = VW - PAD_L - PAD_R
    plot_h = VH - PAD_T - PAD_B

    def px(x: float) -> float:
        return PAD_L + (x - x_lo) / (x_hi - x_lo) * plot_w

    def py(y: float) -> float:
        return PAD_T + plot_h - (y - y_lo) / (y_top - y_lo) * plot_h

    parts: list[str] = []

    # 網格 + Y 軸刻度（recessive：髮絲線 + muted 文字）
    for tick in y_ticks:
        y = py(tick)
        parts.append(
            f'<line class="grid" x1="{PAD_L}" y1="{y:.1f}" x2="{PAD_L + plot_w}" y2="{y:.1f}"/>'
        )
        parts.append(
            f'<text class="tick" x="{PAD_L - 10}" y="{y + 4:.1f}" text-anchor="end">'
            f"{html.escape(value_fmt(tick))}</text>"
        )

    # 基線 + X 軸刻度（只標實際測過的級距）
    base_y = py(y_lo)
    parts.append(
        f'<line class="axis" x1="{PAD_L}" y1="{base_y:.1f}" x2="{PAD_L + plot_w}" y2="{base_y:.1f}"/>'
    )
    for xv in x_values:
        parts.append(
            f'<text class="tick" x="{px(xv):.1f}" y="{VH - PAD_B + 20}" text-anchor="middle">'
            f"{xv:g}</text>"
        )

    # 每個 x 位置一條隱形的 hover 感應帶，比資料點大得多，好按
    band = plot_w / max(len(x_values) - 1, 1)
    for i, xv in enumerate(x_values):
        parts.append(
            f'<rect class="hit" data-i="{i}" x="{px(xv) - band / 2:.1f}" y="{PAD_T}" '
            f'width="{band:.1f}" height="{plot_h:.1f}"/>'
        )

    parts.append(
        f'<line class="crosshair" x1="0" y1="{PAD_T}" x2="0" y2="{PAD_T + plot_h}" '
        f'style="opacity:0"/>'
    )

    # 資料線 + 標記
    for si, s in enumerate(series):
        pts = [
            (px(xv), py(v))
            for xv, v in zip(x_values, s["values"], strict=False)
            if v is not None
        ]
        if not pts:
            continue
        d = " ".join(
            f"{'M' if i == 0 else 'L'}{x:.1f},{y:.1f}" for i, (x, y) in enumerate(pts)
        )
        dash = ' stroke-dasharray="5 4"' if s.get("dashed") else ""
        parts.append(f'<path class="line s{si}" d="{d}"{dash}/>')
        for x, y in pts:
            parts.append(f'<circle class="dot s{si}" cx="{x:.1f}" cy="{y:.1f}" r="4"/>')

    # 只在最後一個點直接標值，不是每點都標
    labels: list[tuple[float, float, str]] = []
    for s in series:
        last = next(
            (
                (xv, v)
                for xv, v in reversed(list(zip(x_values, s["values"], strict=False)))
                if v is not None
            ),
            None,
        )
        if last:
            xv, v = last
            labels.append((px(xv) - 8, py(v) - 9, f"{s['name']} {value_fmt(v)}"))

    # 幾條線在尾端收斂時標籤會疊在一起，由下往上推開到至少 13px 間距
    labels.sort(key=lambda item: item[1], reverse=True)
    min_gap = 13.0
    for i in range(1, len(labels)):
        x, y, text = labels[i]
        if labels[i - 1][1] - y < min_gap:
            labels[i] = (x, labels[i - 1][1] - min_gap, text)

    # 整疊往上推之後最頂端可能超出畫面。這時要整疊一起下移，
    # 逐一夾住上緣只會把剛剛推開的間距又壓回去、重新疊在一起。
    top = min((y for _, y, _ in labels), default=10.0)
    shift = max(0.0, 10.0 - top)
    for x, y, text in labels:
        parts.append(
            f'<text class="dlabel" x="{x:.1f}" y="{y + shift:.1f}" '
            f'text-anchor="end">{html.escape(text)}</text>'
        )

    series_css = "\n".join(
        f"#{chart_id} .s{i}{{--c:{s['colors'][0]}}}" for i, s in enumerate(series)
    )
    series_css_dark = "\n".join(
        f"#{chart_id} .s{i}{{--c:{s['colors'][1]}}}" for i, s in enumerate(series)
    )

    legend = ""
    if len(series) >= 2:
        chips = "".join(
            f'<span class="chip"><i class="s{i}"></i>{html.escape(s["name"])}</span>'
            for i, s in enumerate(series)
        )
        legend = f'<div class="legend">{chips}</div>'

    payload = html.escape(
        json.dumps(
            {
                "x": x_values,
                "series": [{"name": s["name"], "values": s["values"]} for s in series],
                "fmt": s_fmt_name(value_fmt),
            },
            ensure_ascii=False,
        ),
        quote=True,
    )

    return f"""
<style>
{series_css}
@media (prefers-color-scheme: dark) {{ :root:where(:not([data-theme="light"])) {{
{series_css_dark}
}} }}
:root[data-theme="dark"] {{
{series_css_dark}
}}
</style>
<figure class="chart" id="{chart_id}" data-chart="{payload}">
  <figcaption>
    <h3>{html.escape(title)}</h3>
    <p>{html.escape(subtitle)}</p>
  </figcaption>
  {legend}
  <div class="plot">
    <svg viewBox="0 0 {VW} {VH}" role="img" aria-label="{html.escape(title)}">
      <text class="ylabel" x="14" y="{PAD_T + 10}">{html.escape(y_label)}</text>
      {"".join(parts)}
    </svg>
    <div class="tip" hidden></div>
  </div>
</figure>
"""


def s_fmt_name(value_fmt) -> str:
    return {_fmt_ms: "ms", _fmt_pct: "pct"}.get(value_fmt, "num")


CSS = """
*,*::before,*::after{box-sizing:border-box}
:root{
  color-scheme:light;
  --plane:#f9f9f7; --surface:#fcfcfb;
  --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,0.10);
  --good:#0ca30c; --warn:#fab219; --crit:#d03b3b;
}
@media (prefers-color-scheme: dark){ :root:where(:not([data-theme="light"])){
  color-scheme:dark;
  --plane:#0d0d0d; --surface:#1a1a19;
  --ink:#ffffff; --ink-2:#c3c2b7; --muted:#898781;
  --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,0.10);
} }
:root[data-theme="dark"]{
  color-scheme:dark;
  --plane:#0d0d0d; --surface:#1a1a19;
  --ink:#ffffff; --ink-2:#c3c2b7; --muted:#898781;
  --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,0.10);
}
body{margin:0;background:var(--plane);color:var(--ink);
  font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;
  padding:32px 20px 64px}
.wrap{max-width:900px;margin:0 auto}
h1{font-size:24px;margin:0 0 6px;letter-spacing:-0.01em}
.sub{color:var(--ink-2);margin:0 0 28px;font-size:14px}
.meta{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;color:var(--muted);
  margin:0 0 28px;padding-bottom:20px;border-bottom:1px solid var(--border)}
.meta b{color:var(--ink-2);font-weight:500}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
  gap:12px;margin:0 0 32px}
.tile{background:var(--surface);border:1px solid var(--border);border-radius:10px;
  padding:14px 16px}
.tile .k{font-size:12px;color:var(--muted);margin:0 0 6px}
.tile .v{font-size:26px;font-weight:600;letter-spacing:-0.02em;margin:0}
.tile .n{font-size:12px;color:var(--ink-2);margin:4px 0 0}
.tile.crit .v{color:var(--crit)} .tile.good .v{color:var(--good)}
.chart{background:var(--surface);border:1px solid var(--border);border-radius:10px;
  margin:0 0 20px;padding:18px 18px 10px}
figcaption h3{font-size:15px;margin:0 0 3px;font-weight:600}
figcaption p{font-size:13px;color:var(--ink-2);margin:0 0 10px}
.legend{display:flex;flex-wrap:wrap;gap:14px;margin:0 0 6px;font-size:12.5px;color:var(--ink-2)}
.chip{display:inline-flex;align-items:center;gap:6px}
.chip i{width:11px;height:11px;border-radius:3px;background:var(--c);display:block}
.plot{position:relative}
svg{width:100%;height:auto;display:block;overflow:visible}
.grid{stroke:var(--grid);stroke-width:1}
.axis{stroke:var(--axis);stroke-width:1}
.tick{fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
.ylabel{fill:var(--muted);font-size:11px}
.line{fill:none;stroke:var(--c);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.dot{fill:var(--c);stroke:var(--surface);stroke-width:2}
.dlabel{fill:var(--ink-2);font-size:11px;font-weight:500}
.hit{fill:transparent;cursor:crosshair}
.crosshair{stroke:var(--axis);stroke-width:1;stroke-dasharray:3 3;pointer-events:none}
.tip{position:absolute;pointer-events:none;background:var(--surface);
  border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:12.5px;
  box-shadow:0 4px 14px rgba(0,0,0,0.14);white-space:nowrap;z-index:5}
.tip b{display:block;margin-bottom:4px;font-size:12px;color:var(--ink-2);font-weight:500}
.tip .row{display:flex;justify-content:space-between;gap:16px;
  font-variant-numeric:tabular-nums}
h2{font-size:17px;margin:36px 0 12px}
.tablewrap{overflow-x:auto;background:var(--surface);border:1px solid var(--border);
  border-radius:10px}
table{border-collapse:collapse;width:100%;font-size:13px;
  font-variant-numeric:tabular-nums}
th,td{padding:9px 12px;text-align:right;white-space:nowrap;
  border-bottom:1px solid var(--border)}
th:first-child,td:first-child{text-align:left}
th{font-weight:600;color:var(--ink-2);font-size:12px}
tbody tr:last-child td{border-bottom:0}
tr.breach td{background:color-mix(in srgb,var(--crit) 8%,transparent)}
.flag{color:var(--crit);font-weight:600}
footer{margin-top:32px;font-size:12px;color:var(--muted)}

/* 分程式碼檢視 */
.tabbed{background:var(--surface);border:1px solid var(--border);border-radius:10px;
  padding:14px 16px 16px}
.tabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px;
  border-bottom:1px solid var(--border);padding-bottom:10px}
.tab{display:inline-flex;align-items:center;gap:7px;background:transparent;
  border:1px solid var(--border);border-radius:7px;padding:6px 11px;cursor:pointer;
  font:inherit;font-size:13px;color:var(--ink-2)}
.tab:hover{background:color-mix(in srgb,var(--ink) 5%,transparent)}
.tab.is-active{background:color-mix(in srgb,var(--ink) 8%,transparent);
  color:var(--ink);font-weight:600;border-color:var(--axis)}
.dotmark{width:7px;height:7px;border-radius:50%;display:block}
.dotmark.good{background:var(--good)} .dotmark.crit{background:var(--crit)}
.panel{display:none} .panel.is-active{display:block}
.panel .path{font-size:12px;color:var(--muted);margin:0 0 12px;word-break:break-all}
.tiles.compact{grid-template-columns:repeat(auto-fit,minmax(120px,1fr));margin-bottom:14px}
.tiles.compact .tile{padding:10px 12px} .tiles.compact .v{font-size:20px}

/* 錯誤明細 */
.sectionnote{font-size:13px;color:var(--ink-2);margin:0 0 12px}
.empty{font-size:13px;color:var(--muted);background:var(--surface);
  border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin:0}
.filters{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;margin:0 0 12px}
.filters label{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;
  color:var(--ink-2)}
.filters label.grow{flex:1;min-width:180px}
.filters select,.filters input{font:inherit;font-size:13px;color:var(--ink);
  background:var(--surface);border:1px solid var(--border);border-radius:7px;
  padding:5px 8px}
.filters input{flex:1;min-width:0}
.filters .count{font-size:12.5px;color:var(--muted);margin-left:auto;
  font-variant-numeric:tabular-nums}
.pill{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11.5px;
  font-weight:600;white-space:nowrap;color:var(--ink)}
.pill.crit{background:color-mix(in srgb,var(--crit) 22%,transparent)}
.pill.serious{background:color-mix(in srgb,#ec835a 26%,transparent)}
.pill.warn{background:color-mix(in srgb,var(--warn) 28%,transparent)}
#errtable td{vertical-align:top}
.detailcell{text-align:left;white-space:normal;min-width:280px;max-width:460px}
.detailcell summary{cursor:pointer;color:var(--ink-2);
  overflow:hidden;text-overflow:ellipsis}
.detailcell pre{margin:8px 0 4px;padding:9px 10px;background:var(--plane);
  border:1px solid var(--border);border-radius:6px;font-size:11.5px;line-height:1.5;
  white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto}
.detailcell .mono{margin:0;font-size:11px;color:var(--muted);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
"""

JS = """
const FMT={
  ms:v=>v==null?'—':(v>=10000?(v/1000).toFixed(1)+'s':Math.round(v).toLocaleString()+'ms'),
  pct:v=>v==null?'—':(v*100).toFixed(2)+'%',
  num:v=>v==null?'—':v.toLocaleString(undefined,{maximumFractionDigits:1})
};
for(const fig of document.querySelectorAll('.chart')){
  const cfg=JSON.parse(fig.dataset.chart);
  const fmt=FMT[cfg.fmt]||FMT.num;
  const tip=fig.querySelector('.tip');
  const cross=fig.querySelector('.crosshair');
  const plot=fig.querySelector('.plot');
  for(const hit of fig.querySelectorAll('.hit')){
    const i=+hit.dataset.i;
    const show=e=>{
      const rows=cfg.series.map((s,si)=>
        `<div class="row"><span><i style="display:inline-block;width:9px;height:9px;`+
        `border-radius:2px;margin-right:6px;background:var(--c)" class="s${si}"></i>`+
        `${s.name}</span><span>${fmt(s.values[i])}</span></div>`).join('');
      tip.innerHTML=`<b>${cfg.x[i]} rpm</b>${rows}`;
      tip.hidden=false;
      const r=plot.getBoundingClientRect();
      let x=e.clientX-r.left+14;
      if(x+tip.offsetWidth>r.width) x=e.clientX-r.left-tip.offsetWidth-14;
      tip.style.left=x+'px';
      tip.style.top=Math.max(0,e.clientY-r.top-tip.offsetHeight-10)+'px';
      const hr=hit.getBoundingClientRect();
      const cx=+hit.getAttribute('x')+ +hit.getAttribute('width')/2;
      cross.setAttribute('x1',cx); cross.setAttribute('x2',cx);
      cross.style.opacity=1;
    };
    hit.addEventListener('mousemove',show);
    hit.addEventListener('mouseenter',show);
    hit.addEventListener('mouseleave',()=>{tip.hidden=true;cross.style.opacity=0});
  }
}

// 分程式碼檢視的分頁切換
for(const tabbed of document.querySelectorAll('.tabbed')){
  const tabs=[...tabbed.querySelectorAll('.tab')];
  for(const tab of tabs){
    tab.addEventListener('click',()=>{
      for(const t of tabs){
        t.classList.toggle('is-active',t===tab);
        const p=tabbed.querySelector('#'+t.dataset.panel);
        if(p) p.classList.toggle('is-active',t===tab);
      }
    });
  }
}

// 錯誤明細的篩選：級距 / 程式碼 / 類型 / 關鍵字，全部是 AND 條件
const errTable=document.getElementById('errtable');
if(errTable){
  const rows=[...errTable.querySelectorAll('.errow')];
  const controls=[...document.querySelectorAll('.filters [data-f]')];
  const counter=document.getElementById('errcount');
  const apply=()=>{
    const f={};
    for(const c of controls) f[c.dataset.f]=c.value.trim().toLowerCase();
    let shown=0;
    for(const row of rows){
      const hit=
        (!f.rpm||row.dataset.rpm===f.rpm)&&
        (!f.sample||row.dataset.sample===f.sample)&&
        (!f.kind||row.dataset.kind===f.kind)&&
        (!f.q||row.textContent.toLowerCase().includes(f.q));
      row.style.display=hit?'':'none';
      if(hit) shown++;
    }
    counter.textContent=shown===rows.length
      ? `${rows.length} 筆`
      : `${shown} / ${rows.length} 筆`;
  };
  for(const c of controls){
    c.addEventListener('change',apply);
    c.addEventListener('input',apply);
  }
  apply();
}
"""


# 分程式碼比較用的類別色。折線圖用的是「相鄰配對」規則，八個槽位都通過檢核；
# 超過八支就不再配色，改折進「其他」（見 dataviz 的類別色上限規則）。
CATEGORICAL = [
    ("#2a78d6", "#3987e5"),
    ("#eb6834", "#d95926"),
    ("#1baf7a", "#199e70"),
    ("#eda100", "#c98500"),
    ("#e87ba4", "#d55181"),
    ("#008300", "#008300"),
    ("#4a3aa7", "#9085e9"),
    ("#e34948", "#e66767"),
]

# 錯誤類型 → 狀態色。狀態色不能單靠色相表意，所以每個 pill 都帶文字標籤。
KIND_META = {
    "transport": ("連線／逾時", "crit"),
    "http": ("HTTP 錯誤", "serious"),
    "compile": ("編譯失敗", "warn"),
}

# 報告內嵌的錯誤筆數上限。再多就只留在 errors.jsonl，否則單一 HTML 會爆掉。
MAX_EMBEDDED_ERRORS = 500


def _per_sample_section(run: dict[str, Any]) -> str:
    """各程式碼的完成狀態：一支一個分頁，外加一張 p95 比較圖。"""
    rollup = run.get("per_sample") or {}
    if not rollup:
        return ""

    samples = list(rollup.values())
    x = [lv["target_rpm"] for lv in run["levels"]]

    # 比較圖：每支程式碼一條 p95 曲線，看得出哪支先撐不住
    compare = ""
    if len(samples) >= 2:
        series = []
        for i, s in enumerate(samples[: len(CATEGORICAL)]):
            by_rpm = {lv["target_rpm"]: lv for lv in s["levels"]}
            series.append(
                {
                    "name": s["label"],
                    "colors": CATEGORICAL[i],
                    "values": [
                        by_rpm[r]["latency_ok_ms"]["p95"] if r in by_rpm else None
                        for r in x
                    ],
                }
            )
        compare = _line_chart(
            "c-samples",
            "各程式碼的 p95 延遲比較",
            "同樣的負載下，編譯成本高的程式碼會先出現尾端延遲惡化。",
            x,
            series,
            "延遲 (ms)",
            _fmt_ms,
        )

    tabs, panels = [], []
    for i, s in enumerate(samples):
        active = " is-active" if i == 0 else ""
        pill = "good" if s["error_rate"] == 0 else "crit"
        tabs.append(
            f'<button class="tab{active}" data-panel="sp-{i}" role="tab">'
            f"{html.escape(s['label'])}"
            f'<span class="dotmark {pill}"></span></button>'
        )

        rows = []
        for lv in s["levels"]:
            lat = lv["latency_ok_ms"]
            rows.append(
                f'<tr class="{"breach" if lv["error_rate"] > 0 else ""}">'
                f"<td>{lv['target_rpm']}</td>"
                f"<td>{lv['requests']:,}</td>"
                f"<td>{lv['successful']:,}</td>"
                f"<td>{lv['failed']:,}</td>"
                f"<td>{_fmt_pct(lv['error_rate'])}</td>"
                f"<td>{_fmt_ms(lat['p50'])}</td>"
                f"<td>{_fmt_ms(lat['p95'])}</td>"
                f"<td>{_fmt_ms(lat['p99'])}</td></tr>"
            )

        panels.append(f"""
<div class="panel{active}" id="sp-{i}" role="tabpanel">
  <p class="path">{html.escape(s["path"])} · {html.escape(s["cpp_version"])}</p>
  <div class="tiles compact">
    <div class="tile"><p class="k">總請求</p><p class="v">{s["requests"]:,}</p></div>
    <div class="tile good"><p class="k">成功</p><p class="v">{s["successful"]:,}</p></div>
    <div class="tile {"crit" if s["failed"] else ""}"><p class="k">失敗</p>
      <p class="v">{s["failed"]:,}</p></div>
    <div class="tile {"crit" if s["error_rate"] else "good"}"><p class="k">錯誤率</p>
      <p class="v">{_fmt_pct(s["error_rate"])}</p></div>
  </div>
  <div class="tablewrap">
    <table><thead><tr>
      <th>rpm</th><th>請求</th><th>成功</th><th>失敗</th><th>錯誤率</th>
      <th>p50</th><th>p95</th><th>p99</th>
    </tr></thead><tbody>{"".join(rows)}</tbody></table>
  </div>
</div>""")

    return f"""
<h2>各程式碼的完成狀態</h2>
{compare}
<div class="tabbed">
  <div class="tabs" role="tablist">{"".join(tabs)}</div>
  {"".join(panels)}
</div>
"""


def _level_errors(level: dict[str, Any]) -> list[dict[str, Any]]:
    """取出某級距的錯誤明細。舊版結果的 errors 是筆數（整數），要能容忍。"""
    errors = level.get("errors")
    return errors if isinstance(errors, list) else []


def _error_section(run: dict[str, Any]) -> str:
    """錯誤明細：可依級距／程式碼／類型／關鍵字篩選的調閱表。"""
    errors = [err for lv in run["levels"] for err in _level_errors(lv)]
    verdict = run["verdict"]
    # 舊版結果沒有 errors_total，退回用各級距的失敗筆數／錯誤率推算，
    # 免得明明出過錯卻顯示「沒有任何錯誤」
    total = verdict.get("errors_total") or sum(
        lv.get("error_count") or round(lv["error_rate"] * lv["requests"])
        for lv in run["levels"]
    )

    if not errors:
        if total:
            return (
                '<h2>錯誤明細</h2><p class="empty">'
                f"這次共 {total:,} 筆錯誤，但沒有取得明細"
                "（每個 VU 的記錄上限可用 --max-errors-per-vu 調高）。</p>"
            )
        return '<h2>錯誤明細</h2><p class="empty">沒有任何錯誤。</p>'

    shown = errors[:MAX_EMBEDDED_ERRORS]
    hidden = len(errors) - len(shown)

    kinds = sorted({e["kind"] for e in errors})
    rpms = sorted({e["target_rpm"] for e in errors})
    labels = sorted({e["sample"] for e in errors})

    def options(values: list, name: str) -> str:
        opts = "".join(
            f'<option value="{html.escape(str(v))}">{html.escape(str(v))}</option>'
            for v in values
        )
        return f'<option value="">全部{name}</option>{opts}'

    kind_opts = "".join(
        f'<option value="{k}">{html.escape(KIND_META.get(k, (k, ""))[0])}</option>'
        for k in kinds
    )

    rows = []
    for e in shown:
        text, tone = KIND_META.get(e["kind"], (e["kind"], "warn"))
        detail = e.get("detail") or e.get("error") or "（沒有回應內容）"
        # error_code 是 k6 給的分類碼，跟 HTTP 狀態碼不是同一回事，分開顯示
        meta = f"error_code {e['error_code']}" if e.get("error_code") else ""
        if e.get("error"):
            meta = f"{meta} · {e['error']}" if meta else e["error"]
        rows.append(f"""
<tr class="errow" data-rpm="{e["target_rpm"]}" data-sample="{html.escape(e["sample"])}"
    data-kind="{e["kind"]}">
  <td>{html.escape(e.get("time", "")[11:23])}</td>
  <td>{e["target_rpm"]}</td>
  <td>{html.escape(e["sample"])}</td>
  <td><span class="pill {tone}">{html.escape(text)}</span></td>
  <td>{e["status"] or "—"}</td>
  <td>{e["duration_ms"]:,}ms</td>
  <td class="detailcell">
    <details><summary>{
            html.escape(detail.splitlines()[0][:90] if detail.strip() else "—")
        }</summary>
      <pre>{html.escape(detail)}</pre>
      <p class="mono">{html.escape(e.get("marker", ""))}{
            " · " + html.escape(meta) if meta else ""
        }</p>
    </details>
  </td>
</tr>""")

    kind_counts = " · ".join(
        f"{KIND_META.get(k, (k, ''))[0]} {v:,}"
        for k, v in sorted(verdict.get("error_kinds", {}).items())
    )
    note = (
        f"共 {total:,} 筆錯誤，記錄明細 {len(errors):,} 筆"
        + (f"（{kind_counts}）" if kind_counts else "")
        + (f"，此處顯示前 {len(shown):,} 筆，其餘見 errors.jsonl" if hidden else "")
        + "。"
    )

    return f"""
<h2>錯誤明細</h2>
<p class="sectionnote">{html.escape(note)}</p>
<div class="filters">
  <label>級距<select data-f="rpm">{options(rpms, "級距")}</select></label>
  <label>程式碼<select data-f="sample">{options(labels, "程式碼")}</select></label>
  <label>類型<select data-f="kind"><option value="">全部類型</option>{kind_opts}</select></label>
  <label class="grow">搜尋<input type="search" data-f="q" placeholder="訊息關鍵字…"></label>
  <span class="count" id="errcount"></span>
</div>
<div class="tablewrap">
  <table id="errtable"><thead><tr>
    <th>時間</th><th>rpm</th><th>程式碼</th><th>類型</th><th>狀態</th><th>耗時</th>
    <th>訊息（點開看完整內容）</th>
  </tr></thead><tbody>{"".join(rows)}</tbody></table>
</div>
"""


def build_report(run: dict[str, Any]) -> str:
    levels = run["levels"]
    x = [lv["target_rpm"] for lv in levels]
    verdict = run["verdict"]

    latency_chart = _line_chart(
        "c-latency",
        "編譯延遲 vs 每分鐘編譯請求數",
        "只計成功的編譯請求 — 後端超載時的快速失敗會把混合統計的 p50 拉低、"
        "看起來像變快了。p99 先翹起來代表尾端延遲開始惡化，通常早於平均值出現異常。",
        x,
        [
            {
                "name": "p50",
                "colors": LATENCY_COLORS[0],
                "values": [lv["latency_ok_ms"]["p50"] for lv in levels],
            },
            {
                "name": "p95",
                "colors": LATENCY_COLORS[1],
                "values": [lv["latency_ok_ms"]["p95"] for lv in levels],
            },
            {
                "name": "p99",
                "colors": LATENCY_COLORS[2],
                "values": [lv["latency_ok_ms"]["p99"] for lv in levels],
            },
        ],
        "延遲 (ms)",
        _fmt_ms,
    )

    error_chart = _line_chart(
        "c-error",
        "錯誤率 vs 每分鐘編譯請求數",
        "包含 HTTP 非 200 與回傳 ok=false 的編譯失敗。",
        x,
        [
            {
                "name": "錯誤率",
                "colors": CRITICAL,
                "values": [lv["error_rate"] for lv in levels],
            }
        ],
        "錯誤率",
        _fmt_pct,
    )

    throughput_chart = _line_chart(
        "c-throughput",
        "實際完成量 vs 供給負載",
        "兩條線分岔的那一刻，就是後端已經吃不下這個速率了。",
        x,
        [
            {
                "name": "供給",
                "colors": SERIES_2,
                "values": [float(v) for v in x],
                "dashed": True,
            },
            {
                "name": "實際完成",
                "colors": SERIES_1,
                "values": [lv["achieved_rpm"] for lv in levels],
            },
        ],
        "每分鐘請求數",
        _fmt_num,
    )

    rows = []
    for lv in levels:
        lat = lv["latency_ok_ms"]
        breach = lv.get("breach")
        flag = (
            f'<span class="flag">{html.escape(breach)}</span>'
            if breach
            else '<span style="color:var(--good)">正常</span>'
        )
        rows.append(
            f'<tr class="{"breach" if breach else ""}">'
            f"<td>{lv['target_rpm']}</td>"
            f"<td>{_fmt_num(lv['achieved_rpm'])}</td>"
            f"<td>{lv['requests']:,}</td>"
            f"<td>{lv['dropped_iterations']:,}</td>"
            f"<td>{lv['successful_requests']:,}</td>"
            f"<td>{_fmt_ms(lat['p50'])}</td>"
            f"<td>{_fmt_ms(lat['p95'])}</td>"
            f"<td>{_fmt_ms(lat['p99'])}</td>"
            f"<td>{_fmt_pct(lv['error_rate'])}</td>"
            f"<td>{flag}</td></tr>"
        )

    safe = verdict["safe_rpm"]
    knee = verdict["knee_rpm"]
    tiles = f"""
<div class="tiles">
  <div class="tile good">
    <p class="k">安全容量</p>
    <p class="v">{safe if safe is not None else "—"}<span style="font-size:14px;font-weight:400"> rpm</span></p>
    <p class="n">通過所有門檻的最高級距</p>
  </div>
  <div class="tile crit">
    <p class="k">拐點</p>
    <p class="v">{knee if knee is not None else "未觸發"}{" rpm" if knee is not None else ""}</p>
    <p class="n">{html.escape(verdict["knee_reason"] or "掃描範圍內未出現劣化")}</p>
  </div>
  <div class="tile">
    <p class="k">基準 p95（最低級距）</p>
    <p class="v">{_fmt_ms(verdict["baseline_p95"])}</p>
    <p class="n">{levels[0]["target_rpm"]} rpm 時的 p95</p>
  </div>
  <div class="tile">
    <p class="k">最高錯誤率</p>
    <p class="v">{_fmt_pct(verdict["max_error_rate"])}</p>
    <p class="n">出現在 {verdict["max_error_rpm"]} rpm</p>
  </div>
  <div class="tile {"crit" if verdict.get("errors_total") else "good"}">
    <p class="k">錯誤總數</p>
    <p class="v">{verdict.get("errors_total", 0):,}</p>
    <p class="n">記錄明細 {verdict.get("errors_recorded", 0):,} 筆</p>
  </div>
</div>
"""

    samples = ", ".join(
        f"{s['label']} ({s['cpp_version']})" for s in run["config"]["samples"]
    )
    started = datetime.fromisoformat(run["started_at"]).strftime("%Y-%m-%d %H:%M:%S")

    return f"""<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>編譯壓力測試報告 — {html.escape(run["config"]["base_url"])}</title>
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
<h1>編譯壓力測試報告</h1>
<p class="sub">每分鐘編譯請求數（RPM）與 p50 / p95 / p99 延遲、錯誤率的關聯。</p>

<div class="meta">
  <span><b>目標</b> {html.escape(run["config"]["base_url"])}/build</span>
  <span><b>開始</b> {started}</span>
  <span><b>每級距</b> {html.escape(run["config"]["duration"])}（冷卻 {html.escape(run["config"]["cooldown"])}）</span>
  <span><b>樣本</b> {html.escape(samples)}</span>
  <span><b>快取</b> {"每次請求皆為唯一程式碼（強制真編譯）" if run["config"]["unique_code"] else "允許命中快取"}</span>
</div>

{tiles}
{latency_chart}
{error_chart}
{throughput_chart}

<h2>逐級距數據</h2>
<div class="tablewrap">
<table>
<thead><tr>
<th>目標 rpm</th><th>實際 rpm</th><th>請求數</th><th>丟棄</th><th>成功</th>
<th>p50</th><th>p95</th><th>p99</th><th>錯誤率</th><th>判定</th>
</tr></thead>
<tbody>{"".join(rows)}</tbody>
</table>
</div>

{_per_sample_section(run)}
{_error_section(run)}

<footer>
  判定門檻：錯誤率 &gt; {run["config"]["error_threshold"] * 100:.1f}% ·
  p95 &gt; 基準的 {run["config"]["p95_multiplier"]}× ·
  出現丟棄請求（k6 供不上 VU，代表後端已飽和）。
</footer>
</div>
<script>{JS}</script>
</body>
</html>
"""
