export type ApprovalFocusContext = { agentId: string | null; blocked: boolean; revision: number };

export function captureApprovalFocus(input: HTMLTextAreaElement | null, current: () => ApprovalFocusContext) {
  const origin = current();
  return () => {
    const latest = current();
    // A tab/dialog change cancels this focus return, even if the user comes back
    // before the native acknowledgement. Never queue focus for a later render.
    if (!input || origin.blocked || latest.blocked || !origin.agentId
      || latest.agentId !== origin.agentId || latest.revision !== origin.revision
      || !input.isConnected || input.disabled || input.dataset.agentId !== origin.agentId) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  };
}
