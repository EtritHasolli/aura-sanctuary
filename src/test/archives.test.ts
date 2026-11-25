import { describe, it, expect } from "vitest";
import {
  flashcardKey,
  isCardDue,
  parseFlashcards,
  previewInterval,
  type FlashcardState,
} from "@/lib/archives/flashcards";
import { descendantIds, notePath } from "@/components/archives/MoveNoteDialog";
import { trashBatches } from "@/components/archives/TrashView";
import type { Note } from "@/lib/aura/types";

function note(id: string, extra: Partial<Note> = {}): Note {
  return {
    id,
    user_id: "u1",
    title: id,
    content: "",
    source_task_id: null,
    parent_id: null,
    color: null,
    is_folder: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

describe("parseFlashcards", () => {
  it("reads Question :: Answer lines, with or without a bullet", () => {
    const cards = parseFlashcards("Capital of Japan :: Tokyo\n- 2 + 2 :: 4\nplain text");
    expect(cards.map((c) => [c.question, c.answer])).toEqual([
      ["Capital of Japan", "Tokyo"],
      ["2 + 2", "4"],
    ]);
  });

  it("ignores :: without surrounding spaces and anything inside code fences", () => {
    const content = ["std::vector is a container", "```", "a :: b", "```", "x ::y"].join("\n");
    expect(parseFlashcards(content)).toEqual([]);
  });

  it("drops duplicate questions so one card has one schedule", () => {
    expect(parseFlashcards("Q :: A\nq  :: B")).toHaveLength(1);
  });
});

describe("flashcardKey", () => {
  it("ignores case and spacing but separates different questions", () => {
    expect(flashcardKey("What is  DNA?")).toBe(flashcardKey("what is dna?"));
    expect(flashcardKey("What is DNA?")).not.toBe(flashcardKey("What is RNA?"));
  });

  it("fits the 64-char card_key column", () => {
    expect(flashcardKey("x".repeat(500)).length).toBeLessThanOrEqual(64);
  });
});

describe("previewInterval / isCardDue", () => {
  const state = (patch: Partial<FlashcardState>): FlashcardState => ({
    note_id: "n",
    card_key: "k",
    ease: 2.5,
    interval_days: 0,
    reps: 0,
    due_at: new Date().toISOString(),
    ...patch,
  });

  it("matches the server schedule for new and maturing cards", () => {
    expect(previewInterval(undefined, "again")).toBe("10m");
    expect(previewInterval(undefined, "good")).toBe("1d");
    expect(previewInterval(undefined, "easy")).toBe("3d");
    expect(previewInterval(state({ reps: 1, interval_days: 1 }), "good")).toBe("3d");
    expect(previewInterval(state({ reps: 2, interval_days: 3 }), "good")).toBe("8d");
  });

  it("treats new cards and past-due cards as due", () => {
    expect(isCardDue(undefined)).toBe(true);
    expect(isCardDue(state({ due_at: new Date(Date.now() - 1000).toISOString() }))).toBe(true);
    expect(isCardDue(state({ due_at: new Date(Date.now() + 86_400_000).toISOString() }))).toBe(false);
  });
});

describe("descendantIds / notePath", () => {
  const notes = [
    note("root", { is_folder: true }),
    note("child", { parent_id: "root" }),
    note("grandchild", { parent_id: "child" }),
    note("other"),
  ];

  it("collects a note and everything nested under it", () => {
    expect([...descendantIds("root", notes)].sort()).toEqual(["child", "grandchild", "root"]);
    expect([...descendantIds("other", notes)]).toEqual(["other"]);
  });

  it("builds the folder path of a note", () => {
    const byId = new Map(notes.map((n) => [n.id, n]));
    expect(notePath(byId.get("grandchild")!, byId)).toBe("root / child");
    expect(notePath(byId.get("root")!, byId)).toBe("");
  });
});

describe("trashBatches", () => {
  const t1 = "2026-11-20T10:00:00.000Z";
  const t2 = "2026-11-21T10:00:00.000Z";

  it("groups a folder trashed with its sub-pages into one batch", () => {
    const trashed = [
      note("folder", { is_folder: true, deleted_at: t1 }),
      note("page", { parent_id: "folder", deleted_at: t1 }),
    ];
    const batches = trashBatches(trashed, new Set());
    expect(batches).toHaveLength(1);
    expect(batches[0].top.id).toBe("folder");
    expect(batches[0].ids.sort()).toEqual(["folder", "page"]);
  });

  it("keeps separately trashed notes separate and detaches orphans on restore", () => {
    const trashed = [
      note("folder", { is_folder: true, deleted_at: t2 }),
      note("page", { parent_id: "folder", deleted_at: t1 }),
    ];
    const batches = trashBatches(trashed, new Set());
    expect(batches.map((b) => b.top.id).sort()).toEqual(["folder", "page"]);
    // "page" was trashed on its own earlier; its folder is still in the trash.
    expect(batches.find((b) => b.top.id === "page")?.detach).toBe(true);
  });

  it("restores into the original folder when it still exists", () => {
    const batches = trashBatches([note("page", { parent_id: "folder", deleted_at: t1 })], new Set(["folder"]));
    expect(batches[0].detach).toBe(false);
  });
});
