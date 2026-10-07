---
description: Generate a brand-new Clawd skin from a description using Claude
argument-hint: "<vibe / description>"
allowed-tools: Bash(node *)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/clawd.mjs" generate $ARGUMENTS`

Claude generated a new Clawd skin from the description in `$ARGUMENTS`, appended it to
`skins/skins.json`, and set it as the active skin. Tell the user the new skin's name and
that the status bar / session banner will use it. If the command reported a missing SDK
(`npm install`) or a missing `ANTHROPIC_API_KEY`, relay that fix to the user instead.
