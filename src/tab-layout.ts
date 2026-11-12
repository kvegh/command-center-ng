/** Presentation only: selection never changes the saved order or row membership. */
export function tabGridLayout(ids: readonly string[], hasCoordinator: boolean, selected?: string) {
  const twoRows = ids.length + Number(hasCoordinator) > 6;
  const split = twoRows ? Math.ceil(ids.length / 2) : ids.length;
  const selectedIndex = selected ? ids.indexOf(selected) : -1;
  const firstRow = twoRows && selectedIndex >= 0 && selectedIndex < split ? 2 : 1;
  return {
    twoRows,
    positions: ids.map((id, index) => ({
      id,
      row: index < split ? firstRow : 3 - firstRow,
      column: (index < split ? index : index - split) + 1,
    })),
  };
}

type Bounds = { left: number; right: number };

/** Scroll horizontally only; tab selection must not scroll the chat/page. */
export function tabScrollOffset(tab: Bounds, strip: Bounds): number {
  if (tab.left < strip.left) return tab.left - strip.left;
  if (tab.right > strip.right) {
    // A title wider than the viewport starts at its left edge and remains scrollable.
    return Math.min(tab.right - strip.right, tab.left - strip.left);
  }
  return 0;
}
