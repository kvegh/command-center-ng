type CaptureTarget = {
  setPointerCapture(id: number): void;
  releasePointerCapture(id: number): void;
  hasPointerCapture(id: number): boolean;
};
type Pointer = {
  pointerId: number; pointerType?: string; button: number; isPrimary: boolean; clientX: number; clientY: number;
  currentTarget: CaptureTarget; preventDefault(): void;
};
export type TabDragState = { source: string; target: string | null } | null;

export function reorderTabs(ids: readonly string[], source: string, target: string): string[] {
  if (source === target || !ids.includes(source) || !ids.includes(target)) return [...ids];
  const order = ids.filter(id => id !== source);
  order.splice(ids.indexOf(target), 0, source);
  return order;
}

export class TabReorder {
  private session: { id: number; source: string; x: number; y: number; element: CaptureTarget; dragging: boolean; target: string | null } | null = null;
  private blockClickUntil = 0;
  constructor(private options: {
    targetAt(x: number, y: number): string | null;
    commit(source: string, target: string): void;
    change(state: TabDragState): void;
    allowVerticalStart?: () => boolean;
    now?: () => number;
  }) {}
  get dragging() { return !!this.session?.dragging; }
  down(event: Pointer, source: string) {
    // Finger gestures scroll the page. Arrow controls still let touch users
    // reorder deliberately, without capturing a swipe on a tab.
    if (event.pointerType === 'touch' || !event.isPrimary || event.button !== 0) return;
    this.cancel(); this.blockClickUntil = 0;
    try { event.currentTarget.setPointerCapture(event.pointerId); }
    catch { return; }
    this.session = { id: event.pointerId, source, x: event.clientX, y: event.clientY, element: event.currentTarget, dragging: false, target: null };
  }
  move(event: Pointer) {
    const session = this.session;
    if (!session || session.id !== event.pointerId) return;
    const started = !session.dragging;
    if (!session.dragging) {
      const dx = Math.abs(event.clientX - session.x), dy = Math.abs(event.clientY - session.y);
      if (Math.max(dx, dy) < 6) return;
      if (dy > dx && !this.options.allowVerticalStart?.()) { this.cancel(); return; }
      session.dragging = true;
    }
    event.preventDefault();
    const target = this.options.targetAt(event.clientX, event.clientY);
    if (started || session.target !== target) { session.target = target; this.options.change({ source: session.source, target }); }
  }
  up(event: Pointer) {
    if (this.session?.id !== event.pointerId) return;
    this.move(event);
    const session = this.session;
    if (!session) return;
    this.session = null;
    this.options.change(null);
    if (session.dragging) {
      event.preventDefault(); this.blockClickUntil = (this.options.now?.() ?? Date.now()) + 250;
      if (session.target && session.target !== session.source) this.options.commit(session.source, session.target);
    }
    this.release(session);
  }
  cancel(event?: Pick<Pointer, 'pointerId'>) {
    const session = this.session;
    if (!session || (event && event.pointerId !== session.id)) return;
    this.session = null; this.options.change(null); this.release(session);
  }
  consumeClick(detail: number) {
    if (detail === 0) return false;
    const blocked = (this.options.now?.() ?? Date.now()) <= this.blockClickUntil;
    this.blockClickUntil = 0;
    return blocked;
  }
  private release(session: NonNullable<TabReorder['session']>) {
    try { if (session.element.hasPointerCapture(session.id)) session.element.releasePointerCapture(session.id); }
    catch { /* Capture can already be gone after a cancellation or DOM removal. */ }
  }
}
