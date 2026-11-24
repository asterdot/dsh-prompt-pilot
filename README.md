# 提示词领航 · Prompt Pilot

[English](README.en.md) · [变更记录](CHANGELOG.md)

在 DeepSeek Harness（DSH）的输入框里写下草稿，点击增强，再决定是否发送。插件会调用模型，但不会替你发送聊天消息。可以继续编辑结果，也可以撤销。

## 从旧版迁移

保留原地改写、撤销、首条消息的模式建议，以及按相关性分档的技能建议。模式不会自动切换，技能不会自动执行。推荐的技能名可能写入草稿，请在发送前检查。新版侧重交付能直接使用的提示词：如果模型只返回追问，会尝试提取改写或用经典规则重试；仍不可用时保留原稿，不另开澄清对话。

## 安装或升级本地包

清单要求 DSH ≥0.1.0、Node.js ≥22。使用支持会话输入框和语言服务的 desktop 或 web 配置，并在 DSH 中选好可用模型；没有 `llm` 服务时，设置可用也不代表能改写。以下命令不依赖 npm 上已有此版本。从项目根目录打包，再用**实际绝对路径**安装：

```sh
npm run pack
dsh plugin --profile desktop add "/absolute/path/to/dist/dsh-prompt-pilot-2.0.0.tgz"
```

如果使用 web，把 `desktop` 换成 `web`。如果 `dsh` 不在 PATH，改用安装目录中的 DSH CLI。升级已有 Prompt Pilot 时，在同一个配置中用新版包重复 `add`，重启 DSH，检查插件设置中的版本、模型和引用开关。若同时装有 `dsh-prompt-rewriter`，先停用其中一个，避免出现两个按钮；不要假设不同插件之间会迁移偏好。

## 点击增强时，哪些数据会交给模型？

默认使用会话模型。若启用 `useCustomModel`，请核对 `enhanceProvider` 和 `enhanceModel`。服务商可能是远程服务，**增强发生在发送聊天消息之前**。涉及敏感材料时，应先检查草稿、附件名、模型和下列设置。

| 设置（默认） | 实际作用 |
|---|---|
| `referenceFiles`（开） | 可参考输入框所附的文件；最多 2 个，每个 5 MiB，文本预览最多 6000 字符。关闭后不传文件内容，但仍可传最多 8 个文件名；草稿内手写的路径也仍是文本。 |
| `referenceImages`（关） | 开启后，符合宿主附件服务限额的输入框图片可作为模型输入。无法处理或超限的附件会跳过。 |
| `referenceContext`（开） | 从当前会话内存记录中，优先选取最近的消息，按预算裁剪；默认最多 24 条、每条 4000 字符、历史预算 6000 token。关闭后不将这些历史正文加入改写。判断是否为首条消息时仍可检查本机会话日志；这个检查不是把日志作为模型输入。 |
| `shortcutEnabled`（关） | 按需开启快捷键；不开启也可以点击按钮。 |
| `ruleSet`（`legacy`） | 还可选择 `intent-first` 或 `workbuddy`。切换规则不等于更换模型。 |

## 本地验证

在含开发脚本和测试的源码目录运行：

```sh
npm run check
npm test
npm pack --dry-run --ignore-scripts
```

依次检查语法、运行测试、预览包文件列表（不上传）。排查集成时区分三个宿主路由：`POST /api/prompt-pilot` 调用模型；`GET/POST /api/prompt-pilot/settings` 读写偏好；`GET /api/prompt-pilot/context-status` 判断会话是否已有上下文。安装后可用不含敏感信息的草稿手动检查增强、撤销和是否保持未发送；本地脚本不能替代此检查。

[反馈问题](https://github.com/asterdot/dsh-prompt-pilot/issues)时请附版本、配置类型和脱敏后的复现步骤，不要贴密钥、原始附件或会话日志。
