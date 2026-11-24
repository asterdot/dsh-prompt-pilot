# 变更记录 · Changelog

## 2.0.0

**中文**

- 当前源码版本。保留原地改写、撤销、首条消息模式建议及分档技能推荐，不自动发送消息、切换模式或执行技能。
- 优先返回可用草稿：遇到追问时尝试提取改写或按经典规则重试，仍不可用则保留原稿。
- 升级及数据边界见 [中文指南](README.md)：关闭文件内容引用不等于隐藏文件名，关闭历史引用也不等于禁用首条消息判断。

**English**

- Source version. In-place rewrites, undo, first-message mode advice and tiered skill suggestions remain. Sending, switching modes and executing skills stay under user control.
- When a model asks a question instead of rewriting, the host tries to recover a rewrite or retries with classic rules; otherwise it keeps the draft.
- See the [English guide](README.en.md) for upgrades and data boundaries. Disabling file content does not hide filenames; disabling history does not turn off first-message detection.
