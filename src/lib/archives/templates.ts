export interface NoteTemplate {
  id: string;
  label: string;
  description: string;
  build: () => { title: string; content: string };
}

function today() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "blank",
    label: "Blank note",
    description: "An empty page.",
    build: () => ({ title: "Untitled", content: "" }),
  },
  {
    id: "lecture",
    label: "Lecture notes",
    description: "Topic, key points, questions, summary.",
    build: () => ({
      title: `Lecture — ${new Date().toLocaleDateString()}`,
      content: [
        "# Topic",
        "",
        "## Key points",
        "- ",
        "",
        "## Definitions",
        "Term :: Definition",
        "",
        "## Questions to follow up",
        "- [ ] ",
        "",
        "## Summary",
        "",
      ].join("\n"),
    }),
  },
  {
    id: "journal",
    label: "Daily journal",
    description: "Intentions, wins and reflection for today.",
    build: () => ({
      title: today(),
      content: [
        "## Today I will",
        "- [ ] ",
        "- [ ] ",
        "- [ ] ",
        "",
        "## Wins",
        "- ",
        "",
        "## What I learned",
        "- ",
        "",
        "## Tomorrow",
        "- ",
        "",
      ].join("\n"),
    }),
  },
  {
    id: "reading",
    label: "Reading notes",
    description: "Source, main ideas, quotes, takeaways.",
    build: () => ({
      title: "Reading — ",
      content: [
        "## Source",
        "- Title: ",
        "- Author: ",
        "",
        "## Main ideas",
        "- ",
        "",
        "## Quotes",
        "- ",
        "",
        "## My takeaways",
        "- ",
        "",
      ].join("\n"),
    }),
  },
  {
    id: "study-plan",
    label: "Study plan",
    description: "Goal, deadline and a checklist of topics.",
    build: () => ({
      title: "Study plan — ",
      content: [
        "## Goal",
        "",
        "## Deadline",
        "",
        "## Topics",
        "- [ ] ",
        "- [ ] ",
        "- [ ] ",
        "",
        "## Resources",
        "- ",
        "",
      ].join("\n"),
    }),
  },
  {
    id: "flashcards",
    label: "Flashcard deck",
    description: "Question :: Answer lines you can review for XP.",
    build: () => ({
      title: "Flashcards — ",
      content: [
        "Write one card per line as  Question :: Answer",
        "",
        "What is the powerhouse of the cell? :: The mitochondria",
        "Capital of Japan :: Tokyo",
        "",
      ].join("\n"),
    }),
  },
];
