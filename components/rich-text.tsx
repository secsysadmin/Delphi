import type { ReactNode } from "react";

const INLINE = /\*\*(.+?)\*\*|(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])|(https?:\/\/[^\s)]+)/g;

function inline(text: string, key: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const id = `${key}-${index++}`;
    if (match[1]) parts.push(<strong key={id}>{inline(match[1], id)}</strong>);
    else if (match[2]) parts.push(<em key={id}>{inline(match[2], id)}</em>);
    else parts.push(<a key={id} href={match[3]} target="_blank" rel="noreferrer">{match[3]}</a>);
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

// Lightweight formatting for organizer-written text: **bold**, *italics*, "- " bullets, "1. " lists and links.
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks: Block[] = [];
  for (const line of text.split(/\r?\n/)) {
    const bullet = line.match(BULLET);
    const numbered = bullet ? null : line.match(NUMBERED);
    const current = blocks[blocks.length - 1];
    if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      const item = (bullet ?? numbered)![1];
      if (current?.kind === kind) current.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] });
    } else if (current?.kind === "p") {
      current.lines.push(line);
    } else {
      blocks.push({ kind: "p", lines: [line] });
    }
  }
  return (
    <div className={className ? `rich-text ${className}` : "rich-text"}>
      {blocks.map((block, b) => {
        if (block.kind === "p") {
          if (!block.lines.length) return null;
          return <p key={b}>{block.lines.flatMap((line, l) => (l ? [<br key={`br-${l}`} />, ...inline(line, `${b}-${l}`)] : inline(line, `${b}-${l}`)))}</p>;
        }
        const List = block.kind;
        return <List key={b}>{block.items.map((item, i) => <li key={i}>{inline(item, `${b}-${i}`)}</li>)}</List>;
      })}
    </div>
  );
}
