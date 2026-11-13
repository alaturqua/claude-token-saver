// Handover hooks, no user action needed. Usage: node handover.js posttool|precompact|sessionstart
//   posttool:     once context >= HANDOVER_AT_TOKENS (default 200000), append a one-time request to the tool
//                 result: write/update the handover file, then continue. Mid-turn, so it never adds a Stop
//                 (no extra stop for tools that watch for one) and also covers long turns. Re-armed after each compaction.
//   precompact:   stdout = instructions for the compaction summary; re-arms the guard; purges handovers > 30 days.
//   sessionstart: (matcher compact) loads this session's handover file as context.
// Files: ~/.claude-handovers/<cwd-slug>/<session_id>.md (not under ~/.claude: protected path, writes there prompt or fail)
const fs = require('fs'), path = require('path'), os = require('os');

const mode = process.argv[2];
let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw || '{}');
    const dir = path.join(os.homedir(), '.claude-handovers',slug(input.cwd || process.cwd()));
    const file = path.join(dir, `${input.session_id || 'unknown'}.md`);
    const marker = path.join(dir, `.${input.session_id || 'unknown'}.armed-off`);
    if (mode === 'posttool') posttool(input, dir, file, marker);
    else if (mode === 'precompact') { precompact(file, marker); purge(path.dirname(dir)); }
    else if (mode === 'sessionstart') sessionstart(file);
  } catch {
    // never break a session because the hook itself failed
  }
});

function slug(cwd) {
  return cwd.replace(/[:\\/]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(-120);
}

// Context size = input + cache tokens of the last main-thread assistant message.
function contextTokens(transcript) {
  const size = fs.statSync(transcript).size, len = Math.min(size, 1 << 20);
  const buf = Buffer.alloc(len), fd = fs.openSync(transcript, 'r');
  fs.readSync(fd, buf, 0, len, size - len);
  fs.closeSync(fd);
  const lines = buf.toString('utf8').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"usage"')) continue;
    let j; try { j = JSON.parse(lines[i]); } catch { continue; }
    const u = j.message && j.message.usage;
    if (j.type === 'assistant' && u && !j.isSidechain)
      return (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  }
  return 0;
}

function posttool(input, dir, file, marker) {
  // Subagents share the hook but not the main context; the handover belongs to the main thread.
  if (input.agent_id || !input.transcript_path || fs.existsSync(marker)) return;
  const min = parseInt(process.env.HANDOVER_AT_TOKENS || '200000', 10);
  const tokens = contextTokens(input.transcript_path);
  if (tokens < min) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(marker, String(tokens));
  const fwd = file.replace(/\\/g, '/');
  const additionalContext =
    `Context is at ${tokens} tokens; auto-compaction is near. As your next step, write (or update) the handover file ${fwd} ` +
    'with the Write tool, under 80 lines, plain markdown: ## Goal (the user\'s request in their words), ## State (done / in progress, ' +
    'with evidence), ## Decisions (each with why), ## Open items and risks, ## Next step (exact command or edit), ## Key refs ' +
    '(absolute paths, PR/ticket IDs, run IDs, profiles, branch). Facts only, mark anything unverified. Then continue your task; ' +
    'do not ask the user to clear or compact.';
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } }));
}

function purge(root) {
  const cutoff = Date.now() - 30 * 864e5;
  for (const d of fs.readdirSync(root)) {
    const sub = path.join(root, d);
    if (!fs.statSync(sub).isDirectory()) continue;
    for (const f of fs.readdirSync(sub)) {
      const p = path.join(sub, f);
      if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
    }
    if (!fs.readdirSync(sub).length) fs.rmdirSync(sub);
  }
}

function precompact(file, marker) {
  try { fs.unlinkSync(marker); } catch {}
  const hint = fs.existsSync(file) ? ` A handover file exists at ${file.replace(/\\/g, '/')}; name its path in the summary.` : '';
  process.stdout.write(
    'Preserve in the summary: the user\'s goal in their words; decisions with their reasons; what is done and verified ' +
    'vs. unverified; open items and the next step; exact absolute paths, commands, branch, PR/ticket/run IDs, environment ' +
    'or profile names; user preferences and corrections given in this session. Drop tool output that is no longer needed.' + hint);
}

// Own session only: session_id survives compaction, and a newest-in-repo pick would load a parallel session's task.
function sessionstart(file) {
  if (!fs.existsSync(file)) return;
  const body = fs.readFileSync(file, 'utf8').slice(0, 8000);
  const additionalContext = `Handover written before the last compaction (${file.replace(/\\/g, '/')}). ` +
    `Continue from it and keep it updated:\n\n${body}`;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }));
}
