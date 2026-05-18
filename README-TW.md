# C++ Here - Online C++ Editor

> [!NOTE]
> This readme also has a [English version](README.md).

C++ Here 是一個新世代的線上 C++ 編輯器，專為競程而生。不但快速、輕量，功能也十分完整。

> [!TIP]
> 立即體驗: https://cpp.doong.me

![Screenshot](screenshot/image.png)

## 功能亮點

- **錯誤高亮提示**
  > 在程式發生錯誤時，編輯器會自動對錯誤進行分析，並在對應的行高亮提示錯誤，並提供充分的錯誤訊息，讓使用者一眼就能看出錯誤的原因並快速進行修復。
- **內建測資支援**
  > 透過內建的測資系統，支援輸入測資並一鍵執行所有測資，所有的測資會在瀏覽器 worker 內被並行執行，並透過清楚的顏色標示讓使用者一眼看出測資執行結果，不再需要重複的手動貼上測資。
- **自動程式碼格式化（Formatting）**
  > 透過整合 Clang-format WASM，可以一鍵格式化程式碼，並提供多種風格可供選擇。
- **本地化與在地化 (i18n)**
  > 目前已支援英文和繁體中文，會根據瀏覽器語言自動切換。已規劃支援更多語言，也歡迎在 [Crowdin](https://crowdin.com/project/cpp-here)上協助我們進行翻譯。
- **自動補全**
  > 對 C++ 語法進行自動補全，已針對競程進行優化。
- **響應式設計（RWD）**
  > 良好的響應式設計讓手機及電腦都可以輕鬆地使用 C++ Here。

- **線上編譯與即時執行**
  > 將 C++ 程式碼編譯成 WebAssembly 模組，直接在前端執行，無任和資源限制，且無需每次測試都進行後端編譯，大幅提升執行速度。

- **簡潔但強大的編輯器**
  > 前端使用了簡潔的介面，但功能完整，採用 Astro 框架結合 React 元件打造，確保極致的頁面載入速度與順暢的互動體驗。

- **智慧編譯快取 (Catch)**
  > 後端實作了編譯結果快取功能。當使用者提交與過去相同的程式碼時，系統會自動比對雜湊值並直接返回快取的執行結果，大幅減少重複編譯的時間與伺服器運算負載。

- **一鍵匯入測資**
  > 透過瀏覽器插件一鍵匯入競賽平台的測試資料，支援超過 100 個主流競賽平台。

- **開源及免費**
  > C++ Here 的原始碼完全開放，歡迎社群參與貢獻，讓這個專案持續成長與改進。且完全免費的線上 C++ 編輯與執行服務，能讓每個人都能輕鬆學習與使用 C++。

## 技術棧&依賴套件

- **前端**: Astro, Bun, Motion, React, Shadcn, Tailwind CSS, TypeScript, axios, cloudflare turnstile, codemirror, i18next, Jotai Atom, lucide
- **瀏覽器擴充**: Bun, TypeScript, esbuild, web-ext
- **後端**: FastAPI, PyJWT, PyTurnstile, Python, SQLAlchemy, Uvicorn, aiodocker, aiofiles, aiosqlite, apscheduler, [safe-cpp2wasm](https://github.com/Dong-Chen-1031/safe-cpp2wasm/)

## 原理及優勢

C++ Here 與其他線上 C++ 編輯器的最大不同在於我們使用 [safe-cpp2wasm](https://github.com/Dong-Chen-1031/safe-cpp2wasm/) 將 C++ 檔案編譯成 WebAssembly，並在前端直接執行。這種方式的優勢在於：

1. 快速：由於編譯後的 WebAssembly 模組可以直接在瀏覽器中執行，無需每次測試都進行後端編譯，極大地提升了執行速度。
2. 安全：WebAssembly 在瀏覽器中運行，具有沙箱隔離特性，可以有效防止惡意程式碼對系統造成威脅。
3. 並發：前端執行 WebAssembly 模組可以利用瀏覽器的多線程能力，實現更高效的並發執行，特別適合競賽程式設計中的大量測試案例。
4. 無限制：由於執行在前端，使用者不受後端資源限制，可以自由地編寫和測試程式碼，而不必擔心伺服器的負載問題。

## 本地運行及部署

### 使用 Docker Compose 一鍵部署
```shell
curl -sS "https://cpp.doong.me/script/docker-compose.yml" > docker-compose.yml
docker compose up --pull always
```
> [!TIP]
> - 可以在第二行指令加上 -d 讓他在背景長期執行
> - 可依 docker-compose.yml 內的註釋修改環境變數
> - 在 Linux 及 macos 以外的作業系統上可能需要對 docker-compose.yml 做些許修改才能正常執行



## Contributing

Any contributions are greatly appreciated. If you have a suggestion that would make this project better, please fork the repo and create a Pull Request. You can also [open an issue](https://github.com/Dong-Chen-1031/Cpp-Here/issues).

## License

Published under the [MIT License](LICENSE).
