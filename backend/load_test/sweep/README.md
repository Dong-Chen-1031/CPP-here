# 編譯壓力測試掃描（RPM sweep）

回答一個問題：**每分鐘可以吃下多少個編譯請求，延遲和錯誤率會怎麼變？**

作法是把同一個測試在多個「每分鐘編譯請求數」（RPM）級距各跑一次，
逐級距量 p50 / p95 / p99 延遲與錯誤率，最後把 RPM ↔ 延遲 ↔ 錯誤率的關聯
畫成報告，並標出**拐點**（開始劣化的 RPM）與**安全容量**。

跟上層 `../build.js` 的差別：那支是單一負載的煙霧測試，這裡是掃描多個負載
等級並做橫向比較。

## 前置需求

- [k6](https://k6.io/docs/get-started/installation/)：`brew install k6`
- Python 3.10+（只用標準函式庫）
- 後端需能繞過人機驗證：啟動時設 `BYPASS_CAPTCHA=true`，或帶 `--token`

## 快速開始

```bash
cd backend/load_test/sweep

# 用 samples/ 裡的預設程式碼，掃 6 / 12 / 30 / 60 / 120 rpm
python3 run_sweep.py --url http://localhost:8000

# 自訂級距與時間
python3 run_sweep.py --url http://localhost:8000 \
    --rpm 10,20,40,80 --duration 2m --cooldown 30s

# 需要 token 時
python3 run_sweep.py --token "$CAPTCHA_TEST_TOKEN"
```

跑完會在 `results/<執行名稱>/` 產出：

| 檔案 | 內容 |
|------|------|
| `report.html` | 圖表報告（自帶樣式，可直接雙擊開啟，支援深色模式） |
| `summary.csv` | 逐級距數據，丟進試算表或 pandas 用 |
| `summary.json` | 完整結果，含設定、判定、分程式碼統計與錯誤明細 |
| `errors.csv` / `errors.jsonl` | 所有錯誤的明細（沒出錯就不會產生） |
| `level_<N>rpm.json` | 各級距的原始摘要 |

報告本身分成四個區塊：**判定摘要**（安全容量／拐點／錯誤總數）、**三張趨勢圖**、
**各程式碼的完成狀態**（分頁切換）、**錯誤明細**（可篩選調閱）。

## 從檔案載入要編譯的程式碼

`--code` 可以指向**單一檔案**或**整個目錄**，也可以重複指定。目錄會遞迴
搜尋 `.cpp` / `.cc` / `.cxx` / `.c++`：

```bash
# 換成自己的測試案例
python3 run_sweep.py --code ./my_cases

# 混用目錄和單檔
python3 run_sweep.py --code ./my_cases --code ~/bench/heavy_template.cpp

# 只測單一支程式
python3 run_sweep.py --code ./samples/template_heavy.cpp
```

每個請求會輪流取用清單中的檔案。檔案開頭可以用註解指令覆寫該檔設定：

```cpp
// @cpp_version c++20     ← 這支要用哪個 C++ 標準（預設吃 --cpp-version）
// @label heavy_template  ← 指標上的標籤（預設用檔名）
#include <iostream>
...
```

`samples/` 附了三支涵蓋不同編譯成本的預設樣本：`hello`（最輕）、
`stl_sort`（一般）、`template_heavy`（重模板實例化）。

## 分程式碼檢視

每支程式碼的請求數、成功／失敗、錯誤率、p50/p95/p99 都是分開統計的
（k6 的帶標籤子指標），報告裡用分頁切換，分頁上的圓點直接標出那支有沒有出錯。
上方還有一張各程式碼的 p95 比較圖 —— 同樣負載下編譯成本高的會先出現尾端惡化。

終端機也會印出彙總：

```
程式碼                       請求      成功      失敗      錯誤率
────────────────────────────────────────────────────────
hello                     17       4      13   76.47%
stl_sort                  15       4      11   73.33%
template_heavy            17       4      13   76.47%
```

同樣的資料在 `summary.json` 的 `per_sample` 底下，含逐級距的細項。

## 錯誤分析

只要有錯誤就會記下現場，報告裡可依**級距 / 程式碼 / 類型 / 關鍵字**篩選調閱，
每一列點開就是完整的回應內容。錯誤分三類：

| 類型 | 意思 | 記錄的內容 |
|------|------|-----------|
| `compile` | HTTP 200 但 `ok=false` | 後端回傳的 `errors[]`，也就是編譯器診斷訊息 |
| `http` | 非 200 | 回應 body（截斷至 600 字元） |
| `transport` | 請求根本沒回來 | k6 的錯誤訊息與 `error_code`（逾時、連線被拒等） |

每筆都帶著 `marker`（`// k6 180rpm vu10 iter0 t…`），那行註解就插在送出去的程式碼
第一行，可以拿去跟後端日誌對照同一個請求。

錯誤**總數**一律由指標計算，不受記錄上限影響；上限限的只是「留多少現場證據」：

| 參數 | 預設 | 說明 |
|------|------|------|
| `--max-errors-per-vu` | `40` | 每個 VU 最多記幾筆，避免後端全倒時寫出巨大日誌 |
| `--max-errors-per-level` | `500` | 每個級距最多保留幾筆（0 表示不限） |

報告內嵌上限為 500 筆，超過的部分只留在 `errors.jsonl`。

## 為什麼結果可信

- **強制真編譯**：後端用 `sha256(code + version)` 當快取鍵，重複的程式碼會
  直接回快取。腳本預設在每個請求前插一行唯一註解，確保量到的是真正的編譯
  延遲。想反過來測快取路徑就加 `--allow-cache`。
- **固定到達率**：用 k6 的 `constant-arrival-rate`（`timeUnit: 1m`），
  RPM 就是字面上的每分鐘請求數，不會像 VU 模式那樣「後端變慢 → 發送速率
  跟著變慢」而測不出真正的負載。
- **延遲只算成功請求**：後端超載時會秒回錯誤，那種快速失敗混進統計會把 p50
  拉到接近 0，看起來像變快了。報告主圖用的是成功編譯的延遲，
  混合統計另存在 `summary.json` 的 `latency_ms` 供對照。
- **VU 自動配置**：依 Little's Law（併發 ≈ 到達率 × 服務時間）從上一個級距
  實測的 p95 推算下一級距要幾個 VU，並多留 50% 餘裕。
- **級距間冷卻**：預設 20 秒，避免上一輪殘留的隊列污染下一輪。

## 判定規則

一個級距只要符合任一條就算「劣化」：

| 條件 | 預設值 | 調整參數 |
|------|--------|---------|
| 錯誤率過高 | > 1% | `--error-threshold` |
| p95 相對基準（最低級距）惡化 | > 2× | `--p95-multiplier` |
| 出現丟棄請求（k6 配不出 VU，代表後端已飽和） | > 0 | — |

- **拐點**：第一個劣化的級距
- **安全容量**：拐點前一個級距（全部通過就是最高級距）

連續 2 個級距劣化會提前結束掃描，不再往上加壓浪費時間
（`--stop-after-breaches 0` 可關閉）。

## 常用參數

| 參數 | 預設 | 說明 |
|------|------|------|
| `--url` | `http://localhost:8000` | 後端 base URL |
| `--rpm` | `6,12,30,60,120` | 要掃描的每分鐘編譯請求數 |
| `--duration` | `60s` | 每個級距的持續時間 |
| `--cooldown` | `20s` | 級距之間的冷卻 |
| `--code` | `./samples` | 要編譯的檔案或目錄（可重複） |
| `--cpp-version` | `c++17` | 檔案未指定時的預設標準 |
| `--token` | `$CAPTCHA_TEST_TOKEN` | 繞過人機驗證的 token |
| `--allow-cache` | 關 | 允許命中後端快取 |
| `--max-vus` | `300` | 單一級距的 VU 上限 |
| `--timeout` | `120s` | 單一 `/build` 請求的逾時 |
| `--max-errors-per-vu` | `40` | 每個 VU 最多記錄幾筆錯誤明細 |
| `--max-errors-per-level` | `500` | 每個級距最多保留幾筆錯誤明細 |
| `--out` / `--name` | `./results` / 時間戳 | 輸出位置 |
| `--dry-run` | 關 | 只印出要執行的 k6 指令 |

完整清單：`python3 run_sweep.py --help`

## 只跑單一級距

`sweep.js` 也能單獨用 k6 執行（路徑要用絕對路徑或相對於腳本的路徑）：

```bash
k6 run -e RPM=60 -e DURATION=60s \
       -e BASE_URL=http://localhost:8000 \
       -e CODE_FILES="$PWD/samples/hello.cpp,$PWD/samples/stl_sort.cpp" \
       -e SUMMARY_OUT=/tmp/level.json \
       sweep.js
```

## 抓級距的訣竅

編譯是 CPU-bound 且單次要好幾秒，容量遠低於一般 API。從低開始：

1. 先用 `--rpm 6 --duration 60s` 測單一請求的基準延遲
2. 用 `60 / 基準延遲秒數 × 後端 worker 數` 概算理論上限
3. 圍繞這個數字取 4～6 個級距，讓掃描橫跨拐點兩側

級距太密會拉長總時間（總時間 ≈ 級距數 ×（duration + cooldown）），
太疏則抓不準拐點位置。
