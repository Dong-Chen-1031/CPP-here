# Code Review — 全專案

- **範圍**：`backend/` + `frontend/` + `docker/` + `.github/`（依要求略過 `extensions/`）
- **基準**：`v2` 分支（含 main 的既有程式碼）
- **日期**：2026-07-28
- **結論**：**Request Changes**

> v2 分支「差異」本身的審查另見 [`code-review-v2.md`](./code-review-v2.md)。本份針對整個專案，兩份少量重疊處會標注。

---

## 目錄

- [總體評價](#總體評價)
- [🔴 Critical（5）](#-critical)
- [🟠 High（5）](#-high)
- [🟡 Medium（19）](#-medium)
- [🔵 Low（8）](#-low)
- [做得好的地方](#做得好的地方)
- [修正順序建議](#修正順序建議)

---

## 總體評價

這是一個結構清楚的專案：FastAPI 後端把使用者的 C++ 丟進**鎖得很緊的一次性 Docker container** 用 emcc 編成 wasm，前端在 Web Worker 裡跑。**沙箱設計本身是這個專案最強的部分**（見[做得好的地方](#做得好的地方)）。

主要問題集中在三個地方：

1. **「安全機制靜默失效」的預設值** — 出貨的設定檔直接帶 Cloudflare 的「永遠通過」測試金鑰
2. **缺少資源治理** — 沒有任何 rate limiting，cache 清理排程實際上從未執行
3. **錯誤處理路徑本身有 bug** — 幾條 except 分支跑起來會直接爆掉

---

## 🔴 Critical

### [x] C1. 沒設 PostHog API key，後端根本起不來 (已修復)

**檔案**：`backend/utils/posthog.py` + `backend/main.py:19`

```python
# utils/posthog.py — posthog 只在 if 內部定義
from settings import settings
from posthog import Posthog

if settings.POSTHOG_API_KEY:        # ← 預設是 None
    posthog = Posthog(...)
```

```python
# main.py:19 — 無條件 import
from utils.posthog import posthog
```

`POSTHOG_API_KEY` 的預設值是 `None`（`settings.py:135`），所以模組層級的 `posthog` 名稱不存在。

**已實測重現**：

```
ImportError: cannot import name 'posthog' from 'mod'
--- exit=1 ---
```

**影響**：任何沒有設定 PostHog 的部署（包含 `docker/docker-compose.yml` 這份出貨設定，裡面完全沒提到 `POSTHOG_API_KEY`）**後端啟動即失敗**。這代表出貨的 docker-compose 開箱是壞的。

**修法**：

```python
# utils/posthog.py
from settings import settings
from posthog import Posthog

posthog = (
    Posthog(
        project_api_key=settings.POSTHOG_API_KEY,
        host=settings.POSTHOG_BASE_URL,
    )
    if settings.POSTHOG_API_KEY
    else None
)
```

再把 `main.py:70` 改成 `if posthog: posthog.capture_exception(exc)`。

---

### C2. 出貨的 docker-compose 直接帶 Turnstile「永遠通過」測試金鑰 (略過)

**檔案**：`docker/docker-compose.yml:26`、`docker/backend/docker-compose.yml:26`

```yaml
- TURNSTILE_SECRET=1x0000000000000000000000000000000AA
  # Cloudflare Turnstile secret key for CAPTCHA verification.
  # Get a real secret key from Cloudflare Turnstile dashboard for production use.
```

`1x0000000000000000000000000000000AA` 是 Cloudflare 官方的 **"Always passes" secret key**。註解雖然提醒「production 要換」，但**值是直接寫死的**，不是佔位符或空值——照著 README 部署的人會得到一個 CAPTCHA 完全失效的服務，而且沒有任何警告。

**同一個問題在 v2 的 `astro.config.mjs:127-132` 又出現一次**（詳見 v2 報告 #1）。

**影響**：搭配 [H1](#h1-完全沒有-rate-limiting) 的「零 rate limiting」，這等於把編譯資源完全開放給任何人。

**修法**：改成空值並在 `settings.py` 加驗證——production 模式下 `TURNSTILE_SECRET` 為空或等於測試金鑰時，直接拒絕啟動：

```python
@model_validator(mode="after")
def _reject_test_secrets(self) -> "Settings":
    if not self.DEV_MODE and self.TURNSTILE_SECRET.startswith("1x0000"):
        raise ValueError("Refusing to start in production with a Turnstile test secret")
    return self
```

---

### C3. Docker socket 掛進後端容器 = 後端被打穿就等於拿到宿主機 root (TODO:暫緩修復)

**檔案**：`docker/docker-compose.yml:53`、`docker/backend/docker-compose.yml:49`

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
  # Mount Docker socket for DinD (Docker-in-Docker) to allow backend to manage Docker containers for wasm builds.
```

註解寫的是 DinD，但實際上這是 **Docker-out-of-Docker**：容器內的 process 對宿主機的 Docker daemon 有完整控制權。任何能在後端 process 執行程式碼的漏洞（RCE、反序列化、依賴套件供應鏈）都可以直接：

```
docker run -v /:/host --privileged ... → 拿到宿主機 root
```

這是整個系統**風險最集中的一點**，而這個服務的本質就是「接受陌生人的程式碼」。

**修法**（依成本排序）：

1. **Docker socket proxy**（成本最低、效果好）— 用 `tecnativa/docker-socket-proxy`，只開放 `CONTAINERS=1`、`POST=1`、`EXEC=1`，關掉 `IMAGES` 以外全部。後端連 proxy 而不是 socket。
2. **Rootless Docker** 或 **Podman socket** — 即使被打穿也只是普通使用者權限。
3. 長期：改用專門的 sandbox runtime（gVisor / Firecracker）取代直接操作 daemon。

---

### C4. 錯誤處理路徑本身會拋 `UnboundLocalError` (TODO:優先修復)

**檔案**：`backend/services/build.py:199-205`

```python
async with container_pool.acquire() as container:
    try:
        execute = await container.exec([...])      # ← 這裡若拋 DockerError
        ...
        output = "".join(log_parts)                # ← line 170，output 在這裡才被賦值
        ...
    except DockerError as e:
        if e.status == 404:
            logger.error("Docker image not found. Auto-pulling image.")
            await resource_manager.docker.images.pull(...)
        raise BuildError("...", build_logs=output)  # ← line 205：output 可能未定義
```

**兩個 bug 疊在一起**：

1. **`output` 未定義** — `container.exec()` 或 `execute.start()` 早期失敗時，`output`（line 170）根本沒執行到，line 205 直接 `UnboundLocalError`。這個例外**不是 `BuildError`**，所以 `router/build.py:175` 的 `except BuildError` 接不到，會一路噴到 `main.py` 的全域處理器變成 500。

2. **404 自動拉 image 是死碼** — image 不存在時，失敗點其實在更早的 `_create_container()`（`build.py:48`），而它是在 `container_pool.acquire()` 裡被呼叫的，**在 try 區塊之外**：

   ```python
   @asynccontextmanager
   async def acquire(self):
       try:
           container = self.pool.get_nowait()
           ...
       except asyncio.QueueEmpty:
           container = await self._create_container()   # ← DockerError 從這裡逃出去，沒人接
   ```

   而且啟動時 `_replenish()` 的 `except Exception` 只是 log 一下（line 61-62），pool 會是空的 → **每一個請求**都走 `_create_container()` → 每一個都拋未處理的 `DockerError`。所以「image 不見了就自動拉」這條復原路徑在最常見的觸發情境下**永遠不會執行**。

**修法**：

```python
output = ""      # 在 try 之前先初始化

# 並把 image 檢查/拉取移到啟動階段（lifespan）：
async def startup(self):
    try:
        await resource_manager.docker.images.inspect(IMAGE)
    except DockerError:
        logger.info("Pulling builder image ...")
        await resource_manager.docker.images.pull(IMAGE)
    ...
```

---

### C5. 全域例外處理器把內部錯誤原文回給使用者 (TODO:優先修復，改為紀錄 log +  回傳 "Internal server error" 及 trace id)

**檔案**：`backend/main.py:67-71`

```python
@app.exception_handler(Exception)
async def http_exception_handler(request, exc):
    posthog.capture_exception(exc)
    return JSONResponse(status_code=500, content={"message": str(exc)})
```

`str(exc)` 會把絕對路徑、SQL 片段、boto3 的 endpoint / bucket 名稱、aiodocker 的內部訊息等直接送到瀏覽器。搭配 [C4](#c4-錯誤處理路徑本身會拋-unboundlocalerror) 這種會頻繁觸發 500 的 bug，等於持續對外洩漏內部細節。

**修法**：

```python
@app.exception_handler(Exception)
async def http_exception_handler(request, exc):
    logger.exception("Unhandled exception")
    if posthog:
        posthog.capture_exception(exc)
    detail = str(exc) if settings.DEV_MODE else "Internal server error"
    return JSONResponse(status_code=500, content={"message": detail})
```

---

## 🟠 High

### H1. 完全沒有 rate limiting (略過)

**範圍**：整個 `backend/`（已全域 grep 確認：無 `slowapi`、無 `limiter`、無任何速率限制）

目前的資源保護模型只有一層：Turnstile。而它的實際效果是——

```python
# router/verify.py:65-75
@router.post("/verify")
async def verify(request: VerifyRequest):
    await turnstile.async_validate(request.token)
    return VerifyRespond(token=create_jwt({"verified": True}, expires_in=3600), ...)
```

**一次 CAPTCHA → 一顆有效期 1 小時的 JWT → 這 1 小時內可以無限次呼叫 `/build`**。而每一次 `/build` 都會：

- 佔用 pool 裡一個 container（`DOCKER_POOL_SIZE` 預設 15）
- 跑最多 30 秒的 emcc（`timeout 30s`）
- 吃掉 1 CPU + 1GB RAM
- 在磁碟寫入一份 wasm 產物

JWT payload 只有 `{"verified": True}`，**沒有 `jti`、沒有使用者識別、沒有使用次數上限**，所以也無從追蹤或撤銷。

一個腳本解一次 CAPTCHA，就能用 15 條並行連線把服務打到不能用一小時。

**修法**（建議三層一起做）：

1. **`/build` 加 per-token 配額** — 在 JWT 裡塞 `jti`，用 Redis/SQLite 記錄該 `jti` 的使用次數（例如 1 小時 60 次）。
2. **`/verify` 加 per-IP rate limit** — 防止大量刷 token。
3. **縮短 `JWT_EXPIRY_SECONDS`** — 1 小時太長，建議 5-10 分鐘，前端本來就有自動 renew（`turnstile.tsx:71-75`）。

`slowapi` 可以最快補上第 2 層。

---

### H2. Cache 清理排程實際上從未執行 (略過)

**檔案**：`backend/utils/cache.py:138-139`

```python
scheduler.add_job(delete_expired_caches, "interval", days=1)
scheduler.add_job(cleanup_caches, "interval", days=1)
```

APScheduler 的 `interval` trigger **第一次觸發是在「啟動後 1 天」**，不是啟動當下。只要後端重啟頻率高於一天（開發、部署、`restart: unless-stopped` 遇到 crash），這兩個 job **一次都不會跑**。

**實測證據**（本機當前狀態）：

```
cache 目錄數: 1883
cache 大小:   441M
CACHE_LIMIT 預設: 100
```

**超出上限 18 倍**。生產環境同樣的 pattern 就是磁碟被慢慢塞爆，而 `CACHE_LIMIT` 這個設定形同虛設。

另外，即使 job 有跑，`get_cache()` 每次命中都會延長 `delete_at`（`cache.py:73-75`），所以熱門項目永遠不會過期——真正的上限只剩 `cleanup_caches` 的每日一次修剪。

**修法**：

```python
scheduler.add_job(delete_expired_caches, "interval", hours=1, next_run_time=datetime.now())
scheduler.add_job(cleanup_caches, "interval", hours=1, next_run_time=datetime.now())
```

並考慮在 `add_cache()` 之後就地檢查是否超過上限，而不是完全依賴排程。

---

### H3. `share` 端點在 async 函式裡做阻塞 I/O (略過)

**檔案**：`backend/router/share.py:45-49`

```python
@router.post("/share")
async def share(request: ShareRequest, token: dict = Depends(need_token)) -> ShareResponse:
    ...
    s3.put_object(              # ← 同步 boto3 呼叫，卡在 async def 裡
        Bucket="share",
        Key=f"{share_id}",
        Body=request.code.encode(),
    )
```

`boto3` 是同步的。在 `async def` 裡直接呼叫會**卡住整個 event loop**，直到 S3 往返完成。跨網路的 S3 寫入動輒 100-500ms，這段時間內**所有其他請求**（包含 `/health`、`/build`、`/verify`）全部停擺。

專案在別的地方已經知道要怎麼處理（`utils/cache.py:94` 用了 `asyncio.to_thread`），這裡漏掉了。

**修法**：

```python
await asyncio.to_thread(
    s3.put_object,
    Bucket=settings.S3_BUCKET_NAME,   # 順便修掉 M4
    Key=share_id,
    Body=request.code.encode(),
)
```

或改用 `aioboto3`。

---

### H4. `/build` 的去重機制有 race condition (TODO:優先修復)

**檔案**：`backend/router/build.py:136-165`

```python
if case_id in _in_flight:
    await _in_flight[case_id].wait()      # ← 檢查點

cache_entry = await cache.get_cache(case_id)   # ← await：控制權在這裡交出去
...
event = asyncio.Event()
_in_flight[case_id] = event                    # ← 註冊點
```

**檢查點與註冊點之間隔了 await**，所以兩個同 hash 的並行請求會雙雙通過檢查、雙雙開始編譯：

| 時間 | 請求 A | 請求 B |
|---|---|---|
| t0 | `case_id not in _in_flight` ✓ | |
| t1 | `await get_cache()` → 讓出 | `case_id not in _in_flight` ✓ |
| t2 | | `await get_cache()` → 讓出 |
| t3 | `_in_flight[id] = eventA` | |
| t4 | | `_in_flight[id] = eventB` ← **覆蓋掉 A** |
| t5 | 兩者同時寫入**同一個 `output_path`** | |
| t6 | A 的 `finally` pop 掉的是 **B 的 event** | |

**後果**：

- 重複編譯，浪費一整個 container 和 30 秒 CPU
- 兩個 process 同時寫 `cache/<hash>/build.js`，並且各自 append 一次 worker code（line 198）
- `get_size()` 可能量到寫到一半的 wasm
- 第三個請求在 B 還在編譯時進來，會看不到 in-flight 記錄，再開一個

**修法**：檢查與註冊之間不能有 await——用 `setdefault` 讓它變成原子操作：

```python
event = asyncio.Event()
existing = _in_flight.setdefault(case_id, event)
if existing is not event:
    await existing.wait()
    # 醒來後重查 cache，命中就直接回
```

---

### H5. `Error.tsx` 每顯示一個編譯錯誤就洩漏一個訂閱 (TODO:優先修復)

**檔案**：`frontend/src/components/Error.tsx:41-48`

```typescript
toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    ...
    getDefaultStore().sub(editorFontSizeStore, () => {   // ← 從來沒有 unsubscribe
        const fontSize = getDefaultStore().get(editorFontSizeStore);
        wrap.style.fontSize = `${fontSize}px`;           // ← closure 抓住 wrap
        ...
    });
```

`toDOM()` 是 CodeMirror 在**每次渲染 widget 時**呼叫的。每個編譯錯誤 widget 都會註冊一個永久訂閱，而且 closure 持有 `wrap` 這個 DOM 節點的參照。

**後果**：每編譯失敗一次就洩漏 N 個訂閱（N = 錯誤行數）＋ N 個已經 detach 的 DOM 節點。長時間 debug 的 session（正是這個工具的主要使用情境）會持續累積，而且每次字級變更都要遍歷所有殭屍訂閱。

**修法**：把字級訂閱移到 `errorField` 層級做一次，或在 widget 的 `destroy()` 裡呼叫 unsub：

```typescript
class ErrorWidget extends WidgetType {
    private unsub?: () => void;

    toDOM(view) {
        ...
        this.unsub = getDefaultStore().sub(editorFontSizeStore, () => { ... });
        return wrap;
    }

    destroy() {
        this.unsub?.();
    }
}
```

---

## 🟡 Medium

### 後端

#### M1. Center Console 設定抓取沒有 timeout (TODO:優先修復)

**`backend/settings.py:57-60`**

```python
self.center_json = httpx.get(
    f"{CENTER_URL}/center-api/v1/config",
    headers={"Authorization": f"Bearer {CENTER_TOKEN}"},
).json()
```

`httpx.get` 預設 timeout 是 5 秒（不是無限），但這是**同步呼叫且發生在 import 階段**。Center Console 掛掉或變慢時，後端啟動會被拖住，而這條路徑上沒有 retry/backoff。更麻煩的是它在 `Settings()` 建構時執行，等於**每次 `reload_settings()` 都會再打一次**。

**修法**：明確指定短 timeout（`timeout=3.0`），並把失敗計入 metrics 而不只是 `print`。

---

#### M2. `reload_settings()` 會讓所有 JWT 失效 (略過)

**`backend/settings.py:139-142, 188-193`**

```python
@model_validator(mode="after")
def _derive_defaults(self) -> "Settings":
    if not self.JWT_SECRET:
        self.JWT_SECRET = secrets.token_urlsafe(32)   # ← 每次都重新產生
```

```python
def reload_settings():
    settings.__init__()      # ← 重跑 validator
```

沒有顯式設定 `JWT_SECRET` 時（`docker-compose.yml:31` 就是空值），每次 reload 都會產生一把新 secret，**所有還在有效期內的使用者 token 立刻失效**，全部被踢回 CAPTCHA。

另外 `settings.__init__()` 在物件存活期間重跑本身就不安全——並行的 request 可能讀到處於半初始化狀態的 settings。

**修法**：`JWT_SECRET` 未設定時應在啟動階段就固定下來（或直接拒絕在 production 啟動），而非交給每次 reload 重擲。reload 應該建構一個新的 `Settings` 物件再原子替換參照。

---

#### M3. `share.py` 寫死 bucket 名稱，忽略設定 (TODO:優先修復)

**`backend/router/share.py:46`**

```python
s3.put_object(
    Bucket="share",                    # ← 寫死
    ...
)
```

但 `settings.py:156-163` 明確把 `S3_BUCKET_NAME` 列為啟用 share 功能的必要條件：

```python
self.SHARE = self.SHARE and all([..., self.S3_BUCKET_NAME])
```

**結果**：使用者必須設定 `S3_BUCKET_NAME` 才能啟用功能，但這個值**完全沒被使用**，實際永遠寫進名為 `share` 的 bucket。設定成別的名字會靜默失敗（或寫錯地方）。

---

#### M4. `from venv import logger` (TODO:優先修復)

**`backend/router/share.py:2`**

```python
import uuid
from venv import logger      # ← 標準函式庫的 venv 模組
```

這顯然是 IDE 自動 import 選錯了。`venv.logger` 確實存在所以不會 crash，但 share 相關的 log 全部跑到 `venv` 這個 logger namespace 下，難以過濾。應該是 `from utils.log import logger`。

---

#### M5. `/metrics` 無認證公開 (略過)

**`backend/main.py:33`**

```python
Instrumentator().instrument(app).expose(app)
```

Prometheus 端點對外完全開放，洩漏總編譯次數、程式碼行數分布、wasm 大小分布、延遲分布、失敗率。對競爭對手/攻擊者是免費的營運情報，也讓人能即時觀察 DoS 攻擊的效果。

**修法**：`expose(app, include_in_schema=False, should_gzip=True)` 搭配 IP allowlist，或把 metrics 綁到只在內網監聽的另一個 port。

---

#### M6. Root logger 吸收所有第三方 log 並轉送到 PostHog (略過)

**`backend/utils/log.py:25-26, 46-65`**

```python
logger = logging.getLogger()          # ← root logger
logger.setLevel(settings.LOG_LEVEL)
...
logger.addHandler(LoggingHandler(logger_provider=logger_provider))   # ← 送到 PostHog OTLP
```

掛在 root logger 上代表 `uvicorn`、`httpx`、`boto3`、`botocore`、`aiodocker`、`apscheduler` 的所有輸出都會進檔案並**上傳到 PostHog**。`botocore` 在 DEBUG 等級會記錄請求簽章的細節，`httpx` 會記錄完整 URL（含 query string 裡的 token）。

**修法**：改用具名 logger（`logging.getLogger("cpp_here")`），並對吵雜的第三方明確降級：

```python
for noisy in ("botocore", "boto3", "urllib3", "httpx", "apscheduler"):
    logging.getLogger(noisy).setLevel(logging.WARNING)
```

---

#### M7. `shutil.rmtree` 在 async 函式裡阻塞 (TODO:優先修復)

**`backend/services/build.py:184`**

```python
shutil.rmtree(output_dir, ignore_errors=True)
```

同 [H3](#h3-share-端點在-async-函式裡做阻塞-io)：`utils/cache.py:94` 已經正確使用 `asyncio.to_thread`，這裡漏了。編譯失敗路徑上刪除目錄會卡住 event loop。

---

### 前端

#### M8. `Alert.tsx` 違反 Rules of Hooks + 計時器沒清理 (TODO:優先修復)

**`frontend/src/components/Alert.tsx:24-33`**

```typescript
export function Alerts() {
  const [alerts, setAlerts] = useAtom(alertStore);
  const isMobile = useIsMobile();
  if (!alerts) {
    return null;              // ← 早退發生在 useEffect 之前
  }
  useEffect(() => {           // ← 條件式 hook 呼叫
    if (alerts.length === 0) return;
    const uuid = alerts[alerts.length - 1].id;
    const timer = setTimeout(() => { ... }, 5000);
                              // ← 沒有 return () => clearTimeout(timer)
  }, [alerts]);
```

**兩個問題**：

1. **條件式 hook** — 早退在 `useEffect` 之前，一旦 `alerts` 為 falsy，React 會拋 `Rendered fewer hooks than expected` 並讓整棵樹崩潰。目前 `alertStore` 初始值是 `[]`（永遠 truthy）所以沒爆，但這是顆定時炸彈，而且 `if (!alerts)` 這個檢查本身也因此是死碼。
2. **計時器洩漏** — 沒有 cleanup。`alerts` 每變一次就排一個新 timer，舊的照樣會觸發。使用者手動點掉 alert 時會產生重複的移除操作。

**修法**：把早退刪掉（`alerts` 恆為陣列），並補上 cleanup：

```typescript
useEffect(() => {
    if (alerts.length === 0) return;
    const uuid = alerts[alerts.length - 1].id;
    const timer = setTimeout(() => {
        setAlerts((prev) => prev.filter((a) => a.id !== uuid));
    }, 5000);
    return () => clearTimeout(timer);
}, [alerts]);
```

---

#### M9. 檔案上傳沒有大小限制 (暫緩修復)

**`frontend/src/components/header/uploadBtn.tsx:26-47`**

```typescript
const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target?.result;
        if (typeof content === "string") {
            setCode(content);        // ← 直接寫進 localStorage-backed atom
        }
    };
    reader.readAsText(file);         // ← 完全沒有大小檢查
};
```

`accept=".cpp,.c,..."` 只是檔案挑選對話框的提示，使用者可以選任何檔案。

**兩段連續故障**：

1. 選一個幾百 MB 的檔案 → `readAsText` 把整份讀進記憶體 → 分頁凍結或 OOM
2. 就算讀完了，`codeStore` 是 `atomWithStorage`（`store/atom.ts:57`）→ 超過 ~5MB 觸發 **`QuotaExceededError`**，這是個未被捕捉的同步例外，會讓整個 React 樹崩潰

**修法**：

```typescript
const MAX_UPLOAD_BYTES = 1_000_000;   // 對照後端的 50_000 字元上限

if (file.size > MAX_UPLOAD_BYTES) {
    addAlert({ title: t("upload.tooLarge"), description: ..., variant: "destructive" });
    return;
}
```

順帶：後端 `BuildRequest.code` 限制是 `max_length=50_000`（`router/build.py:61`），前端沒有對應檢查，超過的檔案會走完整個上傳流程才被後端拒絕。

---

#### M10. 遠端 share 資料未經驗證就寫入 store (TODO:優先修復)

**`frontend/src/components/share.tsx:112-145`**

```typescript
fetchSharedCode(shareID!).then((res) => {
    if (!res.ok) { ...; return; }
    const data = res.data!;                       // ← 完全信任遠端 JSON
    if (checkedItems.code)     defaultStore.set(codeStore, data.code);
    if (checkedItems.testCase) defaultStore.set(testCasesStore, data.testCase);
    ...
});
```

`fetchSharedCode` 從 S3 抓一份任意 JSON（`service/share.ts:130`），只做 `as ShareObject` 這個**編譯期**斷言，執行期毫無檢查。

**後果**：`data.testCase` 若不是陣列，`TestCasePanel.tsx:250` 的 `testCases.map()` 直接 TypeError；而且這些值會被寫進 `atomWithStorage` **持久化到 localStorage**，使用者重新整理後仍然壞掉——變成一個要手動清 localStorage 才能修的持續性 DoS。

專案的 `package.json` 已經有 `zod`，直接用就好：

```typescript
const ShareObjectSchema = z.object({
    code: z.string(),
    inputData: z.string(),
    outputData: z.array(z.object({ content: z.string(), /* ... */ })),
    testCase: z.array(z.object({
        id: z.string(), name: z.string(), input: z.string(),
        expectedOutput: z.string().optional(),
    })),
});

const parsed = ShareObjectSchema.safeParse(respond.data);
if (!parsed.success) return { ok: false, errors: ["Malformed share payload"] };
```

---

#### M11. 「複製輸出」只複製第一筆 (TODO:優先修復)

**`frontend/src/components/panel/OutputPanel.tsx:40`**

```typescript
onClick={() => {
    navigator.clipboard.writeText(output[0].content);   // ← 只有 output[0]
    ...
}}
disabled={output.length === 0}
```

在 run-all 模式下 `output` 是每個測資一筆（`service/run.ts:449` 的 `insertInOrder`）。按下「複製」只會拿到**第一個測資**的輸出，其餘靜默遺失。因為有 `disabled` 保護所以不會 crash，但行為明顯不符預期。

**修法**：

```typescript
navigator.clipboard.writeText(
    output.map((o) => (o.testCaseName ? `# ${o.testCaseName}\n${o.content}` : o.content))
          .join("\n"),
);
```

---

#### M12. `runBtn.tsx` 在 render 期間讀 DOM 並改動 ref (TODO:優先修復)

**`frontend/src/components/header/runBtn.tsx:47-59`**

```typescript
function MotionButtonLabel({ children, lastWidthRef, ... }, ref) {
    const el = typeof window !== "undefined"
        ? window.document.getElementById("runBtnText")     // ← render 期間讀 DOM
        : null;

    if (el) {
        const len = el.offsetWidth;
        if (len != lastWidthRef.current[...]) {
            lastWidthRef.current.push(len);                // ← render 期間改 ref
            lastWidthRef.current = lastWidthRef.current.slice(-2);
        }
    }
```

**三個問題疊在一起**：

1. **render 期間的副作用** — 違反 React 的純粹性要求。StrictMode 下 render 會跑兩次，量測會被記錄兩遍；concurrent rendering 下這個 render 甚至可能被丟棄，但 ref 的變更已經發生了。
2. **`getElementById` 抓錯元素** — `id="runBtnText"` 在同一個元件裡出現 **5 次**（line 170、182、196、206、215）。`AnimatePresence` 做退場動畫時新舊元素會同時存在於 DOM，`getElementById` 只回傳第一個，很可能量到正在退場的舊按鈕。
3. **重複的 DOM id** — HTML 規範不允許，同時也讓無障礙工具混淆。

元件裡已經宣告了 `btnTextRef`（line 110）卻沒拿來用。

**修法**：刪掉 `id`，改用既有的 ref 並在 `useLayoutEffect` 裡量測。

---

#### M13. `ext` 事件的 payload 沒有任何驗證 (TODO:優先修復)

**`frontend/src/components/panel/TestCasePanel.tsx:109-120, 188`**

```typescript
const testCaseData = (event as CustomEvent<extTestCase>).detail;
const testCasesFromExtension: TestCase[] = testCaseData.tests.map(   // ← 直接 .map
    (test, index) => ({ ... input: test.input, expectedOutput: test.output }),
);
...
window.addEventListener("ext", handleExtEvent);
```

這個 `window` 事件**任何在頁面上執行的腳本都能發送**（其他擴充功能、第三方 script、XSS）。`detail` 沒有做任何檢查就 `.tests.map()`——`tests` 不存在或不是陣列時直接 TypeError，而且是在事件處理器裡拋出，React 錯誤邊界接不到。

**修法**：加上防衛檢查（同樣可以用 zod）：

```typescript
const detail = (event as CustomEvent).detail;
if (!detail || !Array.isArray(detail.tests) || typeof detail.name !== "string") {
    console.warn("Ignoring malformed ext event", detail);
    return;
}
```

---

### 基礎設施

#### M14. docker-compose 的環境變數名稱和程式碼對不上 (TODO:優先修復)

出貨的 compose 檔裡有 **3 個變數名稱是錯的**，設定它們完全沒有效果：

| compose 裡寫的 | 程式碼實際讀的 | 位置 | 後果 |
|---|---|---|---|
| `DEV=false` | `DEV_MODE` | `docker-compose.yml:9` | 想開 dev 模式開不起來（關閉時剛好對上預設值，所以沒被發現） |
| `PUBLIC_CAPTCHA_SITE_KEY` | `PUBLIC_TURNSTILE_SITE_KEY` | `docker-compose.yml:62` | **前端永遠使用測試 site key**，即使使用者設了正式的 |
| `SKIP_API_FETCH` | `PUBLIC_SKIP_API_FETCH` | `docker-compose.yml:73` | 想關閉 build 期 API 抓取關不掉 |

第 2 項尤其嚴重：搭配 [C2](#c2-出貨的-docker-compose-直接帶-turnstile永遠通過測試金鑰) 的測試 secret，**照著出貨設定部署的服務，前後端的 CAPTCHA 都是測試模式**。

`.env.example` 裡也是用 `PUBLIC_CAPTCHA_SITE_KEY` 和 `SKIP_API_FETCH`，錯得一致。

---

#### M15. 前後端共用同一個 `${PORT}` 變數 (TODO:優先修復)

**`docker/docker-compose.yml:45, 91`**

```yaml
backend:
  ports:
    - "${PORT:-8000}:${PORT:-8000}"
...
frontend:
  ports:
    - "${PORT:-4321}:${PORT:-4321}"
```

兩個 service 讀**同一個** `PORT` 環境變數。使用者只要設了 `PORT=9000`，兩邊都會嘗試綁 9000 → `port is already allocated`，compose 直接起不來。

而且前端的 Caddy 是寫死監聽 4321 的（`docker/frontend/Dockerfile:14`），所以設 `PORT` 還會讓 port mapping 指向一個沒人在聽的 port。

**修法**：拆成 `BACKEND_PORT` / `FRONTEND_PORT`，並把值傳進容器內讓 Caddy 使用。

---

#### M16. 前端 Dockerfile 在容器啟動時才 build (暫緩修復)

**`docker/frontend/Dockerfile:9, 14`**

```dockerfile
RUN bun install --production          # ← 不裝 devDependencies
...
CMD ["/bin/sh", "-c", "bun run build && caddy file-server --root dist --listen :4321"]
```

**兩個問題**：

1. **`--production` 會漏掉 build 需要的套件** — `@types/node`、`@types/react` 都在 `devDependencies`（`frontend/package.json:55-58`）。Astro build 需要它們。
2. **build 在 `CMD` 執行** — 每次容器重啟都重新 build 一次整個網站（幾十秒到幾分鐘），而不是一次 build 成 image。`restart: unless-stopped` 遇到 crash loop 會變成無止境地重複 build。

會這樣寫大概是因為 `PUBLIC_*` 變數是 build 期 inline 的，所以想在啟動時才注入。但正確做法是用 build args：

```dockerfile
ARG PUBLIC_API_URL
ARG PUBLIC_TURNSTILE_SITE_KEY
RUN bun install --frozen-lockfile && bun run build

FROM caddy:alpine
COPY --from=builder /app/dist /srv
```

---

#### M17. 完全沒有測試，CI 也不做 lint / typecheck (TODO:優先修復)

**測試現況**：

| 位置 | 內容 |
|---|---|
| `backend/test/` | `1.py`（印一個隨機字串）、`sort.py`（4 行的排序練習）、`test.html` — **沒有一個是測試** |
| `frontend/` | 沒有任何測試檔、沒有 vitest/jest 設定 |
| `backend/load_test/` | k6 壓測腳本（這個是真的，但只測負載不測正確性） |

**CI 現況**（`.github/workflows/`）：三個 workflow 全部只做 Docker build & push，**沒有任何 lint、typecheck 或測試步驟**。

這代表本份報告裡的每一個 bug——包含 [C1](#c1-沒設-posthog-api-key後端根本起不來) 那個「後端起不來」的問題——都能順利通過 CI 進到 production。

**最低限度的建議**：

```yaml
- run: cd frontend && bun install && bunx astro check      # 型別檢查
- run: cd backend && ruff check .                          # 專案已經在用 ruff（main.py:5 有註解）
- run: cd backend && python -c "import main"               # 冒煙測試，這一行就能擋下 C1
```

最後一行成本近乎零，卻正好能攔住本次最嚴重的問題。

---

#### M18. CI secret 直接內插進 shell 指令 (TODO:優先修復)

**`.github/workflows/scheduled-deploy.yml:11`**

```yaml
- name: Trigger Cloudflare Pages Deploy
  run: curl -X POST "${{ secrets.CF_DEPLOY_HOOK }}"
```

`${{ }}` 內插是在 shell 執行**之前**做字串替換，等於把 secret 直接寫進指令列。GitHub 會遮蔽 log，但這個值會出現在 runner 的 process table，而且若 secret 含有 shell 特殊字元就會造成注入。

**修法**（GitHub 官方建議）：

```yaml
- name: Trigger Cloudflare Pages Deploy
  env:
    CF_DEPLOY_HOOK: ${{ secrets.CF_DEPLOY_HOOK }}
  run: curl -X POST --fail "$CF_DEPLOY_HOOK"
```

順帶加上 `--fail`，否則 hook 回 4xx/5xx 時這個 job 仍然是綠的。

---

#### M19. 編譯容器可以再收緊 (暫緩修復)

**`backend/services/build.py:36-46`**

現有的限制已經相當紮實（見[做得好的地方](#做得好的地方)），還可以再補三項：

```python
"HostConfig": {
    ...
    "ReadonlyRootfs": True,                              # ← 新增
    "Tmpfs": {"/tmp": "rw,noexec,nosuid,size=128m"},     # ← 新增，配合上一行
},
"User": "nobody",                                         # ← 新增（config 層級，非 HostConfig）
```

目前容器內的 process 雖然 `CapDrop: ALL` + `no-new-privileges`，但仍以 root 身分執行，且 rootfs 可寫。加上這三項後，即使 emcc 本身有 RCE 漏洞，攻擊者能操作的範圍也只剩一個 128MB 的 tmpfs。

---

## 🔵 Low

| # | 檔案 | 說明 | 修復規劃 |
|---|---|---|---|
| L1 | `backend/router/verify.py:30` | `datetime.utcnow()` 自 Python 3.12 起已 deprecated（Dockerfile 用的是 3.14），且回傳 naive datetime。改用 `datetime.now(timezone.utc)` | TODO: 優先修復 |
| L2 | `backend/utils/cache.py:17` | `hash_id: str = Field(default=None, ...)` — 型別標注是 `str` 但預設 `None`。目前都有顯式賦值所以沒事，但型別是假的 | TODO: 優先修復 |
| L3 | `backend/router/verify.py:45` | `need_token` 的型別標注是 `dict`（`Depends(need_token)` 處），實際回傳 `bool` |TODO: 優先修復 |
| L4 | `backend/router/build.py:136` | `_in_flight` 是無界 dict。正常路徑會 pop，但 [H4](#h4-build-的去重機制有-race-condition) 的 race 會讓項目遺留 | TODO: 優先修復 |
| L5 | `frontend/src/layouts/Layout.astro:29` | `lang="en"` 寫死在所有頁面上，包含 zh-TW 版。螢幕閱讀器會用錯語音，SEO 也會誤判。應該用 `Astro.currentLocale` | TODO: 優先修復 |
| L6 | `frontend/src/pages/404.astro:11-14` | 用 `<meta http-equiv="refresh">` + `location.replace()` 把所有 404 導回首頁。破壞深層連結的錯誤訊息，且 meta refresh 是無障礙反模式 | TODO: 優先修復 |
| L7 | `frontend/src/layouts/Layout.astro:100-117` | Google Analytics 與 PostHog 都無條件載入，沒有 consent gate。若有歐盟流量會有 GDPR 問題 | 暫緩修復 |
| L8 | `frontend/src/components/share.tsx:56` | `history.replaceState(null, "", "/editor")` 寫死路徑，會把使用者的語言前綴（`/zh-tw/editor`）洗掉 | 暫緩修復 |

---

## 做得好的地方

**這些不是客套話，是實際檢查後認為值得保留的設計：**

### 沙箱設定紮實

`backend/services/build.py:36-46` 的容器設定是專案裡最讓人放心的部分：

```python
"HostConfig": {
    "NetworkMode": "none",                    # 完全沒有網路
    "NanoCpus": 1_000_000_000,                # 1 CPU
    "Memory": 1_073_741_824,                  # 1 GB
    "PidsLimit": 50,                          # 防 fork bomb
    "Ulimits": [{"Name": "fsize", ...}],      # 防磁碟塞爆
    "CapDrop": ["ALL"],                       # 丟掉所有 capability
    "SecurityOpt": ["no-new-privileges:true"],
},
```

**每一層都對應到一個真實的攻擊手法**，而且容器是**一次性的**（`acquire()` 的 `finally` 一定 `delete(force=True)`）。搭配 `timeout 30s` 和外層的 `asyncio.wait_for(60)` 雙重逾時，是很完整的思路。

### Shell 注入有正確處理

```python
f"printf '%s' {shlex.quote(code)} > /tmp/source.cpp && "
```

`shlex.quote` 用對了位置。而 `cpp_version` 雖然是直接內插，但上游被 Pydantic 的 `Literal[...]` 鎖死（`router/build.py:62`），只可能是那 6 個值之一——**兩層防護剛好互補**。

### 編譯輸出的路徑穿越有防住

```python
for member in tar.getmembers():
    if member.isfile():
        (output_dir / Path(member.name).name).write_bytes(...)   # ← 只取 basename
```

從容器抓 tar 回來時只用 `Path(member.name).name`，擋掉了 tar 檔案名稱裡的 `../`（經典的 Zip Slip）。

### 快取失效會自我修復

`router/build.py:143` 在信任快取之前會實際檢查檔案存在：

```python
if js_path.exists() and wasm_path.exists():
    return BuildResponse(...)      # 命中
logger.warning(f"Cache files missing for {case_id}, invalidating and rebuilding")
await cache.del_cache(case_id)     # DB 有但檔案沒了 → 自動修復
```

這正好化解了 [H4](#h4-build-的去重機制有-race-condition) race condition 最糟的後果。

### 前端的錯誤顯示沒有 XSS

`components/Error.tsx` 把編譯器輸出（使用者可控）用 `textContent` 寫入（line 123），只有靜態的 SVG 字串用 `innerHTML`。這個界線劃得很正確——編譯錯誤訊息裡塞 `<img onerror=...>` 是很自然的攻擊嘗試，這裡擋住了。

### 其他

- `utils/cache.py` 的 `del_oldest_cache` 依 `delete_at` 排序，配合 `get_cache` 會延長 `delete_at`，實際上構成了一個 **LRU** 淘汰策略——簡潔且正確
- `services/resource_manager.py` 的 `AsyncResourceManager` 以**反向順序**關閉資源（`reversed(self.resources)`），這是正確的清理語意
- `router/build.py` 的 Prometheus histogram bucket 邊界是依實際資料分布挑的（50/100/200... 行；100K/500K/1M wasm），不是照抄預設值
- `service/share.ts` 的 `renewJwt` 寫得很好（詳見 v2 報告）

---

## 修正順序建議

### 第一梯次：讓部署能正常運作且安全

| # | 項目 | 成本 |
|---|---|---|
| [C1](#c1-沒設-posthog-api-key後端根本起不來) | 修 `utils/posthog.py` 的條件式定義 | 5 分鐘 |
| [C2](#c2-出貨的-docker-compose-直接帶-turnstile永遠通過測試金鑰) | 移除出貨設定裡的測試金鑰，加啟動驗證 | 30 分鐘 |
| [M14](#m14-docker-compose-的環境變數名稱和程式碼對不上) | 修正 3 個對不上的環境變數名稱 | 15 分鐘 |
| [C5](#c5-全域例外處理器把內部錯誤原文回給使用者) | 全域錯誤處理器不回傳 `str(exc)` | 10 分鐘 |
| [M17](#m17-完全沒有測試ci-也不做-lint--typecheck) | CI 加 `python -c "import main"` 冒煙測試 | 5 分鐘 |

> 最後一項只有一行，卻正好能永久攔住 C1 這類問題。

### 第二梯次：資源治理

| # | 項目 |
|---|---|
| [H1](#h1-完全沒有-rate-limiting) | 加 rate limiting（`/verify` per-IP + `/build` per-token 配額），縮短 JWT 有效期 |
| [H2](#h2-cache-清理排程實際上從未執行) | 修 APScheduler 的 `next_run_time`，並縮短間隔 |
| [C3](#c3-docker-socket-掛進後端容器--後端被打穿就等於拿到宿主機-root) | 導入 docker socket proxy |

### 第三梯次：正確性

[C4](#c4-錯誤處理路徑本身會拋-unboundlocalerror) · [H3](#h3-share-端點在-async-函式裡做阻塞-io) · [H4](#h4-build-的去重機制有-race-condition) · [H5](#h5-errortsx-每顯示一個編譯錯誤就洩漏一個訂閱) · [M8](#m8-alerttsx-違反-rules-of-hooks--計時器沒清理) · [M9](#m9-檔案上傳沒有大小限制) · [M10](#m10-遠端-share-資料未經驗證就寫入-store)

### 第四梯次：其餘 Medium 與 Low

---

## 附錄：與 v2 報告的關係

[`code-review-v2.md`](./code-review-v2.md) 涵蓋 v2 分支新增/修改的程式碼，本份不重複，但兩者有兩處主題重疊：

| 主題 | v2 報告 | 本報告 |
|---|---|---|
| Turnstile 測試金鑰當預設值 | #1（`astro.config.mjs`） | [C2](#c2-出貨的-docker-compose-直接帶-turnstile永遠通過測試金鑰)（`docker-compose.yml`） |
| 缺少 rate limiting 的後果 | — | [H1](#h1-完全沒有-rate-limiting) |

**同一個錯誤在前端設定與 docker 設定各出現一次**，建議一併處理，並在 `.env.example` 補上完整的變數說明。
