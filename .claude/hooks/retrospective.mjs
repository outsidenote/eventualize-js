#!/usr/bin/env node
/**
 * Claude Code Retrospective Hook
 * Cross-platform (macOS, Windows, Linux)
 * Captures each prompt and a summary of what was done into .claude/retrospective/
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { stdin } from 'process';

async function readStdin() {
  const chunks = [];
  for await (const chunk of stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function sanitizeSlug(text) {
  return text
    .split('\n')[0]
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .replace(/-+$/, '') || 'unnamed-prompt';
}

function extractFromTranscript(transcriptPath) {
  const content = readFileSync(transcriptPath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  // Parse all JSONL entries
  const entries = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }

  // Find the last user message
  let lastUserIdx = -1;
  let userPrompt = '';

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    const type = entry.type || entry.role;
    if (type === 'human' || type === 'user') {
      lastUserIdx = i;
      const content = entry.message?.content ?? entry.content;
      if (typeof content === 'string') {
        userPrompt = content;
      } else if (Array.isArray(content)) {
        userPrompt = content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');
      }
      break;
    }
  }

  // Collect assistant responses after the last user message
  const toolsUsed = new Set();
  const assistantTexts = [];

  if (lastUserIdx >= 0) {
    for (let i = lastUserIdx + 1; i < entries.length; i++) {
      const entry = entries[i];
      const type = entry.type || entry.role;
      if (type === 'assistant') {
        const content = entry.message?.content ?? entry.content;
        if (typeof content === 'string') {
          assistantTexts.push(content);
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              assistantTexts.push(block.text);
            }
            if (block.type === 'tool_use' && block.name) {
              toolsUsed.add(block.name);
            }
          }
        }
      }
    }
  }

  return {
    userPrompt,
    toolsUsed: [...toolsUsed],
    assistantText: assistantTexts.join('\n').slice(0, 5000),
  };
}

function formatTimestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const HH = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${yyyy}-${MM}-${dd}--${HH}-${mm}`;
}

function getSessionFolder(retroBase, sessionId) {
  const sessionMapPath = join(retroBase, '.session-map.json');
  let sessionMap = {};

  if (existsSync(sessionMapPath)) {
    try {
      sessionMap = JSON.parse(readFileSync(sessionMapPath, 'utf-8'));
    } catch {
      sessionMap = {};
    }
  }

  if (sessionMap[sessionId]) {
    return sessionMap[sessionId];
  }

  // Find the next session number from existing folder names
  const existingNums = Object.values(sessionMap)
    .map(name => {
      const match = String(name).match(/^(\d+)-/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => !isNaN(n));
  const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;

  const folderName = `${nextNum}-${formatTimestamp()}`;
  sessionMap[sessionId] = folderName;
  writeFileSync(sessionMapPath, JSON.stringify(sessionMap, null, 2));

  return folderName;
}

function getPromptIndex(sessionDir) {
  if (!existsSync(sessionDir)) return 1;

  const entries = readdirSync(sessionDir);
  const nums = entries
    .map(name => {
      const match = name.match(/^pmt-(\d+)-/);
      return match ? parseInt(match[1], 10) : null;
    })
    .filter(n => n !== null);

  return nums.length > 0 ? Math.max(...nums) + 1 : 1;
}

async function main() {
  try {
    const rawInput = await readStdin();
    const input = JSON.parse(rawInput);

    const {
      session_id: sessionId,
      transcript_path: transcriptPath,
      stop_hook_active: stopHookActive,
      cwd,
    } = input;

    // Don't run if this is already a stop-hook response (prevent infinite loop)
    if (stopHookActive === true || stopHookActive === 'true') {
      process.exit(0);
    }

    // Don't run if no transcript
    if (!transcriptPath || !existsSync(transcriptPath)) {
      process.exit(0);
    }

    const projectDir = cwd || process.cwd();
    const retroBase = join(projectDir, '.claude', 'retrospective');

    // Extract data from transcript
    const { userPrompt, toolsUsed, assistantText } = extractFromTranscript(transcriptPath);

    // Skip /clear and similar commands
    if (/^\s*\/(clear|reset|compact|help|exit|quit)\s*$/i.test(userPrompt)) {
      process.exit(0);
    }

    // Skip empty prompts
    if (!userPrompt || userPrompt.trim() === '') {
      process.exit(0);
    }

    // Determine session number and prompt index
    mkdirSync(retroBase, { recursive: true });
    const sessionFolder = getSessionFolder(retroBase, sessionId);
    const sessionDir = join(retroBase, sessionFolder);
    mkdirSync(sessionDir, { recursive: true });

    const promptIndex = getPromptIndex(sessionDir);

    // Generate slug from user prompt
    const slug = sanitizeSlug(userPrompt);

    // Build the retrospective markdown
    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').slice(0, 19);

    const toolsList = toolsUsed.length > 0
      ? toolsUsed.join(', ')
      : 'No tools were used';

    const summaryLines = assistantText
      .split('\n')
      .slice(0, 80)
      .join('\n');

    const markdown = `# Retrospective: Session ${sessionFolder}, Prompt ${promptIndex}

**Date:** ${dateStr}
**Session ID:** \`${sessionId}\`

## User Prompt

\`\`\`
${userPrompt.split('\n').slice(0, 50).join('\n')}
\`\`\`

## What Was Done

### Tools Used
${toolsList}

### Summary of Actions
${summaryLines}

---
*Auto-generated by Claude Code retrospective hook*
`;

    const retroFile = join(sessionDir, `pmt-${promptIndex}-${slug}.md`);
    writeFileSync(retroFile, markdown, 'utf-8');

  } catch (err) {
    // Silently exit on errors - don't interrupt Claude's workflow
    // Uncomment below for debugging:
    // console.error('Retrospective hook error:', err.message);
    process.exit(0);
  }
}

main();
