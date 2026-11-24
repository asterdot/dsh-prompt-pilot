# Prompt Pilot for DeepSeek Harness

[中文](README.md) · [Changelog](CHANGELOG.md)

Write a draft in the composer and click Enhance. The plugin calls a model and replaces the draft in place, but does not send a chat message. Edit, undo, or send the result yourself.

## Moving from an earlier version

In-place rewriting, undo, first-message mode advice and tiered skill suggestions remain. Mode advice does not switch modes. Suggested skill names can appear in the draft for review; the plugin does not execute the skills. This version favors a usable rewrite over a clarification dialogue: if the model asks a question instead, the host tries to recover a rewrite or retries with the classic rules, keeping the original draft if neither works.

## Install or upgrade from a local package

The manifest requires DSH ≥0.1.0 and Node.js ≥22. Use a desktop or web profile with the conversation UI and locale services, and select an available model in DSH. Without the host `llm` service, settings may work while enhancement is unavailable. From the source directory, build the package and substitute its **actual absolute path** below. No registry release is assumed.

```sh
npm run pack
dsh plugin --profile desktop add "/absolute/path/to/dist/dsh-prompt-pilot-2.0.0.tgz"
```

Replace `desktop` with `web` for the web profile. Use the bundled DSH CLI if `dsh` is not on PATH. To upgrade, repeat `add` with the new package in the same profile, restart DSH, then check the version, model and reference switches in settings. If `dsh-prompt-rewriter` is also installed, disable one plugin to avoid duplicate buttons. Do not assume preferences migrate between plugins.

## What reaches the model?

The session model is the default. With `useCustomModel` enabled, check `enhanceProvider` and `enhanceModel`. The provider may be remote: **clicking Enhance calls it before you send the message**. Review the draft, filenames and settings before working with sensitive material.

| Setting (default) | Effect |
|---|---|
| `referenceFiles` (on) | Up to two composer files, 5 MiB each; text previews are limited to 6000 characters. Turning this off excludes file contents, but up to eight filenames can still be included. Paths typed into the draft remain text. |
| `referenceImages` (off) | When enabled, composer images within host attachment limits may be model inputs. Unsupported or oversized attachments are skipped. |
| `referenceContext` (on) | Recent in-memory turns from this session take priority. Default limits are 24 messages, 4000 characters each and a 6000-token history budget. Turning this off excludes their text from the rewrite. A separate first-message check can still inspect local session logs; it does not supply those logs to the model. |
| `shortcutEnabled` (off) | Enables the optional shortcut; the button works without it. |
| `ruleSet` (`legacy`) | Also accepts `intent-first` and `workbuddy`. Changing rules does not change the model. |

## Local verification

Run these commands in the source directory containing the scripts and tests:

```sh
npm run check
npm test
npm pack --dry-run --ignore-scripts
```

These check syntax, run tests and preview package contents without uploading. For integration troubleshooting, `POST /api/prompt-pilot` requests a rewrite, `GET/POST /api/prompt-pilot/settings` reads or writes preferences, and `GET /api/prompt-pilot/context-status` checks for earlier context. After installation, use a non-sensitive draft to verify rewrite and undo without sending a message; local tests do not replace this check.

[Report an issue](https://github.com/asterdot/dsh-prompt-pilot/issues) with the version, profile type and redacted steps. Do not include credentials, raw attachments or session logs.
