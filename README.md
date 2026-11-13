# claude-token-saver

A Claude Code plugin that cuts context use and cost:

- **Read-size guard** (PreToolUse hook): blocks a full `Read` of text files over 400 lines and bare `cat`/`Get-Content` dumps. Claude is told to read a line range or use `bulk-read`.
- **bulk-read** (skill): sends large files and one question to Haiku in a one-shot headless `claude -p` call. Only the answer, with `file:line` references, enters your context. Uses your normal Claude Code login.
- **Handover** (hooks): at about 200K tokens, Claude is asked to write a short handover file (goal, state, decisions, next step) to `~/.claude-handovers/`. The PreCompact hook feeds it into the compaction summary, and SessionStart loads it back after compaction.
- **Subagents**: `runner` (Haiku) runs tests or builds and returns only the failures; `reviewer` (Sonnet) reviews a diff before a commit.

## Install

```bash
claude plugin marketplace add alaturqua/claude-token-saver
```

```bash
claude plugin install token-saver@token-saver
```

Then run the one-time setup from a clone (needs Node):

```bash
git clone https://github.com/alaturqua/claude-token-saver && node claude-token-saver/setup/setup.js
```

A plugin can't do these, so the setup script does them in `~/.claude/`:

- Adds allow rules `Edit(~/.claude-handovers/**)` and `Read(~/.claude-handovers/**)`, so the handover write doesn't prompt.
- Sets `autoCompactWindow: 250000` if you have none. The handover must fire before compaction.
- Copies a Haiku `Explore` agent to `~/.claude/agents/` (it replaces the built-in Explore; a plugin agent can't). Skip with `--no-explore`.
- Removes hook entries from an older manual install of these scripts, so nothing runs twice.

It backs up `settings.json` to `~/.claude/backups/token-saver-<time>/` first and is safe to re-run. Undo with `node setup/setup.js --uninstall`, then `claude plugin uninstall token-saver@token-saver`.

Start a new session afterwards.

## Requirements

Node 18 or newer. Everything (hooks, bulk-read, setup, tests) is plain Node, so it runs the same on Windows, macOS, Linux and WSL. Tested on Windows; macOS and Linux are untested.

## Tuning

Set these in your shell, not in `settings.json` `env` (that would override per-session values):

| Variable | Default | Effect |
|---|---|---|
| `HANDOVER_AT_TOKENS` | 200000 | Context size that triggers the handover request. Keep it ~50K below `autoCompactWindow`. |

Handover files older than 30 days are deleted automatically.

## Tests

```bash
node plugins/token-saver/hooks/check-read-size.test.js
```

```bash
node plugins/token-saver/hooks/handover.test.js
```

## Notes

- `bulk-read` does not use `claude -p --bare`, because `--bare` only accepts `ANTHROPIC_API_KEY` and fails with a subscription login. It uses `--setting-sources "" --strict-mcp-config` instead.
- Haiku's price jumps above about 100K prompt tokens, so `bulk-read` caps input at about 380K characters. Split larger sets into several calls.
- Don't rely on Haiku for debugging, security or review decisions. Read the relevant lines yourself.

## About the author

Built by [Isa Inalcik](https://isainalcik.dev), a data platform architect with about fifteen years in data. I build lakehouses on Databricks, Trino and Apache Iceberg, and connect AI to governed data through MCP servers and LLM functions in SQL.

More of my open source work:

- [tower-mods](https://github.com/alaturqua/tower-mods): Claude Code mods for running many sessions across many repos from one control tower.
- [skill-canvas](https://github.com/alaturqua/skill-canvas): a VS Code extension for building agents and skills in a GUI.
- [mcp-trino-python](https://github.com/alaturqua/mcp-trino-python): an MCP server for Trino.
- [trino-ai](https://github.com/alaturqua/trino-ai): LLM calls as Trino SQL functions.
- [dbt-hodor](https://github.com/alaturqua/dbt-hodor): rebuild only the dbt nodes whose code or upstream data changed.

If this saves you tokens, a star on the repo helps others find it.

## License

Apache-2.0
