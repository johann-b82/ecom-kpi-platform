import type { DocBlock, DocPage } from '@/lib/help/content';

function Block({ block }: { block: DocBlock }) {
  switch (block.type) {
    case 'p':
      return <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{block.text}</p>;
    case 'list':
      return (
        <ul className="ml-5 list-disc space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
          {block.items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      );
    case 'steps':
      return (
        <ol className="ml-5 list-decimal space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
          {block.items.map((it, i) => <li key={i}>{it}</li>)}
        </ol>
      );
    case 'note':
      return (
        <div className="rounded-md border border-accent/30 bg-accent/[0.06] px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300">
          {block.text}
        </div>
      );
    case 'table':
      return (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                {block.head.map((h, i) => (
                  <th key={i} className="anno px-3 py-2 text-left text-neutral-500 dark:text-neutral-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 align-top text-neutral-700 dark:text-neutral-300">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function DocArticle({ page }: { page: DocPage }) {
  return (
    <article className="mx-auto max-w-3xl">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{page.title}</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{page.summary}</p>
      </header>
      <div className="space-y-10">
        {page.sections.map((s, si) => (
          <section key={si} className="space-y-3">
            <h2 className="anno text-neutral-500 dark:text-neutral-400">{s.heading}</h2>
            <div className="space-y-3">
              {s.blocks.map((b, bi) => <Block key={bi} block={b} />)}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
