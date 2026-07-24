import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * Renders text containing $...$ (inline) and $$...$$ (display) LaTeX.
 * Non-math segments are rendered as plain text.
 */
export function Latex({ children, className }: { children: string; className?: string }) {
  const html = useMemo(() => renderMixed(children ?? ""), [children]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderMixed(input: string): string {
  const parts: string[] = [];
  const regex = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(input)) !== null) {
    if (m.index > lastIndex) {
      parts.push(escapeHtml(input.slice(lastIndex, m.index)));
    }
    const chunk = m[0];
    const isDisplay = chunk.startsWith("$$");
    const tex = isDisplay ? chunk.slice(2, -2) : chunk.slice(1, -1);
    try {
      parts.push(
        katex.renderToString(tex, { displayMode: isDisplay, throwOnError: false, output: "html" }),
      );
    } catch {
      parts.push(escapeHtml(chunk));
    }
    lastIndex = m.index + chunk.length;
  }
  if (lastIndex < input.length) parts.push(escapeHtml(input.slice(lastIndex)));
  return parts.join("");
}
