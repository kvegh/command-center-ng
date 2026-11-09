import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CopyButton } from './copy-button';

function codeText(children: React.ReactNode): string {
  return React.Children.toArray(children).map(child => React.isValidElement<{ children?: React.ReactNode }>(child)
    ? codeText(child.props.children)
    : typeof child === 'string' || typeof child === 'number' ? String(child) : '').join('');
}

export function Markdown({ value }: { value: string }) {
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
