import { Fragment, type ReactNode } from 'react';
import { plainDashes } from './text';

/**
 * A small, safe markdown renderer for Troy's replies and articles. It
 * handles paragraphs, line breaks, **bold**, *italic*, bullet and numbered
 * lists, [links](https://...) and bare https links. It never injects HTML.
 */

const INLINE = /(\*\*[^*]+?\*\*|\*[^*\s][^*]*?\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) out.push(plainDashes(text.slice(last, start)));
    const key = `${keyBase}-${i++}`;
    if (token.startsWith('**')) {
      out.push(<strong key={key}>{plainDashes(token.slice(2, -2))}</strong>);
    } else if (token.startsWith('*')) {
      out.push(<em key={key}>{plainDashes(token.slice(1, -1))}</em>);
    } else if (token.startsWith('[')) {
      const m = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      if (m) {
        out.push(
          <a key={key} href={m[2]} target="_blank" rel="noopener noreferrer">
            {plainDashes(m[1])}
          </a>,
        );
      } else {
        out.push(token);
      }
    } else {
      out.push(
        <a key={key} href={token} target="_blank" rel="noopener noreferrer">
          {token.replace(/^https?:\/\//, '').slice(0, 48)}
        </a>,
      );
    }
    last = start + token.length;
  }
  if (last < text.length) out.push(plainDashes(text.slice(last)));
  return out;
}

function renderLines(lines: string[], keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) out.push(<br key={`${keyBase}-br-${idx}`} />);
    out.push(<Fragment key={`${keyBase}-l-${idx}`}>{renderInline(line, `${keyBase}-${idx}`)}</Fragment>);
  });
  return out;
}

const BULLET = /^\s*(?:[-*•])\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = (text || '').replace(/\r\n/g, '\n').split(/\n\s*\n/);
  return (
    <div className={className ?? 'prose-troy'}>
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter((l) => l.trim().length > 0);
        if (lines.length === 0) return null;
        const key = `b${bi}`;
        if (lines.every((l) => BULLET.test(l))) {
          return (
            <ul key={key}>
              {lines.map((l, li) => (
                <li key={`${key}-${li}`}>{renderInline(l.replace(BULLET, ''), `${key}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => NUMBERED.test(l))) {
          return (
            <ol key={key}>
              {lines.map((l, li) => (
                <li key={`${key}-${li}`}>{renderInline(l.replace(NUMBERED, ''), `${key}-${li}`)}</li>
              ))}
            </ol>
          );
        }
        const heading = /^#{1,6}\s+(.*)$/.exec(lines[0]);
        if (heading && lines.length === 1) {
          return (
            <p key={key}>
              <strong>{plainDashes(heading[1])}</strong>
            </p>
          );
        }
        return <p key={key}>{renderLines(lines, key)}</p>;
      })}
    </div>
  );
}
