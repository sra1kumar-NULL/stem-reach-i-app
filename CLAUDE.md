# CLAUDE.md

Follow `AGENTS.md` — it is the source of truth for this repo's structure, non-negotiables, roles,
and review workflow.

@AGENTS.md

## Claude Code equivalents

The OpenCode setup in `.opencode/` is mirrored for Claude Code in `.claude/`. Keep both in sync.

| OpenCode | Claude Code |
|---|---|
| `.opencode/agents/*.md` | `.claude/agents/*.md` — subagents: `senior-engineer`, `staff-engineer`, `principal-engineer`, `architect`, `code-reviewer` (read-only), `security-reviewer` (read-only), `test-engineer`, `debugger` |
| `.opencode/skills/*/SKILL.md` | `.claude/skills/*/SKILL.md` — `architecture`, `repo-code-review`, `frontend`, `testing`, `security`, `performance` (`code-review` is renamed `repo-code-review` on the Claude side to avoid the built-in `/code-review`) |
| `.opencode/commands/*.md` | `.claude/commands/*.md` — `/plan`, `/review`, `/fix-review`, `/test`, `/ship` |
| `opencode.json` skill permissions | `skills:` list in each subagent's frontmatter |

Delegate with "use the `<name>` subagent". Security findings are blocking.

## Key commands

```bash
npm install
npm run typecheck      # all workspaces, incl. mobile
npm test               # workspace tests (currently core/: node --test)
npm run verify         # question bank integrity
npm run seed           # load content/*.json into the DB
npm run dev:api        # API on :3000
cd mobile && npm run dev   # Expo dev server
cd mobile && npm run lint
```

Never report a test as passing unless you ran it and show the real output.
