#!/usr/bin/env node
// clawd-skins — render Clawd the mascot in switchable skins.
//
// Modes:
//   banner [skin]          Print the 3-line Clawd banner (active skin, or a named skin to preview)
//   statusline             Read Claude Code status JSON from stdin, print a one-line mini-Clawd
//   list                   Preview every available skin
//   get                    Print the active skin name
//   set <skin>             Set the active skin (persisted to ~/.clawd-skin)
//   reset                  Clear the override — fall back to the default skin (classic)
//   random                 Pick a random skin and set it active
//   generate "<vibe>"      Have Claude invent a new skin from a description (needs SDK + ANTHROPIC_API_KEY)
//   install-statusline     Wire this renderer into ~/.claude/settings.json as the statusLine
//   uninstall-statusline   Remove the statusLine entry this plugin added
//
// The real Claude Code startup banner is hardcoded in the binary and cannot be
// repainted by a plugin. This renderer powers the next-best surfaces: the status
// bar, the SessionStart greeting, and the /clawd-skins:* commands.

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const SELF = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(SELF));                 // plugin root (bin/ -> ..)
const SKINS_FILE = join(ROOT, 'skins', 'skins.json');
const ACTIVE_FILE = join(homedir(), '.clawd-skin');  // stable across local-dev & installed copies
const SETTINGS_FILE = join(homedir(), '.claude', 'settings.json');

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

function loadSkins() {
  try {
    return JSON.parse(readFileSync(SKINS_FILE, 'utf8'));
  } catch (e) {
    process.stderr.write(`clawd-skins: cannot read skins.json (${e.message})\n`);
    return {};
  }
}

function fg([r, g, b]) { return `\x1b[38;2;${r};${g};${b}m`; }
function bg([r, g, b]) { return `\x1b[48;2;${r};${g};${b}m`; }

const STRIP_ANSI = /\x1b\[[0-9;]*m/g;
function visibleWidth(s) { return [...s.replace(STRIP_ANSI, '')].length; }

function activeName() {
  const env = process.env.CLAWD_SKIN && process.env.CLAWD_SKIN.trim();
  if (env) return env;
  try {
    const v = readFileSync(ACTIVE_FILE, 'utf8').trim();
    if (v) return v;
  } catch { /* no active file yet */ }
  return 'snowflake';
}

function resolveSkin(skins, name) {
  if (name && skins[name]) return { name, skin: skins[name] };
  const fallback = skins.snowflake ? 'snowflake' : (skins.classic ? 'classic' : Object.keys(skins)[0]);
  return { name: fallback, skin: skins[fallback] };
}

// Build the 3 colored lines for a skin. `body` colors the outline, `faceBg`
// fills the eye block, `snow` wraps the mascot in asterisks like the winter skin.
function bannerLines(skin) {
  const body = skin.body || [215, 119, 87];
  const face = skin.faceBg || [0, 0, 0];
  const snowC = skin.snowColor || [255, 255, 255];

  const B = (t) => fg(body) + t + RESET;                 // outline
  const F = (t) => fg(body) + bg(face) + t + RESET;      // outline over face fill
  const S = (t) => fg(snowC) + t + RESET;                // snowflake

  if (skin.snow) {
    // Verbatim nU0 layout: " * ▐▛███▜▌ *" / "* ▝▜█████▛▘ *" / " *  ▘▘ ▝▝  *"
    return [
      ` ${S('*')} ${B('▐')}${F('▛███▜')}${B('▌')} ${S('*')}`,
      `${S('*')} ${B('▝▜')}${F('█████')}${B('▛▘')} ${S('*')}`,
      ` ${S('*')}  ${B('▘▘ ▝▝')}  ${S('*')}`,
    ];
  }
  return [
    ` ${B('▐')}${F('▛███▜')}${B('▌')}`,
    `${B('▝▜')}${F('█████')}${B('▛▘')}`,
    `  ${B('▘▘ ▝▝')}`,
  ];
}

function printBanner(skins, name) {
  const { name: resolved, skin } = resolveSkin(skins, name);
  const lines = bannerLines(skin);
  process.stdout.write('\n');
  for (const l of lines) process.stdout.write('  ' + l + '\n');
  process.stdout.write(`  ${DIM}clawd-skins · ${skin.label || resolved} (${resolved})${RESET}\n\n`);
}

function miniClawd(skin) {
  const body = skin.body || [215, 119, 87];
  return fg(body) + '▐▛█▜▌' + RESET;
}

function readStdin() {
  // Claude Code always pipes JSON here. If stdin is an interactive console
  // (no pipe), reading fd 0 would block forever — skip it.
  if (process.stdin.isTTY) return '';
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Locate claude-hud's renderer in the plugin cache, if it's installed.
function findClaudeHud() {
  try {
    const base = join(homedir(), '.claude', 'plugins', 'cache');
    for (const marketplace of readdirSync(base)) {
      const hudDir = join(base, marketplace, 'claude-hud');
      if (!existsSync(hudDir)) continue;
      for (const version of readdirSync(hudDir).sort().reverse()) {
        const idx = join(hudDir, version, 'dist', 'index.js');
        if (existsSync(idx)) return idx;
      }
    }
  } catch { /* no plugin cache / claude-hud not installed */ }
  return null;
}

// The staggered Clawd rows for the status bar. Claude Code strips each row's
// leading whitespace, which flattens the mascot's staggered left edge. ESC
// (U+001B) is NOT whitespace, so a row that BEGINS with an ANSI reset is immune
// to trimStart()/^\s+ — the leading space then survives, renders in the default
// background (invisible) but occupies a column, so row 2 sticks out one column
// to the left exactly like the verbatim nU0 layout.
function clawdRows(skin) {
  return bannerLines(skin).map((l) => l.replace(/^ +/, (m) => RESET + m));
}

function statusline(skins) {
  const { skin } = resolveSkin(skins, activeName());
  const raw = readStdin();
  const lines = clawdRows(skin);
  const hud = findClaudeHud();

  // With claude-hud installed: Clawd on the LEFT, its full HUD to the RIGHT,
  // row by row. The same status JSON is piped straight through, so claude-hud
  // renders its complete output (model, context, CLAUDE.md / rules / MCPs /
  // hooks, tool calls, subagents…). If the HUD is taller than the 3 Clawd rows,
  // the overflow rows keep the Clawd-width left margin so the HUD stays aligned.
  if (hud) {
    const W = Math.max(...lines.map(visibleWidth)) + 3; // column where the HUD starts
    let hudOut = '';
    try {
      const cols = Math.max(20, (parseInt(process.env.COLUMNS, 10) || 120) - W);
      const res = spawnSync(process.execPath, [hud], {
        input: raw || '',
        encoding: 'utf8',
        env: { ...process.env, COLUMNS: String(cols) }, // reserve W cols for the Clawd
        timeout: 5000,
      });
      hudOut = res.stdout || '';
    } catch { /* hud failed — the Clawd alone still renders */ }
    const hudLines = hudOut.trim() ? hudOut.replace(/\n+$/, '').split('\n') : [];

    const n = Math.max(lines.length, hudLines.length);
    for (let i = 0; i < n; i++) {
      const right = hudLines[i] || '';
      let left;
      if (i < lines.length) {
        // pad the Clawd row out to the HUD column (only when there's HUD text)
        left = right ? lines[i] + ' '.repeat(Math.max(1, W - visibleWidth(lines[i]))) : lines[i];
      } else {
        // overflow row: an invisible, Clawd-width left margin. ESC-led so the
        // bar's leading-whitespace trim leaves it intact and the HUD stays aligned.
        left = RESET + ' '.repeat(W);
      }
      process.stdout.write(`${left}${right}\n`);
    }
    return;
  }

  // No claude-hud: render our own compact info column beside the Clawd.
  let info = ['', '', ''];
  if (raw && raw.trim()) {
    try {
      const j = JSON.parse(raw);
      const model = j?.model?.display_name || j?.model?.id || '';
      const p = j?.context_window?.used_percentage;
      const pct = typeof p === 'number' ? `${Math.round(p)}% ctx` : '';
      const usd = j?.cost?.total_cost_usd;
      const cost = typeof usd === 'number' && usd > 0 ? `$${usd.toFixed(2)}` : '';
      const added = j?.cost?.total_lines_added || 0;
      const removed = j?.cost?.total_lines_removed || 0;
      const changes = (added || removed) ? `+${added}/-${removed}` : '';
      const dirPath = j?.workspace?.current_dir || j?.cwd || '';
      const dir = dirPath ? dirPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() : '';
      const branch = j?.workspace?.git_worktree?.branch || j?.worktree?.branch || '';
      info = [
        model ? `[${model}]` : '',
        [pct, cost].filter(Boolean).join(' · '),
        [branch || dir, changes].filter(Boolean).join(' · '),
      ];
    } catch { /* malformed/partial JSON: render the mascot without info */ }
  }
  const pad = Math.max(...lines.map(visibleWidth)) + 3;
  for (let i = 0; i < lines.length; i++) {
    const gap = ' '.repeat(Math.max(1, pad - visibleWidth(lines[i])));
    const tail = info[i] ? `${gap}${DIM}${info[i]}${RESET}` : '';
    process.stdout.write(`${lines[i]}${tail}\n`);
  }
}

function list(skins) {
  const names = Object.keys(skins);
  if (!names.length) {
    process.stdout.write('No skins defined.\n');
    return;
  }
  const active = activeName();
  for (const name of names) {
    const lines = bannerLines(skins[name]);
    const tag = name === active ? ' ◀ active' : '';
    process.stdout.write(`\n  ${name}${tag}  ${DIM}${skins[name].label || ''}${RESET}\n`);
    for (const l of lines) process.stdout.write('    ' + l + '\n');
  }
  process.stdout.write('\n');
}

function set(skins, name) {
  if (!name) {
    process.stderr.write('Usage: clawd set <skin>\n');
    process.exitCode = 2;
    return;
  }
  if (!skins[name]) {
    process.stderr.write(`Unknown skin "${name}". Available: ${Object.keys(skins).join(', ')}\n`);
    process.exitCode = 2;
    return;
  }
  writeFileSync(ACTIVE_FILE, name + '\n');
  process.stdout.write(`Active skin set to "${name}" (${skins[name].label || name}).\n`);
  printBanner(skins, name);
}

function reset() {
  // Remove the override so the active skin falls back to the default (snowflake).
  try { unlinkSync(ACTIVE_FILE); } catch { /* nothing to reset */ }
  process.stdout.write('Active skin reset to default (snowflake).\n');
}

function random(skins) {
  const names = Object.keys(skins);
  if (!names.length) {
    process.stderr.write('No skins defined.\n');
    process.exitCode = 1;
    return;
  }
  const name = names[Math.floor(Math.random() * names.length)];
  writeFileSync(ACTIVE_FILE, name + '\n');
  process.stdout.write(`Randomly selected "${name}" (${skins[name].label || name}).\n`);
  printBanner(skins, name);
}

// --- settings.json statusLine wiring -------------------------------------

const MARK = 'clawd-skins'; // marker so we only remove our own entry

function statuslineCommand() {
  // Forward slashes so Git Bash / PowerShell both handle the path.
  const p = SELF.replace(/\\/g, '/');
  return `node "${p}" statusline`;
}

function readSettings() {
  if (!existsSync(SETTINGS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
  } catch (e) {
    process.stderr.write(`clawd-skins: ${SETTINGS_FILE} is not valid JSON (${e.message}). Aborting.\n`);
    process.exit(1);
  }
}

function backupSettings() {
  if (existsSync(SETTINGS_FILE)) copyFileSync(SETTINGS_FILE, SETTINGS_FILE + '.bak');
}

function writeSettings(obj) {
  mkdirSync(dirname(SETTINGS_FILE), { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(obj, null, 2) + '\n');
}

function installStatusline() {
  const s = readSettings();
  const prev = s.statusLine;
  if (prev && prev.command && !String(prev.command).includes('clawd.mjs')) {
    process.stdout.write(
      `Note: an existing statusLine was found and will be replaced:\n  ${prev.command}\n` +
      `A backup is written to settings.json.bak — restore it to revert.\n`
    );
  }
  backupSettings();
  s.statusLine = { type: 'command', command: statuslineCommand(), padding: 0, _source: MARK };
  writeSettings(s);
  process.stdout.write(`Installed clawd-skins statusLine into ${SETTINGS_FILE}.\nRestart Claude Code (or it refreshes on next message) to see the mini-Clawd.\n`);
}

function uninstallStatusline() {
  const s = readSettings();
  if (s.statusLine && (s.statusLine._source === MARK || String(s.statusLine.command || '').includes('clawd.mjs'))) {
    backupSettings();
    delete s.statusLine;
    writeSettings(s);
    process.stdout.write('Removed clawd-skins statusLine. Backup at settings.json.bak.\n');
  } else {
    process.stdout.write('No clawd-skins statusLine found — nothing to remove.\n');
  }
}

// --- AI skin generation (optional — needs @anthropic-ai/sdk + ANTHROPIC_API_KEY) ---

const GEN_MODEL = 'claude-opus-4-8';

const SKIN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label: { type: 'string', description: 'Short human-readable name, e.g. "Cyberpunk Sunset"' },
    body: { type: 'array', items: { type: 'integer' }, description: 'Outline color as [r,g,b], each 0-255' },
    faceBg: { type: 'array', items: { type: 'integer' }, description: 'Eye-block fill as [r,g,b]; usually near-black' },
    snow: { type: 'boolean', description: 'Whether to surround the mascot with falling snowflakes' },
    snowColor: { type: 'array', items: { type: 'integer' }, description: 'Snowflake color as [r,g,b] (used only when snow is true)' },
  },
  required: ['label', 'body', 'faceBg', 'snow', 'snowColor'],
};

function clampRgb(v, fallback) {
  if (!Array.isArray(v) || v.length < 3) return fallback;
  return v.slice(0, 3).map((n) => Math.max(0, Math.min(255, Math.round(Number(n) || 0))));
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'skin';
}

function uniqueName(skins, base) {
  let name = slugify(base);
  if (!skins[name]) return name;
  for (let i = 2; ; i++) if (!skins[`${name}-${i}`]) return `${name}-${i}`;
}

async function generate(skins, description) {
  if (!description || !description.trim()) {
    process.stderr.write('Usage: clawd generate "<vibe or description>"\n');
    process.exitCode = 2;
    return;
  }
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    process.stderr.write('clawd-skins: the AI generator needs the Anthropic SDK.\nRun `npm install` in the plugin directory, then try again.\n');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write('clawd-skins: set ANTHROPIC_API_KEY in your environment to use the generator.\n');
    process.exit(1);
  }

  const client = new Anthropic();
  const prompt =
    `Design a skin for "Clawd", the Claude Code pixel mascot, matching this vibe: "${description}".\n\n` +
    `The mascot is drawn with Unicode block characters in a terminal that supports 24-bit color:\n` +
    `- body: the outline/body color (the bulk of the creature)\n` +
    `- faceBg: fills the eye block; keep it near-black (e.g. [0,0,0]) unless the vibe truly calls for otherwise\n` +
    `- snow: set true only if falling snowflakes (asterisks) suit the vibe (winter, frost, starry, magical)\n` +
    `- snowColor: the snowflake color, used only when snow is true\n\n` +
    `Pick colors that read clearly on a dark terminal background. Return the skin via the schema.`;

  let resp;
  try {
    resp = await client.messages.create({
      model: GEN_MODEL,
      max_tokens: 1024,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SKIN_SCHEMA } },
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (e) {
    // exitCode (not exit()) so the SDK's HTTP handle can close cleanly on Windows
    process.stderr.write(`clawd-skins: generation request failed — ${e?.message || e}\n`);
    process.exitCode = 1;
    return;
  }

  if (resp.stop_reason === 'refusal') {
    process.stderr.write('clawd-skins: the request was declined. Try a different description.\n');
    process.exitCode = 1;
    return;
  }

  const text = resp.content.find((b) => b.type === 'text')?.text;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    process.stderr.write('clawd-skins: could not parse the generated skin. Try again.\n');
    process.exitCode = 1;
    return;
  }

  const skin = {
    label: (data.label && String(data.label).slice(0, 48)) || description.trim().slice(0, 48),
    body: clampRgb(data.body, [215, 119, 87]),
    faceBg: clampRgb(data.faceBg, [0, 0, 0]),
    snow: Boolean(data.snow),
  };
  if (skin.snow) skin.snowColor = clampRgb(data.snowColor, [255, 255, 255]);

  const name = uniqueName(skins, skin.label || description);
  skins[name] = skin;
  writeFileSync(SKINS_FILE, JSON.stringify(skins, null, 2) + '\n');
  writeFileSync(ACTIVE_FILE, name + '\n');

  process.stdout.write(`Generated skin "${name}" (${skin.label}) and set it active.\n`);
  printBanner(skins, name);
}

// --- dispatch ------------------------------------------------------------

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const arg = rest[0];
  const skins = loadSkins();
  switch (mode) {
    case undefined:
    case 'banner': printBanner(skins, arg || activeName()); break;
    case 'statusline': statusline(skins); break;
    case 'list': list(skins); break;
    case 'get': process.stdout.write(activeName() + '\n'); break;
    case 'set': set(skins, arg); break;
    case 'reset': reset(); break;
    case 'random': random(skins); break;
    case 'generate': await generate(skins, rest.join(' ')); break;
    case 'install-statusline': installStatusline(); break;
    case 'uninstall-statusline': uninstallStatusline(); break;
    default:
      process.stderr.write(`Unknown mode "${mode}".\nModes: banner|statusline|list|get|set|reset|random|generate|install-statusline|uninstall-statusline\n`);
      process.exitCode = 2;
  }
}

main();
