import { useEffect, useRef } from "react";
import { EditorState, Annotation, RangeSetBuilder } from "@codemirror/state";
import {
  EditorView,
  ViewPlugin,
  WidgetType,
  Decoration,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { defaultKeymap, historyKeymap, history } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";

// ─── Annotation to mark external (non-user) dispatches ───────────────────────
const External = Annotation.define<boolean>();

// ─── Widgets ─────────────────────────────────────────────────────────────────

class HeadingWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly level: 1 | 2 | 3,
  ) { super(); }

  eq(o: HeadingWidget) { return o.text === this.text && o.level === this.level; }

  toDOM() {
    const tag = ["h1", "h2", "h3"][this.level - 1];
    const el = document.createElement(tag);
    el.textContent = this.text;
    el.className = `cm-md-heading cm-md-h${this.level}`;
    el.style.cursor = "text";
    return el;
  }

  ignoreEvent() { return false; }
}

class BulletWidget extends WidgetType {
  constructor(readonly text: string) { super(); }

  eq(o: BulletWidget) { return o.text === this.text; }

  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "cm-md-bullet";
    const dash = document.createElement("span");
    dash.className = "cm-md-bullet-icon";
    dash.textContent = "–";
    const text = document.createElement("span");
    text.textContent = this.text;
    wrap.appendChild(dash);
    wrap.appendChild(text);
    return wrap;
  }

  ignoreEvent() { return false; }
}

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly label: string,
    readonly lineFrom: number,
    readonly lineTo: number,
    readonly rawLine: string,
  ) { super(); }

  eq(o: CheckboxWidget) {
    return o.checked === this.checked && o.label === this.label && o.lineFrom === this.lineFrom;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement("span");
    wrap.className = "cm-md-checkbox";

    const box = document.createElement("span");
    box.className = `cm-md-checkbox-box${this.checked ? " checked" : ""}`;
    if (this.checked) {
      const check = document.createElement("span");
      check.textContent = "✓";
      box.appendChild(check);
    }

    box.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const newLine = this.checked
        ? this.rawLine.replace(/^(\s*)-\s*\[x\]/i, "$1- [ ]")
        : this.rawLine.replace(/^(\s*)-\s*\[ \]/, "$1- [x]");
      view.dispatch({
        changes: { from: this.lineFrom, to: this.lineTo, insert: newLine },
      });
    });

    const labelEl = document.createElement("span");
    labelEl.className = `cm-md-checkbox-label${this.checked ? " checked" : ""}`;
    labelEl.textContent = this.label;

    wrap.appendChild(box);
    wrap.appendChild(labelEl);
    return wrap;
  }

  ignoreEvent() { return false; }
}

// ─── Live-preview ViewPlugin ──────────────────────────────────────────────────

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number;

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      pos = line.to + 1;

      if (line.number === cursorLine) continue;

      const t = line.text;

      // Headings
      const hm = t.match(/^(#{1,3}) (.+)/);
      if (hm && hm[1].length <= 3) {
        builder.add(
          line.from,
          line.to,
          Decoration.replace({
            widget: new HeadingWidget(hm[2], hm[1].length as 1 | 2 | 3),
          }),
        );
        continue;
      }

      // Checkboxes
      const checked = /^\s*-\s*\[x\]\s*(.*)/i.exec(t);
      const unchecked = /^\s*-\s*\[ \]\s*(.*)/.exec(t);
      if (checked || unchecked) {
        const isChecked = !!checked;
        const label = (isChecked ? checked![1] : unchecked![1]) ?? "";
        builder.add(
          line.from,
          line.to,
          Decoration.replace({
            widget: new CheckboxWidget(isChecked, label, line.from, line.to, t),
          }),
        );
        continue;
      }

      // Bullets (not checkboxes)
      const bm = /^\s*- (?!\[[ x]\])(.+)/.exec(t);
      if (bm) {
        builder.add(
          line.from,
          line.to,
          Decoration.replace({
            widget: new BulletWidget(bm[1]),
          }),
        );
        continue;
      }
    }
  }

  return builder.finish();
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    lastCursorLine = -1;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
      this.lastCursorLine = view.state.doc.lineAt(view.state.selection.main.head).number;
    }

    update(upd: ViewUpdate) {
      if (upd.docChanged || upd.viewportChanged) {
        this.decorations = buildDecorations(upd.view);
        this.lastCursorLine = upd.state.doc.lineAt(upd.state.selection.main.head).number;
      } else if (upd.selectionSet) {
        const newLine = upd.state.doc.lineAt(upd.state.selection.main.head).number;
        if (newLine !== this.lastCursorLine) {
          this.lastCursorLine = newLine;
          this.decorations = buildDecorations(upd.view);
        }
      }
    }
  },
  { decorations: (v) => v.decorations },
);

// ─── Theme ────────────────────────────────────────────────────────────────────

const appTheme = EditorView.theme({
  "&": {
    color: "var(--foreground)",
    backgroundColor: "transparent",
    fontFamily: "var(--font-display, sans-serif)",
    fontSize: "0.875rem",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-content": {
    padding: "0",
    caretColor: "var(--primary, #5b7d56)",
    minHeight: "100%",
  },
  ".cm-line": {
    padding: "0",
    lineHeight: "1.4",
  },
  ".cm-line:has(> br:only-child)": {
    lineHeight: "0.5",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--primary, #5b7d56)",
    borderLeftWidth: "2px",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in oklab, var(--primary) 25%, transparent) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--primary) 25%, transparent) !important",
  },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-scroller": { overflow: "visible", outline: "none" },

  // ── heading widgets ──
  ".cm-md-heading": {
    display: "block",
    lineHeight: "1.4",
    cursor: "text",
  },
  ".cm-md-h1": {
    fontSize: "clamp(0.8rem, 3.5vw, 1.15rem)",
    fontWeight: "bold",
    color: "var(--primary)",
    fontFamily: "var(--font-pixel, monospace)",
  },
  ".cm-md-h2": {
    fontSize: "clamp(0.7rem, 3vw, 1rem)",
    fontWeight: "bold",
    fontFamily: "var(--font-pixel, monospace)",
  },
  ".cm-md-h3": {
    fontSize: "clamp(0.6rem, 2.5vw, 0.85rem)",
    fontWeight: "bold",
    fontFamily: "var(--font-pixel, monospace)",
  },

  // ── bullet widgets ──
  ".cm-md-bullet": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "text",
  },
  ".cm-md-bullet-icon": {
    color: "var(--primary)",
    fontWeight: "bold",
    flexShrink: "0",
    fontSize: "0.9em",
  },

  // ── checkbox widgets ──
  ".cm-md-checkbox": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "text",
  },
  ".cm-md-checkbox-box": {
    display: "inline-flex",
    width: "16px",
    height: "16px",
    border: "2px solid var(--border)",
    background: "var(--input)",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: "0",
    fontSize: "0.5rem",
    color: "var(--primary)",
    lineHeight: "1",
  },
  ".cm-md-checkbox-box.checked": {
    borderColor: "var(--primary)",
    background: "color-mix(in oklab, var(--primary) 20%, transparent)",
  },
  ".cm-md-checkbox-label": { fontSize: "0.875rem" },
  ".cm-md-checkbox-label.checked": {
    textDecoration: "line-through",
    color: "var(--muted-foreground)",
  },

});


// ─── Component ────────────────────────────────────────────────────────────────

const LEGACY_SOFT_BREAK = new RegExp(String.fromCodePoint(0x2028), "g");

export function MarkdownEditor({
  content,
  onChange,
}: {
  content: string;
  onChange: (val: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Create the editor once
  useEffect(() => {
    if (!containerRef.current) return;

    const initial = (content ?? "").replace(LEGACY_SOFT_BREAK, "\n");

    const state = EditorState.create({
      doc: initial,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage }),
        livePreviewPlugin,
        appTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((upd) => {
          if (upd.docChanged && !upd.transactions.some((t) => t.annotation(External))) {
            onChangeRef.current(upd.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync when content changes from outside (note switch, etc.)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const normalized = (content ?? "").replace(LEGACY_SOFT_BREAK, "\n");
    const current = view.state.doc.toString();
    if (current === normalized) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: normalized },
      selection: { anchor: 0 },
      annotations: External.of(true),
      scrollIntoView: true,
    });
  }, [content]);

  return (
    <div
      className="w-full min-h-full cursor-text"
      onClick={(e) => {
        const view = viewRef.current;
        if (!view || view.dom.contains(e.target as Node)) return;
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        view.focus();
      }}
    >
      <div
        ref={containerRef}
        className="[&_.cm-editor]:w-full [&_.cm-editor]:outline-none"
      />
    </div>
  );
}
