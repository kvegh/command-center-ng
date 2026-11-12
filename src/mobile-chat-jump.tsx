import React, { useEffect, useState, type RefObject } from 'react';

type MobileChatJumpProps = {
  compact: boolean;
  conversationRef: RefObject<HTMLDivElement | null>;
  conversationId: string;
};

export function MobileChatJump({ compact, conversationRef, conversationId }: MobileChatJumpProps) {
  const [ready, setReady] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  const measure = () => {
    const conversation = conversationRef.current;
    if (!conversation) return;
    const { top, bottom } = conversation.getBoundingClientRect();
    // The overview can remain visible well below document scroll position zero.
    // Each end has its own control, so both remain reachable in long histories.
    setShowTop(top <= 0);
    setShowBottom(bottom < 0 || bottom > window.innerHeight);
  };

  useEffect(() => {
    if (!compact || !conversationId) return;
    const conversation = conversationRef.current;
    setReady(!!conversation);
    if (!conversation) return;

    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(conversation);
    if (conversation.parentElement) observer?.observe(conversation.parentElement);
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [compact, conversationId, conversationRef]);

  if (!compact || !conversationId || !ready) return null;
  return <div className="mobile-chat-jump">
    {showTop && <button type="button" onClick={() => {
      if (!conversationRef.current) return;
      window.scrollTo({ top: 0, behavior: 'instant' });
      measure();
    }}>Jump to top</button>}
    {showBottom && <button type="button" onClick={() => {
      const conversation = conversationRef.current;
      if (!conversation) return;
      // Reveal the latest history and input without focusing it or opening the keyboard.
      const end = conversation.parentElement?.querySelector<HTMLElement>('.composer') || conversation;
      const top = Math.max(0, end.getBoundingClientRect().bottom + window.scrollY - window.innerHeight);
      window.scrollTo({ top, behavior: 'instant' });
      measure();
    }}>Jump to bottom</button>}
  </div>;
}
