---
description: Reset the active Clawd skin back to the default (classic)
allowed-tools: Bash(node *)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/clawd.mjs" reset`

The active skin override was cleared, so Clawd falls back to the default `classic`
(orange) skin in the status bar and session banner. Confirm this to the user.
