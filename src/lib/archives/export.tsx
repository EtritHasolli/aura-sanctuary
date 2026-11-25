import ReactMarkdown from "react-markdown";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

function safeFileName(title: string) {
  const cleaned = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "Untitled").slice(0, 120);
}

/** Downloads a Markdown file. `body` is the note text; the title becomes the H1. */
export function downloadMarkdown(title: string, body: string) {
  const text = `# ${title || "Untitled"}\n\n${body}`.replace(/\n{3,}/g, "\n\n");
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFileName(title)}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** react-markdown has no task-list support without remark-gfm; show boxes as glyphs. */
function prettifyChecklists(markdown: string) {
  return markdown
    .replace(/^(\s*[-*]\s+)\[ \]\s*/gm, "$1☐ ")
    .replace(/^(\s*[-*]\s+)\[[xX]\]\s*/gm, "$1☑ ");
}

function renderMarkdownToHtml(markdown: string) {
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(<ReactMarkdown>{prettifyChecklists(markdown)}</ReactMarkdown>));
  const html = container.innerHTML;
  root.unmount();
  return html;
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const PRINT_CSS = `
  @page { margin: 18mm; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; line-height: 1.55; font-size: 12pt; }
  h1.note-title { font-size: 22pt; margin: 0 0 4pt; }
  .meta { color: #666; font-size: 9pt; margin-bottom: 16pt; }
  h1 { font-size: 18pt; } h2 { font-size: 15pt; } h3 { font-size: 13pt; }
  h1, h2, h3 { margin: 16pt 0 6pt; break-after: avoid; }
  ul, ol { padding-left: 18pt; } li { margin: 2pt 0; }
  code { font-family: Consolas, monospace; background: #f2f2f2; padding: 0 3pt; }
  pre { background: #f6f6f6; padding: 8pt; white-space: pre-wrap; }
  blockquote { border-left: 3pt solid #ccc; margin: 0; padding-left: 10pt; color: #444; }
`;

/** Opens the system print dialog for the note; "Save as PDF" produces the PDF. */
export function printNoteAsPdf(title: string, body: string) {
  const html = renderMarkdownToHtml(body);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    throw new Error("Printing is not available here.");
  }
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title || "Untitled")}</title>
    <style>${PRINT_CSS}</style></head><body>
    <h1 class="note-title">${escapeHtml(title || "Untitled")}</h1>
    <div class="meta">Exported from Aura Sanctuary · ${escapeHtml(new Date().toLocaleDateString())}</div>
    ${html}</body></html>`);
  doc.close();
  const cleanup = () => setTimeout(() => iframe.remove(), 500);
  win.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(() => {
    win.focus();
    win.print();
    // Fallback in case afterprint never fires (some browsers).
    setTimeout(cleanup, 60_000);
  }, 100);
}
