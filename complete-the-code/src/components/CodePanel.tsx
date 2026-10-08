import { Fragment, useMemo, type ReactNode } from "react";

const TOKEN =
  /(\/\/.*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(this)\b|\b(import|export|from|class|constructor|const|let|var|for|if|else|return|new|break|private|type|interface|extends|void|number|boolean|true|false|null|as)\b|(\b\d+(?:\.\d+)?\b)/g;

function highlight(src: string) {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of src.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(<Fragment key={key++}>{src.slice(last, idx)}</Fragment>);
    let cls = "";
    if (m[1]) cls = "text-slate-500 italic";
    else if (m[2]) cls = "text-amber-300";
    else if (m[3]) cls = "text-pink-400 italic";
    else if (m[4]) cls = "text-pink-400";
    else if (m[5]) cls = "text-orange-300";
    out.push(
      <span key={key++} className={cls}>
        {m[0]}
      </span>
    );
    last = idx + m[0].length;
  }
  if (last < src.length) out.push(<Fragment key={key++}>{src.slice(last)}</Fragment>);
  return out;
}

export default function CodePanel({
  source,
  open,
  onClose,
}: {
  source: string;
  open: boolean;
  onClose: () => void;
}) {
  const lines = useMemo(() => source.split("\n").length, [source]);
  const gutter = useMemo(
    () => Array.from({ length: lines }, (_, i) => i + 1).join("\n"),
    [lines]
  );
  const code = useMemo(() => highlight(source), [source]);

  return (
    <aside
      className={`pointer-events-auto absolute inset-y-0 right-0 z-20 flex w-[min(620px,94vw)] flex-col border-l border-white/10 bg-[#0b0d12]/95 shadow-2xl backdrop-blur transition-transform duration-300 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
      aria-hidden={!open}
    >
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          <span className="ml-3 font-mono text-xs text-slate-400">LimSystem.ts</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md px-2 py-1 font-mono text-xs text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          fechar ✕
        </button>
      </header>

      <div className="flex min-h-0 flex-1 overflow-y-auto py-3 font-mono text-[12px] leading-5">
        <pre className="sticky left-0 shrink-0 select-none px-3 text-right text-slate-600">
          {gutter}
        </pre>
        <pre className="min-w-0 flex-1 overflow-x-auto pr-4 text-slate-200">
          <code>{code}</code>
        </pre>
      </div>
    </aside>
  );
}
