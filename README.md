# clawd-skins

A Claude Code plugin that restyles **Clawd**, the pixel mascot — switchable color
skins (including the winter **snowflake** skin) shown in your status bar, your
session greeting, and on-demand commands.

```
 * ▐▛███▜▌ *     [Opus 4.8]
* ▝▜█████▛▘ *    63% ctx · $0.18
 *  ▘▘ ▝▝  *     project · +120/-30
```

## Install

Requires Node.js and Claude Code v2.1.x+.

**Local dev (single session):**
```powershell
cd C:\Users\86151\Desktop\clawd-skins
claude --plugin-dir "C:\Users\86151\Desktop\clawd-skins"
```

**Local marketplace (persistent):**
```
/plugin marketplace add C:/Users/86151/Desktop/clawd-skins
/plugin install clawd-skins@clawd-skins
```
…then restart Claude Code (or `/reload-plugins`). Verify by typing `/clawd-skins:`.

Put the Clawd in your status bar (once per machine):
```
/clawd-skins:install-statusline
```
This writes a `statusLine` entry into `~/.claude/settings.json` (backing up the old
one to `settings.json.bak`). Revert with `/clawd-skins:uninstall-statusline`.

## Commands

| Command | Does |
|---|---|
| `/clawd-skins:show [skin]` | Print the active skin's banner, or preview a named skin |
| `/clawd-skins:list` | Preview every skin; marks the active one |
| `/clawd-skins:set <skin>` | Switch the active skin (persisted to `~/.clawd-skin`) |
| `/clawd-skins:random` | Pick a random skin and make it active |
| `/clawd-skins:reset` | Reset to the default skin (snowflake) |
| `/clawd-skins:generate <vibe>` | Have Claude invent a new skin from a description, save it, make it active |
| `/clawd-skins:install-statusline` | Add the Clawd to your status bar |
| `/clawd-skins:uninstall-statusline` | Remove it |

The active skin (from `CLAWD_SKIN` env var, else `~/.clawd-skin`, else `snowflake`)
drives the status bar and the SessionStart greeting at once.

## Status bar

The status bar shows the full 3-row Clawd in the active skin. If
[claude-hud](https://github.com/jarrodwatts/claude-hud) is installed, its complete
HUD is rendered to the **right** of the Clawd, row by row (model, context, CLAUDE.md /
rules / MCPs / hooks, tool calls, subagents…); rows beyond the Clawd's 3 keep an
aligned left margin. Without claude-hud, a compact info column (model / context% ·
cost / dir · lines changed) is shown beside the Clawd instead.

## Skins

14 built in: `snowflake` (default — winter `ice_blue` #ADD8E6 + flakes), `classic`
(orange #D77757), `ice`, `matrix`, `magenta`, `gold`, `mono`, `sunset`, `ocean`,
`ember`, `lavender`, `mint`, `crimson`, `starlight`. Defined in
[`skins/skins.json`](skins/skins.json) — add your own by appending an entry
(`body`/`faceBg`/`snow`/`snowColor` as `[r,g,b]`).

## Engine

Everything is driven by [`bin/clawd.mjs`](bin/clawd.mjs) (dependency-free):
```powershell
node bin/clawd.mjs banner            # active skin banner
node bin/clawd.mjs banner snowflake  # preview a skin
node bin/clawd.mjs list              # all skins
node bin/clawd.mjs set ice           # switch active skin
echo '{"model":{"display_name":"Fable 5"},"context_window":{"used_percentage":20}}' | node bin/clawd.mjs statusline
```

### AI skin generator — extra setup

`/clawd-skins:generate` calls Claude to invent a skin. It needs:
- `npm install` run in this directory (installs `@anthropic-ai/sdk`)
- `ANTHROPIC_API_KEY` set in your environment

Everything else (status bar, banner, `list`/`set`/`show`) is dependency-free — only
`generate` lazily loads the SDK.

## License

MIT — see [`LICENSE`](LICENSE).
