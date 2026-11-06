type InterruptAgent = { id: string; status: string; turnId: string | null };
type InterruptState = { agent?: InterruptAgent; connected: boolean; blocked: boolean; pending: boolean };

export function canInterrupt(agent: InterruptAgent | undefined, connected: boolean) {
  return !!(agent && connected && agent.turnId && ['running', 'attention'].includes(agent.status));
}

export function handleEscapeInterrupt(event: KeyboardEvent, state: InterruptState, interrupt: (id: string) => void) {
  if (event.key !== 'Escape' || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229
    || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || state.blocked || state.pending
    || !canInterrupt(state.agent, state.connected)) return false;

  const target = event.target as Element | null;
  // Leave Escape with controls that use it to dismiss/cancel local interaction.
  if (target?.closest?.('select, [role="combobox"], [role="listbox"], [role="menu"], [role="separator"], [aria-expanded="true"], input[type="search"], .question-card, .branch-summary-review')) return false;

  event.preventDefault();
  interrupt(state.agent!.id);
  return true;
}
