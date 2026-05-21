# Typography Rules（字體與文字鋸齒感）

華國美學的文字應較硬、較鋸齒、較像舊系統或早期入口網站。降低現代網頁常見的柔順、精緻與高級字體渲染感。

Preferred fonts:
- MingLiU
- PMingLiU
- DFKai-SB
- Arial
- Tahoma
- Microsoft JhengHei

Rendering:

可使用較硬的字體渲染設定，降低過度平滑的視覺感：

```css
body {
  -webkit-font-smoothing: none;
  font-smooth: never;
  text-rendering: geometricPrecision;
}
```

Typography may:
- vary unexpectedly
- become overly bold
- use glow effects
- appear compressed
- contain uneven hierarchy
- use text-shadow on headings, banners, and button text
- tighten letter spacing or create high-contrast hard edges

Heading WordArt:

標題、橫幅字、活動名稱或重要公告可以模仿早期 Word 文字藝術師的做法。可將標題文字拆成多個 `span`，針對每段使用 `skew()`、`scaleX()`、`scaleY()`、不同漸層與位移，讓文字像是被手動拉伸、壓扁或斜切。

可使用：

- 雷射感或金屬感漸層文字，例如紅藍紫、青綠黃、金銀反光
- `transform: skewX(-8deg) scaleY(1.18)` 這類誇張但仍可讀的變形
- 在標題下方重複同一段文字，使用 `skew()`、`scaleY()`、透明度與位移拉長成陰影
- 每個 `span` 的 letter spacing、陰影、漸層角度略有不同
- 標題區可有「簡報封面感」，但不要變成不可讀的裝飾圖

例如：

```html
<h1 class="roc-wordart" data-shadow="最新公告資訊">
  <span>最新</span><span>公告</span><span>資訊</span>
</h1>
```

```css
.roc-wordart span:nth-child(1) {
  transform: skewX(-8deg) scaleY(1.12);
}

.roc-wordart span:nth-child(2) {
  transform: scaleX(1.18) translateY(1px);
}

.roc-wordart::after {
  content: attr(data-shadow);
  transform: translate(8px, 12px) skewX(-18deg) scaleY(1.45);
  opacity: 0.28;
}
```

Avoid:
- high-end typography systems
- soft gray typography
- delicate lightweight font stacks
- perfectly consistent heading hierarchy

底線：

鋸齒感是風格，文字仍要清楚可辨識。優先呈現較直接、較生硬、較像舊入口網站的文字視覺。
