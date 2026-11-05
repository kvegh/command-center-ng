import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function Markdown({ value }: { value: string }) {
  return <div className="markdown prose"><ReactMarkdown skipHtml remarkPlugins={[remarkGfm]}
    components={{
      table: ({ node, ...props }) => <div className="markdown-table" role="region" aria-label="Table" tabIndex={0}><table {...props} /></div>,
      a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
      img: ({ src, alt }) => src?.startsWith('/') && !src.startsWith('//') || src?.startsWith('data:image/')
        ? <img src={src} alt={alt || ''} loading="lazy" />
        : <a href={src} target="_blank" rel="noopener noreferrer">{alt || 'Image'}</a>
    }}>{value}</ReactMarkdown></div>;
}
