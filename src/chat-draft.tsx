import React from 'react';

export function clearSubmittedDraft(drafts: Record<string, string>, agentId: string, sentText: string) {
  return drafts[agentId] === sentText ? { ...drafts, [agentId]: '' } : drafts;
}

type Props = {
  agentId: string;
  name: string;
  text: string;
  placeholder: string;
  disabled: boolean;
  canSubmit: boolean;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  onChange: (text: string) => void;
  onSubmit: () => void;
  onPasteImages?: (files: File[], agentId: string) => void;
};

export function ChatDraft({ agentId, name, text, placeholder, disabled, canSubmit, inputRef, onChange, onSubmit, onPasteImages }: Props) {
  return <textarea ref={inputRef} data-agent-id={agentId} aria-label={`Message ${name}`}
    placeholder={placeholder} value={text} onChange={event => onChange(event.target.value)}
    onPaste={event => {
      if (disabled || !onPasteImages) return;
      const images = Array.from(event.clipboardData.items).filter(item => item.kind === 'file' && item.type.startsWith('image/'))
        .map(item => item.getAsFile()).filter((file): file is File => !!file);
      if (images.length) onPasteImages(images, agentId);
    }}
    onKeyDown={event => {
      if (canSubmit && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault(); onSubmit();
      }
    }} rows={2} maxLength={32000} disabled={disabled} />;
}
