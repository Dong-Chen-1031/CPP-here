> 以下為使用 Claude 進行程式碼審查報告，未使用其生成程式碼，單純進行詢問並作為參考

# 靜默失敗（Silent Failure）稽核報告

- **範圍**：`backend/`、`frontend/`、`extensions/`（自寫部分）、`docker/`、`.github/workflows/`
- **分支**：`v2` @ `6e41bfc`
- **日期**：2026-09-10
- **定義**：本報告只收「**出錯了，但沒有人會知道**」的地方——包含
  1. 例外被吞掉、只寫 console/log 就當沒事
  2. 失敗路徑回傳成功值（假成功）
  3. UI 顯示打勾 / 成功訊息，但底下的操作其實沒完成
  4. 設定寫錯不會報錯，只會安靜地降級成另一種行為
  5. Promise 沒 await / 沒 catch，失敗直接消失
  6. 流程卡住不會超時、也不會回報（永久 pending）

> 註：與 `dev_logs/code-review-full.md` / `code-review-v2.md` 重疊的項目會標註 `[既有]`，其餘為本次新發現。

---

## 總覽

| # | 位置 | 症狀 | 嚴重度 |
|---|---|---|---|
| S1 | `frontend/src/pages/api/share.ts:43` | R2 `put()` 沒 await，分享連結可能指向不存在的物件 | 🔴 |
| S2 | `frontend/src/pages/api/share.ts:33` vs `:43` | 去重用的 key 與寫入的 key 不同 → 碰撞時直接覆蓋別人的分享 | 🔴 |
| S3 | `frontend/src/pages/api/share.ts:12` | hash 把陣列字串化成 `[object Object]` → 測資/輸出不影響 shareId | 🔴 |
| S4 | `frontend/src/pages/api/share.ts:36-40` | `customMetadata.fullHash` 從未寫入 → 該分支永遠不成立，且是潛在無限迴圈 | 🟠 |
| S5 | `backend/settings.py:25` | `ENABLE_CENTER_CONSOLE="false"` 會「開啟」Center Console | 🟠 |
| S6 | `backend/settings.py:74-80` | Center Console 抓不到設定時安靜退回 env，JWT_SECRET 可能整批重生 | 🟠 |
| S7 | `backend/settings.py:175-182` | S3 設定缺一個，`SHARE` 就被安靜關掉，前端卻照樣顯示分享按鈕 | 🟠 |
| S8 | `backend/router/verify.py:39-42` | token 過期回 **400**，前端只認 401 → 自動續期永遠不會觸發 | 🟠 |
| S9 | `frontend/src/service/run.ts:432` | `url2WasmModule` 沒有 try/catch → 失敗時 UI 永遠卡在 building | 🟠 |
| S10 | `frontend/src/service/run.ts:60-66` | 401 重試的 Promise 沒有 timeout 也沒有 unsubscribe → 可能永久 pending `[既有]` | 🟠 |
| S11 | `extensions/src/background.ts:104-132` | `executeScript` 先回，注入的等待迴圈才在跑 → 回報 `SendTaskDone` 但事件從未送達 | 🟠 |
| S12 | `frontend/src/components/panel/TestCasePanel.tsx:218` | `window.eventListenerLoaded` 只設 true 不設 false；手機版根本不會掛載 | 🟠 |
| S13 | `frontend/src/service/run.ts:148-150, 326-346` | stderr 只進 console，UI 完全看不到 | 🟠 |
| S14 | `backend/utils/cache.py:165-174` | 讀 stats 失敗時回傳全 0，`/status` 看起來一切正常 | 🟡 |
| S15 | `backend/utils/cache.py:139-140` | 清理排程 24h 才第一次跑，重啟頻繁的部署等於從不清理 | 🟡 |
| S16 | `frontend/src/lib/format.ts:56-59` + `formatBtn.tsx:49-56` | 格式化失敗回傳原字串，UI 還是打勾 | 🟡 |
| S17 | `frontend/src/components/panel/OutputPanel.tsx:42-52` | `clipboard.writeText` 沒 await / 沒 catch，一律顯示已複製 | 🟡 |
| S18 | `frontend/src/components/header/uploadBtn.tsx:30-41` | `FileReader` 沒有 `onerror`，讀檔失敗完全無聲 | 🟡 |
| S19 | `frontend/src/lib/langList.ts:12-20` | 忘記跑 `copy-i18n` → 語言清單空白，沒有任何錯誤 | 🟡 |
| S20 | `backend/utils/log.py:56-66` | OTLP log 沒有 shutdown/flush，關機前的 log 直接丟失 | 🟡 |
| S21 | `backend/services/build.py:104-105` | pool 補充失敗只 log，容量安靜縮水 | 🟡 |
| S22 | `extensions/src/hosts/Host.ts:18-20` | `catch { // }` 完全空的，送不出去也不會有人知道 | 🟡 |
| S23 | `docker/frontend/Dockerfile:14` | Caddy 的 root 指到 `dist`，但 Cloudflare adapter 產物在 `dist/client` | 🟡 |
| S24 | `frontend/src/components/posthog.astro` | `PUBLIC_POSTHOG_PROJECT_TOKEN` 未納入 env schema，沒設就靜靜不送 | 🟡 |
| S25 | `backend/requirements.txt` | 完全沒有版本鎖定 | 🟡 |
| S26 | `frontend/src/service/run.ts:329-334` | `onStdout` 把整個 output 陣列換成單一元素，錯誤訊息被吃掉 | 🔵 |
| S27 | `frontend/src/service/run.ts:350-386` | `insertInOrder` 找不到 testCaseId 時回 -1，排序默默錯亂 | 🔵 |
| S28 | `backend/assets/worker.js:47` | `err.message` 對非 Error 例外是 `undefined`，下游 `matchAll` 會爆在 event handler 裡 | 🔵 |
| S29 | `frontend/src/store/atom.ts:41` | `loadedCount >= 3` 這個魔術數字沒有任何保護 | 🔵 |
| S30 | `extensions/src/background.ts:86-102` | `waitForTabLoad` 沒有 catch / timeout | 🔵 |

---

## 🔴 P0 — 會造成資料遺失或給錯內容

### S1. R2 寫入沒有 `await`，分享連結可能指向空物件

**檔案**：`frontend/src/pages/api/share.ts:43`

```ts
env.R2_BUCKET.put(`share/${shareId}`, JSON.stringify(shareObject));   // ← 沒有 await

return reply({ shareId: shareId });
```

在 Cloudflare Workers 上，**handler 回傳之後尚未完成的 I/O 不保證會被執行完**（要留住它得 `await`，或用 `ctx.waitUntil()`）。

**失效情境**：使用者按下分享 → 前端拿到 shareId、複製連結、跳出「分享成功」→ 但 `put` 在 response 回傳的瞬間被取消。對方打開連結，`fetchSharedCode` 拿到 404，只會看到一句泛用的「接收失敗」。**送出端永遠不會知道自己分享了一個空連結。**

另外，`put` 若 reject（配額、權限、R2 故障）也**沒有任何 catch**，同樣是回 200 + shareId。

**修法**：

```ts
try {
    await env.R2_BUCKET.put(`share/${shareId}`, JSON.stringify(shareObject), {
        customMetadata: { fullHash: fullShareId },   // 順便補 S4
    });
} catch (err) {
    console.error("R2 put failed", err);
    throw new APIError(502, "Failed to store shared code");
}
```

---

### S2. 去重檢查讀的 key 和實際寫入的 key 不一樣

**檔案**：`frontend/src/pages/api/share.ts:30-43`

```ts
while (true) {
    shareId = fullShareId.slice(0, len);
    const old = await env.R2_BUCKET.head(shareId);        // ← 讀 "abc12"
    if (!old) break;
    ...
}
env.R2_BUCKET.put(`share/${shareId}`, ...);               // ← 寫 "share/abc12"
```

`head()` 查的是裸 key，`put()` 寫的是 `share/` 前綴 key。**兩者永遠不會是同一個物件**，所以：

- `head()` 永遠回 `null` → 迴圈第一圈就 `break` → `len` 永遠是 5
- 整段碰撞偵測是**死碼**

**失效情境**：sha256 取 base64url 前 5 碼 ≈ 10 億種可能，依生日悖論在**約 3 萬筆分享**時就會出現第一次碰撞。碰撞發生時 `put` 直接覆蓋既有物件——**A 之前分享的連結，從此指向 B 的程式碼**。整個過程零錯誤、零 log，A 和 B 都不會知道。

**修法**：`head()` 與 `put()` 使用同一個 key（`share/${shareId}`）；並把 5 碼起跳改長一點（8-10 碼），碰撞機率才降到可忽略。

---

### S3. hash 把陣列字串化，測資與輸出根本沒進 hash

**檔案**：`frontend/src/pages/api/share.ts:12`

```ts
const jsonString = `v2.0.0;${shareObject.code};${shareObject.inputData};${shareObject.outputData};${shareObject.testCase}`;
```

`shareObject.testCase` 是 `TestCase[]`、`outputData` 是 `OutputCase[]`。模板字串會呼叫 `Array.prototype.toString()`，結果是 `[object Object],[object Object],[object Object]`——**與內容完全無關，只跟元素個數有關**。

**失效情境**：兩個人程式碼與 input 相同、只有測資不同（例如同一題目的兩組測資），算出來的 `fullShareId` **完全一樣**。搭配 S2（覆蓋不設防），後分享的人會直接蓋掉前一個人的內容，而前一個人的連結**看起來還是好的，只是內容變成別人的**。

**修法**：

```ts
const jsonString = `v2.0.0;${JSON.stringify(shareObject)}`;
```

（若要保證穩定性，序列化前先對 key 做排序；zod 的 `ShareObjectSchema` 已經固定了欄位，直接 `JSON.stringify` 就夠。）

---

## 🟠 P1 — 功能整個失效，但看起來像正常運作

### S4. `customMetadata.fullHash` 從來沒被寫入 → 分支永遠不成立 + 潛在無限迴圈

**檔案**：`frontend/src/pages/api/share.ts:36-40`

```ts
else if (old.customMetadata?.fullHash === fullShareId) {
    return reply({ shareId });      // 命中同一份內容，直接重用
} else len += 1;
```

`put()` 從未帶 `customMetadata`，所以 `old.customMetadata` 永遠是 `undefined`，這個「同內容重用」的分支**是死碼**。

更危險的是：一旦 S2 被修好（head/put 對齊）而這裡沒修，重複分享同一份程式碼會走進 `else len += 1`，而 `String.prototype.slice(0, len)` 在 `len` 超過字串長度後**會一直回傳同一個字串** → `shareId` 不再改變 → `head()` 永遠命中 → **while 迴圈永不結束**，Worker 撞 CPU 上限被殺掉。使用者只看到「分享失敗」，log 裡沒有任何線索。

**修法**：修 S2 的同時務必補上 `customMetadata: { fullHash: fullShareId }`，並在迴圈加上 `len <= fullShareId.length` 的上界防護。

---

### S5. `ENABLE_CENTER_CONSOLE="false"` 會「開啟」Center Console

**檔案**：`backend/settings.py:25-27`

```python
ENABLE_CENTER_CONSOLE = os.getenv("ENABLE_CENTER_CONSOLE") and bool(
    CENTER_URL and CENTER_TOKEN
)
```

`os.getenv()` 回傳的是**字串**。`"false"`、`"0"`、`"no"` 在 Python 裡全都是 truthy，所以 `ENABLE_CENTER_CONSOLE=false` 的效果和 `=true` 一模一樣。

**失效情境**：想關掉遠端設定源的人照直覺寫 `ENABLE_CENTER_CONSOLE=false`，結果每次啟動與 `reload_settings()` 仍會去打 Center Console，而且**遠端設定的優先序高於 env**（見 `settings_customise_sources`），本機 `.env` 被安靜蓋掉。啟動訊息還會印綠字「Center Console is enabled」，但沒人會把那句話跟自己剛設成 false 的變數聯想在一起。

**修法**：

```python
def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}

ENABLE_CENTER_CONSOLE = _env_bool("ENABLE_CENTER_CONSOLE") and bool(CENTER_URL and CENTER_TOKEN)
```

---

### S6. Center Console 抓不到就安靜退回 env——包含 `JWT_SECRET`

**檔案**：`backend/settings.py:74-80`

```python
except Exception as e:
    CENTER_CONSOLE_FETCH_FAILURES.inc()
    print(f"[red]Failed to fetch settings from Center Console ({e!r}), using env / .env instead")
    return d       # ← 回傳空 dict，所有欄位落回 default
```

計數器有 +1、也有紅字，這比多數地方好。但問題在於「退回 default」的後果：

`JWT_SECRET: str = Field(default_factory=lambda: secrets.token_urlsafe(32))`

若正式環境的 `JWT_SECRET` 是由 Center Console 提供、env 沒有，一次 3 秒 timeout 的抓取失敗就會讓 **backend 產生一把全新的隨機簽章金鑰**。所有在線使用者手上的 JWT 立刻失效——而依 S8，他們拿到的會是 400，前端的自動續期又不吃 400，於是每個人都卡在「Build failed: Request failed with status code 400」。這是一次瞬時網路抖動造成的全站故障，而唯一的線索是 stdout 上一行紅字。

同樣的道理套用在 `BYPASS_CAPTCHA`（default `False`，退回後只是變嚴格，還好）與 `SHARE`（見 S7）。

**修法**：
- 把「必須由 Center Console 提供」的欄位列成白名單，抓取失敗時**啟動失敗**而不是退回 default
- `JWT_SECRET` 不要用 `default_factory` 隨機生成；缺就 raise（現行寫法讓「忘了設」和「設了但抓不到」變成同一個無聲行為）
- 已經有 `center_console_fetch_failures_total` 這個 Counter，請在 Grafana / 告警上真的接一條規則

---

### S7. S3 設定缺一項，`SHARE` 就被安靜關掉

**檔案**：`backend/settings.py:175-182`、`backend/main.py:58-62`

```python
self.SHARE = self.SHARE and all([
    self.S3_ENDPOINT_URL, self.S3_ACCESS_KEY_ID,
    self.S3_SECRET_ACCESS_KEY, self.S3_BUCKET_NAME,
])
```

明明設了 `SHARE=true`，只要四個 S3 變數少填一個（或打錯字），就會被降級成 `False`。而 `main.py` 只在**成功**時印 `🔗 Share feature is enabled`——**失敗時沒有任何訊息**，只是那行綠字不見了。

連帶效果：
- `router/share.py:35-41` 那段「回 501 告訴使用者功能未啟用」的貼心處理是**死碼**——因為 route 根本沒被 `include_router`，實際回的是 404
- 前端的 `PUBLIC_SHARE` 是**獨立**的環境變數，backend 關掉不影響它，所以分享按鈕照樣顯示，使用者按了才發現壞掉

**修法**：

```python
if self.SHARE and not all([...]):
    raise ValueError("SHARE=true but S3_* settings are incomplete: " + ", ".join(missing))
```

寧可開不起來，也不要「以為開了其實沒開」。

---

### S8. token 過期回 400，前端只認 401 → 自動續期是死的

**檔案**：`backend/router/verify.py:39-42`、`frontend/src/service/run.ts:49`

```python
except jwt.ExpiredSignatureError as e:
    raise HTTPException(status_code=400, detail="Token has expired") from e
except jwt.InvalidTokenError as e:
    raise HTTPException(status_code=400, detail="Invalid token") from e
```

```ts
if (axios.isAxiosError(error) && error.status === 401) {   // ← 只處理 401
```

`need_token()` 只有在 **Authorization header 完全缺席**時回 401；token 存在但過期／簽章不符時回的是 **400**。前端 `buildCode` 與 `shareCode` 的重試邏輯都只比對 401。

**失效情境**：JWT 過期（預設 1 小時）→ 使用者按執行 → 後端回 400 → 前端**不重置 Turnstile、不續期**，直接把 axios 的錯誤字串塞進輸出面板：

```
Build failed with errors:
AxiosError: Request failed with status code 400
```

使用者只會覺得「編譯壞了」，重整頁面才會好。整套已經寫好的自動續期機制（`turnstile.tsx` 的 `RESET_BUFFER_MS`、`share.ts` 的 `renewJwt`）在這條路徑上**從未被觸發過**。

**修法**：語意上「token 過期／無效」就是 401（`WWW-Authenticate`），把 `is_verified` 的兩個 400 改成 401；前端同時放寬成 `[401, 403].includes(error.response?.status)` 較保險。另注意 `error.status` 只在有 response 時才有值，網路層錯誤要走另一條路徑。

---

### S9. `url2WasmModule` 沒有防護 → 「執行全部」失敗時 UI 永久卡在 building

**檔案**：`frontend/src/service/run.ts:432`

```ts
const wasmModule = await url2WasmModule(response.wasm_url);   // ← 裸 await
```

`handleRunAll` 本身不是被 await 的（`runBtn.tsx:233` 直接 `handleRunAll()`），也沒有 `.catch()`。而 `url2WasmModule` 內部是 `fetch` + `WebAssembly.compileStreaming`，會在以下情況 reject：

- CDN / backend 暫時抓不到 `.wasm`
- `.wasm` 的 `Content-Type` 不是 `application/wasm`（`compileStreaming` 對此**嚴格檢查**）
- 快取檔被 `delete_expired_caches` 清掉但 response 還在飛

此時：`runStatusStore` 停在 `"building"`（第 405 行設定，永遠沒有機會被設回 `"idle"`）→ **執行按鈕永久 disabled、輸出面板永遠轉圈**，console 有一條沒人看的 unhandled rejection。使用者只能重整。

**修法**：包 try/catch，失敗時 `showError(...)` + `store.set(runStatusStore, "idle")`。同時建議在 `runBtn.tsx` 的兩個呼叫點補 `.catch()`，讓 `handleRun` / `handleRunAll` 任何未預期的 reject 都能收斂狀態。

---

### S10. 401 重試路徑沒有 timeout、也沒有 unsubscribe `[既有]`

**檔案**：`frontend/src/service/run.ts:60-66`

```ts
await new Promise((resolve, reject) =>
    defaultStore.sub(verifyJwtStore, () => {
        resolve(null);
    }),
);
return await buildCode(code, cppVersion);
```

三個問題：

1. `defaultStore.sub()` 回傳的 unsubscribe 函式被丟棄 → **每次 401 都洩漏一個訂閱**
2. 沒有 timeout：Turnstile 若因為網路/擴充功能攔截而沒有成功，這個 Promise **永遠 pending**，`runStatusStore` 卡在 `"building"`
3. `resolve` 在 store 「有任何變動」時就觸發，包含被設成 `null` 的那次 → 有機會拿著空 jwt 立刻重試，然後無限遞迴（`buildCode` 沒有重試次數上限）

`service/share.ts:18-55` 的 `renewJwt()` **已經把這三點都修好了**（有 `JWT_RENEW_TIMEOUT_MS`、有 `unsub()`、有 `settled` 旗標、有 `allowRetry` 單次限制）。`run.ts` 沒有跟上。

**修法**：把 `share.ts` 的 `renewJwt()` 抽到共用模組，兩邊一起用。

---

### S11. 擴充功能回報「送出成功」，但事件可能從未送達

**檔案**：`extensions/src/background.ts:104-132`、`:188-190`

```ts
await browser.scripting.executeScript({
    target: { tabId }, args: [payload], world: 'MAIN',
    func: injectedPayload => {
        waitForEventListener().then(() => {                 // ← 非同步，executeScript 不會等它
            window.dispatchEvent(new CustomEvent('ext', { detail: injectedPayload }));
        });
    },
});

sendToContent(tabId, MessageAction.SendTaskDone, { messageId });   // ← 無論如何都送 Done
```

注入的函式是**同步回傳**的（它只是啟動了一個 promise chain），`executeScript` 因此立刻 resolve。真正決定事件有沒有送出的 `waitForEventListener()` 是一個**沒有上限、每 50ms 輪詢一次、永不放棄**的 `setInterval`。

**失效情境**：目標分頁上 `window.eventListenerLoaded` 一直沒被設成 `true`（見 S12）→ 那個 interval 在頁面上**永遠跑下去**（每秒 20 次，直到分頁關閉）→ 測資從未送達 → 但擴充功能那邊已經回報 `SendTaskDone`，Nanobar 走到 100%，使用者以為題目匯入成功，切到編輯器卻什麼都沒有。

**修法**：
- 讓注入的函式 `return` 那個 promise（`executeScript` 支援 async func，會等它 resolve）
- 給 `waitForEventListener()` 一個 timeout（例如 10 秒）並在逾時時 reject
- `SendTaskDone` 改成只在確實 dispatch 之後才送，失敗走 `SendTaskFailed`

---

### S12. `window.eventListenerLoaded` 只會被設 true，且手機版根本不會掛載

**檔案**：`frontend/src/components/panel/TestCasePanel.tsx:213-222`

```ts
window.addEventListener("ext", handleExtEvent);
// @ts-ignore
window.eventListenerLoaded = true;
return () => {
    window.removeEventListener("ext", handleExtEvent);   // ← 只移掉 listener
};                                                       // ← eventListenerLoaded 沒有設回 false
```

這是擴充功能與網頁之間唯一的握手訊號，但它是**單調遞增**的。

兩個具體場景：

1. **手機版**：`Resize.tsx:182-194` 在 `isMobile` 時只渲染 `MobileLayout`（僅有 Editor），`ComputerLayout`（含 `TestCasePanel`）**完全不渲染**。`TestCasePanel` 只有在使用者手動打開 Drawer 時才會被 vaul 掛載。所以手機上剛開頁面時 `eventListenerLoaded` 是 `undefined` → 擴充功能永遠等不到 → 走進 S11 的無聲失敗。
2. **Drawer 關閉後**：使用者打開過 Drawer（旗標變 true）、又關掉（`TestCasePanel` unmount、listener 被移除、旗標**仍是 true**）→ 擴充功能看到 true 就立刻 dispatch → **沒有任何人在聽**，事件直接落地。這次連 interval 都不會卡住，是徹底的「送出成功但資料蒸發」。

**修法**：
- cleanup 裡把 `window.eventListenerLoaded = false`
- 更好的作法：把 `ext` 的 listener 從 `TestCasePanel` 搬到一個**永遠掛載**的頂層元件（直接寫進 store），與 UI 的掛載狀態解耦

---

### S13. stderr 只進 console，使用者在 UI 上完全看不到

**檔案**：`frontend/src/service/run.ts:148-150`、`:326-346`、`:436-490`

```ts
onStderr = (err) => {
    console.error("Standard error occurred.", err);      // ← 預設實作只寫 console
},
```

`handleRun()` 與 `handleRunAll()` **都沒有傳 `onStderr`**，所以一律走這個預設值。

**失效情境**：C++ 程式用 `cerr` / `fprintf(stderr, ...)` 印偵錯訊息、assert 失敗訊息、或 sanitizer 的報告——**在輸出面板上一個字都不會出現**。使用者看到的是「程式跑完了，但沒有輸出」，得自己想到去開 F12。對一個以競程為訴求的編輯器來說，這條路徑相當關鍵。

`worker.js:27-30` 其實有好好把 stderr post 出來，白費了。

**修法**：在 `handleRun` / `handleRunAll` 傳入 `onStderr`，把內容以不同樣式（例如 `type: "err"`，紅字）寫進 `outputStore`。

---

## 🟡 P2 — 觀測性 / 部署層的無聲降級

### S14. stats 讀取失敗回傳全 0，`/status` 顯示得像一切正常

**檔案**：`backend/utils/cache.py:165-174`

```python
except Exception as e:
    logger.error(f"Error fetching build stats: {e}")
    return BuildStats()          # ← 全部欄位都是 0
```

`router/api.py:19-35` 外層還包了一次 try/except 想回 500，但**永遠不會被觸發**——內層已經把例外吃掉並回了一個合法物件。

**失效情境**：DB 檔損毀 / 磁碟滿 / schema 不匹配 → `/status` 回 `200 {"total_count": 0, ...}` → landing page 的數據區塊顯示「0 次編譯」。監控看到 200 也不會告警。只有翻 log 才找得到。

**修法**：讓 `get_build_stats()` 把例外往外丟，由 `router/api.py` 決定回 500；「查無資料」（`stats is None`）才回 `BuildStats()`——那是合法的空狀態，跟「查詢失敗」必須分開。

---

### S15. 清理排程 24 小時後才第一次跑

**檔案**：`backend/utils/cache.py:139-140`

```python
scheduler.add_job(delete_expired_caches, "interval", days=1)
scheduler.add_job(cleanup_caches, "interval", days=1)
```

APScheduler 的 `interval` trigger 預設**第一次執行是在一個 interval 之後**（也就是啟動後 24 小時）。

**失效情境**：任何部署頻率高於一天一次的環境（CD 推版、`restart: unless-stopped` 遇上 OOM、host 重開）→ 這兩個 job **一次都不會執行**。`CACHE_LIMIT`（預設 100）與 `CACHE_EXPIRY`（7 天）形同虛設，`cache/` 目錄與 sqlite 無上限成長，直到磁碟寫滿——那時才會以完全無關的錯誤（build 失敗、DB locked）浮現。

**修法**：加上 `next_run_time=datetime.now()`（或 `start_date`），啟動時先跑一次；並把 interval 縮到小時級。同時建議加一個 `cache_entries_total` 的 Gauge，讓「沒清乾淨」這件事看得見。

---

### S16. 格式化失敗會安靜地回傳原字串，UI 還打勾

**檔案**：`frontend/src/lib/format.ts:56-59`、`frontend/src/components/header/formatBtn.tsx:49-56`

```ts
} catch (err) {
    console.error("Failed to format code:", err);
    return code;                 // ← 回傳原字串，呼叫端無法分辨成功或失敗
}
```

```ts
formatCode(code).then((formatted) => {
    setCode(formatted);
    setFormatted(true);          // ← 無條件顯示 ✓
    ...
    window.posthog?.capture("code_formatted");   // ← 連 analytics 都記成成功
});
```

**失效情境**：clang-format 的 wasm 載入失敗（CSP、離線、`optimizeDeps` 設定失誤）或程式碼觸發 parser 錯誤 → 使用者按格式化 → 程式碼一個字沒動 → **按鈕仍然跳出綠色打勾**。使用者會以為「我的程式碼本來就是這個格式」。連 PostHog 上的 `code_formatted` 都是假的。

**修法**：讓 `formatCode` 失敗時 throw（或回 `{ ok, code }`），呼叫端據此顯示 `addAlert({ variant: "destructive" })`，並且不要 `setFormatted(true)`。`Alt+Shift+F` 快捷鍵（`Editor.tsx:131-134`）是同一條路徑，也要一起修。

---

### S17. 複製到剪貼簿沒有 await / catch，一律顯示「已複製」

**檔案**：`frontend/src/components/panel/OutputPanel.tsx:42-52`

```ts
navigator.clipboard.writeText(...);   // ← 沒 await、沒 catch
setCopied(true);
```

`writeText` 在非 HTTPS 環境、失焦的 document、或使用者拒絕權限時會 reject。此時：剪貼簿沒東西、console 一條 unhandled rejection、**UI 打勾**。

對照組：`shareBtn.tsx:51-65` 對 clipboard 處理得很完整（先檢查 `ClipboardItem` 支援度、`.catch(() => false)`、依 `copied` 決定顯示哪一種訊息）。同一個 codebase 裡兩種標準。

**修法**：照 `shareBtn.tsx` 的模式改寫，`.then(() => setCopied(true)).catch(() => addAlert(...))`。

---

### S18. `FileReader` 沒有 `onerror`

**檔案**：`frontend/src/components/header/uploadBtn.tsx:30-41`

```ts
const reader = new FileReader();
reader.onload = (e) => { ... };
reader.readAsText(file);       // ← 沒有 reader.onerror
```

檔案在讀取途中被刪除／權限問題／是個資料夾 → `onerror` 觸發、`onload` 不觸發 → **編輯器內容不變、沒有任何提示**。使用者以為上傳成功。

另外 `if (typeof content === "string")` 這個守衛不成立時（理論上 `readAsText` 一定給 string，但仍是防禦性寫法）也是靜靜跳過。

還有 `[既有 M9]`：沒有大小限制，選到一個 500MB 的檔案會讓分頁直接凍結。

**修法**：補 `reader.onerror` → `addAlert`；加 `file.size` 上限（backend `BuildRequest.code` 是 `max_length=50_000`，前端可以對齊這個數字並在超過時明確告知）。

---

### S19. 忘記跑 `copy-i18n` → 語言清單空白，沒有任何錯誤

**檔案**：`frontend/src/lib/langList.ts:12-20`

```ts
const i18nDir = path.resolve("./public/i18n");
if (!fs.existsSync(i18nDir)) return [];      // ← 靜默回傳空陣列
```

`frontend/public/i18n` 在 `.gitignore:7` 裡，是由 root 的 `npm run copy-i18n` 產生的。任何繞過 root script 的路徑（直接 `cd frontend && npm run build`、Dockerfile 的 build context 有落差、CI 少一步）都會讓這個目錄不存在。

**失效情境**：build 成功、頁面正常、**設定面板的語言下拉選單是空的**（`getLanguages()` 回 `{}`）。沒有錯誤、沒有警告，只有一個空清單。

同一個檔案裡 `getStaticLangPaths()` 是硬編碼的 `["en", "zh-tw"]`（第 35-40 行），與動態掃描的 `getLanguageCodes()` 各走各的——新增語言時只改其中一邊也不會有人報錯。

順帶一提，`lib/i18n.ts:38-41` 的 `i18next-http-backend` 若載不到 `../i18n/{{lng}}/{{ns}}.json`，i18next 的預設行為是**安靜地退回 fallback 語言**，翻譯缺漏同樣不會有錯誤。

**修法**：`getLanguageCodes()` 在目錄不存在時 `throw`（build 時期失敗比執行時期空白好）；並把 `getStaticLangPaths` 改成由 `getLanguageCodes()` 推導。

---

### S20. OTLP log 沒有 shutdown/flush

**檔案**：`backend/utils/log.py:56-66`

```python
logger_provider.add_log_record_processor(BatchLogRecordProcessor(otlp_exporter))
logger.addHandler(LoggingHandler(logger_provider=logger_provider))
```

`BatchLogRecordProcessor` 會把 log 攢在記憶體裡批次送出，但**沒有任何地方呼叫 `logger_provider.shutdown()`**（`services/resource_manager.py` 的 `lifespan` 只關 docker 與 container pool）。

**失效情境**：程序收到 SIGTERM → 緩衝區裡的 log **直接消失**。而「程序即將結束前」正好是最需要那些 log 的時刻（crash 前的堆疊、關機時的清理錯誤）。此外，exporter 送不出去時 OTel SDK 只會在自己的 logger 印一行，等於整條 log pipeline 可以無聲斷掉而沒人發現。

**修法**：在 `lifespan` 的 `finally` 加 `logger_provider.shutdown()`（或 `force_flush(timeout_millis=...)`）。

---

### S21. Pool 補充失敗只 log，容量安靜縮水

**檔案**：`backend/services/build.py:104-105`

```python
except Exception as e:
    logger.error(f"Failed to replenish container pool: {e}")
```

`_replenish()` 失敗（docker daemon 壓力大、image 被刪、記憶體不足）→ pool 少一個 worker，`acquire()` 會 fallback 到即時建立容器，所以**功能面看起來正常，只是每次 build 都慢了幾秒**。持續失敗時 pool 會空掉，服務降級成「每次請求現開容器」，除非有人盯著 log，否則只會被當成「最近變慢了」。

`startup()` 裡的 `_ensure_image()` 失敗（第 180-182 行）也是同一個模式——註解寫得很清楚是刻意的（「builds will fail loudly with a BuildError instead」），這個取捨合理，但同樣**沒有指標**。

**修法**：加 `container_pool_size` Gauge 與 `container_replenish_failures_total` Counter。專案已經在用 prometheus-fastapi-instrumentator，成本很低。

---

### S22. 擴充功能的 `doSend` 是完全空的 catch

**檔案**：`extensions/src/hosts/Host.ts:18-20`

```ts
} catch (err) {
    //
}
```

（此為 competitive-companion 上游的既有寫法。）送給本機 host（CP Editor、cpbooster 等）的請求失敗時**連 console 都不寫**。使用者的 CP Editor 沒收到題目，完全無從得知是哪一環出錯。

`fetch` 也沒有檢查 `response.ok`——HTTP 500 對 `fetch` 而言是「成功」，同樣被當成送達。

**修法**：至少 `console.warn(url, err)`；並檢查 `response.ok`。

---

### S23. 前端 Docker image 的 Caddy root 指錯目錄

**檔案**：`docker/frontend/Dockerfile:9,14`

```dockerfile
RUN bun install --production
CMD ["/bin/sh", "-c", "bun run build && caddy file-server --root dist --listen :4321"]
```

兩個問題：

1. `astro.config.mjs` 用的是 `@astrojs/cloudflare` adapter，`astro build` 的產物是 `dist/client/`（靜態資產）+ `dist/_worker.js/`（Worker 程式碼）。`--root dist` 底下**沒有 `index.html`** → Caddy 對每個請求回 404。root `package.json` 有一個 `build:static` script 專門處理這件事（把 `dist/client` 搬成 `dist`），但 Dockerfile 呼叫的是 `build`。
2. 就算路徑修好，純靜態的 Caddy **沒有 `/api/*`** —— `pages/api/share.ts`、`pages/api/verify.ts`、`middleware.ts` 全部不存在。Turnstile 驗證與分享在這個部署方式下**必然失敗**。

3. `bun install --production` 會略過 devDependencies，而 build 需要 `@astrojs/check` / `typescript`。

這不算「靜默」失敗（會 404 得很大聲），但它會讓「照 docker-compose 起服務」的使用者以為是自己的環境問題。列在這裡是因為它跟 S7 疊加：backend 的 `SHARE` 悄悄關掉、前端的 `/api/share` 根本不存在、而分享按鈕仍然亮著。

**另外**：`docker/docker-compose.yml:87` 設定 `PUBLIC_API_URL=http://127.0.0.1:8000`，而 `lib/axiosInstance.ts:11-13` 讓 `apiAxios` 的 `baseURL` 用它。於是 `callAPI("/api/share")` 會打到 **FastAPI 的 `/api/share`**（不存在，404），而不是 Astro Worker 的同名路由。`turnstile.tsx` 呼叫的 `/api/verify` 同理。這條路由歧義只有在 `PUBLIC_API_URL` 為空字串（預設值）時才會正確地走相對路徑。

**修法**：Dockerfile 改用 `bun run build:static` 並把 root 對齊產物；或者乾脆放棄 Caddy 靜態部署、統一走 `wrangler deploy`。同時建議把「打 backend 的 axios instance」與「打自家 Astro API 的 axios instance」拆成兩個，不要共用 `baseURL`。

---

### S24. PostHog token 沒進 env schema，沒設就靜靜不送

**檔案**：`frontend/src/components/posthog.astro:8,57`

```ts
token: import.meta.env.PUBLIC_POSTHOG_PROJECT_TOKEN,
```

`PUBLIC_POSTHOG_PROJECT_TOKEN` 與 `PUBLIC_POSTHOG_HOST` **沒有出現在 `astro.config.mjs` 的 `env.schema`**，也不在 `frontend/.env.example` 裡。專案其他所有環境變數都走 `astro:env` 的型別化 schema，只有這兩個是裸的 `import.meta.env`。

**失效情境**：沒設 → `posthog.init(undefined, ...)` → SDK 安靜地什麼都不送。所有 `window.posthog?.capture(...)` 呼叫（共 16 處）全部進黑洞。同時 `lib/axiosInstance.ts:17` 的 `posthog.get_session_id()` 會回 `undefined`，`X-PostHog-Session-ID` header 就不會帶上——後端 log 與前端事件之間的關聯就斷了，而且沒有人會注意到。

另外這個檔案**init 了兩次**（inline stub 一次、module 一次），兩者的設定不同（module 版多了 `defaults: "2026-01-30"` 與 `ui_host`）。stub 階段排隊的事件與 module 版的行為是否一致值得確認。

**修法**：把這兩個變數納入 `env.schema`（`context: "client", access: "public"`），並補進 `.env.example`。

---

### S25. `requirements.txt` 完全沒有版本鎖定

**檔案**：`backend/requirements.txt`

19 個套件，**零個版本約束**。`docker/backend/Dockerfile:6` 是 `uv pip install --system --no-cache -r requirements.txt`，也就是每次 build image 都抓當下最新版。

CI 的註解（`.github/workflows/ci.yml:29-30`）已經意識到這個問題並把 ruff 鎖住了：「an unpinned Ruff means a new release can enable new default rules and fail CI on code that did not change」——但**同一個檔案裡的 19 個 runtime 依賴一個都沒鎖**。

具體風險：
- `apscheduler` 4.x 的 API 與 3.x 不相容（`AsyncIOScheduler` 的行為與 `add_job` 簽章都變了）
- `pydantic-settings` 的 `PydanticBaseSettingsSource` 介面（`settings.py:45-92` 直接繼承實作）是相對低階的擴充點，小版本就可能變動
- `boto3` / `posthog` / opentelemetry 三件套的節奏各自獨立

這些不會靜默——會在半夜的 image rebuild 之後轟然倒下——但**「上次能跑、這次不能跑，而 git 沒有任何變更」**這種除錯體驗值得先付一點成本避免。

**修法**：`uv pip compile` 產出 lock 檔並提交；CI 的 import smoke test 才有意義。

---

## 🔵 P3 — 邊緣情境 / 程式碼健康度

### S26. `handleRun` 的 `onStdout` 會把整個輸出陣列換掉

**檔案**：`frontend/src/service/run.ts:329-334`

```ts
store.set(outputStore, (prev) => [
    { content: (prev[prev.length - 1]?.content || "") + output + "\n" },
]);
```

回傳的是**只有一個元素的新陣列**。若 `showError()` 先前已經 append 了一筆 `type: "err"` 的輸出，下一行 stdout 到達時它會被合併進一個沒有 `type` 的物件裡——錯誤的紅色樣式消失，而且只保留了「最後一筆」的內容。單一執行模式下錯誤與輸出交錯時，前面的訊息會逐步被吃掉。

### S27. `insertInOrder` 對未知 testCaseId 回 -1

**檔案**：`frontend/src/service/run.ts:373-385`

`orderedIds.indexOf(item.testCaseId!)` 找不到時回 `-1`，接著的 `idx <= insertIdx` 比較會把它排到最前面。使用者在執行過程中刪除測資，輸出順序就會默默錯亂。不會壞、只是不對。

### S28. `worker.js` 對非 Error 例外取 `.message` 會拿到 `undefined`

**檔案**：`backend/assets/worker.js:46-48`

```js
} catch (err) {
    self.postMessage({ type: "error", taskId, content: err.message });
}
```

Emscripten 在 `abort()` / `ExitStatus` 的情境下丟出的**不一定是 `Error`**（可能是數字或自訂物件），此時 `err.message` 是 `undefined`。傳到主執行緒後 `showError(undefined)` 會在 `err.matchAll(regex)`（`run.ts:243`）丟 `TypeError`——而這個 throw 發生在 `worker.onmessage` 裡，**不會被任何 try/catch 接到**，於是 `onExit` 也不會被呼叫 → `runStatusStore` 卡在 `"running"`。

**修法**：`content: err?.message ?? String(err)`；`showError` 開頭加 `err = String(err ?? "")`。

### S29. `loadedCount >= 3` 的魔術數字

**檔案**：`frontend/src/store/atom.ts:41`

```ts
export const loadedStore = atom((get) => get(loadedCountStore) >= 3);
```

這個 3 對應到 `SplitViewEditor` + `HeaderActions` + `HeaderActionsMobile` 三個元件各 `+1`。目前是對的（桌機/手機兩個 header 都靠 CSS 隱藏而非卸載），但**沒有任何東西保護這個不變量**。哪天有人把手機版 header 改成條件渲染、或拆掉其中一個元件，整個編輯器會**永遠停在骨架畫面**，沒有錯誤訊息。

**修法**：改成具名的 `Set<string>`（例如 `loadedComponents` 記錄哪些元件已就緒），或至少加一個 timeout fallback：3 秒後無條件視為 loaded。

### S30. `waitForTabLoad` 沒有 catch 也沒有 timeout

**檔案**：`extensions/src/background.ts:86-102`

```ts
return new Promise(resolve => {
    browser.tabs.get(tabId).then(tab => { ... });      // ← 沒有 .catch，沒有 reject
});
```

`tabs.get` reject（分頁在期間被關閉）→ Promise **永遠 pending** → `sendTask` 的 `await` 卡住 → 既不送 `SendTaskDone` 也不送 `SendTaskFailed` → content script 端的進度條永遠停在中途。同樣地，`onUpdated` 的 listener 在分頁被關閉時不會被移除。

---

## 「假成功」清單（UI 說成功，實際沒有）

這一類最值得優先處理，因為使用者**不會回報 bug**——他們以為功能正常：

| 位置 | UI 表現 | 實際情況 |
|---|---|---|
| `pages/api/share.ts:43` (S1) | 「分享成功，連結已複製」 | R2 寫入可能被取消 |
| `pages/api/share.ts:12,33` (S2/S3) | 「分享成功」 | 連結指向別人的程式碼 |
| `background.ts:188-190` (S11) | 進度條 100%、Nanobar 完成 | 題目從未送達編輯器 |
| `formatBtn.tsx:52-55` (S16) | 綠色打勾 + `code_formatted` 事件 | 程式碼一個字沒動 |
| `OutputPanel.tsx:51` (S17) | 「已複製」打勾 | 剪貼簿是空的 |
| `uploadBtn.tsx:41` (S18) | 無反應（沒有失敗提示） | 檔案沒讀進來 |
| `router/api.py` + `cache.py:170` (S14) | `/status` 回 200 | DB 讀取失敗，數字是假的 |

---

## 建議修復順序

**第一梯次（資料正確性，這週）**
1. S3 — `JSON.stringify(shareObject)`，一行
2. S2 — head/put key 對齊 + shareId 加長
3. S1 — `await` R2 put + 錯誤時回 502
4. S4 — 補 `customMetadata.fullHash` + 迴圈上界

（S1-S4 全都在 `pages/api/share.ts` 這 52 行裡，建議一起重寫。）

**第二梯次（使用者實際踩得到）**
5. S8 — 400 改 401（後端一行、前端一行）
6. S9 — `url2WasmModule` 包 try/catch + 狀態收斂
7. S13 — 把 stderr 接到輸出面板
8. S12 + S11 — 擴充功能握手訊號的生命週期
9. S16 / S17 / S18 — 三個假成功的 UI 回饋

**第三梯次（設定與部署的無聲陷阱）**
10. S5 — env 布林解析
11. S7 — `SHARE` 設定不完整時啟動失敗
12. S6 — 關鍵設定不允許 fallback
13. S23 — Dockerfile 產物路徑 + API 路由歸屬
14. S19 / S24 — build 期缺檔／缺 env 要吵

**第四梯次（觀測性）**
15. S14 / S15 / S20 / S21 — 讓「壞掉」這件事看得見
16. S25 — 鎖版本

**第五梯次**：S10、S22、S26-S30

---

## 檢查過、確認沒問題的地方

為了讓報告可信，列出幾處我特別去確認、但**寫得是對的**的地方：

- **`router/build.py:165-246` 的 in-flight 去重**：`setdefault()` 的原子性用得正確，`finally` 只讓 owner 釋放且會比對 `is event` 再刪，`_DEDUP_MAX_WAITS` 有界，不會無限等待。註解也把 why 寫清楚了。
- **`services/build.py:254-280` 的 shell 組裝**：`shlex.quote()` 對 `code` 與 `name` 都有用，注入路徑是乾淨的。
- **`services/build.py:331-339` 的 tar 解壓**：`Path(member.name).name` 把路徑攤平，路徑穿越有防住。
- **`main.py:70-86` 的全域例外處理**：trace_id + 不外洩 `str(exc)`，做得好。
- **`lookup_cache()`（`router/build.py:133-154`）**：快取檔案不見時會反向失效 DB 記錄，是自我修復的。
- **`service/share.ts:18-55` 的 `renewJwt()`**：timeout、unsubscribe、settled 旗標、單次重試四件事都對——這是本 repo 處理非同步狀態的最佳範例，`run.ts` 應該直接沿用。
- **`components/panel/TestCasePanel.tsx:88-133`**：`ext` 事件的 payload 有 zod 驗證，不信任外部輸入這點做對了。
- **`middleware.ts:29-35`**：測試用 JWT 的比對有先比長度再 `timingSafeEqual`，避免了 `timingSafeEqual` 對不等長輸入 throw 的陷阱。
