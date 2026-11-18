# Prompt Pilot

[简体中文](README.md)

An unofficial DeepSeek Harness plugin forked from [huaguoxingkong/dsh-prompt-rewriter v1.8.3](https://github.com/huaguoxingkong/dsh-prompt-rewriter/tree/v1.8.3). It is not affiliated with the upstream project or DeepSeek.

Rewrite a draft in place without sending it. Before sending the first message, review optional mode advice without switching modes automatically. Relevant available skill names are added to the draft as likely or possible suggestions; the plugin does not load or execute them.

Once the npm package is published, install with `dsh plugin --profile desktop add dsh-prompt-pilot` (or use `--profile web`) and restart DSH. Node.js 22+ is required. Avoid enabling both upstream and this fork if you only want one rewrite button.

The rewrite uses a DSH model and can include conversation context and attachments depending on your settings. Skill matching runs locally and does not send the catalog to the model.

[MIT License](LICENSE) and [attributions](NOTICE.md).
