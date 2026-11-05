import React, { useEffect, useRef, useState } from 'react';

type CopyEnvironment = { clipboard?: Pick<Clipboard, 'writeText'> | null; document?: Document | null };

export async function copyText(text: string, {
  clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard,
  document: doc = typeof document === 'undefined' ? undefined : document
}: CopyEnvironment = {}) {
  if (clipboard?.writeText) { await clipboard.writeText(text); return; }
  if (!doc?.body || typeof doc.execCommand !== 'function') throw new Error('Clipboard unavailable. Select the text and copy it manually.');
  const active = doc.activeElement as HTMLElement | null;
  const selection = doc.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const field = doc.createElement('textarea');
  field.value = text; field.readOnly = true; field.tabIndex = -1;
  field.setAttribute('aria-hidden', 'true');
  Object.assign(field.style, { position: 'fixed', left: '-10000px', top: '0', opacity: '0' });
  try {
    doc.body.appendChild(field); field.focus({ preventScroll: true }); field.select();
    if (!doc.execCommand('copy')) throw new Error('Copy failed. Select the text and copy it manually.');
  } finally {
    field.remove();
    try { active?.focus({ preventScroll: true }); if (selection) { selection.removeAllRanges(); ranges.forEach(range => selection.addRange(range)); } } catch { /* Selection may no longer belong to the current document. */ }
  }
}

export function CopyButton({ text, label = 'Copy this', compact = false }: { text: string; label?: string; compact?: boolean }) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const pending = useRef(false);
  useEffect(() => { if (status !== 'copied') return; const timer = setTimeout(() => setStatus('idle'), 2000); return () => clearTimeout(timer); }, [status]);
  const result = status === 'copied' ? 'Copied!' : status === 'error' ? 'Copy failed' : status === 'copying' ? 'Copying…' : label;
  return <span className={`copy-control${compact ? ' compact' : ''}`}>
    <button type="button" className="message-copy" aria-label={result} title={status === 'error' ? 'Clipboard unavailable. Select and copy the text manually, or retry.' : result} disabled={status === 'copying'} onClick={async () => {
      if (pending.current) return; pending.current = true; setStatus('copying');
      try { await copyText(text); setStatus('copied'); } catch { setStatus('error'); } finally { pending.current = false; }
    }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {status === 'copied' ? <path d="m5 12 4 4L19 6" /> : <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" /></>}
      </svg>
      {(!compact || status === 'copied' || status === 'error') && <span>{result}</span>}
    </button>
    <span className="copy-status" role="status" aria-live="polite">{status === 'copied' ? 'Copied to clipboard.' : status === 'error' ? 'Copy failed. Select and copy the text manually.' : ''}</span>
  </span>;
}
