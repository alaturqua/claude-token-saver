#!/usr/bin/env node
// One-time setup for what a plugin can't do on its own. Run after installing the plugin:
//   node setup/setup.js              add the Explore agent, the handover allow rules and a compact window
//   node setup/setup.js --no-explore same, without the Explore agent
//   node setup/setup.js --uninstall  remove what this script added
// Safe to re-run. settings.json and any replaced file are backed up to ~/.claude/backups/ first.
const fs = require('fs'), path = require('path'), os = require('os');

const CLAUDE = path.join(os.homedir(), '.claude');
const SETTINGS = path.join(CLAUDE, 'settings.json');
const EXPLORE = path.join(CLAUDE, 'agents', 'Explore.md');
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const BACKUP = path.join(CLAUDE, 'backups', `token-saver-${stamp}`);
const RULES = ['Edit(~/.claude-handovers/**)', 'Read(~/.claude-handovers/**)'];
// Hook entries from an older manual install (absolute paths). The plugin now ships these hooks.
const OLD_HOOK = /check-read-size\.js|handover\.js/;
const args = process.argv.slice(2);

function backup(file) {
  if (!fs.existsSync(file)) return;
  const dest = path.join(BACKUP, path.basename(file));
  fs.mkdirSync(BACKUP, { recursive: true });
  if (!fs.existsSync(dest)) fs.copyFileSync(file, dest); // keep the oldest copy if run twice in one second
}

let s = {};
if (fs.existsSync(SETTINGS)) {
  try { s = JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); }
  catch (e) { console.error(`Cannot parse ${SETTINGS}: ${e.message}. Fix it first; nothing was changed.`); process.exit(1); }
}
backup(SETTINGS);

let removed = 0;
for (const ev of Object.keys(s.hooks || {})) {
  s.hooks[ev] = s.hooks[ev]
    .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !(OLD_HOOK.test(h.command || '') && (removed += 1))) }))
    .filter((g) => g.hooks.length);
  if (!s.hooks[ev].length) delete s.hooks[ev];
}
if (removed) console.log(`Removed ${removed} hook entries from an older manual install (the plugin provides them now).`);
if (s.permissions?.allow) s.permissions.allow = s.permissions.allow.filter((r) => !RULES.includes(r));

const ours = (f) => fs.existsSync(f) && fs.readFileSync(f, 'utf8') === fs.readFileSync(path.join(__dirname, 'Explore.md'), 'utf8');

if (args.includes('--uninstall')) {
  const wasOurs = ours(EXPLORE);
  if (wasOurs) fs.unlinkSync(EXPLORE);
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n');
  console.log(`Removed the allow rules${wasOurs ? ' and the Explore agent' : ''}. autoCompactWindow left as it is.
Backup: ${BACKUP}
To remove the plugin too: claude plugin uninstall token-saver@token-saver`);
  process.exit(0);
}

(s.permissions ||= {}).allow ||= [];
s.permissions.allow.push(...RULES);
// Handover fires at 200K tokens, so compaction must come later. An existing window is kept.
if (s.autoCompactWindow == null) s.autoCompactWindow = 250000;
else if (s.autoCompactWindow <= 200000)
  console.log(`Note: autoCompactWindow is ${s.autoCompactWindow}. Set HANDOVER_AT_TOKENS in your shell to ~50K below it.`);
fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n');

if (!args.includes('--no-explore')) {
  // A user-level agent named Explore replaces the built-in one; a plugin agent can't (its name gets a plugin prefix).
  if (fs.existsSync(EXPLORE) && !ours(EXPLORE)) { backup(EXPLORE); console.log('Replaced your Explore agent (old copy in backup).'); }
  fs.mkdirSync(path.dirname(EXPLORE), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'Explore.md'), EXPLORE);
}
console.log(`Done. Backup: ${BACKUP}\nStart a new Claude Code session to load the changes.`);
