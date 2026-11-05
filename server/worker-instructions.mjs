import { readFileSync } from 'node:fs';

export const REPORT_INTERVALS = [0, 5, 15, 60];

export const WORKER_BASE_INSTRUCTIONS = readFileSync(new URL('./worker-instructions.md', import.meta.url), 'utf8');
export const WORKER_REPORT_INSTRUCTIONS = WORKER_BASE_INSTRUCTIONS.split('## Standard Task Report\n')[1].split('## Structured questions\n')[0].trim();

export const WORKER_REPORT_REQUEST = 'Standard Task Report. High priority: report at the next safe response checkpoint before ordinary project work; use known evidence without additional commands or waiting for task completion, then resume authorized work. Follow the named routine in your base instructions. Pending questions and native permissions remain unchanged.';

export const WORKER_QUESTION_INSTRUCTIONS = WORKER_BASE_INSTRUCTIONS.split('## Structured questions\n')[1].trim();

export function reportTimingContext(minutes = 0) {
  return minutes && REPORT_INTERVALS.includes(minutes)
    ? `Current saved Standard Task Report interval: ${minutes} minutes. Maintain this existing agent-managed cadence, or reestablish it if this native session resumed without its schedule. Browser refresh or tab switching does not cancel it. Reuse or replace the existing schedule rather than adding a duplicate, and do not post another timing acknowledgement or an immediate report merely for this context. Use available native scheduling/clock tools and explain any actual runtime limit. This setting does not authorize additional project work; Command Center does not run a recurring report timer.`
    : 'Current saved Standard Task Report interval: Never. This control requests no recurring reports; do not reestablish a schedule from an older CCNG interval setting. Explicit Report now and other direct user instructions remain valid.';
}
