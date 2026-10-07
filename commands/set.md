---
description: Switch the active Clawd skin
argument-hint: "<skin>"
allowed-tools: Bash(node *)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/clawd.mjs" set $ARGUMENTS`

The active Clawd skin has been changed (persisted to `~/.clawd-skin`). The new skin
applies to the status bar and the SessionStart greeting. If the status bar isn't
showing Clawd yet, tell the user to run `/clawd-skins:install-statusline` once.
If the command above reported an unknown skin, list the valid names for the user.
