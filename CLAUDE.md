@AGENTS.md

## 集成说明

hero-next 是被 `web` 和 `app`（Tauri 桌面端）以 `"hero-next": "workspace:*"` 消费的私有 workspace 包。改动本包时必须遵守以下契约：

- **没有构建步骤。** `package.json` 的 `exports` 直接指向 TypeScript 源码（`./core/...`、`./blocks/...`、`./i18n/*`），消费方（Next.js 16）自动转译 workspace 源码，不需要 `transpilePackages`。新增公共入口时同步更新 `exports`，不要产出 `dist`。
- **样式归消费方所有。** 本包自身不 import Tailwind；每个 app 在自己的 globals.css 里 `@import "hero-next/base.css"`。`core/styles/dev.css` 只是单独打开本包时给 Tailwind IntelliSense 用的锚点，不参与任何构建。如果某个依赖（如 streamdown）把 Tailwind 类编译进 dist，要在 `core/styles/base.css` 里为它加 `@source`，否则类不会生成——背景见 `docs/design/streamdown-styles.md`。
- **版本经 peerDependencies + 根 catalog 对齐。** `@heroui/react`、`next`、`next-themes`、`react`、`zustand` 等由消费方提供，本包只声明范围，不自行锁定版本。
- **Tiptap 节点：有 nodeView 就必须有 renderHTML。** 任何定义了 `addNodeView()` / `ReactNodeViewRenderer` 的 Node 都必须同时定义 `renderHTML`（并配对 `parseHTML`）。路由切换时 `@tiptap/react` 的 EditorContent 卸载会先 `setProps({ nodeViews: {} })` 清空所有 nodeView，ProseMirror 随后回退到 `spec.toDOM` 重新渲染这些节点；缺了 `renderHTML` 就会抛 `TypeError: node.type.spec.toDOM is not a function`。参考 `core/chat/ChatComposerInput.tsx` 里的 `SkillNode`。
- **Tailwind 版本必须 ≥ 4.3（`tailwindcss` 与 `@tailwindcss/postcss` 同步升级）。** 工程由 `bun create` 生成，模板自带的 Tailwind 版本可能较低（如 4.1.11）。旧版本缺少 Tailwind IntelliSense 所依赖的 canonicalize 能力，`tailwindCSS.lint.suggestCanonicalClasses` 不会生效——例如 `min-w-[64px]` 不会提示改写为 `min-w-16`。新建或接手工程后先检查版本，偏低就执行 `bun add tailwindcss@latest @tailwindcss/postcss@latest`，升级后在 VS Code 中 `Developer: Reload Window`。

## 常见问题

- HeroUI 的 `.dropdown__popover` 自带 `md:min-w-55`，如果想要设置较小宽度，必须用 `min-w-0` 覆盖. 如 `w-20 min-w-0 md:min-w-0`.
