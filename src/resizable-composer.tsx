import React, { useLayoutEffect, useRef, useState } from 'react';

// Keep a readable part of the history even on short windows. The composer can
// scroll internally when a wrapped header, controls or image previews need room.
export function composerLimits(available: number) {
  const max = Math.max(80, Math.min(1200, available - 120));
  return { min: Math.min(180, max), max };
}
export function composerSize(value: number, available: number) {
  const { min, max } = composerLimits(available);
  return Math.round(Math.max(min, Math.min(max, value)));
}

export function ResizableComposer({ workerId, height, compact = false, change, onSubmit, children }: {
  workerId: string;
  height?: number;
  compact?: boolean;
  change: (height: number | undefined) => void;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  children: React.ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const drag = useRef<{ pointer: number; y: number; initial: number; restore: () => void } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [available, setAvailable] = useState(600);
  const cancel = () => {
    const previous = drag.current; drag.current = null; setDragging(false);
    if (previous) previous.restore();
  };
  useLayoutEffect(() => {
    // Rotation can remove the handle midway through a drag. Restore the saved
    // desktop preference rather than keeping that unfinished resize.
    if (compact) cancel();
  }, [compact]);
  const measureAvailable = () => {
    const panel = form.current?.parentElement;
    if (!panel) return 600;
    const overview = panel.querySelector<HTMLElement>(':scope > .context');
    const stacked = getComputedStyle(panel).display !== 'grid';
    return Math.max(0, panel.clientHeight - (stacked ? overview?.getBoundingClientRect().height || 0 : 0));
  };
  useLayoutEffect(() => {
    if (compact) return;
    const node = form.current; const panel = node?.parentElement;
    if (!node || !panel) return;
    const measure = () => setAvailable(measureAvailable());
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel); observer.observe(node);
    const overview = panel.querySelector(':scope > .context');
    if (overview) observer.observe(overview);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [workerId, compact]);
  const limits = composerLimits(available);
  const measuredHeight = () => form.current?.getBoundingClientRect().height || height || limits.min;
  return <form ref={form} id="chat-composer" className={`composer${compact || height === undefined ? '' : ' sized'}`} style={compact ? undefined : {
    height: height === undefined ? undefined : composerSize(height, available),
    maxHeight: limits.max,
  }} onSubmit={onSubmit}>
    {!compact && <div role="separator" tabIndex={0} aria-label="Resize chat input and history" aria-orientation="horizontal" aria-controls="chat-composer"
      aria-valuemin={limits.min} aria-valuemax={limits.max} aria-valuenow={height === undefined ? undefined : composerSize(height, available)}
      aria-valuetext={height === undefined ? 'Automatic height' : `${composerSize(height, available)} pixels`}
      className={`composer-divider${dragging ? ' resizing' : ''}`}
      title="Drag up to enlarge input; Up/Down arrows, Home/End; double-click to reset"
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary) return;
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { return; }
        event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
        drag.current = { pointer: event.pointerId, y: event.clientY, initial: measuredHeight(), restore: () => change(height) };
        setDragging(true);
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (current?.pointer === event.pointerId) change(composerSize(current.initial + current.y - event.clientY, measureAvailable()));
      }}
      onPointerUp={event => {
        if (drag.current?.pointer !== event.pointerId) return;
        drag.current = null; setDragging(false); event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={cancel} onLostPointerCapture={cancel}
      onDoubleClick={() => { drag.current = null; setDragging(false); change(undefined); }}
      onKeyDown={event => {
        if (event.key === 'Escape' && drag.current) { event.preventDefault(); event.stopPropagation(); cancel(); return; }
        const bounds = composerLimits(measureAvailable());
        const value = event.key === 'ArrowUp' ? measuredHeight() + (event.shiftKey ? 64 : 16)
          : event.key === 'ArrowDown' ? measuredHeight() - (event.shiftKey ? 64 : 16)
          : event.key === 'Home' ? bounds.min : event.key === 'End' ? bounds.max : null;
        if (value === null) return;
        event.preventDefault(); change(composerSize(value, measureAvailable()));
      }} />}
    {children}
  </form>;
}
