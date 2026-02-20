import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './MarkdownText.module.css';

const REMARK_PLUGINS = [remarkGfm];

const inlineComponents = {
  p: ({ children }) => <>{children}</>,
  h1: ({ children }) => <>{children}</>,
  h2: ({ children }) => <>{children}</>,
  h3: ({ children }) => <>{children}</>,
  h4: ({ children }) => <>{children}</>,
  h5: ({ children }) => <>{children}</>,
  h6: ({ children }) => <>{children}</>,
  ul: ({ children }) => <>{children}</>,
  ol: ({ children }) => <>{children}</>,
  li: ({ children }) => <><span>{children}</span>{' '}</>,
  blockquote: ({ children }) => <>{children}</>,
  pre: ({ children }) => <>{children}</>,
  hr: () => <span>{' '}</span>,
};

export default memo(function MarkdownText({ value, inline = false, className = '' }) {
  if (!value) return null;

  return (
    <div className={`${styles.markdown} ${inline ? styles.inline : styles.block} ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        components={inline ? inlineComponents : undefined}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
});
