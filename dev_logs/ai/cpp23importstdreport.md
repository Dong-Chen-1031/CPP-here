> 以下使用 Claude 進行之研究報告，未使用其生成程式碼，單純進行詢問並作為參考

# C++23 `import std;` 在 CPP-here 上失敗的原因與修復方案評估

> 調查日期：2026-09-11
> 範圍：只做研究，**未修改任何程式碼、未建立分支、未推送**
> 錯誤訊息：
> ```
> /tmp/source.cpp:1:8: fatal error: module 'std' not found
>     1 | import std;
>       |        ^~~~
> 1 error generated.
> ```

---

## 1. 結論（TL;DR）

| 項目 | 結論 |
|---|---|
| 是不是我們的程式碼有 bug？ | 不是。是編譯環境（Docker image）裡的 Emscripten 版本太舊。 |
| 根本原因 | `import std;` 需要一份預先編譯好的 **BMI（`std.pcm`）**，而目前 image 內的 Emscripten sysroot **根本沒有 `std.cppm` 這個檔案**，clang 自然找不到 `std` 這個 module。 |
| 現在的 image 是什麼版本？ | 基底為 **`emscripten/emsdk:5.0.2`**（2026-02-25 釋出），image 本身建置於 **2026-03-09**。 |
| 上游何時支援？ | Emscripten [PR #27065](https://github.com/emscripten-core/emscripten/pull/27065)（2026-06-15 合併），首次出現在 **Emscripten 6.0.1**（2026-06-22）。 |
| 能修嗎？ | **可以**，而且不需要改動編譯流程架構。核心是「升級 base image 到 ≥ 6.0.1，並在 image 建置階段預先編譯 `std.pcm`，執行期只多加一個 `-fmodule-file=` 參數」。 |
| 預估成本 | Dockerfile 加約 10 行 + `backend/services/build.py` 改約 5 行 + 一次 image 重建與回歸測試。 |
| 每次編譯的額外耗時 | 接近 0（`.pcm` 在 image build 時就做好，執行期只是 mmap 讀取）。 |

---

## 2. 問題重現路徑

使用者在前端選 C++ 23（`frontend/src/components/header/cppVersionSelect.tsx:56`），請求進到 `backend/router/build.py` 的 `/build`，最後在 `backend/services/build.py:119-142` 組出這條指令，丟進 pool 容器執行：

```sh
mkdir -p /tmp/out && printf '%s' <code> > /tmp/source.cpp && \
timeout 30s emcc /tmp/source.cpp -o /tmp/out/build.js \
  -std=c++23 -ftemplate-depth=50 -sMODULARIZE=1 -sEXPORT_NAME="createMyModule" \
  -sENVIRONMENT="worker" -sEXIT_RUNTIME=1 -sFILESYSTEM=0 \
  --js-library /tmp/stdin_lib.js -fconstexpr-depth=50 -fmacro-backtrace-limit=10 \
  -sSTACK_SIZE=8388608 -sINITIAL_MEMORY=33554432 -sALLOW_MEMORY_GROWTH=1
```

注意這裡 **完全沒有任何 module 相關參數**——這正是問題所在，但也不是加個參數就好（見下節）。

---

## 3. 根本原因分析

### 3.1 `import std;` 不是「開了 `-std=c++23` 就能用」的語法

C++20 具名模組（named modules）的查找機制是：編譯器必須被**明確告知**某個 module 名稱對應到哪個已編譯好的 BMI（Binary Module Interface，clang 的 `.pcm` 檔）。clang 不會、也不能即時去猜 `std` 應該從哪裡編出來。

libc++ 的做法是提供一份 `std.cppm` 原始碼（以及 `std.compat.cppm`），**使用者或建置系統必須自己先把它編成 `.pcm`**。libc++ 官方文件長期以來的立場就是「BMI 不可攜（依賴編譯器版本與編譯旗標），所以不預先散佈 `.pcm`」。這也是為什麼原生 clang 上也常見同樣錯誤，一般解法是：

```sh
clang++ -std=c++23 -Wno-reserved-module-identifier --precompile \
        /usr/lib/llvm-21/share/libc++/v1/std.cppm -o std.pcm
clang++ -std=c++23 -fmodule-file=std=std.pcm main.cpp
```

### 3.2 但我們現在的環境連 `std.cppm` 都沒有

我從 GHCR 直接把 image 的 manifest 與 config blob 拉下來核對（沒有 docker daemon，所以用 registry API）：

```
ghcr.io/dong-chen-1031/safe-cpp2wasm:latest (amd64)
  created : 2026-03-09T04:51:24Z
  ENV     : EMSDK=/emsdk, PATH=/emsdk:/emsdk/upstream/emscripten:/emsdk/node/22.16.0_64bit/bin:...
  history : COPY /emsdk /emsdk → ENTRYPOINT /emsdk/docker/entrypoint.sh (官方 emscripten/emsdk)
            RUN mkdir -p /emsdk/upstream/emscripten/cache/sysroot/include/c++/v1
            COPY inner/ .../include/c++/v1/        ← 自製的 bits/stdc++.h
            COPY js_lib/stdin_lib.js /tmp/stdin_lib.js
            RUN useradd -m sandbox_user ...
```

再把它的 layer digest 跟 Docker Hub 上 `emscripten/emsdk` 各 tag 對比，**前四層完全相同於 `emscripten/emsdk:5.0.2-x64`**：

```
safe-cpp2wasm : 01d7766a2e4a 459c627a3b32 bb18918a9062 985c7263c1a3
emsdk 5.0.2   : 01d7766a2e4a 459c627a3b32 bb18918a9062 985c7263c1a3   ← 命中
emsdk 5.0.3   : 01d7766a2e4a 64e5b7db9dac ed1813a50a99 d6fb702bffc0
emsdk 5.0.1   : 6f4ebca3e823 995a14091dc3 520073dbac3c 3dc842d3dc49
```

而 Emscripten 是在 **PR #27065（2026-06-15 合併）** 才把 libc++ 的 modules 目錄 vendored 進來並安裝到 sysroot。用 raw.githubusercontent 對各 tag 探測 `system/lib/libcxx/modules/prebuilt/share/libc++/v1/std.cppm`：

| Emscripten tag | 釋出日 | `std.cppm` 是否存在 |
|---|---|---|
| 4.0.14 / 5.0.0 / 5.0.2 / 6.0.0 | ~2025-07 ~ 2026-06-04 | ❌ 404 |
| **6.0.1** | 2026-06-22 | ✅ 200 |
| 6.0.2 / 6.0.5 / 6.0.9 | 2026-07 ~ 2026-09 | ✅ 200 |

> 我們的 image 是 5.0.2，比 6.0.1 早了約四個月 → sysroot 裡沒有 `std.cppm`、沒有 `libc++.modules.json`，`import std;` 必定失敗。這是**環境版本問題，不是旗標問題**：在 5.0.2 上就算硬加 `-fmodule-file=std=...` 也沒有檔案可以指。

### 3.3 上游修好之後長什麼樣

PR #27065 在 sysroot 裡安裝了：

```
$(em-config CACHE)/sysroot/share/libc++/v1/std.cppm
$(em-config CACHE)/sysroot/share/libc++/v1/std.compat.cppm
$(em-config CACHE)/sysroot/share/libc++/v1/std/*.inc          (131 個)
$(em-config CACHE)/sysroot/share/libc++/v1/std.compat/*.inc   (21 個)
$(em-config CACHE)/sysroot/lib/wasm32-emscripten/libc++.modules.json
```

（安裝對應表見上游 `tools/system_libs.py` 的 `install_dirs`，以及 `cmake/Modules/Platform/Emscripten.cmake` 新增的 `CMAKE_CXX_MODULE_STD` 區塊。）

Emscripten 官方測試 `test_other.py::test_cxx_import`（`std23` / `std26` 兩個參數化案例）示範了**不用 CMake 的純命令列做法**，這正是我們需要的模式：

```python
cflags = ['-nostdinc++', '-isystem', <sysroot>/include/c++/v1, '-std=c++23']
for module in ['std', 'std.compat']:
    cflags += [f'-fmodule-file={module}={module}.pcm']
    emcc('-Wno-reserved-module-identifier', '--precompile',
         f'<sysroot>/share/libc++/v1/{module}.cppm', '-o', f'{module}.pcm', *cflags)
# 然後直接編使用者程式，測試程式就是 `import std; int main(){ std::print("Hello, world!\n"); }`
```

值得注意的兩點：
1. 上游測試**只傳 `-fmodule-file=`，沒有額外把 `std.pcm` 編成 `.o` 再連結**，代表對 libc++ 的 std module 而言，連結階段不需要額外 object（所有實體符號都已在 `libc++.a` 裡）。
2. `-Wno-reserved-module-identifier` 只在編 `std.cppm` 時需要（因為 `std` 是保留 module 名稱）。

---

## 4. 三個可行方案

### 方案 A（建議）：升級 base image 到 Emscripten ≥ 6.0.1，並在 image 內預先編譯 `std.pcm`

**核心想法**：把耗時的 `--precompile` 放在 image build 階段做一次，執行期的每個請求只是多帶一個 `-fmodule-file=` 參數，所以**對編譯延遲幾乎沒有影響**（目前每次編譯有 `timeout 30s` 的限制，若改成每次請求才 precompile 一定會爆掉，絕對不能這樣做）。

`safe-cpp2wasm` 的 Dockerfile 需要加的內容大致如下（該 image 不在本 repo，需到對應 repo 修改）：

```dockerfile
# 1) 版本從 5.0.2 拉到 6.0.x（建議釘死版本，不要用 latest）
FROM emscripten/emsdk:6.0.9

USER root
# 2) 在 image build 階段預先編譯 std / std.compat 的 BMI
RUN set -eux; \
    SYSROOT="$(em-config CACHE)/sysroot"; \
    mkdir -p /opt/cpp-modules/c++23; \
    emcc -std=c++23 -Wno-reserved-module-identifier --precompile \
         "$SYSROOT/share/libc++/v1/std.cppm" \
         -o /opt/cpp-modules/c++23/std.pcm; \
    emcc -std=c++23 -Wno-reserved-module-identifier --precompile \
         -fmodule-file=std=/opt/cpp-modules/c++23/std.pcm \
         "$SYSROOT/share/libc++/v1/std.compat.cppm" \
         -o /opt/cpp-modules/c++23/std.compat.pcm; \
    chmod -R a+rX /opt/cpp-modules
# 3) 其餘（bits/stdc++.h、stdin_lib.js、sandbox_user）維持原樣
```

`backend/services/build.py` 端只要按版本附加旗標（**以下為提案，尚未套用**）：

```python
# services/build.py
MODULE_FLAGS: dict[str, list[str]] = {
    "c++23": [
        "-fmodule-file=std=/opt/cpp-modules/c++23/std.pcm ",
        "-fmodule-file=std.compat=/opt/cpp-modules/c++23/std.compat.pcm ",
    ],
}

cmd = (...) + " ".join(
    [
        f"-std={cpp_version} ",
        ...
    ]
    + MODULE_FLAGS.get(cpp_version, [])
)
```

**旗標相容性檢查（重要）**：BMI 與使用端 TU 的 LangOptions 必須相容，我對照了 clang 的 `LangOptions.def`：

| 目前用的旗標 | 對 BMI 的影響 |
|---|---|
| `-std=c++23` | **Compatible 類，必須一致** → precompile 時務必也用 `-std=c++23` |
| `-ftemplate-depth=50` | `InstantiationDepth` 標為 **Benign**，不影響模組相容性 |
| `-fconstexpr-depth=50` | `ConstexprCallDepth` 標為 **Benign**，同上 |
| `-fmacro-backtrace-limit=10` | 純診斷輸出，無影響 |
| 所有 `-sXXX` | 連結期設定，無影響 |
| 未設定 exceptions / RTTI 覆寫 | 與 precompile 時的 emcc 預設一致 ✅ |

也就是說，只要 `-std` 對上、同一個 image 內同一個 clang，就不會有 BMI 不相容問題。

**配套事項**

1. `backend/settings.py:101` 的 `BUILD_VERSION`（預設 `"0.1.0"`）要往上升——它參與 `BuildRequest.hash()`，不升的話舊的失敗結果/快取不會失效。
2. `backend/services/build.py:31` 目前把 image 寫死成 `:latest`。建議改成可由 settings 指定的釘死 tag，避免 pool 容器在滾動更新期間新舊混用（舊容器沒有 `/opt/cpp-modules` 會直接編譯失敗）。
3. Image 體積會增加：`std.pcm` 通常落在數十 MB 等級（實際數字我在這個環境無法量測，**需要實測確認**）。
4. 若日後前端要開放 C++26，就多做一組 `/opt/cpp-modules/c++26/`。

**升級 5.0.2 → 6.0.x 的相容性風險**（我讀了 5.0.3 ~ 6.0.9 的 ChangeLog，跟本專案有關的項目）：

| 變更 | 對本專案的影響 |
|---|---|
| 6.0.0：瀏覽器最低版本上調（Chrome 74→85、Firefox 68→79、Safari 12.2→14.1） | 產出的 JS/wasm 不再支援極舊瀏覽器，需確認可接受 |
| 6.0.0：`FAKE_DYLIBS` 預設關閉、`-shared` 產生真正的 side module | 本專案沒用 `-shared`，無影響 |
| 5.0.5：C++ 例外一律以 `CppException` 物件拋出 | 前端若有解析例外訊息的邏輯要看一下 |
| 5.0.3：`FS.write` 只吃 TypedArray | 本專案 `-sFILESYSTEM=0`，無影響 |
| `MODULARIZE` / `EXPORT_NAME` / `--js-library` / `STACK_SIZE` / `ALLOW_MEMORY_GROWTH` | 這些旗標在 5.0.2→6.0.9 之間沒有破壞性變更；但 `backend/assets/worker.js` 與 `stdin_lib.js` 仍建議跑一次完整回歸 |

### 方案 B：不升級 Emscripten，自行把 libc++ modules 目錄「backport」進 5.0.2 的 sysroot

做法是從對應版本的 llvm-project / Emscripten 取出 `std.cppm`、`std.compat.cppm` 與 `std/*.inc`、`std.compat/*.inc`，複製進 5.0.2 的 sysroot 再 precompile。

- 優點：不動 Emscripten 版本，避開上面那張相容性風險表。
- 缺點：`.inc` 分割檔是**跟著 libc++ 版本走的**（它們用 `_LIBCPP_HAS_*` 特性巨集決定匯出哪些名稱）。從較新的 LLVM 抓 `.inc` 配上較舊的 libc++ 標頭，很容易出現「匯出了這個 libc++ 版本還不存在的實體」而編譯失敗。要正確做，必須找到與 emsdk 5.0.2 內 libc++ **完全相同 revision** 的 modules 目錄。
- 評價：技術上可行但脆弱、維護成本高，而且等於自行維護一份上游已經做好的東西。**不建議**，除非升級 Emscripten 被判定風險太高。

### 方案 C：暫時不支援，但把錯誤訊息做得友善

在 `backend/router/build.py` 既有的錯誤清洗邏輯（`re.sub(r"emcc: error:...")`）旁邊，偵測 `module 'std' not found`，回一句明確說明，例如：「目前後端 Emscripten 版本尚不支援 `import std;`，請改用 `#include <...>`；C++23 的其他語言特性可正常使用。」

- 優點：改動最小、零風險，馬上改善使用者體驗。
- 缺點：沒有真的解決問題。
- 評價：**適合當作方案 A 上線前的過渡**。

#### 關於「自動把 `import std;` 換成 `#include <bits/stdc++.h>`」的 shim 想法

技術上可行（image 內已經有自製的 `bits/stdc++.h`，來自 `inner/` 那層），而且語意上「include 全部標頭」是「`import std;`」的超集合，多數競程程式碼會直接通過。但我**不建議**把它做成預設行為：

- 需要用正則改寫使用者原始碼，容易誤判字串/註解中的 `import std;`，也會讓錯誤訊息的行號對不上（除非用等長空白替換該行）。
- image 內那份 `bits/stdc++.h` 是 GCC 來源、且**沒有涵蓋 C++23 標頭**（缺 `<print>`、`<expected>`、`<flat_map>`、`<mdspan>`、`<spanstream>`、`<stdfloat>`），而 `import std;` 的使用者十之八九是要用 `std::print`——shim 反而會在下一行炸掉。（順帶一提：`<print>`、`<expected>`、`<flat_map>`、`<mdspan>` 在 5.0.2 的 libc++ 就已經有了，只有 `<generator>` 連 6.0.9 都還沒有。）
- 它是「看起來支援了，其實是另一套語意」，日後要切換到真 module 會留下技術債。

---

## 5. 建議執行順序

1. **短期（今天就能做）**：套用方案 C 的友善錯誤訊息。
2. **中期（主線）**：在 `safe-cpp2wasm` repo 升級到 `emscripten/emsdk:6.0.9`（或 6.0.1+ 的任一釘死版本）並加上 precompile 步驟 → 重建並推 image（**建議推一個新 tag，例如 `:emsdk-6.0.9`，不要只覆蓋 `latest`**）→ `build.py` 加 `-fmodule-file=` 與 image tag 設定 → 升 `BUILD_VERSION` → 部署。
3. **驗證清單**：
   - [ ] `docker run --rm <new-image> emcc -v` 顯示 6.0.x
   - [ ] `ls $(em-config CACHE)/sysroot/share/libc++/v1/std.cppm` 存在
   - [ ] `/opt/cpp-modules/c++23/std.pcm` 存在且 `sandbox_user` 可讀
   - [ ] `import std; int main(){ std::print("Hello, world!\n"); }` 用完整的生產旗標（含 `-sFILESYSTEM=0`、`--js-library /tmp/stdin_lib.js`、`-sMODULARIZE=1` 等）編譯成功並在 worker 內跑出正確輸出
   - [ ] C++98 / 14 / 17 / 20 舊題目回歸測試（確認升級沒有打壞既有行為）
   - [ ] stdin 互動輸入（`stdin_lib.js` 路徑）仍正常
   - [ ] 量測 image 體積增量與冷啟動時間，確認 `DOCKER_POOL_SIZE=15` 的記憶體/磁碟仍在預算內

---

## 6. 即使修好也**不會**支援的東西

- **使用者自訂 module**（`export module foo;` 搭配多個 TU）：目前的編譯流程是單檔、單次 `emcc` 呼叫，沒有 `clang-scan-deps` 的相依掃描與兩階段建置。單檔提交本來也寫不出多 TU 模組，所以影響很小，但值得在文件寫清楚。
- **Header units**（`import <vector>;`）：需要對每個標頭做 `-fmodule-header` 預編譯，成本高、收益低，建議明確不支援。
- **`<generator>`**：libc++ 到 Emscripten 6.0.9 都還沒實作，`import std;` 也拿不到 `std::generator`。

---

## 7. 調查方法與限制

- 本次調查在 remote session 中進行，**容器內沒有 docker daemon、沒有 emscripten**，因此無法實際重現編譯或量測 `.pcm` 大小/編譯耗時。
- 版本判定是透過 GHCR / Docker Hub 的 registry API 比對 image config 與 layer digest 得到的，屬於可重複驗證的硬證據（digest 完全相同）。
- 上游行為（安裝路徑、旗標、是否需要連結額外 object）皆取自 Emscripten 原始碼與其官方測試，非憑印象推測。
- 唯一未能親手驗證的環節：升級後在本專案完整旗標組合下的實際編譯結果。上線前請務必跑第 5 節的驗證清單。

---

## 8. 參考資料

- [emscripten-core/emscripten PR #27065 — C++23 std modules 支援](https://github.com/emscripten-core/emscripten/pull/27065)（2026-06-15 合併，首見於 6.0.1）
- [emscripten-core/emscripten Issue #21143 — C++ 23 module support & import std](https://github.com/emscripten-core/emscripten/issues/21143)（由 #27065 關閉）
- [emscripten-core/emscripten Issue #23674 — CMake + Emscripten 編譯 C++23 module](https://github.com/emscripten-core/emscripten/issues/23674)
- [Modules in libc++ — libc++ 官方文件](https://releases.llvm.org/17.0.1/projects/libcxx/docs/Modules.html)
- [Standard C++ Modules — Clang 官方文件](https://clang.llvm.org/docs/StandardCPlusPlusModules.html)
- [llvm/llvm-project Issue #73089 — Please consider installing `std.cppm` in libc++](https://github.com/llvm/llvm-project/issues/73089)
- [Using the C++23 std Module with Clang 18 — 0xStubs](https://0xstubs.org/using-the-c23-std-module-with-clang-18/)
- Emscripten `ChangeLog.md`（5.0.3 ~ 6.0.9 區段）、`tools/system_libs.py`、`cmake/Modules/Platform/Emscripten.cmake`、`test/test_other.py::test_cxx_import`
