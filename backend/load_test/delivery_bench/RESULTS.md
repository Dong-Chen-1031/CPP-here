# WASM 傳遞方式測試結果（2026-10-05）

## 結論

1. **改成 C（JSON 裡放 JS 程式碼 + base64 WASM）**，從送出建置請求到程式可以執行，大約快 **300 ms（−40% 到 −47%）**。冷連線時也一樣快。
2. **串流編譯（`compileStreaming`）沒有效益。** 這個大小的 WASM，`WebAssembly.compile` 只要 1–4 ms，串流能重疊的時間幾乎是零。所以改用 base64、放棄串流也沒有損失。
3. **A（兩個網址）最慢**，比現行的 B 多約 300 ms，因為 `doong.me` 上 `.js` 檔的 TTFB 是 `.wasm` 的兩倍。
4. **多一次請求的成本，主要是到原站的一次往返（從台灣約 320 ms），不是建立連線。** 建立連線本身只有在 WASM 放在另一個網域、而且是第一次使用時才會多出來。所以「客戶端直接向伺服器要 WASM」不管連線冷熱都要多付一次往返。光是這點，base64 就值得了。

## 測試方法

- 伺服器：赫爾辛基（Hetzner），經 Cloudflare Tunnel 公開在 `cpp-api-insiders.doong.me`，用 `server.py` 模擬建置快取命中時的 `/api/build`。
- 樣本：用正式的 builder image（`tree-72c2864063e6`）編出來的真實產物，JS 都附上 `worker.js`。WASM 大小：printf 48 KB、iostream 168 KB、stdcxx 227 KB、heavy 386 KB；JS 都是 58–70 KB。

- 時間：「可執行」是從送出 POST 到 WASM Module 和 JS 都就緒為止；之後建立 Worker 的時間每種方式都一樣。
- 客戶端：
  - **MacBook**：Chrome 154、Wi-Fi、中華電信。每種組合 10 次。
  - **樹莓派**：Ubuntu arm64、headless Chromium 141、同一個家用網路。暖連線每種組合 10 次，冷連線（每次都開新的瀏覽器 context）8 次。分成不限速，以及 DevTools 限速 10 Mbps 加 40 ms。
  - **雲端容器 loopback**：不經過網路，只用來量 CPU 端的成本（解碼、編譯、JSON 解析）。另外用 DevTools 限速和 4 倍 CPU 降速做對照。

**路由要注意：** 中華電信連 `doong.me`（Cloudflare 免費方案）會走 **SJC（聖荷西）節點**，不是台北，所以每次請求都要經過 台灣 → SJC → 赫爾辛基。量到的每次請求 TTFB 都約 **305–335 ms**。trycloudflare.com 走台北節點，但到原站的路徑比較慢（TTFB 約 570–650 ms），所以表格裡「另一個 host」那幾列不適合跟同網域直接比較。

## 結果（中位數，ms）

### MacBook，暖連線，同一個 host

| 樣本 | A 兩個網址 | B 現行 | C base64 | C 比 B 快 |
|---|---|---|---|---|
| printf | 1001 | 689 | **364** | −325（−47%） |
| iostream | 1010 | 713 | **402** | −311（−44%） |
| stdcxx | 995 | 727 | **419** | −308（−42%） |
| heavy | 1008 | 751 | **457** | −294（−39%） |

B 和 A 的數字是 buffer 模式；stream 模式差不到 3 ms。p25–p75 的範圍都在 ±15 ms 內。

### 樹莓派，冷連線 vs 暖連線（不限速）

| 樣本 | B 暖 | B 冷 | C 暖 | C 冷 | B 冷、WASM 在另一個網域 | B 加 HTTP 快取命中 |
|---|---|---|---|---|---|---|
| printf | 652 | 721 | 344 | **371** | 1017 | 328 |
| iostream | 697 | 733 | 395 | **489** | 1005 | 336 |
| stdcxx | 700 | 781 | 408 | **470** | 1067 | 329 |
| heavy | 714 | 808 | 439 | **564** | 1048 | 344 |

限速 10 Mbps 時趨勢相同：C 暖連線 366–505，B 672–770。

- **「B 加 HTTP 快取命中」**：WASM 網址不變，而且可以快取。這代表同一份程式碼重新執行的情況，跟 C 一樣只要一次往返。正式站的 `StaticFiles` 沒有設 `Cache-Control`，所以拿不到這個效果。
- **另一個網域的冷連線**：建立連線（TCP+TLS）本身只花 23–35 ms，因為那是台北節點。如果第二個網域也走 SJC，用 curl 量到的 TCP+TLS 是 190–470 ms，DNS 首次解析也可能要 200 ms。

### 每一段在做什麼

| | 每次請求 TTFB | `.js` 檔 TTFB | base64 解碼 | `WebAssembly.compile` |
|---|---|---|---|---|
| MacBook／樹莓派 | 305–335 | **640–690**（同網域 `.wasm` 只要 310–345） | 0.1–1（`Uint8Array.fromBase64`）、0.2–4（`atob`） | 0.5–4 |

- **C 多傳的 bytes：** gzip 後大約多 16–45%（heavy：128 KB → 173 KB）。在家用網路只多花 40–110 ms 下載，遠小於省下的一次往返。
- **`.js` 雙倍延遲：** 只發生在 `doong.me`，同樣的檔案從 trycloudflare 抓就沒有。看起來是這個 zone 對 `.js` 多走了一段，可能是快取規則或 Worker route，可以到 Cloudflare 後台查。正式站的 B 不會抓 `.js`，所以不受影響。

## 對正式站的影響

現在正式站的流程是：瀏覽器 → 前端 Worker（`/api/build`）→ builder 回傳 JSON，接著瀏覽器再向另一個網域（`BACKEND_URL`）下載 WASM。也就是「B，而且 WASM 放在另一個網域」，要兩次到原站的往返，第一次執行還要另開一條連線。改成 C 之後只剩一次往返，大約可以省下 300–600 ms，視連線冷熱而定。

改之前要注意：

1. **前端 Worker 會解析整個回應**（`res.json()` 加 zod 驗證，再重新序列化），base64 會讓它多處理 60–520 KB 的字串。免費方案的 Worker 有 10 ms 的 CPU 上限，建議實際量一下，或改成不解析、直接轉送 body。
2. **WASM 變大時就不划算了。** 損益平衡點是「多傳的 bytes ÷ 頻寬 = 一次往返的時間」。以 RTT 300 ms、10 Mbps 來算，大約在 WASM 2–3 MB 的時候。可以設一個門檻：WASM 小於約 2 MB 就內嵌 base64，大於就照舊給網址。這次的樣本是 48–386 KB，一般程式應該都在門檻以下；實際分佈可以查 Prometheus 的 `cpp_build_wasm_size_bytes`。
3. **同一份程式碼重新執行時：** C 本來就只有一次往返。如果還想更快，可以讓前端依 case hash 把編譯好的 `WebAssembly.Module` 存在記憶體裡，那就連建置請求都不用送。

## 重現

```sh
uv run --with fastapi --with uvicorn server.py                    # 伺服器
node run_playwright.mjs --base https://<host> --label <name>      # 或用瀏覽器開 /bench/
curl -s https://<host>/bench/results > results.json && python3 analyze.py results.json
```
