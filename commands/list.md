---
description: Preview every available Clawd skin
allowed-tools: Bash(node *)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/clawd.mjs" list`

These are all the Clawd skins shipped by clawd-skins; the one marked `◀ active` is
current. Tell the user they can switch with `/clawd-skins:set <skin>`.
