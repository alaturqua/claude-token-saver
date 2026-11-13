// Self-check for handover.js. Run: node handover.test.js
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const h = path.join(__dirname, 'handover.js');
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'handovertest-'));
const cwd = path.join(d, 'repo'), sid = 'test-session-1';
const slug = cwd.replace(/[:\\/]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(-120);
const hroot = path.join(os.homedir(), '.claude-handovers'), hdir = path.join(hroot, slug);
const env = { ...process.env }; delete env.HANDOVER_AT_TOKENS; // test the default threshold

function transcript(tokens) {
  const t = path.join(d, `t${tokens}.jsonl`);
  fs.writeFileSync(t, '{"type":"user","message":{"role":"user","content":"hi"}}\n' +
    `{"type":"assistant","message":{"id":"m1","usage":{"input_tokens":1,"cache_creation_input_tokens":0,"cache_read_input_tokens":${tokens},"output_tokens":5}}}\n`);
  return t;
}
const run = (mode, obj) => execFileSync(process.execPath, [h, mode],
  { input: typeof obj === 'string' ? obj : JSON.stringify(obj), encoding: 'utf8', env });
let fail = 0;
function check(name, ok) { if (!ok) fail++; console.log(`${name.padEnd(36)} ${ok ? 'PASS' : 'FAIL'}`); }

check('posttool below threshold: nothing', !run('posttool', { session_id: sid, cwd, transcript_path: transcript(1000) }));
const bigT = transcript(210000);
check('posttool in subagent: nothing', !run('posttool', { session_id: sid, cwd, transcript_path: bigT, agent_id: 'a1' }));
const big = { session_id: sid, cwd, transcript_path: bigT };
let o = run('posttool', big);
check('posttool above threshold: request', o.includes('"hookEventName":"PostToolUse"') && o.includes('210001 tokens') && !o.includes('"decision"'));
check('posttool again: no second request', !run('posttool', big));
fs.mkdirSync(hdir, { recursive: true });
fs.writeFileSync(path.join(hdir, `${sid}.md`), '## Goal\n');
o = run('precompact', { session_id: sid, cwd });
check('precompact: instructions + path', o.includes('Preserve') && o.includes(`${sid}.md`));
check('after compaction: guard re-armed', run('posttool', big).includes('PostToolUse'));
o = JSON.parse(run('sessionstart', { session_id: sid, cwd, source: 'compact' }) || '{}');
check('sessionstart: loads own handover', /## Goal/.test(o.hookSpecificOutput?.additionalContext || ''));
check('sessionstart other session: none', !run('sessionstart', { session_id: 'other', cwd, source: 'compact' }));
check('sessionstart other cwd: nothing', !run('sessionstart', { session_id: sid, cwd: path.join(d, 'other'), source: 'compact' }));

const oldDir = path.join(hroot, 'zz-purge-test'), old = path.join(oldDir, 'old.md');
fs.mkdirSync(oldDir, { recursive: true }); fs.writeFileSync(old, 'x');
const past = new Date(Date.now() - 31 * 864e5); fs.utimesSync(old, past, past);
run('precompact', { session_id: sid, cwd });
check('precompact: purges > 30 days + dir', !fs.existsSync(oldDir));
check('precompact: keeps fresh handover', fs.existsSync(path.join(hdir, `${sid}.md`)));
check('bad input: no crash, no output', !run('posttool', 'garbage'));

fs.rmSync(hdir, { recursive: true, force: true });
fs.rmSync(d, { recursive: true, force: true });
process.exit(fail);
