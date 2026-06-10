# k6 Load Tests

壓力測試腳本針對後端 API，放於此目錄。

## 前置需求

安裝 [k6](https://k6.io/docs/get-started/installation/)：

```bash
# macOS
brew install k6
```

## 腳本說明

| 檔案 | 測試範圍 | 需要 Token |
|------|---------|-----------|
| `health.js` | `GET /health`、`GET /status` | 否 |
| `build.js` | `POST /build`（多種 C++ 程式碼樣本） | 是 |
| `full_flow.js` | health + status + build 完整流程（雙 scenario） | 是 |

## 執行方式

```bash
# 健康 & 狀態端點（無需 token）
k6 run health.js

# 自訂後端 URL
k6 run -e BASE_URL=http://localhost:8000 health.js

# 使用 CAPTCHA_TEST_TOKEN 繞過人機驗證
k6 run -e CAPTCHA_TEST_TOKEN=<your_token> build.js

# 完整流程測試
k6 run -e CAPTCHA_TEST_TOKEN=<your_token> full_flow.js

# 輸出結果至 JSON 以便進一步分析
k6 run --out json=results.json -e CAPTCHA_TEST_TOKEN=<your_token> build.js
```

## 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `BASE_URL` | `http://localhost:8000` | 後端 URL |
| `CAPTCHA_TEST_TOKEN` | `""` | 對應 `settings.CAPTCHA_TEST_TOKEN`，用於繞過 Turnstile 驗證 |

> 若後端啟動時設定了 `BYPASS_CAPTCHA=true`，則不需要提供 `CAPTCHA_TEST_TOKEN`。
