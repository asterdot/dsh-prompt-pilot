# Prompt Pilot for DeepSeek Harness

[中文](README.md) · [Changelog](CHANGELOG.md)

Write a draft in the composer and click Enhance. The plugin calls a model and replaces the draft in place, but does not send a chat message. Edit, undo, or send the result yourself.

## Moving from an earlier version

In-place rewriting, undo, first-message mode advice and tiered skill suggestions remain. Mode advice does not switch modes. Suggested skill names can appear in the draft for review; the plugin does not execute the skills. This version favors a usable rewrite over a clarification dialogue: if the model asks a question instead, the host tries to recover a rewrite or retries with the classic rules, keeping the original draft if neither works.

## Install or upgrade from a local package

The manifest requires DSH ≥0.1.0 and Node.js ≥22. Use a desktop or web profile with the conversation UI and locale services, and select an available model in DSH. Without the host `llm` service, settings may work while enhancement is unavailable. From the source directory, build the package and substitute its **actual absolute path** below. No registry release is assumed.

```sh
npm run pack
dsh plugin --profile desktop add "/absolute/path/to/dist/dsh-prompt-pilot-2.1.0.tgz"
```

Replace `desktop` with `web` for the web profile. Use the bundled DSH CLI if `dsh` is not on PATH. To upgrade, repeat `add` with the new package in the same profile, restart DSH, then check the version, model and reference switches in settings. If `dsh-prompt-rewriter` is also installed, disable one plugin to avoid duplicate buttons. Do not assume preferences migrate between plugins.

## What reaches the model?

The session model is the default. With `useCustomModel` enabled, check `enhanceProvider` and `enhanceModel`. The provider may be remote: **clicking Enhance calls it before you send the message**. Review the draft, filenames and settings before working with sensitive material.

Settings include rewrite style (`ruleSet`, default `legacy`; alternatives: `intent-first`, `workbuddy`), a fixed-model toggle (`useCustomModel`, off by default), and model selection (`enhanceProvider` / `enhanceModel`; follows the current conversation by default). References are independent: `referenceContext` (on) includes text from this conversation's in-memory record; `referenceImages` (off) allows images attached to the current draft; `composerFiles` (off) controls current-draft files; `referenceFiles` (off by default) is the legacy file-toggle compatibility field. Up to eight filenames may still be sent when content reading is off. The optional shortcut `shortcutEnabled` is off by default; the button remains available.

The composer context controls also independently cover current-draft images/files (`composerImages`, `composerFiles`, both off by default) and historical images/file text (`contextImages`, `contextFileContents`, both off by default). Counts default to two; image counts cap at four and file counts at two. Images follow host attachment-service limits: defaults are 5,000,000 bytes per image, four images and 10,000,000 bytes total per message; actual host limits take precedence. Before a model request, the attachment service prepares image content at up to 1024×1024 and 1 MiB. Files are limited to two at 5 MiB each; text previews to 6,000 characters; filenames to eight (names may remain when content reading is off). Unsupported or oversized attachments are skipped.

Historical text comes only from the current conversation's in-memory record, not from on-disk session logs. The plugin ranks messages by lexical relevance to the draft, selects at most 24 messages and 4,000 characters per message, then trims to the default 6,000-token history budget and at most 5% of the model context window. The excerpt is bounded and may omit history. First-message detection also uses only the active in-memory record and never scans disk logs. Each enhancement is a separate stateless model call: no provider session id is attached and no model conversation is retained between requests.

## Local verification

Run these commands in the source directory containing the scripts and tests:

```sh
npm run check
npm test
npm pack --dry-run --ignore-scripts
```

These check syntax, run tests and preview package contents without uploading. For integration troubleshooting, `POST /api/prompt-pilot` requests a rewrite, `GET/POST /api/prompt-pilot/settings` reads or writes preferences, and `GET /api/prompt-pilot/context-status` checks for earlier context. After installation, use a non-sensitive draft to verify rewrite and undo without sending a message; local tests do not replace this check.

[Report an issue](https://github.com/asterdot/dsh-prompt-pilot/issues) with the version, profile type and redacted steps. Do not include credentials, raw attachments or session logs.
