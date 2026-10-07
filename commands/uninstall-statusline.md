---
description: Remove the clawd-skins mini-Clawd from your status bar
allowed-tools: Bash(node *)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/clawd.mjs" uninstall-statusline`

This removes the clawd-skins `statusLine` entry from `~/.claude/settings.json`
(a backup is saved to `settings.json.bak`). Confirm to the user that the mini-Clawd
status bar has been removed.
