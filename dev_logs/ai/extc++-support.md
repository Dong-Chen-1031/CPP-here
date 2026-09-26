> 以下為使用 Claude 進行之可行性研究報告，未使用其生成程式碼，單純進行詢問並作為參考

claude --resume a2d82789-bb8e-4e0d-9c0d-f628f14bb15f

# 支援 `#include <bits/extc++.h>` — 可行性研究報告

日期：2026-09-10 ｜ 對應 TODO：`[ ] #include <bits/extc++.h>`

## 結論

**可行，而且成本很低。** 已在本機用 `ghcr.io/dong-chen-1031/safe-cpp2wasm:latest` 實測通過：
pb_ds 全套（`tree` / `gp_hash_table` / `cc_hash_table` / `priority_queue` / `trie`）可以在 emcc + libc++ 下正常編譯與執行，
只需要在 safe-cpp2wasm 的 `docker/inner/` overlay 再加 **4 個手寫 shim 檔 + 6 個從 libstdc++ 直接複製的檔案 + `ext/pb_ds/` 整棵樹**。

需要付出的代價：`bits/extc++.h` 只能是**部分相容**（pb_ds 完整支援，rope / vstring / slist 等 libstdc++ 專屬容器不支援，見「做不到的部分」）。
對競程使用者來說這剛好涵蓋 99% 的實際用途（ordered_set / gp_hash_table）。

---

## 為什麼現在不行

- `bits/extc++.h` 是 **GCC libstdc++ 專屬**的 header，內容是「把所有 `ext/*` 擴充一次 include 進來」。
- 我們的編譯環境是 **emscripten = clang + libc++**，libc++ 沒有 `__gnu_cxx` / `__gnu_pbds` 這些擴充。
- 現有的 `bits/stdc++.h` 之所以能用，是因為 safe-cpp2wasm 在 `docker/inner/bits/stdc++.h` 放了一份「只是一堆標準 include」的 shim
  （見 `docker/dockerfile` 把 `inner/` 複製到 `/emsdk/upstream/emscripten/cache/sysroot/include/c++/v1/`）。
  但 `extc++.h` 沒辦法比照辦理 —— 它要 include 的東西**根本不存在**，不是換個名字就好。

好消息是：**pb_ds 是純 header-only 的 template library**，它對 libstdc++ 內部的依賴其實很淺。
把 `ext/pb_ds/` 整棵樹搬過來、再補上它需要的幾個內部 header 與巨集定義，clang + libc++ 就能吃。

---

## 做法

在 builder image 裡（emscripten/emsdk 基底是 Ubuntu 24.04，**本來就裝了 `libstdc++-13-dev`，路徑 `/usr/include/c++/13`**）
把 libstdc++ 的 pb_ds 相關 header 複製進 libc++ 的 include 目錄，並補 4 個 shim。

### 需要的檔案（放進 `docker/inner/`）

| 檔案 | 來源 | 說明 |
|---|---|---|
| `ext/pb_ds/**`（約 240 檔） | 從 `/usr/include/c++/13/ext/pb_ds` 複製 | 主體，原封不動 |
| `ext/type_traits.h`、`ext/typelist.h`、`ext/numeric_traits.h` | 同上複製 | pb_ds 直接相依 |
| `bits/cpp_type_traits.h` | 複製 + **1 行 patch** | 見下方相容性修補 2 |
| `bits/requires_hosted.h` | 同上複製 | 原封不動 |
| `tr1/type_traits` | 同上複製 | pb_ds `type_utils.hpp` 需要 |
| `bits/c++config.h` | **手寫 shim** | 最關鍵，見下方 |
| `bits/extc++.h` | **手寫 shim** | 對外的門面 |
| `tr1/functional` | **手寫 shim** | pb_ds 只用到 `std::tr1::hash` |
| `debug/debug.h` | **空檔** | `_GLIBCXX_DEBUG_*` 已在 c++config 定義成 no-op |

`ext/`、`bits/` 目錄在 libc++ 已存在（`ext/hash_map`、`bits/stdc++.h`），
但**沒有檔名衝突**，`tr1/`、`debug/` 則完全不存在。已實測不會弄壞 libc++ 原本的 `ext/hash_map`。

### 三個關鍵的相容性修補

1. **inline namespace 對齊**（最重要的一招）
   libstdc++ header 會用 `namespace std { _GLIBCXX_BEGIN_NAMESPACE_VERSION ... }` 把宣告塞進 `std`，
   但 libc++ 的東西實際上住在 `std::__2`（ABI inline namespace）。直接塞會撞成 ambiguous（`std::iterator_traits` 有兩個候選）。
   解法是把巨集定義成展開到 libc++ 自己的 ABI namespace：

   ```cpp
   #define _GLIBCXX_BEGIN_NAMESPACE_VERSION inline namespace _LIBCPP_ABI_NAMESPACE {
   #define _GLIBCXX_END_NAMESPACE_VERSION }
   ```

   這樣 libstdc++ 的前置宣告就會和 libc++ 的定義**合併**而不是打架。

2. **`std::byte` 例外**
   libc++ 把 `std::byte` 定義在 `std` 而**不是** `std::__2`，所以 `bits/cpp_type_traits.h` 裡那行前置宣告
   `enum class byte : unsigned char;` 會變成 ambiguous。直接 sed 刪掉那一行即可（`<cstddef>` 已經提供真正的定義）。

3. **libstdc++ 專屬巨集**
   `__try` / `__catch` / `__throw_exception_again` / `__N()` / `_GLIBCXX_HOSTED` 等，
   在 c++config shim 裡補上對應定義（見下）。C++98 模式要把 `constexpr`/`noexcept` 系列巨集降級。

### `docker/inner/bits/c++config.h`（手寫）

```cpp
#pragma once
#include <__config>
#include <cstddef>
#include <cstdlib>
#define _GLIBCXX_VISIBILITY(V)
#define _GLIBCXX_BEGIN_NAMESPACE_VERSION inline namespace _LIBCPP_ABI_NAMESPACE {
#define _GLIBCXX_END_NAMESPACE_VERSION }
#define _GLIBCXX_BEGIN_NAMESPACE_CONTAINER
#define _GLIBCXX_END_NAMESPACE_CONTAINER
#define _GLIBCXX_STD_C std
#if __cplusplus >= 201103L
#  define _GLIBCXX_CONSTEXPR constexpr
#  define _GLIBCXX_USE_CONSTEXPR constexpr
#  define _GLIBCXX_NOEXCEPT noexcept
#  define _GLIBCXX_USE_NOEXCEPT noexcept
#else
#  define _GLIBCXX_CONSTEXPR
#  define _GLIBCXX_USE_CONSTEXPR const
#  define _GLIBCXX_NOEXCEPT throw()
#  define _GLIBCXX_USE_NOEXCEPT throw()
#endif
#define _GLIBCXX_NODISCARD
#define _GLIBCXX_THROW_OR_ABORT(E) (throw (E))
#define _GLIBCXX_DEBUG_ASSERT(x)
#define _GLIBCXX_DEBUG_ONLY(x)
#define _GLIBCXX_DEBUG_VERIFY_AT(cond, msg, file, line)
#define __glibcxx_assert(x)
#define _GLIBCXX14_CONSTEXPR _GLIBCXX_CONSTEXPR
#define _GLIBCXX17_CONSTEXPR _GLIBCXX_CONSTEXPR
#define _GLIBCXX20_CONSTEXPR _GLIBCXX_CONSTEXPR
#define _GLIBCXX_PURE
#define _GLIBCXX_CONST
#define _GLIBCXX_NORETURN
#define _GLIBCXX_HOSTED 1
#define __N(msgid) (msgid)
#define __try try
#define __catch(X) catch(X)
#define __throw_exception_again throw
```

### `docker/inner/bits/extc++.h`（手寫）

```cpp
#pragma once
#include <bits/stdc++.h>
#include <ext/pb_ds/assoc_container.hpp>
#include <ext/pb_ds/priority_queue.hpp>
#include <ext/pb_ds/exception.hpp>
#include <ext/pb_ds/hash_policy.hpp>
#include <ext/pb_ds/list_update_policy.hpp>
#include <ext/pb_ds/tree_policy.hpp>
#include <ext/pb_ds/trie_policy.hpp>
#include <ext/typelist.h>
#include <ext/type_traits.h>
#include <ext/numeric_traits.h>
```

### `docker/inner/tr1/functional`（手寫）

```cpp
#pragma once
#include <functional>
namespace std { namespace tr1 {
  using std::hash; using std::equal_to; using std::less; using std::greater;
} }
```

### `docker/dockerfile` 修改

在 `COPY inner/ ...` **之前**加上（用 image 內建的 libstdc++-13 當來源，不必把 GPL 檔案 commit 進 repo）：

```dockerfile
ARG GCC_INC=/usr/include/c++/13
ARG V=/emsdk/upstream/emscripten/cache/sysroot/include/c++/v1

RUN set -eux; \
    apt-get update && apt-get install -y --no-install-recommends libstdc++-13-dev && \
    rm -rf /var/lib/apt/lists/*; \
    mkdir -p ${V}/ext ${V}/bits ${V}/tr1 ${V}/debug; \
    cp -r ${GCC_INC}/ext/pb_ds ${V}/ext/; \
    cp ${GCC_INC}/ext/type_traits.h ${GCC_INC}/ext/typelist.h ${GCC_INC}/ext/numeric_traits.h ${V}/ext/; \
    cp ${GCC_INC}/bits/cpp_type_traits.h ${GCC_INC}/bits/requires_hosted.h ${V}/bits/; \
    cp ${GCC_INC}/tr1/type_traits ${V}/tr1/; \
    sed -i 's/^  enum class byte : unsigned char;$//' ${V}/bits/cpp_type_traits.h; \
    : > ${V}/debug/debug.h

# 原本這行會把手寫的 c++config.h / extc++.h / tr1/functional 蓋上去
COPY inner/ /emsdk/upstream/emscripten/cache/sysroot/include/c++/v1/
```

> 注意順序：`COPY inner/` 要放在複製 libstdc++ 之後，手寫 shim 才會贏。
> 另一個選項是把那些 libstdc++ 檔案直接 vendor 進 repo（可重現性更好，但要處理授權，見下）。

---

## 實測結果

測試環境：本機 arm64 Docker，`ghcr.io/dong-chen-1031/safe-cpp2wasm:latest`。
測試碼涵蓋 `tree`（ordered_set / ordered_map、`find_by_order`、`order_of_key`）、
`gp_hash_table`、`cc_hash_table`、`__gnu_pbds::priority_queue`（pairing heap + `modify`）、`trie`（`prefix_range`）。

| 項目 | 結果 |
|---|---|
| C++14 / 17 / 20 / 23 | ✅ 編譯通過、輸出正確 |
| C++98 | ✅ 通過（pb_ds 部分功能本來就需 C++11 語法，但 header 本身可編） |
| 用 `backend/services/build.py` 的**完整正式 flag**（含 `-ftemplate-depth=50`、`-sFILESYSTEM=0`、`--js-library`） | ✅ 通過，`-ftemplate-depth=50` 沒有被 pb_ds 撐爆 |
| 回歸：原本的 `#include <bits/stdc++.h>` | ✅ 不受影響 |
| 回歸：libc++ 自己的 `ext/hash_map` | ✅ 不受影響 |
| 壓力：ordered_set 20 萬次 insert + find_by_order | ✅ 正確，wasm 執行 < 0.1s |

編譯時間（單檔、冷 cache、arm64）：

| 內容 | 時間 |
|---|---|
| `#include <bits/stdc++.h>` + 空 main（基準） | 503 ms |
| `#include <bits/extc++.h>` + 空 main | 558 ms |
| 完整 pb_ds 測試碼（c++17） | 630 ms |
| 完整 pb_ds 測試碼（c++20 / c++23） | 844 / 940 ms |

**只 include 不用的話，額外成本約 +55ms**，對 30s timeout 與 build cache 來說可以忽略。

---

## 做不到的部分（要在文件講清楚）

真正的 `bits/extc++.h` 還會 include 這些，它們跟 libstdc++ 的 `basic_string` / allocator / iostream 內部**深度綁死**，
移植到 libc++ 的成本遠高於收益，建議**不支援**：

- `ext/rope`、`ext/vstring.h`、`ext/slist`、`ext/rb_tree`
- 各種 allocator：`ext/mt_allocator.h`、`ext/pool_allocator.h`、`ext/bitmap_allocator.h`、`ext/throw_allocator.h` …
- `ext/stdio_filebuf.h`、`ext/stdio_sync_filebuf.h`、`ext/concurrence.h`、`ext/pointer.h`
- `ext/numeric`（`__gnu_cxx::power`）、`ext/algorithm`、`ext/functional`、`ext/memory`
  — 這幾個相依較淺，如果有人真的要，之後可以個別再補

實測已確認 `__gnu_cxx::power` 目前不可用（error: no member named 'power'）。
競程用途中真正常見的只有 pb_ds，其次是 `rope`（罕見），所以現況已足夠。

---

## 其他要一起改的地方

1. **前端自動補全**：`frontend/src/config/cppKeywords.ts:270` 目前只有 `"bits/stdc++.h"`，
   可加 `"bits/extc++.h"`、`"ext/pb_ds/assoc_container.hpp"`、`"ext/pb_ds/tree_policy.hpp"`、
   以及 `__gnu_pbds`、`tree_order_statistics_node_update`、`find_by_order`、`order_of_key`、`gp_hash_table` 等關鍵字。
2. **docs**：在 `docs/content` 補一頁說明「支援 pb_ds，但不支援 rope/vstring」。
3. **build cache**：不受影響（hash 是對原始碼算的），但**換 builder image 後舊 cache 仍有效**，
   如果之前有人的程式因為 extc++ 編譯失敗被 cache 起來，要確認失敗結果沒有被快取（目前 `BuildError` 路徑看起來不寫 cache，值得再確認一次）。
4. **授權**：pb_ds header 是 GPLv3 + GCC Runtime Library Exception。
   編譯產物沒問題（Runtime Library Exception 就是為此存在），但如果把這些檔案**vendor 進 safe-cpp2wasm repo**，
   就是在散布 GPLv3 原始碼：要保留原始 header 的授權聲明，並在 repo 的 LICENSE/README 註明這部分不是 MIT。
   用 Dockerfile 在 build 時複製（上面的做法）比較單純 —— 但 image 內含這些檔案，本質上仍是散布，
   同樣建議在 README 標注來源與授權。（現有的 `inner/bits/stdc++.h` 其實已經是同樣情況。）

---

## 建議的落地步驟

- [ ] 在 safe-cpp2wasm 加 `docker/inner/bits/c++config.h`、`docker/inner/bits/extc++.h`、`docker/inner/tr1/functional`、`docker/inner/debug/debug.h`
- [ ] 改 `docker/dockerfile`（複製 libstdc++ pb_ds → 再 `COPY inner/`）
- [ ] 加一支 `test/pb_ds.cpp` 進 `test.sh`
- [ ] 重 build / push image，`docker/backend/docker-compose.yml` 的 `wasm-builder` 會自動拉到新版
- [ ] C++ Here 這邊：更新 `cppKeywords.ts` + docs
- [ ] 更新 README「已知限制」：extc++.h 只支援 pb_ds 子集

驗證用的實驗腳本與測試碼（可直接重跑）在本次工作的暫存目錄：
`/private/tmp/claude-501/-Users-dong-Documents-Code-FullStack-CPP-here/a2d82789-bb8e-4e0d-9c0d-f628f14bb15f/scratchpad/exp/`
（`mkshim.sh` 產生 shim、`final.sh` 是完整驗證含回歸測試、`t2.cpp` / `t98.cpp` 是測試碼）
