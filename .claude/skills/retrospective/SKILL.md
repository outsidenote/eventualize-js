# Retrospective Skill

Automatically records a retrospective log for each user prompt interaction with Claude Code.

## How It Works

A `Stop` hook fires after Claude finishes responding to each prompt. The hook script (`.claude/hooks/retrospective.mjs`) reads the conversation transcript and writes a markdown file capturing:

- The user's prompt
- Tools used during the response
- Summary of actions taken

## File Structure

```
.claude/retrospective/
├── .session-map.json                              # Maps session IDs to folder names
├── 1-2026-02-16--14-30/                           # Session 1
│   ├── pmt-1-{slug-name}.md
│   ├── pmt-2-{slug-name}.md
│   └── ...
├── 2-2026-02-17--09-15/                           # Session 2
│   └── ...
└── ...
```

- **Session number**: Auto-incremented per unique session ID
- **Prompt index**: Auto-incremented within each session
- **Slug name**: Generated from the user prompt content

## Excluded Prompts

The hook skips:
- `/clear`, `/reset`, `/compact`, `/help`, `/exit`, `/quit` commands
- Empty prompts
- Stop-hook responses (prevents infinite loops)

## Configuration

The hook is configured in `.claude/settings.json` under `hooks.Stop`.

## Cross-Platform

The hook script is written in Node.js (`.mjs`) for cross-platform compatibility (macOS, Windows, Linux).
