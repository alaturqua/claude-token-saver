// PreToolUse hook: deny full reads of large text files and point Claude to bulk-read.
// Targeted reads (Read with offset/limit, piped or sliced shell reads) pass through.
// Threshold: env BULK_READ_MIN_LINES (default 400). Node: fast startup and the same on Windows, macOS and Linux.
const fs = require('fs');
const path = require('path');
// The script ships next to the skill; resolved from this file so it works wherever the plugin is installed.
const SCRIPT = path.join(__dirname, '..', 'skills', 'bulk-read', 'bulk-read.js').replace(/\\/g, '/');

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw);
    const min = parseInt(process.env.BULK_READ_MIN_LINES || '400', 10);
    const ti = input.tool_input || {};
    let p = null;

    if (input.tool_name === 'Read') {
      if (ti.offset != null || ti.limit != null) return;
      p = ti.file_path;
    } else if (input.tool_name === 'Bash' || input.tool_name === 'PowerShell') {
      // shortcut: only a bare "cat|less|more|type|gc|Get-Content <one path>" is caught; other forms pass.
      const m = /^\s*(?:cat(?:\s+-n)?|less|more|type|gc|Get-Content)\s+(?:-(?:Literal)?Path\s+)?("[^"]+"|'[^']+'|[^\s|;&>]+)\s*$/i.exec(ti.command || '');
      if (m) p = m[1].replace(/^["']|["']$/g, '');
    }
    if (!p) return;
    if (!path.isAbsolute(p)) p = path.join(input.cwd || process.cwd(), p);
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return;
    // Binary and rich formats are rendered by Read itself.
    if (/\.(png|jpe?g|gif|webp|bmp|pdf|ipynb|xlsx?|docx?|pptx?|zip)$/i.test(p)) return;

    // Count newlines in chunks; stop as soon as the threshold is passed.
    const fd = fs.openSync(p, 'r');
    const buf = Buffer.alloc(1 << 16);
    let lines = 0, n;
    while (lines <= min && (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      for (let i = 0; i < n; i++) if (buf[i] === 10) lines++;
    }
    fs.closeSync(fd);
    if (lines <= min) return;

    const fwd = p.replace(/\\/g, '/');
    const reason = `File has more than ${min} lines. To understand it, run: node "${SCRIPT}" "<question>" "${fwd}" (see the bulk-read skill). To edit it, Read only the section you need with offset/limit. For debugging, code review or security checks, do not use bulk-read: Read the file in chunks with offset/limit.`;
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    }));
  } catch {
    // never block a tool call because the hook itself failed
  }
});
