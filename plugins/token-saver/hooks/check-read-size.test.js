// Self-check for check-read-size.js. Run: node check-read-size.test.js
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const h = path.join(__dirname, 'check-read-size.js');
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hooktest-'));
fs.writeFileSync(path.join(d, 'big.txt'), Array.from({ length: 500 }, (_, i) => `line ${i + 1}`).join('\n'));
fs.writeFileSync(path.join(d, 'small.txt'), 'x\n'.repeat(10));
const big = path.join(d, 'big.txt');
let fail = 0;
function T(name, input, expectDeny) {
  const out = execFileSync(process.execPath, [h], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8' });
  const ok = out.includes('"deny"') === expectDeny;
  if (!ok) fail++;
  console.log(`${name.padEnd(24)} ${ok ? 'PASS' : `FAIL out=${out}`}`);
}
const read = (ti) => ({ tool_name: 'Read', cwd: d, tool_input: ti });
const sh = (tool, command) => ({ tool_name: tool, cwd: d, tool_input: { command } });
T('Read big full', read({ file_path: big }), true);
T('Read big limit', read({ file_path: big, limit: 50 }), false);
T('Read small', read({ file_path: path.join(d, 'small.txt') }), false);
T('Read missing', read({ file_path: path.join(d, 'nope.txt') }), false);
T('Bash cat big rel', sh('Bash', 'cat big.txt'), true);
T('Bash cat -n big', sh('Bash', 'cat -n big.txt'), true);
T('Bash less big', sh('Bash', 'less big.txt'), true);
T('Bash cat|grep', sh('Bash', 'cat big.txt | grep 5'), false);
T('PS Get-Content -Tail', sh('PowerShell', `Get-Content "${big}" -Tail 5`), false);
T('PS Get-Content quoted', sh('PowerShell', `Get-Content "${big}"`), true);
T('Bad JSON input', 'not json', false);
fs.rmSync(d, { recursive: true, force: true });
process.exit(fail);
