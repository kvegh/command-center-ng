export const RECAP_WORD_TARGET: number;
export const RECAP_WORD_LIMIT: number;
export type ProgressRecapFields = { summary?: string; blocker?: string; nextStep?: string };
export function progressWordCount(progress: ProgressRecapFields): number;
export function compactProgressRecap(progress: ProgressRecapFields): {
  summary: string; blocker: string; nextStep: string; condensed: boolean;
};
