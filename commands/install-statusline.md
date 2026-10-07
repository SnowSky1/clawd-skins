---
description: Install the clawd-skins mini-Clawd in your status bar
allowed-tools: Bash(node *)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/clawd.mjs" install-statusline`

This writes a `statusLine` entry into `~/.claude/settings.json` that renders a
mini-Clawd in the active skin next to your model and context usage (a backup is
saved to `settings.json.bak`). Tell the user it takes effect on the next status
refresh or restart, and that they can revert with `/clawd-skins:uninstall-statusline`.
