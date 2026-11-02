import type { ReactNode } from "react";

type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };
type RichTextProps = { text: string };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
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

function listItem(line: string): { kind: "ul" | "ol"; item: string } | null {
  const bullet = line.match(BULLET);
  if (bullet) return { kind: "ul", item: bullet[1] };
  const numbered = line.match(NUMBERED);
  return numbered ? { kind: "ol", item: numbered[1] } : null;
}

function parseBlocks(text: string) {
  const blocks: Block[] = [];
  for (const line of text.split(/\r?\n/)) {
    const list = listItem(line);
    const current = blocks[blocks.length - 1];
    if (list && current?.kind === list.kind) current.items.push(list.item);
    else if (list) blocks.push({ kind: list.kind, items: [list.item] });
    else if (!line.trim()) blocks.push({ kind: "p", lines: [] });
    else if (current?.kind === "p") current.lines.push(line);
    else blocks.push({ kind: "p", lines: [line] });
  }
  return blocks;
}

export function RichText({ text }: RichTextProps) {
  const blocks = parseBlocks(text);
  return (
    <div className="rich-text">
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
