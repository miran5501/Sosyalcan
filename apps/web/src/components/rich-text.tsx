import type { ReactNode } from "react";

/**
 * Basit biçimli metin: "## " başlık, "- " madde, boş satır paragraf arası. HTML çalıştırılmaz
 * (metin admin tarafından girilse de yalnızca düz metin olarak gösterilir).
 */
export function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push(<p key={blocks.length} className="mt-3 text-sm leading-relaxed text-neutral-700">{paragraph.join(" ")}</p>);
      paragraph = [];
    }
    if (list.length) {
      blocks.push(
        <ul key={blocks.length} className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-neutral-700">
          {list.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flush();
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push(<h2 key={blocks.length} className="mt-6 text-base font-semibold text-neutral-900 first:mt-0">{line.slice(3)}</h2>);
    } else if (line.startsWith("- ")) {
      if (paragraph.length) flush();
      list.push(line.slice(2));
    } else {
      if (list.length) flush();
      paragraph.push(line);
    }
  }
  flush();
  return <div>{blocks}</div>;
}
