---
description: Show Clawd in the active skin, or preview a named skin
argument-hint: "[skin]"
allowed-tools: Bash(node *)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/clawd.mjs" banner $ARGUMENTS`

The Clawd banner above is rendered by the clawd-skins plugin. If the user passed a
skin name in `$ARGUMENTS`, this is a preview of that skin (the active skin is
unchanged). Briefly tell the user which skin is shown and remind them they can
switch with `/clawd-skins:set <skin>` or list all skins with `/clawd-skins:list`.
