/**
 * k6 — 單一「每分鐘編譯請求數」(RPM) 級距的壓力測試
 *
 * 這支腳本只負責跑「一個」固定 RPM 的級距，並把該級距的
 * p50 / p95 / p99 延遲、錯誤率、實際達成 RPM 寫成 JSON。
 * 掃描多個 RPM 級距、彙整、畫圖的工作交給 run_sweep.py。
 *
 * 單獨執行：
 *   k6 run -e RPM=60 -e DURATION=60s \
 *          -e CODE_FILES=samples/hello.cpp,samples/sort.cpp \
 *          -e CAPTCHA_TEST_TOKEN=<token> sweep.js
 */
import http from "k6/http";
import { check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// ── 參數（全部由環境變數注入，run_sweep.py 會幫你填）─────────────────────
const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";
const TOKEN = __ENV.CAPTCHA_TEST_TOKEN || "";
const RPM = Number(__ENV.RPM || 60);
const DURATION = __ENV.DURATION || "60s";
const PRE_ALLOCATED_VUS = Number(__ENV.PRE_ALLOCATED_VUS || 20);
const MAX_VUS = Number(__ENV.MAX_VUS || 200);
const GRACEFUL_STOP = __ENV.GRACEFUL_STOP || "120s";
const REQ_TIMEOUT = __ENV.REQ_TIMEOUT || "120s";
const DEFAULT_CPP_VERSION = __ENV.CPP_VERSION || "c++17";
const SUMMARY_OUT = __ENV.SUMMARY_OUT || "";
const LEVEL_LABEL = __ENV.LEVEL_LABEL || `${RPM}rpm`;

// 後端會用 sha256(code + version) 當快取鍵，重複的程式碼會直接回快取、
// 量不到真正的編譯延遲。預設在每個請求前面插一行唯一註解強迫真編譯。
// 想測「全快取命中」的情境時設 UNIQUE=false。
const UNIQUE = (__ENV.UNIQUE || "true") !== "false";

// 每個 VU 最多記錄幾筆錯誤明細。錯誤總數一律由指標算，不受這個上限影響；
// 這裡限的是「留下多少現場證據」，避免後端整個倒掉時寫出幾百 MB 的日誌。
const MAX_ERRORS_PER_VU = Number(__ENV.MAX_ERRORS_PER_VU || 40);
const ERROR_BODY_LIMIT = Number(__ENV.ERROR_BODY_LIMIT || 600);
const ERROR_SENTINEL = "##K6ERR##";

// ── 載入要編譯的 C++ 原始碼 ────────────────────────────────────────────
// k6 的 open() 只能在 init context 呼叫，所以檔案清單必須由外部傳進來
// （k6 沒有列目錄的能力，掃目錄的工作在 run_sweep.py 做）。
const CODE_FILES = (__ENV.CODE_FILES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

if (CODE_FILES.length === 0) {
    throw new Error(
        "沒有指定要編譯的程式碼：請用 -e CODE_FILES=a.cpp,b.cpp（路徑相對於本腳本）",
    );
}

/**
 * 讀入一個 .cpp 檔。檔案開頭可以用註解指令覆寫該檔的設定：
 *   // @cpp_version c++20
 *   // @label heavy_template
 */
function loadSample(path) {
    const source = open(path);
    const versionMatch = /^[ \t]*\/\/[ \t]*@cpp[_-]?version[ \t]*[:=]?[ \t]*(c\+\+\d+)/im.exec(
        source,
    );
    const labelMatch = /^[ \t]*\/\/[ \t]*@label[ \t]*[:=]?[ \t]*(\S+)/im.exec(source);
    const basename = path.split("/").pop().replace(/\.[^.]+$/, "");
    // 標籤會變成指標標籤和 threshold 的鍵（build_duration_ok{sample:X}），
    // `{` `}` `:` `,` 會把那個語法切壞，先換成底線。
    const label = (labelMatch ? labelMatch[1] : basename).replace(/[^\w.-]/g, "_");

    return {
        path,
        code: source,
        cpp_version: versionMatch ? versionMatch[1] : DEFAULT_CPP_VERSION,
        label,
    };
}

const SAMPLES = CODE_FILES.map(loadSample);

// ── 自訂指標 ───────────────────────────────────────────────────────────
const buildDuration = new Trend("build_duration", true); // 所有請求的端到端延遲
// 只統計成功的編譯。後端超載時會秒回 503，那種「快速失敗」會把混在一起的
// p50 拉到接近 0，看起來像變快了 — 必須跟成功請求的延遲分開量。
const buildDurationOk = new Trend("build_duration_ok", true);
const errorRate = new Rate("build_error_rate"); // 綜合錯誤率（HTTP + 編譯失敗）
const httpErrorRate = new Rate("build_http_errors"); // 非 200
const compileErrorRate = new Rate("build_compile_errors"); // 200 但 ok=false
const buildRequests = new Counter("build_requests");

/** 為每支程式碼宣告恆真的 threshold，好讓子指標出現在 summary 裡。 */
function perSampleThresholds() {
    const out = {};
    for (const s of SAMPLES) {
        out[`build_requests{sample:${s.label}}`] = ["count>=0"];
        out[`build_duration_ok{sample:${s.label}}`] = ["p(99)>=0"];
        out[`build_error_rate{sample:${s.label}}`] = ["rate>=0"];
    }
    return out;
}

export const options = {
    scenarios: {
        sweep: {
            executor: "constant-arrival-rate",
            rate: RPM,
            timeUnit: "1m", // rate 直接就是「每分鐘請求數」
            duration: DURATION,
            preAllocatedVUs: PRE_ALLOCATED_VUS,
            maxVUs: MAX_VUS,
            // 讓收尾階段還在編譯的請求跑完，否則尾端延遲會被截斷、p99 失真
            gracefulStop: GRACEFUL_STOP,
        },
    },
    // 這裡的 threshold 全部恆真，不是拿來判定成敗的（掃描的目的是找崩潰點，
    // 某一級距紅了不該讓整個掃描以非零狀態中斷）。k6 只會把「有宣告 threshold 的
    // 帶標籤子指標」放進 summary，所以這是把每支程式碼的數字拆出來的唯一辦法。
    thresholds: perSampleThresholds(),
    // count 必須明列，否則自訂 summaryTrendStats 會蓋掉預設值、拿不到樣本數
    summaryTrendStats: [
        "count", "avg", "min", "med", "p(50)", "p(90)", "p(95)", "p(99)", "max",
    ],
    discardResponseBodies: false,
};

const HEADERS = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TOKEN}`,
};

// 每個 VU 各自算自己記了幾筆（k6 的 VU 之間不共享狀態）
let errorsRecorded = 0;

/**
 * 把一筆錯誤的現場寫成日誌。k6 沒有「在測試中途寫檔」的 API，
 * 所以走 console.error + 前綴，再由 run_sweep.py 從 k6 的日誌檔撈回來。
 */
function recordError(kind, res, sample, marker) {
    if (errorsRecorded >= MAX_ERRORS_PER_VU) return;
    errorsRecorded++;

    const body = res.body ? String(res.body) : "";
    let detail = body;
    // 編譯失敗時 body 裡的 errors[] 才是真正要看的編譯器診斷訊息
    if (kind === "compile") {
        try {
            const parsed = res.json();
            if (parsed && Array.isArray(parsed.errors) && parsed.errors.length) {
                detail = parsed.errors.join("\n");
            }
        } catch (_) {
            // 保持原始 body
        }
    }

    const payload = {
        level: LEVEL_LABEL,
        target_rpm: RPM,
        sample: sample.label,
        cpp_version: sample.cpp_version,
        kind, // transport | http | compile
        status: res.status,
        duration_ms: Math.round(res.timings.duration),
        // 逾時／連線被拒這類請求根本沒回來的情況，訊息在 res.error
        error: res.error || "",
        error_code: res.error_code || 0,
        detail: detail.length > ERROR_BODY_LIMIT
            ? detail.slice(0, ERROR_BODY_LIMIT) + `…（截斷，原長 ${detail.length}）`
            : detail,
        marker: marker.trim(),
        vu: __VU,
        iter: __ITER,
        time: new Date().toISOString(),
    };
    console.error(ERROR_SENTINEL + JSON.stringify(payload));
}

export default function () {
    const sample = SAMPLES[(__VU + __ITER) % SAMPLES.length];
    const tags = { sample: sample.label, level: LEVEL_LABEL };

    // 唯一標記：VU + 迭代數 + 時間戳，確保不同級距之間也不會撞快取。
    // 這行同時也是錯誤日誌裡定位單一請求的識別碼。
    const marker = `// k6 ${LEVEL_LABEL} vu${__VU} iter${__ITER} t${Date.now()}\n`;
    const code = UNIQUE ? marker + sample.code : sample.code;

    const res = http.post(
        `${BASE_URL}/build`,
        JSON.stringify({ code, cpp_version: sample.cpp_version }),
        { headers: HEADERS, timeout: REQ_TIMEOUT, tags },
    );

    buildRequests.add(1, tags);
    buildDuration.add(res.timings.duration, tags);

    const httpOk = res.status === 200;
    httpErrorRate.add(!httpOk, tags);

    let compileOk = false;
    if (httpOk) {
        // 後端超載時可能回 200 但 body 不是預期的 JSON，別讓 parse 例外炸掉 VU
        try {
            compileOk = res.json("ok") === true;
        } catch (_) {
            compileOk = false;
        }
        compileErrorRate.add(!compileOk, tags);
    }

    const ok = httpOk && compileOk;
    errorRate.add(!ok, tags);
    if (ok) {
        buildDurationOk.add(res.timings.duration, tags);
    } else {
        // status 0 = 請求根本沒送達或逾時，跟後端回了錯誤碼是兩回事
        const kind = res.status === 0 ? "transport" : httpOk ? "compile" : "http";
        recordError(kind, res, sample, marker);
    }

    check(res, {
        "status 200": () => httpOk,
        "build ok": () => compileOk,
    });
}

// ── 輸出摘要 ───────────────────────────────────────────────────────────
function seconds(spec) {
    const m = /^([\d.]+)(ms|s|m|h)?$/.exec(String(spec).trim());
    if (!m) return NaN;
    const n = Number(m[1]);
    return { ms: n / 1000, s: n, m: n * 60, h: n * 3600 }[m[2] || "s"];
}

function trend(metric) {
    const v = (metric && metric.values) || {};
    return {
        avg: v.avg ?? null,
        min: v.min ?? null,
        p50: v["p(50)"] ?? v.med ?? null,
        p90: v["p(90)"] ?? null,
        p95: v["p(95)"] ?? null,
        p99: v["p(99)"] ?? null,
        max: v.max ?? null,
    };
}

function rate(metric) {
    const v = (metric && metric.values) || {};
    return {
        rate: v.rate ?? 0,
        passes: v.passes ?? 0,
        fails: v.fails ?? 0,
    };
}

/** 把每支程式碼的子指標拆出來（鍵長這樣：build_duration_ok{sample:hello}）。 */
function perSample(m) {
    const out = {};
    for (const s of SAMPLES) {
        const suffix = `{sample:${s.label}}`;
        const okTrend = m[`build_duration_ok${suffix}`];
        const errRate = rate(m[`build_error_rate${suffix}`]);
        const requests = (m[`build_requests${suffix}`] || {}).values;
        const successful = (okTrend && okTrend.values.count) || 0;
        const total = (requests && requests.count) || 0;

        out[s.label] = {
            label: s.label,
            path: s.path,
            cpp_version: s.cpp_version,
            requests: total,
            successful,
            failed: total - successful,
            error_rate: errRate.rate,
            latency_ok_ms: trend(okTrend),
        };
    }
    return out;
}

export function handleSummary(data) {
    const m = data.metrics || {};
    const windowSec = seconds(DURATION);
    const requests = (m.build_requests && m.build_requests.values.count) || 0;
    const dropped = (m.dropped_iterations && m.dropped_iterations.values.count) || 0;

    const summary = {
        label: LEVEL_LABEL,
        target_rpm: RPM,
        duration: DURATION,
        unique_code: UNIQUE,
        samples: SAMPLES.map((s) => ({
            label: s.label,
            path: s.path,
            cpp_version: s.cpp_version,
        })),

        // 供給 vs 實際完成：兩者背離就是後端已經跟不上了
        requests,
        // dropped_iterations = k6 想發但沒 VU 可用而丟掉的請求
        dropped_iterations: dropped,
        achieved_rpm: windowSec ? (requests / windowSec) * 60 : null,
        offered_rpm: windowSec ? ((requests + dropped) / windowSec) * 60 : null,

        // latency_ok_ms 才是報告主圖採用的數字：只含成功的編譯
        latency_ok_ms: trend(m.build_duration_ok),
        successful_requests: (m.build_duration_ok && m.build_duration_ok.values.count) || 0,
        // latency_ms 含失敗請求，用來對照「快速失敗」造成的假性變快
        latency_ms: trend(m.build_duration),
        http_req_duration_ms: trend(m.http_req_duration),

        error_rate: rate(m.build_error_rate).rate,
        http_error_rate: rate(m.build_http_errors).rate,
        compile_error_rate: rate(m.build_compile_errors).rate,
        // 失敗筆數。注意這裡是 passes 不是 fails：送進 Rate 的值是
        // 「這筆是不是錯誤」，所以 true（= 錯誤）被算進 passes。
        // 另外名字不能叫 errors —— run_sweep.py 會把錯誤明細的陣列放進
        // 同一層的 errors 欄位，撞名會把數字蓋掉。
        error_count: rate(m.build_error_rate).passes,

        vus_max: (m.vus_max && m.vus_max.values.max) || null,
        iterations: (m.iterations && m.iterations.values.count) || 0,

        // 分程式碼的完成狀態；錯誤明細由 run_sweep.py 從日誌檔補上
        per_sample: perSample(m),
    };

    const lat = summary.latency_ok_ms;
    const line =
        `\n[${LEVEL_LABEL}] 目標 ${RPM} rpm → 實際 ${fmt(summary.achieved_rpm)} rpm | ` +
        `成功請求 p50 ${fmt(lat.p50)}ms p95 ${fmt(lat.p95)}ms p99 ${fmt(lat.p99)}ms | ` +
        `錯誤率 ${(summary.error_rate * 100).toFixed(2)}% | 丟棄 ${dropped}\n`;

    const out = { stdout: line };
    if (SUMMARY_OUT) out[SUMMARY_OUT] = JSON.stringify(summary, null, 2);
    return out;
}

function fmt(n) {
    return n === null || n === undefined || Number.isNaN(n) ? "-" : n.toFixed(1);
}
