# 提示词领航 · Prompt Pilot

[English](README.en.md) · [变更记录](CHANGELOG.md)

在 DeepSeek Harness（DSH）的输入框里写下草稿，点击增强，再决定是否发送。插件会调用模型，但不会替你发送聊天消息。可以继续编辑结果，也可以撤销。

## 从旧版迁移

保留原地改写、撤销、首条消息的模式建议，以及按相关性分档的技能建议。模式不会自动切换，技能不会自动执行。推荐的技能名可能写入草稿，请在发送前检查。新版侧重交付能直接使用的提示词：如果模型只返回追问，会尝试提取改写或用经典规则重试；仍不可用时保留原稿，不另开澄清对话。

## 安装或升级本地包

清单要求 DSH ≥0.1.0、Node.js ≥22。使用支持会话输入框和语言服务的 desktop 或 web 配置，并在 DSH 中选好可用模型；没有 `llm` 服务时，设置可用也不代表能改写。以下命令不依赖 npm 上已有此版本。从项目根目录打包，再用**实际绝对路径**安装：

```sh
npm run pack
dsh plugin --profile desktop add "/absolute/path/to/dist/dsh-prompt-pilot-2.1.0.tgz"
```

如果使用 web，把 `desktop` 换成 `web`。如果 `dsh` 不在 PATH，改用安装目录中的 DSH CLI。升级已有 Prompt Pilot 时，在同一个配置中用新版包重复 `add`，重启 DSH，检查插件设置中的版本、模型和引用开关。若同时装有 `dsh-prompt-rewriter`，先停用其中一个，避免出现两个按钮；不要假设不同插件之间会迁移偏好。

## 点击增强时，哪些数据会交给模型？

默认使用会话模型。若启用 `useCustomModel`，请核对 `enhanceProvider` 和 `enhanceModel`。服务商可能是远程服务，**增强发生在发送聊天消息之前**。涉及敏感材料时，应先检查草稿、附件名、模型和下列设置。

设置页提供改写方式（`ruleSet`，默认 `legacy`；另有 `intent-first`、`workbuddy`）、固定模型开关（`useCustomModel`，默认关）和模型选择（`enhanceProvider` / `enhanceModel`；默认跟随当前会话）。上下文与附件引用可独立控制：`referenceContext`（默认开）决定是否从当前会话的内存记录取文本；`referenceImages`（关）允许读取本次草稿所附图片；`composerFiles`（关）控制本次草稿文件，`referenceFiles`（默认关）是旧版文件开关的兼容字段，关闭内容读取时仍可能发送最多 8 个文件名。快捷键 `shortcutEnabled` 默认关闭；按钮仍可用。

输入框按钮附近的上下文控件还可单独控制草稿图片和文件（`composerImages`、`composerFiles`，均默认关），以及历史图片/文件文本（`contextImages`、`contextFileContents`，均默认关）。数量默认分别为 2；图片数量最多 4，文件数量最多 2。图片控件遵从宿主附件服务限额：默认单图最多 5,000,000 bytes、每条消息最多 4 张且图片总量最多 10,000,000 bytes；实际宿主限额优先。图片送入请求前由附件服务处理为最大 1024×1024、最大 1 MiB 的请求内容。文件最多 2 个、每个 5 MiB；文本预览最多 6000 字符，文件名最多 8 个（名称会在关闭内容读取时保留）。超限或无法读取的附件会跳过。

上下文文字只从当前会话的内存记录读取，不从磁盘会话日志取作模型上下文。系统根据草稿词项相关性选取消息，最多 24 条、每条最多 4000 字符，并受默认 6000 token 历史预算及模型上下文窗口 5% 上限约束；预算会裁剪内容，因此不是完整历史。首条消息状态探测也只使用当前内存记录，不扫描磁盘日志。每次增强都是独立、无状态的模型调用：不附带 provider session id，不保留跨请求模型会话。

## 本地验证

在含开发脚本和测试的源码目录运行：

```sh
npm run check
npm test
npm pack --dry-run --ignore-scripts
```

依次检查语法、运行测试、预览包文件列表（不上传）。排查集成时区分三个宿主路由：`POST /api/prompt-pilot` 调用模型；`GET/POST /api/prompt-pilot/settings` 读写偏好；`GET /api/prompt-pilot/context-status` 判断会话是否已有上下文。安装后可用不含敏感信息的草稿手动检查增强、撤销和是否保持未发送；本地脚本不能替代此检查。

[反馈问题](https://github.com/asterdot/dsh-prompt-pilot/issues)时请附版本、配置类型和脱敏后的复现步骤，不要贴密钥、原始附件或会话日志。
