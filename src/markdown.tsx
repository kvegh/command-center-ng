import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CopyButton } from './copy-button';

function codeText(children: React.ReactNode): string {
  return React.Children.toArray(children).map(child => React.isValidElement<{ children?: React.ReactNode }>(child)
    ? codeText(child.props.children)
    : typeof child === 'string' || typeof child === 'number' ? String(child) : '').join('');
}

function goalAnnouncement(value: string): string[] | null {
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length !== 3) return null;
  const objective = lines[0].match(/^\*\*New Goal:\*\* (.+)$/)?.[1];
  const title = lines[1].match(/^\*\*Task title:\*\* (.+)$/)?.[1];
  const id = lines[2].match(/^\*\*Beads ID:\*\* ([A-Za-z0-9][A-Za-z0-9._-]*)$/)?.[1];
  return objective?.trim() && title?.trim() && id ? [objective, title, id] : null;
}

export function Markdown({ value, goalAnnouncements = false }: { value: string; goalAnnouncements?: boolean }) {
  // Only opted-in worker replies can use this exact format; user pastes and code stay Markdown.
  const announcement = goalAnnouncements ? goalAnnouncement(value) : null;
  if (announcement) return <div className="markdown prose"><div className="goal-announcement">
    {announcement.map((text, index) => <div className="goal-announcement-row" key={index}>
      <span className="goal-announcement-label">{['New Goal:', 'Task title:', 'Beads ID:'][index]}</span>{' '}
      <span className="goal-announcement-value">{text}</span>
    </div>)}
  </div></div>;
  return <div className="markdown prose"><ReactMarkdown skipHtml remarkPlugins={[remarkGfm]}
    components={{
      pre: ({ node, children, ...props }) => <div className="markdown-code-block">
        <div className="markdown-code-actions"><CopyButton text={codeText(children)} label="Copy code" compact /></div>
        <pre {...props}>{children}</pre>
      </div>,
      table: ({ node, ...props }) => <div className="markdown-table" role="region" aria-label="Table" tabIndex={0}><table {...props} /></div>,
      a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
      img: ({ src, alt }) => src?.startsWith('/') && !src.startsWith('//') || src?.startsWith('data:image/')
        ? <img src={src} alt={alt || ''} loading="lazy" />
        : <a href={src} target="_blank" rel="noopener noreferrer">{alt || 'Image'}</a>
    }}>{value}</ReactMarkdown></div>;
}
