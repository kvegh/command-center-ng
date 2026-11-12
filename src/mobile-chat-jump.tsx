import React, { useEffect, useState, type RefObject } from 'react';

type MobileChatJumpProps = {
  compact: boolean;
  conversationRef: RefObject<HTMLDivElement | null>;
  conversationId: string;
};

export function MobileChatJump({ compact, conversationRef, conversationId }: MobileChatJumpProps) {
  const [ready, setReady] = useState(false);
  const [atTop, setAtTop] = useState(true);

  useEffect(() => {
    if (!compact || !conversationId) return;
    const conversation = conversationRef.current;
    setReady(!!conversation);
    if (!conversation) return;

    const measure = () => setAtTop(window.scrollY <= 4);
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(conversation);
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [compact, conversationId, conversationRef]);

  if (!compact || !conversationId || !ready) return null;
  const label = atTop ? 'Jump to end' : 'Jump to top';
  return <button type="button" className="mobile-chat-jump" onClick={() => {
    const conversation = conversationRef.current;
    if (!conversation) return;
    // Align this chat's composer with the viewport bottom, keeping the latest
    // messages visible above it without scrolling through the sidebar.
    const end = conversation.parentElement?.querySelector<HTMLElement>('.composer') || conversation;
    const top = window.scrollY <= 4 ? Math.max(0, end.getBoundingClientRect().bottom + window.scrollY - window.innerHeight) : 0;
    window.scrollTo({ top, behavior: 'instant' });
  }}>{label}</button>;
}
