#!/usr/bin/env node
// One-shot bulk file reader. Sends files plus a question to Haiku via headless Claude Code
// (your normal Claude Code login) and prints only the answer, so file contents never enter the caller's context.
//   node bulk-read.js [--model haiku] [--max-chars 380000] "<question>" <path> [path...]
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');

const SYSTEM = `You are a precise code analyst. Read the provided files and answer the question concisely.
Output structured bullets only. No greetings, no prose, no preamble.
Lead every bullet with the exact name, type, or file:line (lines are numbered in the input).
Use nested bullets for details. Skip anything the caller did not ask for.
If the files do not contain the answer, say so in one bullet. Never guess.`;

function die(msg) { process.stderr.write(`bulk-read: ${msg}\n`); process.exit(1); }

const args = process.argv.slice(2);
let model = 'haiku', maxChars = 380000; // ~95K tokens: Haiku 5.5 bills 5x above 100K prompt tokens
const rest = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--model') model = args[++i];
  else if (args[i] === '--max-chars') maxChars = Number(args[++i]);
  else rest.push(args[i]);
}
const [question, ...paths] = rest;
if (!question || !paths.length) die('usage: node bulk-read.js [--model haiku] "<question>" <path> [path...]');

let prompt = '';
for (const p of paths) {
  const full = path.resolve(p);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) die(`file not found: ${p}`);
  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  prompt += `<file path="${full}">\n${lines.map((l, i) => `${i + 1}: ${l}`).join('\n')}\n</file>\n`;
}
prompt += `<question>${question}</question>\n`;
if (prompt.length > maxChars) die(`input is ${prompt.length} chars, over ${maxChars}. Split the paths into smaller calls.`);

const sysFile = path.join(os.tmpdir(), `bulk-read-system-${process.pid}.txt`);
fs.writeFileSync(sysFile, SYSTEM);
// Not --bare: it only accepts ANTHROPIC_API_KEY and fails on a subscription login.
// Empty setting sources + strict MCP skip user hooks, plugins and MCP servers (~4K tokens overhead).
const cli = ['-p', '--model', model, '--tools', '', '--no-session-persistence', '--setting-sources', '',
  '--strict-mcp-config', '--system-prompt-file', sysFile, '--output-format', 'json'];
// Windows npm installs ship claude.cmd, which only starts through a shell. Every arg here is ours
// (no user text; the prompt goes via stdin), so plain double quotes are safe for cmd.exe.
const opts = { input: prompt, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true };
const r = process.platform === 'win32'
  ? spawnSync(['claude', ...cli].map((a) => `"${a}"`).join(' '), { ...opts, shell: true })
  : spawnSync('claude', cli, opts);
fs.rmSync(sysFile, { force: true });
if (r.error) die(`could not start claude: ${r.error.message}`);

let json;
try { json = JSON.parse(r.stdout); } catch { /* handled below */ }
if (!json || json.is_error) die(`worker failed: ${(r.stdout || r.stderr || '').slice(0, 500)}`);

process.stdout.write(json.result + '\n');
const u = json.usage || {};
const inTok = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
process.stderr.write(`bulk-read: model=${model} in=${inTok} out=${u.output_tokens || 0} cost_usd=${(json.total_cost_usd || 0).toFixed(5)} files=${paths.length}\n`);
