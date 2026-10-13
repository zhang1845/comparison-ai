# 五席 — 多模型同屏对话平台搭建规范

版本 1.0 · 2026-10-13

这份文档是实现合同。产品决策已经写死。实现 AI 按本文搭建，不另做产品判断，不扩大范围。

给人看的摘要在第 1 节。交给 AI 时，把整个文件发给它，并附上第 0 节的提示词。

---

## 0. 交给实现 AI 的提示词

把下面这段话和本文件一起发送：

```text
你是实现工程师。请先完整阅读 SPEC.md，再按第 17 节的顺序实现「五席」。

约束：
- 第 2 节的决策已经锁定。不要改产品范围，不要换技术栈，不要停下来提问。
- 规范没写到的细节，按第 20 节处理。
- 不要删除 SPEC.md。
- 界面文案使用本文表里的中文。不要做欢迎页，不要写 lorem。
- 发送请求只能写在点击或快捷键的事件处理函数里，禁止用 useEffect 在出现新消息时自动请求。
- 做完第 18 节验收再停。没有真实密钥时，用「使用演示回答」走通界面。
- 应用可运行后，把根 README 改成运行说明，并在开头链接到 SPEC.md。
```

---

## 1. 产品一页纸

五席是一个单页工作台。用户配置最多五个模型席位，在同一个输入框写下一条问题，五个模型同时作答，并排看差异。

它解决的事：比较多个模型时，不必在多个网页之间复制同一段提示词，也不必靠记忆对齐它们的回答。

页面打开就是工作台，没有营销首页。

两种说话方式：

| 模式 | 用户得到什么 |
| --- | --- |
| 并行对比（默认） | 各席只看见用户说过的话和自己以前的回答。回答互不污染，用来比质量、速度和措辞。 |
| 圆桌 | 同一条问题先同时回答。用户可以让各席再续谈，续谈时各席能看见其他席刚才的回复，并只代表自己补充。 |

两种看法：

| 视图 | 用途 |
| --- | --- |
| 分栏 | 五列并排，扫读差异。桌面端默认。 |
| 时间线 | 按轮次纵向排列，每轮下面挂上各席回复。看圆桌来回时用。 |

密钥、席位配置、对话记录都只存在这台浏览器里。服务端只做请求转发，不建账号，不落库。

产品名：**五席**。一句说明：**一条问题，五个模型并排作答。**

---

## 2. 锁定决策

1. 固定五个席位，标识永远是 `slot-1` 到 `slot-5`。席位可以单独停用，不能增删到五个以外。
2. 默认模式是并行对比。圆桌是同一页里的开关，不是另一个产品。
3. 第一轮回答永远并行发出。圆桌的「续谈」才把其他席的回复放进上下文。
4. 技术栈：当前稳定版 Next.js（App Router）、TypeScript、Tailwind CSS、shadcn/ui。包管理器用 npm。
5. 状态用 React context + `useReducer`。不引入 Redux、Zustand、数据库、登录和对象存储。
6. 每席一次独立的 `POST /api/chat`。不要用一条多路复用流包住五个模型。
7. 浏览器不直连厂商。一律走同源的 Next.js 路由转发，以避免 CORS，并把密钥留在请求头里。
8. 协议三种：`openai`（兼容协议，覆盖大多数国内 API）、`anthropic`、`gemini`。
9. 会话正文放 IndexedDB。设置与密钥分两个 localStorage 键。导出文件不含密钥。
10. 流式输出期间，气泡里用纯文本。该席状态变为 `done`、`error` 或 `aborted` 之后再渲染 Markdown。
11. 不支持分叉历史。只能重做最后一轮的某一席，或编辑某条用户消息并截掉它之后的轮次。
12. 本期只有文本。没有图片、文件、工具调用、语音、评分榜和分享链接。

---

## 3. 本期包含与不包含

本期包含：

- 五个席位的配置、启用、密钥、连接测试
- 预设厂商与自定义 OpenAI 兼容地址
- 并行对比的流式回答、单独停止、单独重新生成
- 圆桌最多 3 次发言（首次回答 + 2 次续谈）
- 分栏与时间线
- 本地会话列表、重命名、删除、Markdown 导出
- 演示回答（不离开浏览器）
- 每席耗时、首字时间和用量（厂商有返回时）
- 每一轮选一个「这条更好」

本期不包含：

- 账号、协作、付费、云端同步
- 自动裁判模型、Elo 排行
- 图像、PDF、函数调用、JSON 模式开关
- 把五个模型的回答交由第六个模型总结（用户若需要，可自己再问一轮）
- 插件市场

---

## 4. 术语

| 术语 | 含义 |
| --- | --- |
| 席位 | 一个可配置的模型位置，全应用固定五个。 |
| 轮次 | 用户的一条消息，以及各席针对这条消息的回复。 |
| 发言（pass） | 圆桌里某一席在同一轮中的第几次开口。从 0 计数。并行对比只有 pass 0。 |
| 首字时间 | 请求开始到第一段非空正文到达的毫秒数。 |
| 演示回答 | 客户端本地伪造的流式文本，用于没有密钥时看界面。 |

---

## 5. 信息架构

只有一个路由 `/`。设置、会话、导出都是这一页上的浮层或区域内控件。

```text
工作台 /
├── 会话栏（最近会话）
├── 顶栏（标题、模式、视图、新对话、导出、设置）
├── 主区
│   ├── 分栏：五列对话
│   └── 时间线：按轮次堆叠
└── 底栏输入
    └── 席位设置（右侧 Sheet）
```

不增加 `/settings`、`/chat/[id]` 之类的第二页面。刷新后停在同一工作台，并恢复最后一次打开的会话。

---

## 6. 界面与交互

### 6.1 桌面布局（宽度 ≥ 1200px）

```text
┌─会话 240px─┬─顶栏：标题 · 并行对比|圆桌 · 分栏|时间线 · 导出 · 设置─┐
│ 新对话     │ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                      │
│ 今天       │ │席 1│ │席 2│ │席 3│ │席 4│ │席 5│                      │
│ 选一门外语 │ │    │ │    │ │    │ │    │ │    │                      │
│            │ └────┘ └────┘ └────┘ └────┘ └────┘                      │
│            ├─输入框──────────────────────────────────────────────────┤
│            │ 向已启用的五个席位发送                          发送    │
└────────────┴──────────────────────────────────────────────────────────┘
```

- 会话栏背景 `#efeae2`，主背景 `#f6f4ef`，列表面 `#ffffff`，列边框 `#e6e1d8`。
- 五列等宽：`repeat(5, minmax(0, 1fr))`，列间距 8px，页面外边距 12px。
- 列没有投影。顶上 3px 色条使用第 14 节的席位色。
- 顶栏高 52px。输入区贴在主列底部，不跟着某一列滚动。

宽度 800–1199px：会话栏收进抽屉。五列改为横向滚动，每列最小 280px，`scroll-snap` 对齐。

宽度 < 800px：

- 顶栏保留标题、模式、设置。会话栏改为抽屉。
- 席位切换：`全部` 与五个席位。
- `全部` 把五列上下堆叠，每列最高 70vh，内部滚动。这是手机上的对照视图。
- 单席占满剩余高度。
- 输入框固定在底部，避开浏览器安全区。

### 6.2 会话栏

- 按钮「新对话」。
- 列表按 `updatedAt` 倒序。标题是首条用户消息的前 24 个字符；用户没说话前，标题是「未命名对话」。
- 悬停或焦点出现重命名、删除。删除前用对话框确认，文案：「删除这则对话？此操作只影响这台浏览器。」
- 空态：「还没有对话。发送第一条消息后，会记在这台浏览器里。」
- 当前会话有明显底色，不只用颜色，还要有 2px 左侧色条。

### 6.3 列头

从左到右：色点、显示名、模型 ID（等宽、超长省略）、状态、菜单。

状态文案：

| 状态 | 文案 |
| --- | --- |
| 空闲 | 不显示额外字 |
| pending | 等待 |
| streaming | 正在回答 |
| done | 不显示 |
| error | 失败 |
| aborted | 已停止 |

菜单项：「重新生成」「复制此席最后一条」「停用此席」。流式进行中，「重新生成」换成「停止此席」。

停用后该列仍留在布局里，显示「此席已停用」，不参与发送。这样五个位置始终对齐。

未配置密钥且未开演示：列内空态「尚未配置密钥」，并给「去设置」按钮。其他席继续可用。

### 6.4 消息

- 用户消息在每一列都显示同一份，右对齐浅底。每一轮的用户消息都可以编辑，任意一列里编辑，效果相同。
- 确认编辑后：删掉该轮及其后的所有轮次，用新文本重新发送。进行中的请求先停止。
- 助手气泡左对齐。流式中为 `white-space: pre-wrap` 纯文本。结束后用 Markdown。
- Markdown 使用 `react-markdown` + `remark-gfm`。禁止 `rehype-raw`，不渲染原始 HTML。
- 代码块显示「复制」按钮。链接 `target="_blank"` 且 `rel="noreferrer"`。
- 气泡页脚在结束后显示：`1.2s 首字 · 4.8s 完成`，有用量时再加 `入 120 · 出 340`。没有首字时不显示首字段。
- 失败时在列内显示中文说明和「重试」。重试等于重新生成该席这一发言。
- 中止且已有正文：保留正文，页脚写「已停止，以下为未完成输出」。中止且无正文：显示「已停止」。

每一轮的最下方，在分栏视图里放一条跨五列的细栏（时间线视图里则放在该轮卡片组下面）：

- 五个席的首字时间与完成时间，便于对齐比较
- 按钮「这条更好」：点某一席，记为该轮 `winnerSlotId`。再点同一席则取消。选中后文案变为「已选{显示名}」。

同步滚动：分栏视图默认开启。滚动一列时，其他列使用相同的滚动比例。用户若向上阅读，暂停同步，出现「回到底部」。回到底部后恢复同步。

### 6.5 输入框

- 占位符：五个全开时「向五个席位提出同一个问题」；否则「向已启用的 N 个席位发送」。
- Enter 发送，Shift+Enter 换行。输入法组合中按 Enter 不发送。
- 空文本不能发送。最长 32000 个字符。到达 80% 时显示计数。
- 没有任何席位启用：输入框禁用，说明「至少启用一个席位」。
- 有席位处于 `pending` 或 `streaming` 时，主按钮是「停止」，停止所有进行中的席。此时不能发送下一条。
- 圆桌模式，且当前最后一轮各席都已结束（完成、失败或停止），并且至少两个席有非空完成回复：显示「续谈」。首次回答是 pass 0，其后最多再续谈两次（pass 1、pass 2）。pass 2 完成后隐藏按钮。按钮旁写「还可续谈 N 次」。
- 续谈前不弹确认。费用由用户自己的密钥产生，在设置页顶部写清：「请求直接发往你填写的厂商，费用记在对应账号上。」

### 6.6 席位设置（右侧 Sheet，宽 420px）

自上而下：

1. 说明：密钥只保存在这台浏览器。
2. 全局补充要求。多行，最多 8000 字。占位符：「对所有席位生效的补充要求，例如：用中文回答，先给结论。」
3. 五个手风琴。标题含色点、显示名、模型 ID、启用开关。
4. 每个手风琴内：第 8 节的 `SlotConfig` 字段，外加一个密钥框。密钥框是密码输入，只写入 `SecretMap`。已保存时显示末四位，聚焦后整段替换。预设按「国际 / 国内 / 本地 / 自定义」分组。
5. 「测试连接」：对该席发一条最短请求，用户消息为 `Reply with the single word: ok`，`maxTokens` 临时取 16。成功显示「已连通」。失败显示第 15 节的中文错误。
6. 「使用演示回答 / 关闭演示」。
7. 「清除全部密钥」，确认后只删密钥，不删对话。

切换预设时：写入该预设的 `kind`、`baseUrl`、建议模型。若模型框里仍是上一个预设的建议模型，则替换；用户已经改过的模型 ID 保留。

模型框是可输入的组合框。OpenAI 兼容协议额外提供「拉取模型列表」：`POST /api/models`，请求体 `{ "baseUrl": "..." }`，请求头 `x-api-key`。服务端用同一套地址校验，再请求 `GET {baseUrl}/models`，把返回里的模型 id 列表交给前端。失败时不阻断，用户仍可手写模型 ID。Anthropic 与 Gemini 不提供这个按钮。

设置更改立即保存。

### 6.7 顶栏其他动作

- 「新对话」：若当前会话没有任何轮次，不重复创建。
- 「导出」：下载该会话的 Markdown，文件名 `五席-{标题}-{YYYYMMDD-HHmm}.md`。格式见附录 D。
- 模式切换立即作用于下一次发送，不改写已经存在的轮次。

### 6.8 键盘

| 按键 | 作用 |
| --- | --- |
| Enter | 发送（非组合状态） |
| Shift+Enter | 换行 |
| Esc | 停止所有进行中的席；若设置 Sheet 开着，先关闭 Sheet |
| Mod+K | 聚焦输入框 |

焦点环必须可见。流式状态用 `aria-live="polite"` 通知「席位 N 正在回答 / 回答完成 / 回答失败」，不要对每个 token 播报。

---

## 7. 上下文组装

这是行为合同。测试按本节的 C1–C8 断言，不要用「差不多」的提示词拼接代替。

### 7.1 规则

- **C1** 每次请求先可选一条 `system`，其后是 `user` / `assistant` 交替的正文。
- **C2** `system` 由以下段落按顺序用一个空行拼接，空段落省略：
  1. 圆桌规则（仅当**本次**请求的模式是圆桌）
  2. 全局补充要求
  3. 该席补充要求
  拼接结果为空时，不传 system 字段。
- **C3** 对每个已经结束的历史轮次：追加 `user` = 该轮用户原文。若本次请求是圆桌，且该历史轮的 `mode` 也是圆桌，则用 `\n\n` 把其他席的**最终回复**引用块接在同一条 user 后面。若该席存在最后一条 `status=done` 且内容去空白后非空的发言，再追加 `assistant` = 那条内容。
- **C4** 当前轮、并行：再追加一条 `user` = 本轮用户原文。
- **C5** 当前轮、圆桌、pass 0：同 C4。
- **C6** 当前轮、圆桌、pass > 0：先按 C4 追加用户原文；再按 pass 从小到大，把该席在本轮已 `done` 且非空的发言追加为 `assistant`；最后追加一条 `user`，内容是其他席**上一次 pass** 的引用块。其他席只取同一 pass、`done`、非空的发言。这样的其他席一个都没有时，禁止发起这次续谈。
- **C7** 最后做交替规范化：丢掉内容为空的消息；相邻同角色用 `\n\n` 合并；若去掉 system 后第一条是 assistant，在前面插入 `user`，内容为 `请继续`。
- **C8** 本次请求的模式是并行时，任何消息里都不得出现其他席的回复。历史圆桌引用块在并行请求中整段去掉。

「最终回复」指该席在该轮 pass 最大、且 `done`、非空的那条。

历史轮次不回放中间发言。中间发言仍显示在界面上，也写入导出。例外只在 C6：续谈当前轮时，该席自己在本轮的先前发言要按顺序放进上下文。

### 7.2 固定文案

圆桌规则（原文使用，不要润色）：

```text
你正在一场最多五个席位的圆桌里发言。
只代表你自己，不要替其他模型写回复。
使用与用户相同的语言。
先给出结论，再补充理由，不要开场客套。
若消息里引用了其他席位，只回应实质分歧或遗漏，不要逐段复读。
不要声称你调用了工具、检索了网页或执行了代码。
```

历史轮次里的其他席引用块：

```text
其他席位在该轮的最终回复如下。

### {displayName} · {model}
{content}
```

多个席位之间空一行。顺序固定为 slot-1 → slot-5，跳过自己和无效回复。

续谈引用块：

```text
其他席位刚才说：

### {displayName} · {model}
{content}

只写你自己的下一则回复：指出你与他们的实质分歧，或补充一个他们没说到的点。不要复述全文，不要代替别人发言。
```

### 7.3 装配例子

两个席位。席位 1 显示名「席位 1」，模型 `gpt-4o`。席位 2 显示名「席位 2」，模型 `deepseek-chat`。无全局提示，无席位提示。

轮次 R1，模式圆桌：

- 用户：`选一门外语`
- 席位 1 pass 0：`选日语`；pass 1：`我仍选日语`
- 席位 2 pass 0：`选西班牙语`；pass 1：`我仍选西班牙语`

新的一条用户消息：`那学习顺序呢`。模式仍是圆桌，pass 0，目标席位 1。期望消息：

```text
system:
你正在一场最多五个席位的圆桌里发言。
（后文与第 7.2 节圆桌规则完全一致）

user:
选一门外语

其他席位在该轮的最终回复如下。

### 席位 2 · deepseek-chat
我仍选西班牙语

assistant:
我仍选日语

user:
那学习顺序呢
```

同一历史，若新请求改为并行对比、席位 1：

```text
user:
选一门外语

assistant:
我仍选日语

user:
那学习顺序呢
```

没有 system，没有「西班牙语」四字。

R1 只有 pass 0 完成时，用户点击续谈，目标席位 1，期望最后一条 user 为续谈引用块，其中引用席位 2 的 `选西班牙语`，并且 assistant 序列里有席位 1 的 `选日语`。

---

## 8. 数据模型

类型以本节为准。字段名不要改。

```typescript
export type ProviderKind = "openai" | "anthropic" | "gemini";
export type ChatMode = "parallel" | "roundtable";
export type WorkspaceView = "columns" | "timeline";
export type TurnStatus = "pending" | "streaming" | "done" | "error" | "aborted";
export type SlotId = "slot-1" | "slot-2" | "slot-3" | "slot-4" | "slot-5";

export interface ChatMessageInput {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface SlotConfig {
  id: SlotId;
  enabled: boolean;
  displayName: string;
  presetId: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

export interface Settings {
  version: 1;
  mode: ChatMode;
  view: WorkspaceView;
  globalSystemPrompt: string;
  demo: boolean;
  slots: SlotConfig[]; // 长度必须为 5，且 id 顺序固定
}

export interface SecretMap {
  version: 1;
  keys: Partial<Record<SlotId, string>>;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface SlotTurn {
  id: string;
  slotId: SlotId;
  pass: number;
  status: TurnStatus;
  content: string;
  errorCode?: string;
  errorMessage?: string;
  startedAt?: number;
  firstTokenAt?: number;
  finishedAt?: number;
  usage?: Usage;
  displayName: string;
  model: string;
  kind: ProviderKind;
  temperature: number;
  maxTokens: number;
}

export interface Round {
  id: string;
  createdAt: number;
  mode: ChatMode;
  userText: string;
  turns: SlotTurn[];
  winnerSlotId?: SlotId;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  rounds: Round[];
}
```

约束：

| 字段 | 约束 |
| --- | --- |
| `displayName` | 1–20 字，默认「席位 1」…「席位 5」 |
| `temperature` | 0–2，步长 0.1，默认 0.7 |
| `maxTokens` | 256–8192 的整数，默认 2048 |
| `systemPrompt` / 全局补充 | 各最多 8000 字 |
| `model` | 1–128 字，发送前必填 |
| `rounds` | 单会话最多 200 轮。超出时阻止发送并说明 |
| 标识 | `crypto.randomUUID()` |
| 时间 | `Date.now()` 毫秒 |

默认五个席位全部启用，密钥为空，建议模型只是占位，用户必须能改成任意模型 ID。不要把连通性判断写死在这些名字上。

| 席位 | 预设 | 建议模型 |
| --- | --- | --- |
| slot-1 | openai | gpt-4o |
| slot-2 | anthropic | claude-sonnet-4-5 |
| slot-3 | gemini | gemini-2.5-pro |
| slot-4 | deepseek | deepseek-chat |
| slot-5 | qwen | qwen-plus |

发送瞬间把显示名、模型、协议、温度、maxTokens 抄进 `SlotTurn`。之后用户改设置，不回写旧气泡上的名字。

`winnerSlotId` 只表示用户的人工选择，不触发新的请求。

---

## 9. 厂商适配

### 9.1 预设

`baseUrl` 不要尾斜杠。OpenAI 兼容协议的请求地址是 `${baseUrl}/chat/completions`，所以 `baseUrl` 要带上厂商要求的版本前缀。

| presetId | 名称 | 分组 | kind | baseUrl |
| --- | --- | --- | --- | --- |
| openai | OpenAI | 国际 | openai | `https://api.openai.com/v1` |
| anthropic | Anthropic | 国际 | anthropic | `https://api.anthropic.com` |
| gemini | Gemini | 国际 | gemini | `https://generativelanguage.googleapis.com/v1beta` |
| openrouter | OpenRouter | 国际 | openai | `https://openrouter.ai/api/v1` |
| groq | Groq | 国际 | openai | `https://api.groq.com/openai/v1` |
| deepseek | DeepSeek | 国内 | openai | `https://api.deepseek.com/v1` |
| qwen | 通义千问 | 国内 | openai | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| moonshot | Kimi | 国内 | openai | `https://api.moonshot.cn/v1` |
| zhipu | 智谱 | 国内 | openai | `https://open.bigmodel.cn/api/paas/v4` |
| siliconflow | 硅基流动 | 国内 | openai | `https://api.siliconflow.cn/v1` |
| ark | 火山方舟 | 国内 | openai | `https://ark.cn-beijing.volces.com/api/v3` |
| ollama | Ollama | 本地 | openai | `http://127.0.0.1:11434/v1` |
| custom | 自定义 | 自定义 | 用户选 | 空 |

火山方舟的模型 ID 通常是接入点 ID。占位符写「接入点 ID」，不要假装一个通用模型名。

建议模型（允许改写）：OpenRouter 与 Groq 留空，让用户填写；Ollama 默认 `llama3.1`；Kimi 默认 `moonshot-v1-128k`；智谱默认 `glm-4-flash`；硅基流动默认留空。

### 9.2 服务端翻译

客户端把第 7 节产出的 `messages` 原样提交。服务端不组装会话，只做协议翻译和流式转发。

**OpenAI 兼容**

```http
POST {baseUrl}/chat/completions
Authorization: Bearer {apiKey}
Content-Type: application/json
```

```json
{
  "model": "模型 ID",
  "temperature": 0.7,
  "max_tokens": 2048,
  "stream": true,
  "stream_options": { "include_usage": true },
  "messages": [{ "role": "system", "content": "..." }]
}
```

解析 SSE 的 `choices[0].delta.content`。结束标记 `data: [DONE]`。最后一块里的 `usage.prompt_tokens` / `usage.completion_tokens` 映射到用量。部分厂商不认识 `stream_options` 而返回 400 时，不带该字段重试一次。

**Anthropic**

```http
POST {baseUrl}/v1/messages
x-api-key: {apiKey}
anthropic-version: 2023-06-01
content-type: application/json
```

```json
{
  "model": "模型 ID",
  "max_tokens": 2048,
  "temperature": 0.7,
  "stream": true,
  "system": "没有则为省略该字段",
  "messages": [{ "role": "user", "content": "..." }]
}
```

只把 user/assistant 放进 `messages`。解析 SSE 事件 `content_block_delta` 的 `delta.text`。`message_delta` 里的 usage 映射到用量。`message_start` 里若已有 input usage，一并记录。

**Gemini**

```http
POST {baseUrl}/models/{model}:streamGenerateContent?alt=sse
x-goog-api-key: {apiKey}
content-type: application/json
```

`model` 做 URL 编码。`assistant` 映射为 Gemini 的 `model` 角色。

```json
{
  "systemInstruction": { "parts": [{ "text": "..." }] },
  "contents": [
    { "role": "user", "parts": [{ "text": "..." }] }
  ],
  "generationConfig": { "temperature": 0.7, "maxOutputTokens": 2048 }
}
```

从 `candidates[0].content.parts[].text` 取增量。`usageMetadata.promptTokenCount` / `candidatesTokenCount` 映射到用量。

若官方字段与本文不一致，以实现当日的官方文档为准，但第 10 节对浏览器的 SSE 契约不能改。

### 9.3 演示回答

`settings.demo === true` 时，所有席位都不访问 `/api/chat`。客户端按席位生成一段中文流式文本，逐字间隔约 16ms，并且五席的措辞必须不同：

| 席位 | 立场 |
| --- | --- |
| slot-1 | 用简短条目给出结论 |
| slot-2 | 先讲取舍 |
| slot-3 | 按步骤说明 |
| slot-4 | 先指出风险 |
| slot-5 | 用一个具体例子说明 |

正文需要复述用户问题中的关键词，让人看得出是针对这条消息的。第一行固定为 `【演示回答】`。演示数据也写入会话，导出时保留这一行，以便和真实回答区分。

关闭演示后，没有密钥的席位按缺失密钥失败，不静默继续演示。

---

## 10. 转发接口

`POST /api/chat`，运行时 `nodejs`。

请求头：`x-api-key: 密钥`。密钥不要放进 JSON。

请求体：

```typescript
interface ChatProxyRequest {
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  messages: ChatMessageInput[];
}
```

校验：

- `messages` 1–200 条
- 单条 content ≤ 100000 字
- 整包 JSON ≤ 1_500_000 字节，否则 413
- 角色只能是 system / user / assistant，且 system 若存在只能是第一条
- `temperature`、`maxTokens`、`model` 符合第 8 节

响应：`Content-Type: text/event-stream`，禁止缓冲。事件：

```text
event: delta
data: {"text":"增量文本"}

event: usage
data: {"inputTokens":120,"outputTokens":340}

event: done
data: {}

event: error
data: {"code":"provider_error","message":"给人看的中文说明"}
```

`error` 事件之后关闭流。HTTP 层的 400 只用于请求本身不合法（校验失败、地址被拒绝）。厂商失败用 200 的 SSE `error` 事件，这样五席互不影响，前端解析路径也只有一条。

校验失败的 HTTP 正文：

```json
{ "code": "invalid_request", "message": "中文说明" }
```

超时 90 秒，中止上游请求。不要跟随跨主机重定向：`redirect: "manual"`，收到 3xx 视为 `provider_error`。

错误码：

| code | 何时 | 界面文案 |
| --- | --- | --- |
| `missing_key` | 密钥为空。此码由前端直接产生，不必打到服务端 | 尚未配置密钥 |
| `invalid_base_url` | URL 无法解析 | 接口地址无法识别 |
| `blocked_host` | 命中第 13 节拒绝规则 | 这个地址不允许由服务器访问 |
| `timeout` | 超过 90 秒 | 厂商超时 |
| `provider_error` | 上游非 2xx 或无法解析 | 厂商返回错误 |
| `network` | 连不上游 | 网络连接失败 |
| `aborted` | 用户停止 | 已停止 |
| `empty_response` | 结束时正文仍为空 | 厂商没有返回正文 |

`provider_error` 可把上游状态码和截断到 400 字的响应附在说明里。附上之前先删掉形如密钥的片段（`sk-` 开头、`key=`、`api_key`）。

`POST /api/models` 只服务 OpenAI 兼容协议。请求体是 `{ "baseUrl": string }`，密钥仍在 `x-api-key`。地址校验与 `/api/chat` 相同。上游为 `GET {baseUrl}/models`，请求头 `Authorization: Bearer {apiKey}`。成功时返回 `{ "ids": string[] }`，取每条数据的 `id` 字段，去空、去重，最多 200 条。失败时返回与校验失败相同形状的 JSON，HTTP 状态 400 或 502，界面保持可手写模型 ID。

前端用 `AbortController` 绑定到该席。停止只中止该请求。`aborted` 不弹全局错误条。

一个席失败时，其他席继续流式输出。全局 toast 仅用于设置保存失败、导出失败、IndexedDB 不可用。对话错误留在列内。

---

## 11. 前端结构

```text
src/app/layout.tsx
src/app/page.tsx
src/app/globals.css
src/app/api/chat/route.ts
src/app/api/models/route.ts
src/components/workspace/workspace.tsx
src/components/workspace/session-rail.tsx
src/components/workspace/topbar.tsx
src/components/workspace/column.tsx
src/components/workspace/timeline.tsx
src/components/workspace/composer.tsx
src/components/workspace/settings-sheet.tsx
src/components/workspace/markdown.tsx
src/components/ui/                  # 只放 shadcn 生成的组件
src/lib/types.ts
src/lib/presets.ts
src/lib/context.ts                  # 第 7 节
src/lib/demo.ts
src/lib/storage.ts
src/lib/proxy-guard.ts              # 第 13 节，纯函数
src/lib/providers/openai.ts
src/lib/providers/anthropic.ts
src/lib/providers/gemini.ts
src/lib/sse.ts                      # 解析上游与写出下游事件
```

工作台状态放在 `WorkspaceProvider`。发送、停止、续谈、重新生成都是事件函数。

重新生成：仅最后一轮、该席 pass 最大的那条，且该条不在 `pending` / `streaming`。清空其内容与用量，状态改回 `pending`，用同一 pass 的上下文再请求。其他席不动。

续谈：对每个启用中的席追加一条新的 `SlotTurn`（pass + 1），然后并行请求。

会话标题：第一轮创建时设为用户文本 trim 后的前 24 个字符。之后只在用户重命名时改变。

最后打开的会话 id 存在 `localStorage` 键 `wuxi.lastSessionId`。

---

## 12. 持久化

| 存储 | 键 / 库 | 内容 |
| --- | --- | --- |
| localStorage | `wuxi.settings.v1` | `Settings`。禁止出现密钥字段 |
| localStorage | `wuxi.secrets.v1` | `SecretMap` |
| localStorage | `wuxi.lastSessionId` | 字符串 |
| IndexedDB | 库 `wuxi`，版本 1，对象库 `sessions`，keyPath `id`，索引 `updatedAt` | `Session` |

写入设置与密钥时整份替换并捕获 `QuotaExceeded`。失败时 toast：「浏览器存储空间不足，这次修改没有保存。」

会话在每轮创建、每次 delta 结束的帧、以及完成时保存。delta 保存用 `requestAnimationFrame` 合并，避免每个 token 写一次库。刷新后允许丢失尚未刷盘的极短尾巴；完成态必须已写入。

`version` 不是 1 时，丢弃该键并回退到默认设置，不要抛未捕获异常。不写迁移框架。

清除站点数据即卸载，这是预期行为。设置页要写明这一点。

---

## 13. 安全

密钥规则：

- 只存在 `wuxi.secrets.v1` 和当次请求头 `x-api-key`
- 服务端日志、错误正文、导出、会话对象、设置对象都不得写入密钥
- 界面只显示末四位，其余以 `•` 代替。编辑时可以整段替换

地址规则，实现为纯函数 `assertSafeBaseUrl`：

1. 必须能被 `URL` 解析。
2. 拒绝带用户名或密码的 URL。
3. 主机为 `localhost`、`127.0.0.1`、`::1` 时，只允许 `http:` 与 `https:`。
4. 其他主机只允许 `https:`。
5. 拒绝字面私网、链路本地、回环、组播 IP，以及 `0.0.0.0`、`169.254.169.254`、`metadata.google.internal`。
6. 主机名是 IP 时按第 5 条判断；主机名不是 IP 时不在本期做 DNS 解析。残留风险是 DNS 重绑定，本期接受，不为它加解析器。

不要把密钥写进仓库示例环境变量。不需要 `.env` 也能跑。可选环境变量只有 `PROXY_TIMEOUT_MS`，默认 90000。

---

## 14. 视觉

这是一张比较工作台，不是落地页。

- 字体：`IBM Plex Sans` 与 `Noto Sans SC` 做界面，`IBM Plex Mono` 做模型 ID、耗时和代码。用 `next/font` 引入。
- 字色 `#1c1915`，次要字色 `#6b645b`，危险色 `#9b2c2c`。
- 席位色只用于 3px 顶条、色点和时间线卡片左边线：

| 席位 | 色值 |
| --- | --- |
| slot-1 | `#c4552a` |
| slot-2 | `#2f6f5e` |
| slot-3 | `#3d5a80` |
| slot-4 | `#a15c2f` |
| slot-5 | `#6b4c7a` |

- 圆角：列与卡片 10px，控件 8px。
- 不使用渐变背景、玻璃拟态和装饰性插画。
- 五个席位在视觉上同权重，不要把第一席做成「主模型」。
- shadcn 组件用于按钮、输入、对话框、Sheet、选择器、开关、手风琴、下拉菜单、提示、分隔线、滚动区域、toast。不要手写这些控件，也不要再引入另一套组件库。

---

## 15. 空态、失败与边界

| 场景 | 表现 |
| --- | --- |
| 第一次打开 | 直接进入空白工作台。会话空态使用第 6.2 节文案。输入框可用。 |
| 全部未配置密钥且未开演示 | 允许输入。发送后各席列内显示「尚未配置密钥」。顶栏提供「使用演示回答」。 |
| 仅部分席位有密钥 | 有密钥的席位正常请求，其余列内报错。 |
| 演示开启 | 顶栏常驻「正在使用演示回答」，可关闭。 |
| IndexedDB 打不开 | 主区说明「这台浏览器存不了对话，发送仍可进行，但刷新后不会留下。」本轮仍可在内存中使用。 |
| 单席超时或 401 | 只在该列显示「厂商返回错误」及去掉密钥后的细节。 |
| 用户连点发送 | 进行中主按钮已变为停止，第二次点击是停止，不是第二条消息。 |
| 超长输出 | 不在客户端截断正文。列内部滚动。 |
| 模型 ID 为空 | 该席不发请求，错误码用 `invalid_request`，文案「请填写模型 ID」。 |

组件在数据加载完成前显示列骨架，不显示「Welcome」或旋转的全屏加载超过一次存储读取所需的时间。存储读取失败走上一张表，不白屏。

---

## 16. 技术栈与工程约束

- 使用 `create-next-app` 的官方脚手架：TypeScript、Tailwind、ESLint、App Router、`src/` 目录、导入别名 `@/`。不要 Pages Router。脚手架若生成示例首页，用工作台替换掉。
- 先把脚手架生成在临时目录，再移到仓库根目录。不要把目标路径指到文件系统根。
- 用 shadcn 官方 CLI 添加第 14 节的组件。
- 依赖保持在：Next.js、React、Tailwind、shadcn 所需、`react-markdown`、`remark-gfm`、Vitest。语法高亮库不是验收项。
- 脚本：`dev`、`build`、`lint`、`test`。
- 开发端口 `3847`：`npm run dev -- -p 3847`。
- 实现完成后的根 README 用中文写：这是什么、如何安装、如何启动、密钥存在浏览器本地、如何打开演示、并链接 `SPEC.md`。

---

## 17. 实现顺序

按顺序做，不要跳到视觉打磨而留下假数据请求。

1. 脚手架、Tailwind、shadcn、字体与第 14 节的底色。
2. `types`、`presets`、第 7 节 `context` 与其单元测试。
3. `proxy-guard` 与其单元测试。
4. 三种厂商翻译和 `/api/chat`，外加 SSE 解析测试（用夹具字符串，不访问真实厂商）。
5. `storage`。
6. 工作台骨架：会话栏、五列、输入框、设置 Sheet。
7. 并行对比的真实流式路径，包括单席失败、单席停止、全部停止、重新生成。
8. 演示回答。
9. 圆桌续谈与时间线。
10. 导出、投票、编辑用户消息并截断、测试连接、拉取模型列表。
11. 补齐第 15 节的空态与窄屏布局。
12. `lint`、`test`、`build`。

---

## 18. 验收

下面每一条都要能在运行中的应用里做到。

1. 打开 `/` 看到五个席位和工作台，没有独立欢迎页。
2. 未填密钥时发送，五列各自出现「尚未配置密钥」，页面不崩溃。
3. 打开演示后发送一句中文，五列流式出现不同正文，且都以 `【演示回答】` 开头。刷新后会话仍在。
4. 只给两个席位填入可用密钥并关闭演示。发送后这两席出真实流式正文，另外三席列内报错，不阻断前两席。
5. 回答过程中「停止此席」只打断该席；「停止」打断全部。已生成的半截文字还在。
6. 并行对比下，检查发出的消息（测试或网络面板均可）：请求体不包含其他席的文字。
7. 圆桌下，两席都完成后点「续谈」，得到 pass 1。这次请求含有其他席刚才的正文，回复仍在各自的列里。再续谈一次得到 pass 2。pass 2 完成后「续谈」消失。
8. 编辑第一轮用户消息后，后面的轮次消失，并按新文本重新请求。
9. 导出的 Markdown 含各席正文与耗时，不含密钥、不含 `sk-`。
10. 把 baseUrl 改成 `http://169.254.169.254/` 后测试连接，界面得到「这个地址不允许由服务器访问」，服务器没有去请求该地址。
11. 宽度 390px 时可以发送，并能在「全部」里向下读完五席的回答。
12. `npm test`、`npm run lint`、`npm run build` 通过。

---

## 19. 测试

用 Vitest。至少覆盖：

1. 第 7.3 节的三个装配例子（圆桌新一轮、并行新一轮、续谈 pass 1）。断言全文，而不是只断言「包含某个词」。并行例子要断言不含 `西班牙语`。
2. 失败轮次不产生 assistant 消息；连续 user 被 C7 合并。
3. 空的全局提示和席位提示不会变成空 system。
4. `assertSafeBaseUrl` 拒绝：`http://example.com`、`https://user:pass@example.com`、`https://169.254.169.254/`、`https://10.0.0.8/`、`http://192.168.1.1/`。放行：`https://api.openai.com/v1`、`http://127.0.0.1:11434/v1`。
5. OpenAI SSE 夹具能拼出增量文本，并在 `[DONE]` 前读到 usage。Anthropic 的 `content_block_delta` 夹具同样。
6. 错误文本里的 `sk-abc123` 会被去掉。

不要为了测试访问真实厂商。

---

## 20. 规范没写到时

按下面处理，不要为此提问，也不要顺手加功能：

- 文案使用简体中文，短句，语气像工具而不是客服。
- 能用现有 shadcn 组件就不要新造控件。
- 动画只保留颜色与透明度的 150ms 过渡。不要做消息飞入。
- 时间显示用本地时区的 24 小时制。
- 未知的厂商 4xx/5xx 统一归到 `provider_error`。
- 不要加埋点、不加大模型总结、不加主题切换。界面只有这一套浅色。
- 不要把演示回答包装成真实模型已经连通。

---

## 附录 A. 发送时序

```mermaid
sequenceDiagram
  participant User as 用户
  participant UI as 工作台
  participant Store as IndexedDB
  participant Proxy as /api/chat
  participant Vendor as 厂商

  User->>UI: 发送一条问题
  UI->>UI: 按 C1–C8 为每个启用席组装消息
  UI->>Store: 写入该轮，状态 pending
  par 席位 1
    UI->>Proxy: POST messages + 请求头密钥
    Proxy->>Vendor: 翻译后的流式请求
    Vendor-->>Proxy: token
    Proxy-->>UI: event delta
  and 席位 2
    UI->>Proxy: POST
    Proxy-->>UI: event error
  end
  UI->>Store: 各席终态
```

席位 2 的错误不取消席位 1。

---

## 附录 B. 给浏览器的 SSE 契约

事件名只有 `delta`、`usage`、`done`、`error`。

`delta.text` 是增量，不是累计全文。前端自己拼接。空字符串的 delta 忽略，且不记为首字时间。

第一个非空 delta 写下 `firstTokenAt`。`done` 或 `error` 或中止写下 `finishedAt`。

解析器要容忍分块边界切在半条 SSE 上。不要假设一次 `read()` 等于一个事件。

---

## 附录 C. 文案表

实现时使用左列原文。

| 位置 | 文案 |
| --- | --- |
| 产品名 | 五席 |
| 顶栏说明 | 一条问题，五个模型并排作答 |
| 新对话 | 新对话 |
| 模式 | 并行对比 / 圆桌 |
| 视图 | 分栏 / 时间线 |
| 发送 | 发送 |
| 停止全部 | 停止 |
| 停止单席 | 停止此席 |
| 续谈 | 续谈 |
| 重新生成 | 重新生成 |
| 复制 | 复制 |
| 导出 | 导出 |
| 设置 | 席位设置 |
| 演示开 | 使用演示回答 |
| 演示关 | 关闭演示 |
| 演示条 | 正在使用演示回答 |
| 测试连接 | 测试连接 |
| 连通 | 已连通 |
| 无密钥 | 尚未配置密钥 |
| 无启用席 | 至少启用一个席位 |
| 无会话 | 还没有对话。发送第一条消息后，会记在这台浏览器里。 |
| 密钥说明 | 密钥只保存在这台浏览器 |
| 费用说明 | 请求直接发往你填写的厂商，费用记在对应账号上。 |
| 未完成 | 已停止，以下为未完成输出 |
| 空回复 | 厂商没有返回正文 |
| 投票 | 这条更好 |
| 已投票 | 已选{显示名} |
| 存储失败 | 浏览器存储空间不足，这次修改没有保存。 |
| 对话存储不可用 | 这台浏览器存不了对话，发送仍可进行，但刷新后不会留下。 |

---

## 附录 D. 导出样例

```markdown
# 选一门外语

- 导出时间：2026-10-13 22:40
- 模式：圆桌

## 第 1 轮 · 圆桌

选一门外语

### 席位 1 · gpt-4o
1.2s 首字 · 4.8s 完成 · 入 80 · 出 120

选日语

### 席位 2 · deepseek-chat
失败 · 尚未配置密钥

人工选择：席位 1
```

没有发生的字段整行省略。演示回答因为正文里已有 `【演示回答】`，导出不再另加标签。

---

## 附录 E. 实现检查清单

- [ ] 五个固定席位，可停用，列位置仍在
- [ ] 并行对比不把其他席正文放进请求
- [ ] 圆桌续谈最多到 pass 2，且引用的是上一 pass
- [ ] 每席独立请求、独立停止、独立失败
- [ ] 流式过程中不渲染 Markdown
- [ ] 密钥不进设置、会话、导出、日志和错误文案
- [ ] 私网与元数据地址在服务端被拒绝
- [ ] 演示模式不访问网络
- [ ] 刷新后会话、设置、密钥都还在
- [ ] 窄屏可以读完五席
- [ ] `test`、`lint`、`build` 通过
