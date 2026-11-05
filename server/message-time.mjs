/** Normalize native milliseconds/ISO timestamps without coercing absent values. */
export function messageTime(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return;
  } else if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return;
  return date.toISOString();
}
