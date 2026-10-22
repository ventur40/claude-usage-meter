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
- The extension never refreshes or writes the token. When it expires, run
  Claude Code and it renews it.
- The endpoint is not documented by Anthropic and may change without notice.

## Install from source

```sh
make install
```

Then log out and back in (Wayland) and enable it:

```sh
gnome-extensions enable claude-usage-meter@kelmia.com
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
