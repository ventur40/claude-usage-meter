# Claude Usage Meter

A GNOME Shell extension that shows the usage limits of your Claude Pro or Max
plan in the top bar: the 5-hour session window, the weekly window and any
per-model weekly limits, each with its reset time.

Unofficial. Not affiliated with or endorsed by Anthropic.

## Requirements

- GNOME Shell 46 to 51
- [Claude Code](https://docs.claude.com/en/docs/claude-code) installed and
  signed in with a Pro or Max account

## How it works

Claude Code stores an OAuth access token in `~/.claude/.credentials.json`
(or in `$CLAUDE_CONFIG_DIR`). Every few minutes the extension reads that
token and calls `https://api.anthropic.com/api/oauth/usage`, the same
endpoint Claude Code uses for `/usage`.

- The token is only sent to `api.anthropic.com`.
- The access token lasts a few hours and Claude Code only renews it when it
  runs. When the extension finds it expired, it runs `claude auth status`
  (without `CLAUDE_CODE_OAUTH_TOKEN`), which makes Claude Code renew it. That
  command sends no prompt and uses no plan usage. It can be turned off in the
  settings, and the extension never writes the credentials file itself.
- The endpoint is not documented by Anthropic and may change without notice.

## Troubleshooting

**"The Claude Code session has expired"** and it does not recover: if you use
`CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`), Claude Code ignores
`.credentials.json` and never updates it. Sign in once with `/login` running
`env -u CLAUDE_CODE_OAUTH_TOKEN claude`, and keep automatic renewal on.

**"the claude command was not found"**: GNOME Shell may not have the same
`PATH` as your terminal (for example with nvm). Set the full path, from
`which claude`, in the settings.

## Install from source

```sh
make install
```

Then log out and back in (Wayland) and enable it:

```sh
gnome-extensions enable claude-usage-meter@ventur40.github.io
```

## Development

```sh
make test   # parser and credential tests, needs gjs
make lint   # needs `npm install`
make pot    # refresh po/claude-usage-meter.pot
```

To try changes without logging out, start a nested shell:

```sh
dbus-run-session gnome-shell --devkit --wayland
```

Logs: `journalctl -f -o cat /usr/bin/gnome-shell`

## Publishing

```sh
make pack
gnome-extensions upload --accept-tos
```

## License

GPL-2.0-or-later
