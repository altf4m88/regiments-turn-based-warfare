import { Fragment, ReactNode } from 'react';

/**
 * Renders the light markdown AI generals write in their dispatches: paragraphs,
 * headings, numbered and bulleted lists (indented items nest), **bold**,
 * *italic* and `code`. It builds React elements directly, so model output is
 * never injected as HTML.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>);
    para = [];
  };

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    const item = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push(<p key={blocks.length} className="font-bold not-italic">{inline(heading[1])}</p>);
    } else if (item) {
      flush();
      const depth = Math.min(3, Math.floor(item[1].replace(/\t/g, '  ').length / 2));
      const marker = /\d/.test(item[2]) ? item[2].replace(')', '.') : '•';
      blocks.push(
        <div key={blocks.length} className="flex gap-1.5" style={{ paddingLeft: `${depth * 0.9}rem` }}>
          <span className="shrink-0 not-italic opacity-60">{marker}</span>
          <span>{inline(item[3])}</span>
        </div>,
      );
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return <div className={className}>{blocks}</div>;
}

/** **bold**, *italic* / _italic_ and `code` spans. */
function inline(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\b_[^_\s][^_]*_\b)/g);
  return parts.map((p, i) => {
    if (!p) return null;
    if (p.startsWith('`')) return <code key={i} className="not-italic font-mono text-[0.92em] px-1 bg-black/5 rounded-sm">{p.slice(1, -1)}</code>;
    if (p.startsWith('**')) return <strong key={i} className="font-bold">{p.slice(2, -2)}</strong>;
    if (p.length > 2 && (p.startsWith('*') || p.startsWith('_'))) return <em key={i}>{p.slice(1, -1)}</em>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

/** The dispatch as one line of plain text, for short previews. */
export const plainText = (text: string) =>
  text
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*([-*•]|\d+[.)])\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
