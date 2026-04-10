# C++ Here - Online C++ Editor

> This readme also has a [English version](README.md).

C++ Here 是一個輕量、快速的線上 C++ 執行與驗證平台。讓使用者可以在網頁端直接輸入、編譯並測試 C++ 程式碼。

![Screenshot](screenshot/image.png)

> 立即體驗: https://cpp.doong.me

## 功能亮點

- **線上編譯與即時執行**
  將 C++ 程式碼編譯成 WebAssembly 模組，直接在前端執行，無任和資源限制，且無需每次測試都進行後端編譯，大幅提升執行速度。

- **Test Case 支援**
  使用者可以為程式碼添加多組測試案例，系統會自動執行並顯示每個測試案例的結果，幫助使用者驗證程式碼的正確性。

- **專為競程設計**
  C++ Here 的功能和介面設計特別適合競賽程式設計（Competitive Programming）的需求，讓使用者能夠快速測試和驗證他們的解法。

- **即時錯誤提示**
  編譯過程中若發生錯誤，系統會高亮顯示錯誤位置並提供詳細的錯誤訊息，幫助使用者快速定位問題並修正程式碼。

- **多平台支援**
  無論是在桌面瀏覽器還是行動裝置上，C++ Here 都能提供流暢的使用體驗，讓使用者隨時隨地都能編寫與測試 C++ 程式碼。

- **簡潔但強大的編輯器**
  前端使用了簡潔的介面，但功能完整，提供良好的使用者體驗。

- **智慧編譯快取 (Catch)**
  後端實作了編譯結果快取功能。當使用者提交與過去相同的程式碼時，系統會自動比對雜湊值並直接返回快取的執行結果，大幅減少重複編譯的時間與伺服器運算負載。

- **現代化且流暢的使用者介面**
  前端採用 Astro 框架結合 React 元件打造，確保極致的頁面載入速度與順暢的互動體驗。

- **i18n**
  支援多語言介面，使用者可以根據自己的語言偏好切換界面語言，提升使用體驗。

- **安全性**
  後端使用沙箱技術隔離執行環境，確保使用者提交的程式碼不會對伺服器造成安全威脅。

- **開放原始碼**
  C++ Here 的原始碼完全開放，歡迎社群參與貢獻，讓這個專案持續成長與改進。

- **免費使用**
  C++ Here 提供完全免費的線上 C++ 編輯與執行服務，讓每個人都能輕鬆學習與使用 C++。

- **簡潔優雅，不失強大**
  雖然功能豐富，但 C++ Here 的使用者介面保持簡潔優雅，讓使用者能夠專注於程式碼本身，而不會被過多的功能選項分散注意力。

- **匯入測資**
  透過瀏覽器插件一鍵匯入競賽平台的測試資料，支援超過 100 個主流競賽平台。

## 技術棧

- **前端**: Astro, Bun, Motion, React, Shadcn, Tailwind CSS, TypeScript, axios, cloudflare turnstile, codemirror, i18next, Jotai Atom, lucide
- **瀏覽器擴充**: Bun, TypeScript, esbuild, web-ext
- **後端**: FastAPI, PyJWT, PyTurnstile, Python, SQLAlchemy, Uvicorn, aiodocker, aiofiles, aiosqlite, apscheduler

## 原理及優勢

C++ Here 與其他線上 C++ 編輯器的最大不同在於我們是將 C++ 檔案編譯成 WebAssembly，並在前端直接執行。這種方式的優勢在於：

1. 快速：由於編譯後的 WebAssembly 模組可以直接在瀏覽器中執行，無需每次測試都進行後端編譯，極大地提升了執行速度。
2. 安全：WebAssembly 在瀏覽器中運行，具有沙箱隔離特性，可以有效防止惡意程式碼對系統造成威脅。
3. 並發：前端執行 WebAssembly 模組可以利用瀏覽器的多線程能力，實現更高效的並發執行，特別適合競賽程式設計中的大量測試案例。
4. 無限制：由於執行在前端，使用者不受後端資源限制，可以自由地編寫和測試程式碼，而不必擔心伺服器的負載問題。

## Contributing

Any contributions are greatly appreciated. If you have a suggestion that would make this project better, please fork the repo and create a Pull Request. You can also [open an issue](https://github.com/Dong-Chen-1031/Cpp-Here/issues).

## License

Published under the [MIT License](LICENSE).
