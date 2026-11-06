export type NativeApprovalQuestion = { method: string; params: Record<string, any> };
export type NativeApprovalChoice = {
  key: string;
  label: string;
  scope: string | null;
  persistent: boolean;
  answer: Record<string, any>;
};
export function isNativeToolApproval(question: NativeApprovalQuestion): boolean;
export function nativeApprovalChoices(question: NativeApprovalQuestion, options?: { allowPersistent?: boolean }): NativeApprovalChoice[];
export function nativeApprovalAnswer(question: NativeApprovalQuestion, answer: Record<string, any>, options?: { allowPersistent?: boolean }): Record<string, any>;
