---
name: bulk-read
description: Use when you need to understand one or more large files (over ~400 lines) without reading them in full, or when the check-read-size hook denied a Read.
---

# bulk-read

Sends files and one question to Haiku in a one-shot headless Claude Code call (uses your normal Claude Code login).
Only the answer enters your context. Cost is cents, latency 5-30 s.

```bash
node "${CLAUDE_SKILL_DIR}/bulk-read.js" "What are the main functions and who calls them?" src/app.py src/utils.py
```

- Follow-up question: call again with the same paths. Re-sending is cheap, because the files go to Haiku, not to you.
- The input is line-numbered, so answers cite `file:line`. Before an edit, confirm with a targeted `Read` (offset/limit).
- Over ~380K chars (~95K tokens, where Haiku's price jumps 5x): split the paths into several calls.

Do not use it for debugging, code review, security, prod or data-loss decisions. Haiku misses subtle bugs; read the relevant sections yourself.
