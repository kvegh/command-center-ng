import React, { useRef, useState } from 'react';

export function sidebarLimits(panelWidth: number) { return { min: 280, max: Math.max(280, Math.min(800, panelWidth - 360)) }; }
export function sidebarSize(value: number, panelWidth: number) { const limits = sidebarLimits(panelWidth); return Math.max(limits.min, Math.min(limits.max, value)); }

export function SidebarDivider({ width, panelWidth, change }: { width: number; panelWidth: number; change: (width: number) => void }) {
  const drag = useRef<{ pointer: number; initial: number } | null>(null);
  const [dragging, setDragging] = useState(false); const limits = sidebarLimits(panelWidth);
  return <div className={`sidebar-divider ${dragging ? 'resizing' : ''}`} role="separator" tabIndex={0} aria-label="Resize overview panel" aria-orientation="vertical" aria-controls="overview-panel" aria-valuemin={limits.min} aria-valuemax={limits.max} aria-valuenow={Math.round(width)}
    onPointerDown={event => {
      if (event.button !== 0 || !event.isPrimary) return;
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { return; }
      event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); drag.current = { pointer: event.pointerId, initial: width }; setDragging(true);
    }} onPointerMove={event => {
      if (drag.current?.pointer !== event.pointerId) return;
      const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
      change(sidebarSize(bounds.right - event.clientX, bounds.width));
    }} onPointerUp={event => {
      if (drag.current?.pointer !== event.pointerId) return;
      drag.current = null; setDragging(false); event.currentTarget.releasePointerCapture(event.pointerId);
    }} onPointerCancel={() => { if (drag.current) change(drag.current.initial); drag.current = null; setDragging(false); }}
    onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
    onKeyDown={event => {
      if (event.key === 'Escape' && drag.current) { change(drag.current.initial); drag.current = null; setDragging(false); return; }
      const value = event.key === 'ArrowLeft' ? width + (event.shiftKey ? 64 : 16) : event.key === 'ArrowRight' ? width - (event.shiftKey ? 64 : 16) : event.key === 'Home' ? limits.min : event.key === 'End' ? limits.max : null;
      if (value === null) return; event.preventDefault(); change(sidebarSize(value, panelWidth));
    }} title="Drag to resize overview; use Left/Right arrows when focused" />;
}
