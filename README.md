# CPP-here - Online C++ Editor

CPP-here 是一個輕量、快速的線上 C++ 執行與驗證平台。讓使用者可以在網頁端直接輸入、編譯並測試 C++ 程式碼。

## 功能亮點

- **線上編譯與即時執行**
  提供安全且快速的後端環境，讓使用者可以直接在網頁上編寫 C++ 程式碼，並立即提交查看編譯過程與執行結果。

- **Test Case 支援**
  使用者可以為程式碼添加多組測試案例，系統會自動執行並顯示每個測試案例的結果，幫助使用者驗證程式碼的正確性。

- **專為競程設計**
  CPP-here 的功能和介面設計特別適合競賽程式設計（Competitive Programming）的需求，讓使用者能夠快速測試和驗證他們的解法。

- **即時錯誤提示**
  編譯過程中若發生錯誤，系統會高亮顯示錯誤位置並提供詳細的錯誤訊息，幫助使用者快速定位問題並修正程式碼。

- **多平台支援**
  無論是在桌面瀏覽器還是行動裝置上，CPP-here 都能提供流暢的使用體驗，讓使用者隨時隨地都能編寫與測試 C++ 程式碼。

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
  CPP-here 的原始碼完全開放，歡迎社群參與貢獻，讓這個專案持續成長與改進。

- **免費使用**
  CPP-here 提供完全免費的線上 C++ 編輯與執行服務，讓每個人都能輕鬆學習與使用 C++。

- **簡潔優雅，不失強大**
  雖然功能豐富，但 CPP-here 的使用者介面保持簡潔優雅，讓使用者能夠專注於程式碼本身，而不會被過多的功能選項分散注意力。

## 技術棧

- **前端**: Astro, Bun, Motion, React, Shadcn, Tailwind CSS, TypeScript, axios, cloudflare turnstile, codemirror, i18next, jotai Atom, lucide
- **瀏覽器擴充**: Bun, TypeScript, esbuild, web-ext
- **後端**: FastAPI, PyJWT, PyTurnstile, Python, SQLAlchemy, Uvicorn, aiodocker, aiofiles, aiosqlite, apscheduler

## 快速開始

### 啟動後端

進入後端目錄並安裝相依套件，接著啟動 FastAPI 伺服器：

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### 啟動前端

進入前端目錄，安裝相依套件並啟動開發伺服器：

```bash
cd frontend
npm install
npm run dev
```

啟動後，開啟終端機提示的本地網址即可開始使用。
