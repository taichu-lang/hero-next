# Streamdown 内容定制（代码块、表格与排版节奏）

这份文档记录 `core/styles/base.css` 里 Streamdown 渲染定制的来龙去脉：代码块和表格**同一个问题的两份实例**——「双层容器各带一层边框」；官方 `@source` 在 monorepo 里的**层级选择**；以及分割线 / 引用 / 链接 / 标题的**排版节奏**对齐。还有为什么只能用 CSS 覆盖（而不是 `components` prop）、为什么这些规则**不能放进任何 `@layer`**。目的是下次改这些样式、升级 streamdown 或排查"样式时灵时不灵"的问题时直接看这里。

依赖版本：`streamdown` 2.6.0。**下文引用的组件结构都从 2.6.0 的构建产物里核对过，streamdown 升级后需要重新确认（见第 9 节）。**

---

## 1. 共同问题：双层容器，两层边框

Streamdown 给代码块和表格渲染的都是「带边框的外层容器 + 带边框的内层内容区」，视觉上就是盒子套盒子。

**代码块：**

```
div[data-streamdown="code-block"]        ← 外层容器
│   默认类: my-4 flex w-full flex-col gap-2 rounded-xl border border-border bg-sidebar p-2
│   内联样式: content-visibility:auto; contain-intrinsic-size:auto 200px   (流式渲染优化，保留)
│
├── div[data-streamdown="code-block-header"]   ← 语言标签行
│     默认类: flex h-8 items-center text-muted-foreground text-xs
│     └── span.ml-1.font-mono.lowercase       ← 语言名（如 ts）
│
└── div[data-streamdown="code-block-body"]     ← 内层代码区，第二层边框的来源
      默认类: overflow-x-auto rounded-md border border-border bg-background p-4 text-sm
      内联样式: max-height:400px（codeBlockMaxHeight 默认值，超出内部滚动）
      └── pre > code > span(每行) > span(每个 token)
```

**表格：**

```
div[data-streamdown="table-wrapper"]
│   默认类: my-4 flex flex-col gap-2 rounded-lg border border-border bg-sidebar p-2
│
├── (controls 区域，controls={false} 时不渲染)
│
└── div                                    ← 内层滚动容器，第二层边框；注意没有 data-streamdown 属性！
    │   默认类: border-collapse overflow-x-auto overflow-y-auto rounded-md border border-border bg-background
    │   内联样式: max-height:300px（tableMaxHeight 默认值）
    │
    └── table[data-streamdown="table"]     默认类: w-full divide-y divide-border
        ├── thead[table-header]            默认类: bg-muted/80
        │   └── th[table-header-cell]      默认类: whitespace-nowrap px-4 py-2 text-left font-semibold text-sm
        └── tbody[table-body]              默认类: divide-y divide-border
            └── tr[table-row]              默认类: border-border
                └── td[table-cell]         默认类: px-4 py-2 text-sm
```

顺带一提，`bg-sidebar` / `text-muted-foreground` 这些是 shadcn 系的 token，HeroUI 里**根本不存在**（HeroUI 的语义 token 见 `@heroui/styles/dist/themes/shared/theme.css`），所以在本项目里它们永远不会生成。

---

## 2. 为什么只能用 CSS 覆盖，不能用 `components` prop

`ChatMessageList` 里已经用 `components` prop 定制了 `h1`/`h2`/`h3`/`p`（换成 HeroUI Typography），但代码块和表格走不通这条路，原因在 streamdown 的合并逻辑：

```js
// streamdown 源码（构建产物反解）：
let { inlineCode: k, ...A } = components ?? {};
let Z = { ...xn, ...A };   // xn 是默认组件表，A 是用户组件 —— 整键替换，没有部分定制
```

- `components.code` / `components.table` 都是**整个替换**默认组件（含 mermaid 分支、语言解析、控件组装），要接手就得自己重新拼渲染管线；
- 内部组件里容器和 header 虽然从包里导出了，但**带高亮的 body（`HighlightedCodeBlockBody`）没有导出**，只导出了个 loading 骨架；
- 给 `code` 传 `className` 也没用：它被转发到 body 的 className，且在 tailwind-merge 里排在默认类**前面**，冲突时后面的默认类（`border border-border` 等）赢。

所以唯一的路径是 CSS 覆盖。好在 streamdown 给每个内部节点都打了稳定的 `data-streamdown` 属性（`code-block` / `code-block-header` / `code-block-body` / `inline-code` / `table-wrapper` / `table` / `table-header` / `table-header-cell` / `table-body` / `table-cell` / `horizontal-rule` / `blockquote` / `link` 等），这就是官方留的样式定制口子。唯一的例外是表格的内层滚动容器——它没有属性，只能用 `:has(> [data-streamdown="table"])` 选到（见第 6 节）。

---

## 3. 样式生成：官方 `@source` 与 monorepo 的层级选择

Streamdown 的样式不是独立 CSS 文件，而是编译进 dist 的 Tailwind 类。官方安装要求在 globals.css 加一行 `@source` 指向它的 dist——Tailwind 不会自动扫描 node_modules，没有这行就一个类都不会生成。

**曾经的状态（本项目早期问题的根源）**：两个应用的 globals.css 都没加，streamdown 的类只能"搭便车"——恰好也被项目里其它被扫描文件用到的类（`border`、`rounded-xl`、`p-4`、`bg-background`、`divide-y`……）才生成。根元素 `space-y-4` 的块间距、分割线 `my-6`、行号计数器、shiki 变量类全部缺席，这就是"p → 分割线 → h2 挤在一起"的直接原因；而且哪些类生成取决于无关代码，随一次改动就会漂移。

**加在哪一层**：streamdown 是 hero-next 的依赖，对 web / app 是**传递依赖**，所以 `@source` 由 hero-next 自己声明——写在 `core/styles/base.css` 顶部：

```css
@source "../../node_modules/streamdown/dist/*.js";
```

理由与验证：

- 两个应用都 `@import "hero-next/base.css"`，导入即继承；应用不需要知道 hero-next 内部的 node_modules 布局，路径始终相对 hero-next 自己，不受应用侧目录结构或依赖提升（hoisting）影响；
- 已验证 Tailwind v4 会处理**被 `@import` 的文件里的 `@source`**，且相对路径以**声明文件**为基准（不是入口 globals.css）：用两个应用各自的 postcss + `@tailwindcss/postcss` 管线编译，streamdown 独有的类（`text-[var(--sdm-c,inherit)]` 系列、`before:content-[counter(line)]`、`space-y-4`）在两边产物里都出现，且两个产物字节数一致；
- 如果 Tailwind 将来不再支持导入文件里的 `@source`，回退方案是在两个应用的 globals.css 里各写一行（app：`@source "../../node_modules/hero-next/node_modules/streamdown/dist/*.js"`，web 同理改相对层级），缺点是把 hero-next 的内部布局复制进了每个应用。

**生成之后的剩余事实**：不存在的 token 依旧不生成——`bg-sidebar`、`text-muted-foreground`、`border-muted-foreground/30`、`text-primary`（链接色，HeroUI 没有 primary）。这些元素的 HeroUI 对齐靠第 7 节的覆盖规则。显式覆盖的原则不变：要改的属性显式写，不指望默认类缺席——尤其现在 `border-border`、`bg-background`、`bg-muted/80` 这类**存在的** token 类真的会生成了，覆盖规则从"防御性"变成了"承重"。

**连带暴露的旧 bug（2026-10 已修）**：`@source` 让 streamdown 的 `dark:text-[var(--shiki-dark,…)]` 成了这两个工程里**第一批** `dark:` 工具类——此前一个都没有，HeroUI 靠 `.dark` 作用域下的 CSS 变量做暗色，不用 `dark:` 变体——于是 globals.css 里 `@custom-variant dark (&: is(.dark *))` 冒号后多出的那个空格当场爆雷：`: is(...)` 是非法伪类语法，Tailwind 按原文内插产出，web 的 `next dev` 在 CSS 解析阶段直接报 `Invalid token in pseudo element: WhiteSpace(" ")`。已修正为 `&:is(.dark *)`（Tailwind 官方写法）。教训：`@custom-variant` 的选择器是原文内插的，多一个空格就是非法 CSS；之前没触发只是因为从未有类用到这个变体。

---

## 4. 关键：这些规则必须放在所有 `@layer` 之外

`base.css` 里其它组件样式都写在 `@layer components` 里，唯独这一段不行，原因是 CSS 级联的判定顺序：

```
来源/重要性 → cascade layer 顺序 → specificity → 源顺序
```

Tailwind v4 的 `@import "tailwindcss"` 定义了 `@layer theme, base, components, utilities`，streamdown 的类全在 **utilities layer**。layer 的先后**先于** specificity 判定——`@layer components` 里的规则无论选择器多具体，都会输给 utilities layer 里的单类选择器 `.border`。而**不属于任何 layer 的规则优先级高于所有 layered 规则**。

所以这段 CSS 刻意不包 `@layer`，并留了注释警告。如果有人「顺手」把它挪进 `@layer components`，`border-0` 会立刻输给 `.border`，双边框原地复活。第 3 节的 `@source` 就位后 streamdown 类**全量**生成，这条规则的重要性只增不减。

一个细化：`divide-*` 这类工具类编译出来是 `:where(...)` 包裹的（specificity 为 0），我们的 `@apply divide-separator/50` 展开后同样是 `:where()`——但因为**不在 layer 里**，依然稳赢 utilities layer 里的 `:where(.divide-border > ...)`。判定顺序是 layer 先于 specificity，` :where()` 的零 specificity 不影响这个结论。

同理，也不要试图「覆盖我的覆盖」时用 `@layer utilities` + 同优先级选择器——直接改这段就行。

---

## 5. 代码块方案：单层 HeroUI 表面

设计对齐 HeroUI 已有的代码样式规范（`@heroui/styles/dist/components/typography.css`）：

| 部分 | 实现 | 对齐的 HeroUI 依据 |
|---|---|---|
| 容器 | `rounded-xl bg-default` 单层表面，无边框，`p-0 gap-0 overflow-hidden` | `.typography-prose pre`：`rounded-xl bg-default p-4 font-mono text-sm leading-relaxed`（HeroUI 官方代码块就是无边的 `bg-default`） |
| 语言标签 | `text-muted text-xs` + `border-b border-separator/50` 发丝线 | HeroUI table header 的分隔线惯例：`border-b border-separator/50` |
| 代码区 | `border-0 rounded-none bg-transparent`，`px-4 py-3 font-mono text-sm leading-relaxed`，透明浮在容器表面 | 字体与行高同 `.typography-prose pre` |
| 行内代码 | `rounded-md bg-default px-1.5 py-0.5 font-mono text-sm text-foreground` | 与 `.typography--code` 逐字一致（顺带修掉 streamdown 默认拿文字色 token `bg-muted` 当背景的问题——该类现在真的会生成） |

细节：

- **无边框**是刻意的：HeroUI 的 prose 代码块就不带边框，靠 `bg-default`（比 `--background` 高一档的中性面）区分于页面背景。明暗主题全部走语义 token，自动适配。
- 容器 `overflow-hidden`：让 header 发丝线和 body 内部滚动条裁剪在圆角内。
- 无语言标注的代码块（` ``` ` 开头没写语言）：header 的 span 是空的，用 `[data-streamdown="code-block-header"]:has(span:empty) { display: none; }` 整行隐藏，不留空条。
- header 里 span 的 `ml-1` 清零，让语言标签和代码区的 `px-4` 左对齐。
- **行号关闭**：streamdown `lineNumbers` 默认 `true`，类全量生成后行号会出现；`ChatMessageList` 两处 `<Streamdown>` 都传了 `lineNumbers={false}`（理由与恢复方式见第 7 节）。
- 保留不动的东西：容器内联的 `content-visibility:auto`（流式渲染优化）、body 的 `max-height:400px` + `overflow-y-auto`（长代码内部滚动，行为来自 streamdown 的 `codeBlockMaxHeight` 默认值）。

---

## 6. 表格方案：透明 + 单边框 + HeroUI 表格细节

表格刻意**不设任何背景色**（与代码块的 `bg-default` 表面区分开），靠单层边框和内部分隔线撑起结构。设计对齐 HeroUI 表格组件（`@heroui/styles/dist/components/table.css`，参照其 secondary 无背景变体）：

| 部分 | 实现 | 对齐的 HeroUI 依据 |
|---|---|---|
| 外层 wrapper | `rounded-xl border border-border`，`bg-transparent p-0 gap-0 overflow-hidden`——唯一的边框 | 单边框替代原双层；表格不设背景 |
| 内层滚动容器 | `border-0 rounded-none bg-transparent`，保留它自己的 overflow 和内联 `max-height:300px` | 第二层边框移除 |
| 表头/表体分隔 | 表元素 `divide-y divide-separator/50`（落在 thead 的 border-bottom 上） | `.table__header { border-b border-separator/50 }` |
| 表头单元格 | `relative px-4 py-2.5 text-start text-xs font-medium text-muted`，去掉 `whitespace-nowrap` | 与 `.table__column` 逐字一致 |
| 列间短分隔线 | th 的 `::after`：`absolute end-0 top-1/2 h-4 w-px -translate-y-1/2 bg-separator`，最后一列不画 | HeroUI 表头标志性的短竖线分隔 |
| 行分隔线 | tbody `divide-y divide-separator/50`（替代默认的全强度 `divide-border`） | `.table__row { border-b border-separator/50 }`（secondary 变体行间线） |
| 单元格 | `px-4 py-3 align-middle text-sm` | 与 `.table__cell` 的节奏一致（不设背景） |

实现细节：

- **内层滚动容器没有 `data-streamdown` 属性**，用 `[data-streamdown="table-wrapper"] > div:has(> [data-streamdown="table"])` 选到。它是 wrapper 的直接子 div 且直接包含 table 元素；controls 开关只会影响它前面有没有按钮行，不影响这个选择器。
- **行分隔线的颜色靠 `@apply divide-separator/50`** 覆盖 streamdown 自带的 `divide-border`。divide 工具类编译为 `:where(父 > :not(:last-child))`（第 4 节的细化说明），靠 unlayered 稳赢；末行天然无边框（`:not(:last-child)`），与 HeroUI 行为一致。
- **表头背景**：streamdown 默认 `bg-muted/80`，类全量生成后会真的生效；`[data-streamdown="table-header"] { @apply bg-transparent }`（unlayered）把它压住，维持"表格无背景"。
- **不启用 hover 行高亮**：markdown 表格是非交互内容，HeroUI 的 hover 背景是给交互数据表的，而且会引入背景色。
- 边框折叠模型不用动：Tailwind preflight 已给 `table` 设 `border-collapse: collapse`，tr/tbody 的 divide 边框在 collapse 模式下正常渲染；HeroUI 自家用的 `border-separate` 是为了做圆角单元格，markdown 表格不需要。
- 保留不动的东西：滚动容器的 `overflow-x-auto`（宽表横向滚动）和内联 `max-height:300px`（长表内部滚动，来自 streamdown 的 `tableMaxHeight` 默认值）。

---

## 7. 排版节奏：分割线、引用、链接与标题

`@source` 就位后，streamdown 根元素的 `space-y-4` 就是它设计的阅读节奏：编译产物里它展开为 `:where(.space-y-4 > :not(:last-child))` 的 `margin-block-end`（相邻 margin 折叠后即 16px 基础间距）。在此之上，base.css 把几类元素的默认 token 换成 HeroUI prose 的处理：

| 元素 | 实现 | 对齐的 HeroUI 依据 |
|---|---|---|
| 分割线 | `my-8 border-separator` | `.typography-prose hr` |
| 引用 | `mt-4 border-s-4 border-border ps-4 text-muted italic` | `.typography-prose blockquote`（逐字） |
| 链接 | `text-link underline-offset-4`（streamdown 自带的 `font-medium underline` 直接用） | `.typography-prose a`：`font-medium text-link underline underline-offset-4` |
| 标题 | 组件覆盖里 `mt-8/mb-3`（h1）、`mt-6/mb-2`（h2/h3） | streamdown 自身的标题节奏意图 |

要点：

- **引用必须覆盖**：streamdown 的 `border-muted-foreground/30` token 不存在，边框色会回落到 `currentColor`（一整条文字色的 4px 粗竖线），比 HeroUI 的 `border-border` 重得多。
- **链接必须补色**：streamdown 用 `text-primary`，HeroUI 没有 primary；不补就是正文色的下划线链接。`--color-link` 经 HeroUI 的 `@theme inline` 映射为 `--link`，`text-link` 在本管线有效（编译产物为 `color: var(--link)`）。
- **标题间距只能写在组件覆盖里**：`components.h2` 替换的是整个默认组件，默认类（`mt-6 mb-2 font-semibold text-2xl`）在默认组件**内部**，自定义组件拿到的 `className` 是 undefined（已从 dist 核实）。此前覆盖里的 `my-1` 还会以 utilities 层单类选择器压过 space-y 的 `:where()`（同层 specificity 10 > 0），把标题上下间距压成 4px——这是"拥挤"问题的另一半根因，`@source` 解决不了，只能在组件里改。
- 折叠后的实际节奏：标题上方 24px（`mt-6` 与前者 16px 折叠取大值）、下方 8px（`mb-2` 覆盖标题自身的 space-y margin）——"上方留白断章、下方紧贴内容"的分组感；分割线两侧 32px；段落间 16px。
- **行号关闭**：与 HeroUI prose 代码一致，也更符合聊天场景（主流 AI 对话的代码块都不带行号）。要恢复：删掉 `ChatMessageList` 里的 `lineNumbers={false}` 即可，但注意行号淡色类 `before:text-muted-foreground/50` 不会生成，需要在 base.css 补一条淡化规则，否则行号是全文字色。
- 用户消息的 `<Streamdown>`（`UserTextContent`）自定义了 `a`（技能链接渲染成 Chip 样式），不带 `data-streamdown="link"`，不受链接规则影响。

---

## 8. 附带发现：高亮插件未安装，代码目前是单色的

排查时确认：项目**没有安装 `@streamdown/code` 插件**，`ChatMessageList` 也没传 `plugins` prop。streamdown 的高亮器来自 `plugins.code`（context 读取），没装就回落到纯文本 token（`color: "inherit"`），所以目前所有代码块都是无语法着色的。

如果以后想要语法高亮：

1. 安装 `@streamdown/code` 并按其文档传入 `plugins={{ code }}`；
2. streamdown dist 的 token 颜色类（`text-[var(--sdm-c,inherit)]` 系列）已随第 3 节的 `@source` 生成，装完插件就有颜色；但 `@streamdown/code` **自己的 dist 不在同一条 `@source` 里**，需要再加一行指向它；
3. token 颜色是 `github-light` + `github-dark` 双主题（streamdown 默认 `shikiTheme`），明暗自动切换；
4. 第 5 节的表面样式不需要改——`pre` 已被强制 `background: transparent`，shiki 的主题底色不会破坏 HeroUI 表面。

另外 `controls={false}`：复制按钮那套（代码块的 `code-block-actions`、表格的 wrapper 内按钮行）目前不渲染，本文档没定制它们。以后开 controls 时注意它们的默认类里也有无效的 `bg-sidebar` token，需要一并处理。

---

## 9. 升级 / 改动时的注意事项

- **升级 streamdown 后**：核对 `data-streamdown` 属性名和第 1 节的两个 DOM 结构是否还在（这些属性是它官方的样式契约，理论上稳定，但 2.x 仍是 0-1.x 式演进）；同时确认第 2 节的合并逻辑没变。
- **`@source` 路径**：`../../node_modules/streamdown/dist/*.js` 相对 `core/styles/base.css`；hero-next 换包管理器或依赖被挪到别的位置（比如提升到仓库根）时这行要跟着改。改完用第 10 节的方法验证 streamdown 独有的类（如 `sdm-c`）仍在产物里。
- **改样式时**：只用 HeroUI 语义 token（`bg-default`、`text-muted`、`border-separator`、`text-link`……），保持与 typography/table 的既有规范一致；不要引入硬编码色值。表格保持无背景。
- **验证 CSS 是否生效**：编译产物里这些规则必须不在任何 `@layer { }` 块内（检查方式：全局搜索 `[data-streamdown=`，看它前一行是不是 `}` 结束某个 layer）。本项目用的验证方法是用各应用自己的 postcss + `@tailwindcss/postcss` 管线单独编译 globals.css，检查输出。
- **`@apply` 的可用范围**：这段 CSS 能用 `@apply` 是因为 base.css 被两个应用的 globals.css `@import`，与 Tailwind 主题在同一个编译单元里；hero-next 若将来被非 Tailwind 项目消费，这段需要换成手写 CSS 变量（`@source` 那行对纯 CSS 消费者也只是个被忽略的未知 at-rule）。`divide-*`、`::after` 这类带嵌套/伪元素的 `@apply` 已在两个应用的管线里验证过能正确展开。

---

## 10. 验证状态

- 双边框根因、DOM 结构、类合并逻辑：读 `streamdown@2.6.0` 构建产物（`dist/chunk-YOKDWASO.js`）反解确认；默认 h2 的类在默认组件内部、自定义组件收不到 className、`lineNumbers` 默认 true、链接默认类 `text-primary font-medium underline` + `data-streamdown="link"`，均从同一产物核实；
- **`@source` 层级**：写在 base.css 顶部、路径相对声明文件，用 app 和 web 各自的 postcss + `@tailwindcss/postcss` 管线编译验证——streamdown 独有的类（`sdm-c` 4 处、`counter(line)`、`space-y-4`、`underline-offset`）在两边产物均出现，产物字节数一致；
- 代码块 / 表格定制规则：同上验证通过，产物中规则全部正确解析到 HeroUI token 且位于所有 layer 之外；`bg-muted\/80`（thead）确认生成、被 unlayered 的 `bg-transparent` 压住；
- 排版节奏规则（hr / blockquote / link）：同上验证通过；链接规则编译为 `color: var(--link); text-underline-offset: 4px`；标题间距工具类（`mt-8`/`mb-3`/`mt-6`/`mb-2`）确认生成；`space-y-4` 展开为 `:where(... > :not(:last-child))` 的 margin-block-end，与标题间距的折叠关系已按产物核对；
- **dark 变体修复**：`@custom-variant` 冒号后的空格移除后，两个产物中 shiki-dark 系选择器均为合法的 `.dark\:…:is(.dark *)` 形式（修复前是非法的 `: is(.dark *)`——postcss 不校验选择器，验证管线拦不住，是 web dev 的 CSS 解析器拦的）。全仓库确认此前无任何 `dark:` 工具类，修复不会隐性激活旧样式；
- **视觉效果尚未在运行中的应用里截图确认**。联调时如发现观感问题（比如分割线 32px 是否过松、标题 24/8 的分组感、行号关闭是否符合预期），直接改 `core/styles/base.css` 对应规则或 `ChatMessageList` 的覆盖并回填本文档。
