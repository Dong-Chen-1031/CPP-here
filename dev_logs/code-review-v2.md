# Code Review — `v2` 分支

- **範圍**：`git diff main...v2`（44 files, +15211 / -13689）
- **日期**：2026-07-28
- **結論**：**Request Changes**

---

## 總覽

v2 做了三件事：

1. 前端遷移到 Cloudflare Workers（`@astrojs/cloudflare` + `wrangler.jsonc`）
2. 把 `src/config/constants.ts` 換成 Astro 型別化的 `astro:env` schema
3. 新增一層「Astro 端」的 JWT / Turnstile 驗證（`middleware.ts` + `lib/server/jwt.ts` + `pages/api/verify.ts`）

方向正確，但第 3 項有兩個**會靜默失效**的預設值，而且這層目前**還沒接上**——前端所有請求仍直接打 `PUBLIC_API_URL`（FastAPI），完全沒有經過它。

---

## 🔴 Critical

### 1. Turnstile secret 的預設值是 Cloudflare 的「永遠通過」測試金鑰

**檔案**：`frontend/astro.config.mjs:127-132`

```js
PRIVATE_TURNSTILE_SECRET_KEY: envField.string({
    context: "server",
    access: "secret",
    optional: true,
    default: "1x0000000000000000000000000000000AA",  // ← Cloudflare "Always passes" 測試金鑰
}),
```

`1x0000000000000000000000000000000AA` 是 Cloudflare 官方文件裡的 **"Always passes" secret key**。

**失效情境**：正式環境忘記設定這個環境變數 → `pages/api/verify.ts` 送給 siteverify 的請求**永遠回傳 `success: true`** → CAPTCHA 完全失效，任何人都能無限量取得 JWT。整個過程**不會有任何錯誤、警告或 log**。

**修法**：移除 `default`，改成 `optional: false` 且不給預設值，讓缺少時直接 build/boot 失敗。

---

### 2. `PRIVATE_JWT_SECRET` 的 `optional: false` 是無效的

**檔案**：`frontend/astro.config.mjs:107-116`

```js
PRIVATE_JWT_SECRET: envField.string({
    context: "server",
    access: "secret",
    optional: false,                       // ← 這行完全沒有作用
    default: Buffer.from(
        crypto.getRandomValues(new Uint8Array(32)),
    ).toString("hex"),
}),
```

**根因**（已於 `node_modules/astro/dist/env/validators.js:128` 確認）：

```js
function validateEnvVariable(value, options) {
  const isOptional = options.optional || options.default !== void 0;   // ← 有 default 就算 optional
  if (isOptional && value === void 0) {
    return { ok: true, value: options.default };                       // ← 直接回傳 default，跳過所有驗證
  }
  ...
}
```

只要給了 `default`，`optional: false` 就被忽略。所以忘記設定 secret 時**不會 fail fast**，而是安靜地啟動。

**三個連帶後果**：

| 後果 | 說明 |
|---|---|
| 金鑰外洩 | 該亂數在 **build time** 產生一次，被序列化進 Worker bundle。拿得到部署產物的人就能偽造 `{ verified: true }` 的 JWT |
| 每次部署失效 | 每次 build 都產生新的一組 → 重新部署會讓所有在線 JWT 立刻失效，使用者掉進 `401 → captcha` 迴圈 |
| 環境不一致 | preview 與 production 各自一組，token 無法跨環境使用 |

**修法**：移除 `default`。缺少時應該讓部署直接失敗。

---

## 🟠 High

### 3. `remoteip` 由 client 完全控制

**檔案**：`frontend/src/pages/api/verify.ts:34-39`

```ts
export async function POST({ request }: APIContext) {
    const { token, remoteip } = (await request.json()) as {
        token: string;
        remoteip: string;      // ← 來自 request body，呼叫端想填什麼都行
    };
    const turnstileResult = await validateTurnstile(token, remoteip);
```

Turnstile 的 `remoteip` 參數是用來**把 token 綁定到解題者的 IP**。讓 client 自己填等於廢掉這個保護，攻擊者可以在 A 機器解題、從 B 機器兌換 token。

**修法**：

```ts
export async function POST({ request, clientAddress }: APIContext) {
    const { token } = (await request.json()) as { token: string };
    const remoteip =
        request.headers.get("CF-Connecting-IP") ?? clientAddress;
```

**順帶**：`request.json()` 沒有 try/catch，`token` 也沒有型別檢查，malformed body 會直接 500。

---

### 4. Debug endpoint 把所有 request header 原樣回傳

**檔案**：`frontend/src/pages/api/[...path].ts:5-15`

```ts
export function GET({ params, request }: APIContext) {
    return new Response(
        JSON.stringify({
            params,
            request: {
                method: request.method,
                headers: Object.fromEntries(request.headers.entries()),  // ← 包含 Authorization
                url: request.url,
            },
        }),
    );
}
```

這是一支 catch-all debug stub，會 echo 回**所有** header，包含 `Authorization: Bearer <JWT>` 以及 CDN 注入的內部 header（`cf-connecting-ip`、`cf-ray` 等）。

雖然 `middleware.ts` 擋在前面需要有效 JWT，降低了直接風險，但這支不該進 production。

**修法**：直接刪除，或補上真正的 backend proxy 實作（見 #6）。

---

## 🟡 Medium

### 5. 繞過驗證的開關被宣告成 public 變數

**檔案**：`frontend/astro.config.mjs:121-126`、`frontend/src/middleware.ts:14-19`

```js
PUBLIC_BYPASS_CAPTCHA: envField.boolean({
    context: "client",     // ← 繞過 server 端驗證的開關，卻放在 client/public 命名空間
    access: "public",
    optional: false,       // ← 同 #2，有 default 所以無效
    default: false,
}),
```

```ts
if (PUBLIC_BYPASS_CAPTCHA) {
    console.warn("Bypassing CAPTCHA verification ...");
    return next();          // ← 整個 API 驗證被跳過
}
```

它是 build time inline 的常數，所以**無法被 runtime 竄改**，直接風險有限。但把 auth bypass 放進 public 命名空間很容易誤設——例如在 Cloudflare dashboard 為 preview 環境設一次，整個 API 就沒有防護了。

**修法**：改成 `context: "server", access: "secret"`，並移除 `default` 讓它跟其他 secret 一致。

---

### 6. 新的 Astro 驗證層目前是 unreachable 的

**檔案**：`src/middleware.ts`、`src/lib/server/jwt.ts`、`src/pages/api/verify.ts`

`apiAxios` 的 baseURL 是 `PUBLIC_API_URL`（`src/lib/axiosInstance.ts:10`），而全專案的 API 呼叫是：

| 呼叫端 | 路徑 | 實際目標 |
|---|---|---|
| `turnstile.tsx:38` | `POST /verify` | FastAPI |
| `service/run.ts:34` | `POST /build` | FastAPI |
| `service/share.ts:85` | `POST /share` | FastAPI |

**沒有任何一處呼叫同源的 `/api/verify`**（已 grep 確認）。

反過來說，如果把 `PUBLIC_API_URL` 指向自己的 `/api`，`POST /build` 會落到只實作 `GET` 的 `[...path].ts` 而 404。

現況等於同時存在**兩個 JWT issuer**、兩把不同的 secret：

- `frontend/src/lib/server/jwt.ts` — jose + `PRIVATE_JWT_SECRET`
- `backend/router/verify.py` — PyJWT + `settings.JWT_SECRET`

**建議**：明確二選一——要嘛把遷移走完（補完 `[...path].ts` 的 proxy 實作），要嘛先把這三個檔案標成 WIP 或移出這個分支。

---

### 7. `run.ts` 沒有跟上 `share.ts` 修好的 401 重試邏輯

**檔案**：`frontend/src/service/run.ts:47-66` vs `frontend/src/service/share.ts:32-65`

v2 在新的 `service/share.ts` 把 401 重試邏輯**修好了**：

```ts
// service/share.ts — 正確版本
function renewJwt() {
    if (jwtRenewPromise) return jwtRenewPromise;          // ✅ 並行合流
    jwtRenewPromise = new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => finish(null), JWT_RENEW_TIMEOUT_MS);  // ✅ 有 timeout
        const unsub = defaultStore.sub(verifyJwtStore, () => { ... });       // ✅ 有 unsub
        ...
    });
}
// ✅ 明確限制單次重試
return await shareCode(false);
```

但 `service/run.ts` 裡**一模一樣的舊版邏輯沒有跟著修**：

```ts
// service/run.ts — 仍是舊版
await new Promise((resolve, reject) =>
    defaultStore.sub(verifyJwtStore, () => {   // ❌ 從不 unsubscribe
        resolve(null);
    }),
);                                             // ❌ 沒有 timeout

return await buildCode(code, cppVersion);      // ❌ 無上限遞迴
```

**三個實際故障**：

1. **訂閱洩漏** — 每次 401 洩漏一個永久訂閱
2. **永久卡死** — 使用者不解 captcha 就永遠卡在 `runStatusStore = "building"`，UI 的執行按鈕再也回不來
3. **無限迴圈** — 新 token 又被拒（例如 #1 的情境下 backend 拒絕）就無限遞迴重試

**修法**：把 `renewJwt` 抽到共用模組（例如 `lib/renewJwt.ts`），`run.ts` 與 `share.ts` 共用。

---

### 8. Landing page 兩個 analytics 事件已失效

**檔案**：`src/components/landing/CTA.astro`、`src/components/landing/hero.astro`

改寫 `href` 時把 `id` 一起刪掉了，但底部的 inline script 還在找那個 id：

```diff
- <a href={config.editorLink} id="cta-start-coding-btn">
+ <a href="/editor">
```

```js
// CTA.astro:69 — 仍然存在
document.getElementById("cta-start-coding-btn")?.addEventListener(...)
// hero.astro:71 — 仍然存在
document.getElementById("hero-start-coding-btn")?.addEventListener(...)
```

grep 結果確認：這兩個 id 現在**只出現在 script 裡，沒有任何元素使用**。

**影響**：`cta_start_coding_clicked` 和 `hero_start_coding_clicked` 兩個 PostHog 事件**完全不會觸發**，而且因為有 `?.` 所以不會報錯——是靜默的資料遺失。

**修法**：把 `id` 加回去。

---

## 🔵 Low / Nits

### 9. `shareId` 未編碼就插進 URL

**檔案**：`frontend/src/service/share.ts:131`

```ts
const respond = await axios.get(`${PUBLIC_S3_BUCKET_URL}/share/${shareId}`);
```

`shareId` 來自 `?shareID=` query param（`components/share.tsx:52-54`），未經編碼。`../` 會被 URL 正規化，可讀到該 host 上 `/share/` 以外的物件。影響範圍限於同一個 bucket host，且無法改變 host。

**修法**：`encodeURIComponent(shareId)`，或加上 uuid 格式驗證。

---

### 10. `heroCard.astro` 留下孤立的空 template literal

**檔案**：`frontend/src/components/landing/heroCard.astro:5`

```diff
- import config from "@/config/constants";
-
- const isProd = config.run_mode === "production";
+ ``;
+ const isProd = import.meta.env.PROD;
```

移除 import 時誤留的 `` `` ``;無作用，但應該清掉。

---

### 11. `src/config/constants.ts` 已成為死檔案

v2 之後**全專案已無任何檔案 import 它**（已 grep 確認），但檔案仍在，且裡面留著一份會與 `astro.config.mjs` 分歧的預設值。

**修法**：刪除。

---

### 12. `.env.example` 沒有更新

新增的這些變數一個都沒補進去：

- `PRIVATE_JWT_SECRET`
- `PRIVATE_JWT_EXPIRATION_SECONDS`
- `PRIVATE_TURNSTILE_SECRET_KEY`
- `PRIVATE_TEST_JWT`
- `PRIVATE_S3_ENDPOINT_URL` / `PRIVATE_S3_KEY_ID` / `PRIVATE_S3_ACCESS_KEY` / `PRIVATE_S3_BUCKET_NAME`
- `PUBLIC_BYPASS_CAPTCHA`

考慮到 #1 和 #2 的預設值有多危險，這份文件缺口是**實質風險**而不只是整潔問題。

---

## ✅ 做得好的地方

- **`middleware.ts:27-33`** — test-JWT 比對用 `crypto.timingSafeEqual`，而且**先比長度**，同時避開了 timing attack 和 `timingSafeEqual` 長度不等會 throw 的坑。
- **`service/share.ts:32-65`** — `renewJwt` 寫得很好：並行呼叫合流成單一 renewal、有 timeout、有 unsub、明確限制單次重試，註解也把 why 說清楚了。這正是 #7 該套用到 `run.ts` 的版本。
- **`astro:env` schema** — 取代 `import.meta.env` 字串比對是明確的進步：型別安全，`PUBLIC_SHARE` 之類的 boolean 不再需要 `== "true"` 這種寫法。
- **`lib/server/jwt.ts:20-22`** — 明確傳了 `algorithms: [algorithm]`，避免 algorithm confusion 攻擊。

---

## 修正順序建議

| 優先度 | 項目 |
|---|---|
| **上線前必修** | #1 Turnstile 測試金鑰預設值 · #2 JWT secret 預設值 |
| **上線前應修** | #3 `remoteip` · #4 debug endpoint · #8 analytics regression |
| **架構決策** | #6 決定 Astro 驗證層是接上還是移除 |
| **接著處理** | #5 · #7 · #9 |
| **順手清掉** | #10 · #11 · #12 |

---

## 附註：本次範圍外的 backend 問題

以下兩個問題**不屬於 v2 分支的變更**（main 也有），過程中順帶讀到，記錄備查：

1. **`backend/utils/posthog.py`** — `posthog` 只在 `if settings.POSTHOG_API_KEY:` 內部定義。未設定該 key 時，`backend/main.py:19` 的 `from utils.posthog import posthog` 會 **ImportError，backend 直接無法啟動**。

2. **`backend/services/build.py:866`** — `except DockerError` 區塊裡的 `build_logs=output`，`output` 在 `container.exec()` 早期就拋出 DockerError（例如 image 404）時尚未賦值，會變成 `UnboundLocalError`。
