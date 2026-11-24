# 变更记录 · Changelog

## 2.1.0

**中文**

- 记录当前独立设置：会话文字、历史图片/文件文本、草稿图片/文件、固定模型、改写方式和快捷键，并注明默认值和数量上限。
- 明确历史文字只从当前会话内存记录选取，按草稿词项相关性排序并受消息数、字符数、token 预算及模型窗口比例约束；磁盘日志正文不作为模型上下文。
- 明确媒体限额和跳过策略，以及每次模型调用均独立、无状态且不带 provider session id。
- 理由：避免将有界摘录描述为完整历史、混淆草稿媒体与历史媒体开关，或暗示模型会话被持久化。增强失败时原草稿保持不变；若无法确认分段编辑安全回滚，不以整稿覆盖，避免抹掉并发编辑。

**English**

- Documented the independent controls for conversation text, historical images/file text, draft images/files, fixed-model selection, rewrite style and shortcut, including defaults and count limits.
- Clarified that history text is selected only from the current conversation's in-memory record, ranked by draft-term relevance and bounded by message, character, token-budget and model-window limits; on-disk log text is not model context.
- Recorded media limits and skip behavior, plus independent stateless model calls without a provider session id.
- Rationale: avoid describing bounded excerpts as full history, conflating draft and historical media controls, or implying persistent model sessions. Failures leave the original draft intact; if segmented edits cannot be safely rolled back, the plugin does not overwrite the whole draft and risk erasing concurrent edits.

## 2.0.0

**中文**

- 独立重构版本。保留原地改写、撤销、首条消息模式建议及分档技能推荐，不自动发送消息、切换模式或执行技能。
- 优先返回可用草稿：遇到追问时尝试提取改写或按经典规则重试，仍不可用则保留原稿。
- 升级及数据边界见 [中文指南](README.md)：关闭文件内容引用不等于隐藏文件名，关闭历史引用也不等于禁用首条消息判断。

**English**

- Independent rebuild. In-place rewrites, undo, first-message mode advice and tiered skill suggestions remain. Sending, switching modes and executing skills stay under user control.
- When a model asks a question instead of rewriting, the host tries to recover a rewrite or retries with classic rules; otherwise it keeps the draft.
- See the [English guide](README.en.md) for upgrades and data boundaries. Disabling file content does not hide filenames; disabling history does not turn off first-message detection.

