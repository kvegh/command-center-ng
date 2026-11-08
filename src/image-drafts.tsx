import React from 'react';
import imageLimits from '../server/image-limits.json' with { type: 'json' };

export type DraftImage = { id: string; label: string; size: number; mimeType: string; dataUrl?: string };
export type ImageDrafts = Record<string, DraftImage[]>;
export type MessageImage = { url: string; label?: string; mimeType: string };
let nextImageId = 0;

export function prepareImageDrafts(existing: DraftImage[], files: File[]): DraftImage[] {
  if (existing.length + files.length > imageLimits.maxImages) throw new Error(`Attach up to ${imageLimits.maxImages} images per message.`);
  for (const file of files) {
    if (!imageLimits.mimeTypes.includes(file.type)) throw new Error('Choose or paste a PNG, JPEG, GIF or WebP image.');
    if (!file.size) throw new Error('This image is empty. Choose or paste the image again.');
    if (file.size > imageLimits.maxImageBytes) throw new Error(`Each image must be ${imageLimits.maxImageBytes / 1024 / 1024} MiB or smaller.`);
  }
  if ([...existing, ...files].reduce((sum, file) => sum + file.size, 0) > imageLimits.maxTotalImageBytes) throw new Error(`Images in one message must total ${imageLimits.maxTotalImageBytes / 1024 / 1024} MiB or less.`);
  return files.map((file, index) => ({ id: `image-${++nextImageId}`, label: file.name?.slice(0, 120) || `Pasted image ${existing.length + index + 1}`, size: file.size, mimeType: file.type }));
}

export function readImageFile(file: File, reader: FileReader = new FileReader()): Promise<string> {
  return new Promise((resolve, reject) => {
    reader.onload = () => typeof reader.result === 'string' && reader.result.startsWith(`data:${file.type};base64,`)
      ? resolve(reader.result) : reject(new Error('This image could not be read. Choose or paste the image again.'));
    reader.onerror = reader.onabort = () => reject(new Error('This image could not be read. Choose or paste the image again.'));
    reader.readAsDataURL(file);
  });
}

export function finishImageDraft(drafts: ImageDrafts, agentId: string, imageId: string, dataUrl: string): ImageDrafts {
  if (!drafts[agentId]?.some(image => image.id === imageId)) return drafts;
  return { ...drafts, [agentId]: drafts[agentId].map(image => image.id === imageId ? { ...image, dataUrl } : image) };
}

export function removeImageDrafts(drafts: ImageDrafts, agentId: string, ids: string[]): ImageDrafts {
  if (!drafts[agentId]) return drafts;
  return { ...drafts, [agentId]: drafts[agentId].filter(image => !ids.includes(image.id)) };
}

export function hasReadyDraft(text: string, images: DraftImage[]): boolean {
  return (!!text.trim() || !!images.length) && images.every(image => !!image.dataUrl);
}

export function ImageAttachmentPicker({ agentId, name, disabled, attach }: { agentId: string; name: string; disabled: boolean; attach: (files: File[], agentId: string) => void }) {
  // A native picker also works when the mobile browser supplies no clipboard image.
  return <label className="button subtle small image-attach">Attach image
    <input type="file" accept={imageLimits.mimeTypes.join(',')} multiple disabled={disabled}
      aria-label={`Attach images to ${name}`} ref={picker => {
        if (!picker) return;
        // File-input cancellation is a native event, not a React input event prop.
        const cancel = () => { delete picker.dataset.attachmentAgentId; picker.value = ''; };
        picker.addEventListener('cancel', cancel);
        return () => picker.removeEventListener('cancel', cancel);
      }} onClick={event => {
        // Keep the destination on the input while its native picker is open, even if React switches chats.
        if (!disabled) event.currentTarget.dataset.attachmentAgentId = agentId;
      }} onChange={event => {
        const picker = event.currentTarget;
        const target = picker.dataset.attachmentAgentId || agentId;
        const files = Array.from(picker.files || []);
        delete picker.dataset.attachmentAgentId;
        picker.value = ''; // The same file can be selected again after removal or a read failure.
        if (!disabled && files.length) attach(files, target);
      }} />
  </label>;
}

export function ImageDraftPreviews({ images, error, disabled, remove }: { images: DraftImage[]; error?: string; disabled: boolean; remove: (id: string) => void }) {
  if (!images.length && !error) return null;
  return <section className="image-drafts" aria-label="Image attachments">
    {!!images.length && <><div className="image-draft-list">{images.map(image => <div className="image-draft" key={image.id}>
      {image.dataUrl ? <img src={image.dataUrl} alt={image.label} /> : <span className="image-reading" role="status">Reading image…</span>}
      <span className="image-draft-name" title={image.label}>{image.label}</span>
      <button type="button" className="image-remove" aria-label={`Remove ${image.label}`} title="Remove image" disabled={disabled} onClick={() => remove(image.id)}>×</button>
    </div>)}</div><p className="image-draft-note">Unsent images disappear on refresh.</p></>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </section>;
}

export function MessageImages({ images, agentId, messageId }: { images: MessageImage[]; agentId: string; messageId: string }) {
  if (!images.length) return null;
  return <div className="message-images">{images.map((image, index) => {
    const label = image.label || `Image ${index + 1}`;
    const safe = image.url === `/api/agents/${encodeURIComponent(agentId)}/messages/${encodeURIComponent(messageId)}/images/${index}` && imageLimits.mimeTypes.includes(image.mimeType);
    return safe ? <a key={index} href={image.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label}`}><img src={image.url} alt={label} loading="lazy" /><span>Open {label}</span></a>
      : <span key={index} className="field-note">{label} unavailable.</span>;
  })}</div>;
}
