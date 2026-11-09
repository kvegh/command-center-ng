import { readFileSync } from 'node:fs';

export const REPORT_INTERVALS = [0, 5, 15, 60];

export const WORKER_BASE_INSTRUCTIONS = readFileSync(new URL('./worker-instructions.md', import.meta.url), 'utf8');
export const WORKER_REPORT_INSTRUCTIONS = WORKER_BASE_INSTRUCTIONS.split('## Standard Task Report\n')[1].split('## Structured questions\n')[0].trim();

export const WORKER_REPORT_REQUEST = 'Standard Task Report, once. Command Center now owns report timing. Cancel any previous agent-owned Standard Task Report clock loops or native schedules; do not start another. High priority: report at the next safe response checkpoint before ordinary project work; use known evidence without additional commands or waiting for task completion, then resume authorized work. Follow the named routine in your base instructions. This internal trigger needs no acknowledgement. Pending questions and native permissions remain unchanged.';

export const WORKER_TASK_PING_REQUEST = 'Silent task check, once. At the next safe response checkpoint, before the next ordinary step, inspect current Beads work in this conversation for neglected authorized tasks and truthful states. Do not force cancellation or interrupt unsafe work. Continue newly ready work only within real existing user authorization; delegate independent work when useful and available without conflicting edits or exceeding native concurrency limits. Keep blocked questions, dependencies, deferred or withdrawn work and explicit user pauses/stops intact; do not invent answers, reopen deferred work, retry unsafe or unconfirmed actions, or expand scope or permissions. Do not create or resume native Goals, a continuation dispatcher or a replacement timer loop. Update actual task states only from evidence and verified outcomes. This internal check needs no acknowledgement or routine task report; keep useful results, errors and genuine input requests visible through their normal channels. If nothing is ready, stop without an empty loop. Command Center owns the fifteen-minute task-ping cadence; do not self-schedule.';

export const WORKER_QUESTION_INSTRUCTIONS = WORKER_BASE_INSTRUCTIONS.split('## Structured questions\n')[1].trim();

export function reportTimingContext(minutes = 0) {
  return minutes && REPORT_INTERVALS.includes(minutes)
    ? `Current saved Standard Task Report interval: ${minutes} minutes. Command Center owns this timer and sends silent one-off report triggers. Stop any older agent-owned Standard Task Report clock loop or native schedule; do not recreate it. Browser refresh does not change the backend schedule. Report once when triggered, without acknowledging the trigger or repeating these timing instructions. This saved setting alone does not request a report or authorize additional project work.`
    : 'Current saved Standard Task Report interval: Never. Command Center schedules no recurring reports. Stop any older agent-owned Standard Task Report loop or native schedule. Explicit one-off Report now requests remain valid.';
}
