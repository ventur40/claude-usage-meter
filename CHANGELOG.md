# Changelog

## 1.1

- Renew an expired Claude Code session automatically by running
  `claude auth status`, which sends no prompt and uses no plan usage.
  Can be turned off in the settings.
- New setting for the path to the `claude` command.
- Explain `CLAUDE_CODE_OAUTH_TOKEN` when the session cannot be renewed.

## 1.0

- First release: 5-hour, weekly and per-model limits in the top bar, with
  reset times, configurable thresholds, optional icon and Spanish translation.
