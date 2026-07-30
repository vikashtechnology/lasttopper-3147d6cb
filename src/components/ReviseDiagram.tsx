import { useEffect, useRef, useState } from "react";

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid(dark: boolean) {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then((m) => {
      m.default.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: dark ? "dark" : "default",
        fontFamily: "Inter, system-ui, sans-serif",
      });
      return m.default;
    });
  }
  return mermaidReady;
}

/** Strips ```mermaid fences the model sometimes adds. */
function clean(code: string) {
  return code
    .replace(/^\s*```(?:mermaid)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

/**
 * Renders an AI-generated Mermaid diagram for a revision topic.
 * Falls back to the raw code block if the diagram can't be parsed.
 */
export function ReviseDiagram({ code, caption }: { code: string; caption?: string | null }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const idRef = useRef(`rd-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;
    const source = clean(code);
    if (!source) {
      setFailed(true);
      return;
    }
    const dark =
      typeof document !== "undefined" && document.documentElement.classList.contains("dark");

    void (async () => {
      try {
        const mermaid = await loadMermaid(dark);
        const { svg: out } = await mermaid.render(idRef.current, source);
        if (!cancelled) setSvg(out);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (failed) {
    return (
      <pre className="overflow-x-auto rounded-lg border bg-background p-3 text-[11px] leading-relaxed text-muted-foreground">
        {clean(code)}
      </pre>
    );
  }

  return (
    <figure className="space-y-2">
      <div className="overflow-x-auto rounded-lg border bg-background p-3">
        {svg ? (
          <div
            className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
            // Mermaid output is sanitized by its own strict security level.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="h-24 animate-pulse rounded bg-muted" />
        )}
      </div>
      {caption ? (
        <figcaption className="text-center text-[11px] text-muted-foreground">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
