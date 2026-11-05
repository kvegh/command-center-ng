import { readFileSync } from 'node:fs';

export const REPORT_INTERVALS = [0, 5, 15, 60];

export const WORKER_BASE_INSTRUCTIONS = readFileSync(new URL('./worker-instructions.md', import.meta.url), 'utf8');
export const WORKER_REPORT_INSTRUCTIONS = WORKER_BASE_INSTRUCTIONS.split('## Standard Task Report\n')[1].split('## Structured questions\n')[0].trim();

export const WORKER_REPORT_REQUEST = 'Standard Task Report. High priority: report at the next safe response checkpoint before ordinary project work; use known evidence without additional commands or waiting for task completion, then resume authorized work. Follow the named routine in your base instructions. Pending questions and native permissions remain unchanged.';

export const WORKER_QUESTION_INSTRUCTIONS = WORKER_BASE_INSTRUCTIONS.split('## Structured questions\n')[1].trim();
