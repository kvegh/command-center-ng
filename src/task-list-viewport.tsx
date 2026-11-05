import React, { useLayoutEffect, useRef, useState } from 'react';

export function taskViewportHeight(rowHeights: number[], gap: number) {
  const visible = rowHeights.slice(0, 3);
  return Math.ceil(visible.reduce((total, height) => total + height, 0) + Math.max(0, visible.length - 1) * gap);
}

export function TaskListViewport({ children }: { children: React.ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const node = viewport.current; if (!node) return;
    const rows = Array.from(node.children).slice(0, 3) as HTMLElement[];
    const measure = () => {
      const style = getComputedStyle(node);
      const next = taskViewportHeight(rows.map(row => row.getBoundingClientRect().height), parseFloat(style.rowGap) || 0) + (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      setHeight(previous => previous === next ? previous : next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }
    const observer = new ResizeObserver(measure); observer.observe(node); rows.forEach(row => observer.observe(row));
    return () => observer.disconnect();
  }, [children]);
  return <div ref={viewport} className="task-scroll" role="region" aria-label="Linked tasks" tabIndex={0} style={height === undefined ? undefined : { maxHeight: height }}>{children}</div>;
}
