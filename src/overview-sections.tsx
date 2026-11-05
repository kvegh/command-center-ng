import React, { useId, useRef, useState } from 'react';

export type OverviewSection = { id: string; label: string; content: React.ReactNode };
const minimum = 64;
const maximum = 1200;

export function sectionPairHeights(before: number, after: number, delta: number) {
  const upper = Math.max(minimum, Math.min(maximum, before + delta));
  const lower = Math.max(minimum, Math.min(maximum, after - (upper - before)));
  return { before: Math.round(upper), after: Math.round(lower) };
}

export function OverviewSections({ sections, heights, change }: {
  sections: OverviewSection[];
  heights: Record<string, number>;
  change: (id: string, height: number | undefined) => void;
}) {
  const instance = useId();
  const bodies = useRef(new Map<string, HTMLDivElement>());
  const drag = useRef<{ pointer: number; y: number; before: string; after: string; upper: number; lower: number; originalUpper?: number; originalLower?: number } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const measure = (id: string) => bodies.current.get(id)?.getBoundingClientRect().height || heights[id] || minimum;
  const resize = (before: string, after: string, upper: number, lower: number, delta: number) => {
    const size = sectionPairHeights(upper, lower, delta);
    change(before, size.before); change(after, size.after);
  };
  const cancel = () => {
    const previous = drag.current; drag.current = null; setDragging(null);
    if (previous) { change(previous.before, previous.originalUpper); change(previous.after, previous.originalLower); }
  };
  return <div className="overview-sections">{sections.map((section, index) => {
    const next = sections[index + 1]; const height = heights[section.id];
    return <React.Fragment key={section.id}>
      <section className="overview-section" data-section={section.id} aria-label={section.label}>
        <div id={`${instance}-${section.id}`} ref={node => { if (node) bodies.current.set(section.id, node); else bodies.current.delete(section.id); }} className={`overview-section-body${height === undefined ? '' : ' sized'}`} style={height === undefined ? undefined : { '--section-height': `${Math.max(minimum, Math.min(maximum, height))}px` } as React.CSSProperties}>
          {section.content}
        </div>
      </section>
      {next && <div role="separator" tabIndex={0} aria-orientation="horizontal" aria-label={`Resize ${section.label} and ${next.label}`} aria-controls={`${instance}-${section.id} ${instance}-${next.id}`} aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={height === undefined ? undefined : Math.round(height)} aria-valuetext={height === undefined ? 'Automatic height' : `${Math.round(height)} pixels`}
        className={`overview-section-divider${dragging === section.id ? ' resizing' : ''}`}
        title="Drag to resize sections; use Up/Down arrows, Home/End; double-click to reset"
        onPointerDown={event => {
          if (event.button !== 0 || !event.isPrimary) return;
          try { event.currentTarget.setPointerCapture(event.pointerId); } catch { return; }
          event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
          drag.current = { pointer: event.pointerId, y: event.clientY, before: section.id, after: next.id, upper: measure(section.id), lower: measure(next.id), originalUpper: heights[section.id], originalLower: heights[next.id] };
          setDragging(section.id);
        }}
        onPointerMove={event => {
          const current = drag.current;
          if (current?.pointer === event.pointerId) resize(current.before, current.after, current.upper, current.lower, event.clientY - current.y);
        }}
        onPointerUp={event => {
          if (drag.current?.pointer !== event.pointerId) return;
          drag.current = null; setDragging(null); event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={cancel} onLostPointerCapture={cancel}
        onDoubleClick={() => { change(section.id, undefined); change(next.id, undefined); }}
        onKeyDown={event => {
          if (event.key === 'Escape' && drag.current) { event.preventDefault(); cancel(); return; }
          const delta = event.key === 'ArrowUp' ? -(event.shiftKey ? 64 : 16) : event.key === 'ArrowDown' ? (event.shiftKey ? 64 : 16) : event.key === 'Home' ? -maximum * 2 : event.key === 'End' ? maximum * 2 : null;
          if (delta === null) return;
          event.preventDefault(); resize(section.id, next.id, measure(section.id), measure(next.id), delta);
        }} />}
    </React.Fragment>;
  })}</div>;
}
