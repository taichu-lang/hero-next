# 聊天消息列表（ChatMessageList）

这份文档记录 `blocks/chat/ChatMessageList.tsx` 的实现要点、TanStack Virtual 的坑，以及"用户消息置顶 / 自动滚到底部 / 贴底状态上报"几个问题的定位结论。目的是下次改需求或排查问题时直接看这里，不用再翻 `@tanstack/virtual-core` 的源码。

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

`key` 必须**惰性**解析：`stickToMessage` 是在 `addUserMessage` 之后的同一个事件里调用的，此时组件闭包里的 `messages` 还是上一次渲染的数组，拿不到新消息。放到 layout effect 里解析，那时新列表已经 commit。

---

## 4. 需求二：`scrollToBottom()` 持续贴底

`stickRef.current = { mode: "bottom" }`，layout effect 里走另一条分支：把 spacer 清零（留白是为置顶服务的，贴底时只会让视口停在一块空白上），然后 `scrollTop = scrollHeight - clientHeight`。因为 effect 在每个 token 后都会跑，效果就是流式输出时自动向下翻滚。

### 踩过的坑：imperative handle 只改 ref，不会触发任何渲染

`scrollToBottom()` 最初只写 `stickRef` / `heldRef`。流式输出时凑巧能工作（token 自带重渲染），但**用户手动向上滚动后在空闲状态下调用，页面毫无反应** —— 没有渲染，layout effect 就不会跑。

解法是 `stickTick` 计数器：两个 imperative 方法都 `setStickTick(n => n + 1)`，并把它列进 effect 依赖。凡是"只改 ref 的命令式 API + 靠 effect 生效"的组合，都要记得补这一步。

### 4.1 首次加载：默认就是 bottom 模式

`stickRef` / `heldRef` 的初始值直接就是 `{ mode: "bottom" }` / `true`，不需要页面在 mount 后再调一次 `scrollToBottom()`。

这么做而不是"算一次高度、写一次 scrollTop"，是因为**首屏的底部位置要过好几帧才稳定**：

- `hydrate()` 在页面的 effect 里跑，mount 时 `messages` 还是空的；
- `scrollElement` 也要等 `ChatScrollArea` 的 ref callback + Provider 的 effect 推进 store 才非 null（在那之前 layout effect 直接 return）；
- 虚拟行只有渲染出来才会被测量，第一次贴底用的是 `estimateSize` 的估算值，测量到位后 `getTotalSize()` 变大，底部还会往下跑。

贴底分支在每次 commit 都重写 `scrollTop = scrollHeight - clientHeight`，上面三件事无论按什么顺序发生都会被收敛掉。因为目标恒为底部，迭代不会来回震荡。

释放规则跟运行时贴底完全一致（第 6 节）：用户第一个滚动手势就放手，`stickToMessage()` 会直接顶掉它。所以新会话"发消息 → 该消息置顶"的路径不受影响。

---

## 5. `scrollPositionListener`（"是否贴底"）不能只靠 scroll 事件

### 5.1 现象

新会话里发第一条消息，置顶逻辑补了一大块 spacer，滚动条出现；此时点"回到底部"按钮，**滚动条确实消失了，但按钮不消失** —— `scrollPositionListener` 没有收到 `true`。

### 5.2 根因

`distance = scrollHeight - clientHeight - scrollTop`，三个量都会变，但**只有 `scrollTop` 变化会派发 `scroll` 事件**。内容高度和视口高度变化是静默的。

这个场景刚好踩在静默路径上：

1. 置顶的是第一条用户消息，`anchorIndex === 0` → `anchorStart === 0` → `wanted === 0`，于是 **scrollTop 一直是 0**，滚动条纯粹是 spacer 撑出来的，位置停在顶部，`distance ≈ 一屏`；
2. `scrollToBottom()` 把 spacer 清零，`scrollHeight` 塌回 `clientHeight`，`distance` 变成 0；
3. 但 scrollTop 本来就是 0，**没有发生夹紧，浏览器不派发 scroll**，`onScroll` 不执行，上报的值停在 `false`。

同一个盲区还会以别的形式出现，排查时一并考虑：

- 流式输出时内容变高、scrollTop 被钉住不动 → 实际已经离开底部，却不会上报 `false`；
- 窗口 resize 改变 `clientHeight` → 同样不上报（viewport 的 `ResizeObserver` 只更新 `viewportHeight`）；
- 即使某些路径上 scrollTop 真的被夹紧了，scroll 事件也是异步的，和置顶逻辑不同步。

（早先的权宜之计是在挂监听时主动调一次 `onScroll()`，只补上了"首次订阅"这一个时刻，上面三条都没覆盖，现已移除。）

### 5.3 解法

把"算 + 上报"抽成 `reportBottom()`，调用点从「scroll 事件」改成「scroll 事件 **＋ 每次 commit 之后**」：

- `onScroll` 开头调一次；
- 另起一个**不带依赖数组**的 `useIsomorphicLayoutEffect(reportBottom)`，声明在置顶 layout effect **之后**，保证读到的是置顶刚写完的位置。spacer 塌缩、流式增高、resize 引起的重渲染因此全部覆盖。

`reportedRef` 记住上一次上报的布尔值，只在真正翻转时才调 `scrollPositionListener`，避免每个 token 都往父组件 `setState`。

注意 `reportBottom` 进了 scroll 监听 effect 的依赖，所以页面传进来的 `scrollPositionListener` **必须是稳定引用**（当前页面传的是 `setAtBottom`），否则每次渲染都会重新挂卸监听。

---

## 6. 释放与重新接管

钉住状态（`heldRef`）在以下任一情况下释放，之后列表恢复成普通滚动容器：

- `wheel` / `touchmove`：明确的用户手势。程序化写 scrollTop **不会**触发这些事件，所以不会误伤。
- `keydown`：仅当按键不是发自可编辑元素。Composer 在滚动容器**内部**，打字时每个 `keydown` 都会冒泡到容器上——如果不过滤，"边流式输出边打下一条消息"就会把 bottom 跟随悄悄放掉。现在 `input / textarea / [contenteditable]` 里的按键被忽略。
- `scroll` 事件中发现 scrollTop 与 `appliedRef`（我们最后写入的值）相差超过 `BOTTOM_THRESHOLD`：用于捕捉**拖动滚动条**，它不产生上面任何一个事件。依据是 scroll 事件每帧最多派发一次且总在引起它的写入之后，所以落在别处就说明是用户干的。

只有 `bottom` 模式会自动重新接管：用户滚回底部 `BOTTOM_THRESHOLD` 以内时重新钉住。`message` 模式一旦释放就不再自动恢复，下次 `stickToMessage` 才会重置。

### 踩过的坑：clamp 被误判成拖动，bottom 跟随在流式输出中悄悄死掉

`bottom` 模式下 scrollTop 被我们钉在 `scrollHeight - clientHeight` 上，此时任何让内容**变矮**的重测量（估算 120 vs 实际行高、markdown reflow）都会让浏览器把 scrollTop 夹小并派发 scroll 事件。旧逻辑把这个事件当成"用户拖了滚动条"直接 `release()`，并且释放后立刻 `return`——同一个事件里"滚回底部就重新接管"的检查根本不会跑。释放之后钉住 effect 每次 commit 都提前返回，scrollTop 从此不再变化，也就再也没有 scroll 事件能触发重新接管：**跟随永久死亡**，表现正是"点了 scrollToBottom 之后流式输出不再自动下滚"。

修复分两点：

- **落在底部的错位不释放。** bottom 模式下，如果错位后的位置恰好就是底部（`distance <= BOTTOM_THRESHOLD`），那是 clamp 而不是手势——保持钉住，并把 `appliedRef` 重同步到当前值。落在别处才释放。
- **释放后不再 `return`，同一个事件里继续走重新接管的判断。** 拖动滚动条直接甩到底部这种一步到位的手势，也能在同一帧里恢复跟随；重新接管时同样重同步 `appliedRef`，避免下一帧拿旧值比较又误判。

---

## 7. 改动时的注意事项

- **别把 `estimateSize` 拿来撑高度。** 估算值只在未测量时生效，测量一到就跳变，反而制造滚动跳动。要预留空间就加真实的 spacer 元素。
- **任何让内容变矮的改动都可能触发浏览器夹紧 scrollTop。** 加折叠、删消息、换 Markdown 渲染器之前，先想清楚 `scrollHeight - clientHeight` 会不会掉到锚点下面。
- **layout effect 里每个 token 都会读一次 `getBoundingClientRect` / `scrollHeight`，强制同步布局。** 目前可接受；如果消息体变重出现掉帧，优先考虑缓存 `listTop`（它只随 Nav 高度变化）而不是改成异步。
- **`measurementsCache` 在类型定义里是 public，`getMeasurements()` 是 private。** 所以读锚点偏移用 `virtualizer.measurementsCache[i].start`，并且要先调一次 `getTotalSize()` 刷新 memo。
- **任何"从 DOM 测量里派生出来的对外状态"都别只挂在事件上。** 第 5 节是一个具体案例：scroll 事件只覆盖三个输入量里的一个。新增这类状态时，默认把它放进每次 commit 后的 layout effect，再用 ref 去重。
- 升级 `@tanstack/react-virtual` 后，重新核对 2.1 / 2.2 / 2.3 / 2.7 这几条 —— 它们都依赖未公开的内部行为。

---

## 8. 验证状态

本文的因果分析来自阅读 `ChatMessageList.tsx`、`ChatContext.tsx`、`useEventSource.tsx` 与 `virtual-core@3.17.11` 的构建产物；引用的常量和分支都在源码里确认过。**尚未在运行中的应用里断点验证，也未跑类型检查 / 构建。** 联调时如果发现实际表现与 3.2 的推断不符，请回来更新这一节。
