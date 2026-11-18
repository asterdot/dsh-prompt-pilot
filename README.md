# 提示词领航 · Prompt Pilot

[English](README.en.md)

DeepSeek Harness（DSH）的非官方社区二改插件，基于 [huaguoxingkong/dsh-prompt-rewriter v1.8.3](https://github.com/huaguoxingkong/dsh-prompt-rewriter/tree/v1.8.3)。与原项目独立发布，不代表上游或 DeepSeek。

- 点击输入框旁的纸飞机，在原处改写草稿，可以撤销，不会自动发送。
- 发送首条消息前，适合时显示模式建议和简短理由，不会自动切换模式。手动编辑、撤销、离开会话或发送后，建议会消失。
- 把与任务相关且当前会话可用的技能分成「很可能用到」和「可能用到」，把技能名写入草稿供发送前检查；不自动加载或执行技能。

## 安装

需要 DSH 和 Node.js 22 或更高版本。npm 包发布后，在终端运行：

```sh
dsh plugin --profile desktop add dsh-prompt-pilot
dsh plugin --profile web add dsh-prompt-pilot
```

按实际使用的版本选一条，安装后重启 DSH。不建议和原版同时启用，以免出现两个改写按钮。

## 数据与验证

改写使用 DSH 当前会话模型或在插件设置里指定的模型。根据设置，改写可参考对话、图片和文件；请在处理敏感材料前检查这些开关及模型提供方。技能匹配在本地完成，不向模型发送技能目录。

开发检查：`npm ci`、`npm run check`、`npm test`。

MIT 许可，保留[上游版权](LICENSE)和[第三方署名](NOTICE.md)。
