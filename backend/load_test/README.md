# k6 Load Tests

壓力測試腳本針對後端 API，放於此目錄。主機本身的編譯效能測試見下一節。

## 主機編譯效能測試（host_bench.py）

量一台主機的編譯效能、建議的 `DOCKER_POOL_SIZE`，並給一個綜合分數。不需要
k6，也不需要先啟動後端：腳本已經在後端映像檔裡，要測的主機只要有 Docker。
`-t` 讓輸出有顏色和即時更新的表格；沒加也能跑，只是改成逐行印進度。

```bash
docker run --rm -t -v /var/run/docker.sock:/var/run/docker.sock \
    ghcr.io/dong-chen-1031/cpp-here/backend python load_test/host_bench.py

# 快速版（每級 10 秒，約 2 分鐘），並把 JSON 結果存到目前目錄
docker run --rm -t -v /var/run/docker.sock:/var/run/docker.sock -v "$PWD:/out" \
    ghcr.io/dong-chen-1031/cpp-here/backend \
    python load_test/host_bench.py --quick --out /out
```

它直接使用後端的 `ContainerPool` 和 `build()`（只是不經過 HTTP），所以量到的
就是正式環境的編譯流程。步驟：

1. **容器量測**：冷啟動時間、Docker 每秒能建立幾個容器、編譯時的記憶體。
2. **同時編譯數掃描**：pool 數 = 同時編譯數，從 1 開始往上加，每級持續編譯固定的
   混合負載（一般競程程式、C++20、只用 iostream、重模板），記錄吞吐量與 p50/p95。
   吞吐量連續兩級不再成長就停止。
3. **純編譯上限**：在一個容器裡直接平行編譯，不經過容器管理，用來看開銷佔多少。

結果怎麼看：

| 項目 | 意義 |
|------|------|
| 建議 pool 數 | 吞吐量達到最高值 90% 的最小同時編譯數，再用記憶體最壞情況（每個容器用滿上限）封頂。設成 `DOCKER_POOL_SIZE` |
| 容器管理開銷 | 1 − 實際最高吞吐量 ÷ 純編譯上限。很高時，瓶頸在每次編譯都要建立、刪除容器，不在 CPU |
| 綜合分數 | `1000 × (吞吐量 ÷ 165)^0.7 × (0.55 s ÷ 單一延遲)^0.3`，1000 分 = Apple M4 10 核 + OrbStack |

注意：

- 測試期間主機會滿載，在正在服務使用者的主機上跑，結果會偏低，也會拖慢線上編譯。
- 分數只能在同一個 workload 版本之間比較（輸出裡的 `workload vN`）。
- 筆電會因為溫度降頻、背景程式干擾，結果可能有 ±20% 的浮動；伺服器比較穩定。
  要比較兩台主機時，各跑兩次取平均比較可靠。

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
| `build.js` | `POST /api/build`（多種 C++ 程式碼樣本） | 是 |
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
