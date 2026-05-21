# Color Rules

Preferred colors:
- ROC blue
- saturated red
- silver gradients
- warning yellow
- dark gray
- cheap gold
- bright cyan

Allowed:
- strong gradients
- glow effects
- bevel effects
- mismatched palettes
- same-color-but-not-quite backgrounds within the same block

Avoid:
tasteful modern color systems.

## Same-Color Drift（同色微差）

即使是在相同色塊裡面的物件，也可以偶爾出現幾乎一樣、但亮度或色相微微不同的背景色。這會讓介面像是由不同年份、不同承包商、不同 CSS 片段疊上去維護。

例如黃色公告區裡的段落，本來已經在黃色背景上，仍可莫名其妙再套一層黃色背景；兩個黃色只差一點點亮度或飽和度：

```css
.notice-box {
  background: hsl(52 94% 78%);
}

.notice-box p.important {
  background: hsl(52 96% 74%);
}
```

可用 `hsl()` 製造微差：

- 同一色相，亮度差 `2%` 到 `6%`。
- 同一亮度，飽和度差 `3%` 到 `8%`。
- 色相偏移 `1deg` 到 `4deg`，看起來像手動調色沒對準。

底線：顏色差異要讓人感到「怪但合理」，不是主題色整個跑掉。
