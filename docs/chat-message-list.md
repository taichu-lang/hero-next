# 聊天消息列表（ChatMessageList）

这份文档记录 `blocks/chat/ChatMessageList.tsx` 的实现要点、TanStack Virtual 的坑，以及"用户消息置顶 / 自动滚到底部"两个需求的问题定位结论。目的是下次改需求或排查问题时直接看这里，不用再翻 `@tanstack/virtual-core` 的源码。

依赖版本：`@tanstack/react-virtual` ^3.14.13，实际安装 `virtual-core@3.17.11`。**下面引用的源码行为都以 3.17.11 为准，跨大版本升级后需要重新确认。**

---

## 1. 整体结构

```
ChatScrollArea                       ← 滚动容器，overflow-y-auto，overflowAnchor: none
├── Nav (sticky top-0, h-14)         ← 由页面 layout 提供
└── div.mx-auto.mt-4                 ← 内容列
    ├── ChatMessageList
    │   ├── div[ref=listRef]         ← 高度 = virtualizer.getTotalSize()，position: relative
    │   │   └── 虚拟行（position: absolute + translateY）
    │   └── div[ref=spacerRef]       ← 末尾留白，高度由 spacer state 决定
    └── Composer (sticky bottom-0)
```

关键点：**滚动容器不只包含消息列表**。列表上面有 56px 的 sticky Nav 加 16px 的 `mt-4`，下面有 Composer。后面所有涉及 scrollTop 的计算都必须把这两块算进去。

状态来自 `ChatContext`（zustand store，按 pathname 重建）：`messages` 是已完成的消息，`streamingMessage` 是当前流式输出的那条。列表把它们拼成一个长度为 `messages.length + (streamingMessage ? 1 : 0)` 的虚拟列表。

---

## 2. TanStack Virtual 使用上的注意事项

### 2.1 measurements 的坐标系 vs scrollTop 的坐标系

`getMeasurements()` 里每一项的 `start` 从 `paddingStart + scrollMargin` 开始累加（virtual-core `index.js:689`）。我们没设 `scrollMargin`，所以 `item.start` 是**相对列表元素**的偏移。

而 `scrollToIndex()` 最终写的是容器的**绝对 scrollTop**。两者差一个"列表元素在滚动内容里的偏移量"，在当前布局里是 56 + 16 = 72px。

也就是说 `virtualizer.scrollToIndex(i, { align: "start" })` 会把目标消息停在距容器顶部 72px 的位置 —— 恰好落在 56px 的 Nav 下面 16px 处，看起来是对的，但这是**布局凑巧**，不是正确实现。Nav 高度一改就会露馅。

现在的实现不再用 `scrollToIndex`，而是自己算：

```
listTop = list.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop
wanted  = listTop + anchorStart - inset     // inset 默认取 listTop，保持原有视觉
```

`topInset` 作为 prop 暴露出来，语义是"置顶消息上方要留多少空间"（一般就是 sticky header 高度）。不传就退化成 `listTop`，跟改造前的观感一致。

### 2.2 `scrollToIndex` 不是"钉住"，是一次性的

`scrollToIndex` 会写一次 scrollTop，然后启动一个 rAF 对账循环 `reconcileScroll()`（`index.js:1227`）：每帧重算目标偏移，测量变化导致目标漂移就重新滚动。但它有两个终止条件：

- 目标和当前位置一致并稳定 `STABLE_FRAMES = 1` 帧 → 立刻停止；
- 超过 `MAX_RECONCILE_MS = 5000` ms → 直接放弃。

所以它只能覆盖"发出滚动指令后的短暂抖动期"。**流式输出通常远超 5 秒，回复结束时 `streamingMessage → messages` 的那次 commit 更是早就出了对账窗口，没有任何东西会重新校准位置。** 想要持续钉住，必须自己在每次 commit 后重新写 scrollTop（见第 3 节）。

### 2.3 `getOffsetForAlignment` 会 clamp 到最大滚动量

```js
const maxOffset = this.getMaxScrollOffset(); // scrollHeight - clientHeight
return Math.max(Math.min(maxOffset, toOffset), 0);
```

这是"消息置顶"这个需求的物理约束：**如果锚点消息下方的内容不足一屏，它在数学上就不可能停在顶部**，无论调用多少次滚动 API。浏览器同样会在内容变矮时把 scrollTop 夹回 `scrollHeight - clientHeight`。

结论：置顶只能靠**在列表末尾补足留白**来实现，不能靠滚动 API。

### 2.4 尺寸缓存以 `getItemKey` 的返回值为键

`itemSizeCache` 是 `Map<key, size>`。key 一变，已测量的真实高度就丢了，该行回落到 `estimateSize`，`getTotalSize()` 随之跳变，浏览器再夹一次 scrollTop。

我们用 `message_id` 作 key。

另外 `getItemKey` 的函数标识是 `getMeasurements` memo 的依赖（`index.js:607`），内联箭头函数会让 measurements 每次渲染都重算。已用 `useCallback` 包好。

### 2.5 `anchorTo: "end"` / `followOnAppend` 与置顶需求冲突

这两个选项是库自带的"贴底"方案：`anchorTo: "end"` 会在 count/边缘 key 变化时锚定，`followOnAppend` 会在追加消息时自动滚到底。它们跟"用户消息置顶"是互斥的，所以保持默认关闭，贴底由我们自己的 `scrollToBottom` 实现。

### 2.6 `useFlushSync: false` 是必须的

`measureElement` 跑在 React commit 阶段（ref callback）。测量值和估算值不一致且 `anchorTo === "end"` 时，virtualizer 会同步 scrollTop 再 `notify(sync=true)`；默认 `useFlushSync: true` 会在生命周期里调 `flushSync(rerender)` —— React 在渲染中会直接拒绝，而流式聊天每个 token 都在重渲染父组件。关掉后改成异步重渲染，晚一帧，视觉无差别。

### 2.7 测量期间的滚动补偿规则（`resizeItem`，`index.js:895`）

- **首次测量**：只要 `itemStart < scrollOffset`（顶部在折叠线以上）就补偿差值；
- **重新测量**：只有整项都在折叠线以上（`itemStart + itemSize <= scrollOffset`）且不是向上滚动时才补偿。

第二条正是为流式消息设计的：跨折叠线的消息在下方变长，补偿会把视口往下拽。默认行为对我们有利，不需要传 `shouldAdjustScrollPositionOnItemSizeChange`。

---

## 3. 需求一：用户发消息后，该消息钉在顶部

### 3.1 现象

调用 `stickToMessage(index)` 后滚动条定位正确；流式输出过程中看着也正常；但**大模型回复结束、`streamingMessage` 被并入 `messages` 之后，滚动条跑回了第一条消息**。

### 3.2 根因（基于代码与库源码分析，未做运行时断点验证）

**主因：末尾没有预留空间，锚点位置超出了最大可滚动量。**

改造前只有一处预留：streaming 行在 `content` 为空时把 `minHeight` / `estimateSize` 撑成 `viewportHeight - 120`。这个撑高在**第一个 token 到达的瞬间就消失了**（`msg.content` 不再为空）。之后能不能保持置顶，完全取决于回复本身够不够长。

回复结束时：一个新会话只有"1 条用户消息 + 1 条回复"，`scrollHeight - clientHeight` 接近 0，浏览器把 scrollTop 夹到 0 —— 视觉上就是"回到第一条消息"。夹紧本身在内容变矮的任意时刻都会发生，只是回复结束这一刻最容易被观察到。

**次因：没有任何东西在这次 commit 上重新校准位置。**`scrollToIndex` 的对账循环早就结束了（见 2.2），`streamingMessage → messages` 这次 commit 没有触发任何滚动逻辑。

**第三点：`overflowAnchor: "auto"`。**浏览器的滚动锚定会和 absolute 定位 + 反复重测量的虚拟行互相干扰，是额外的不确定来源。

### 3.3 解法

三件事：

**(a) 末尾留白 spacer。** 由不变式推出：

```
maxScrollTop = listTop + total + spacer + below - clientHeight  >=  wanted
=> spacer >= wanted + clientHeight - listTop - total - below
```

`below` 是列表之后、滚动容器之内的东西（主要是 Composer），实测得到：

```
below = scrollHeight - (listTop + total + spacer 当前实际高度)
```

`needed` 不依赖 `spacer` 自身（`below` 里已经把它减掉了），所以一次 `setSpacer` 就收敛，不会来回抖。

**(b) 在 `useLayoutEffect` 里每次 commit 都重写 scrollTop。** 依赖里带上 `messages / streamingMessage / totalSize / viewportHeight / spacer / stickTick`，等于"每个 token、每次测量、每次并入 messages 都重新钉一次"。用 layout effect 而不是 effect，是为了在 paint 前完成；`setSpacer` 也在 layout effect 里调用，React 会在同一帧内同步重跑，所以不会闪。

**(c) `estimateSize` 拉平成常量 120。** 撑高的活交给 spacer，不要再让 streaming 行在首 token 时缩掉一屏。

**(d) `overflowAnchor: "none"`。** 滚动位置由我们独占。

### 3.4 锚点用 message_id 追踪，不用 index

`prependMessage`（加载历史）会让所有 index 平移。所以 `stickRef` 里存 `{ index, key }`，第一次能取到消息时把 `key` 填成 `message_id`，之后每次都按 key 反查 index。

`key` 必须**惰性**解析：`stickToMessage` 是在 `addUserMessage` 之后的同一个事件里调用的，此时组件闭包里的 `messages` 还是上一次渲染的数组，拿不到新消息。放到 layout effect 里解析，那时新列表已经 commit。

---

## 4. 需求二：`scrollToBottom()` 持续贴底

`stickRef.current = { mode: "bottom" }`，layout effect 里走另一条分支：把 spacer 清零（留白是为置顶服务的，贴底时只会让视口停在一块空白上），然后 `scrollTop = scrollHeight - clientHeight`。因为 effect 在每个 token 后都会跑，效果就是流式输出时自动向下翻滚。

### 踩过的坑：imperative handle 只改 ref，不会触发任何渲染

`scrollToBottom()` 最初只写 `stickRef` / `heldRef`。流式输出时凑巧能工作（token 自带重渲染），但**用户手动向上滚动后在空闲状态下调用，页面毫无反应** —— 没有渲染，layout effect 就不会跑。

解法是 `stickTick` 计数器：两个 imperative 方法都 `setStickTick(n => n + 1)`，并把它列进 effect 依赖。凡是"只改 ref 的命令式 API + 靠 effect 生效"的组合，都要记得补这一步。

---

## 5. 释放与重新接管

钉住状态（`heldRef`）在以下任一情况下释放，之后列表恢复成普通滚动容器：

- `wheel` / `touchmove` / `keydown`：明确的用户手势。程序化写 scrollTop **不会**触发这些事件，所以不会误伤。
- `scroll` 事件中发现 scrollTop 与 `appliedRef`（我们最后写入的值）相差超过 `BOTTOM_THRESHOLD`：用于捕捉**拖动滚动条**，它不产生上面任何一个事件。依据是 scroll 事件每帧最多派发一次且总在引起它的写入之后，所以落在别处就说明是用户干的。

只有 `bottom` 模式会自动重新接管：用户滚回底部 `BOTTOM_THRESHOLD` 以内时重新钉住。`message` 模式一旦释放就不再自动恢复，下次 `stickToMessage` 才会重置。

---

## 6. 改动时的注意事项

- **别把 `estimateSize` 拿来撑高度。** 估算值只在未测量时生效，测量一到就跳变，反而制造滚动跳动。要预留空间就加真实的 spacer 元素。
- **任何让内容变矮的改动都可能触发浏览器夹紧 scrollTop。** 加折叠、删消息、换 Markdown 渲染器之前，先想清楚 `scrollHeight - clientHeight` 会不会掉到锚点下面。
- **layout effect 里每个 token 都会读一次 `getBoundingClientRect` / `scrollHeight`，强制同步布局。** 目前可接受；如果消息体变重出现掉帧，优先考虑缓存 `listTop`（它只随 Nav 高度变化）而不是改成异步。
- **`measurementsCache` 在类型定义里是 public，`getMeasurements()` 是 private。** 所以读锚点偏移用 `virtualizer.measurementsCache[i].start`，并且要先调一次 `getTotalSize()` 刷新 memo。
- 升级 `@tanstack/react-virtual` 后，重新核对 2.1 / 2.2 / 2.3 / 2.7 这几条 —— 它们都依赖未公开的内部行为。

---

## 7. 验证状态

本文的因果分析来自阅读 `ChatMessageList.tsx`、`ChatContext.tsx`、`useEventSource.tsx` 与 `virtual-core@3.17.11` 的构建产物；引用的常量和分支都在源码里确认过。**尚未在运行中的应用里断点验证，也未跑类型检查 / 构建。** 联调时如果发现实际表现与 3.2 的推断不符，请回来更新这一节。
