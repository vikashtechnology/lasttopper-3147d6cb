export type ReviseReference = { title: string; url: string; source: string };

export type ReviseTopic = {
  id: string;
  chapter_id: string;
  title: string;
  slug: string;
  summary: string | null;
  key_points: string[];
  formulas: string[];
  refs: ReviseReference[];
  /** Mermaid source for a concept diagram (null when none). */
  diagram: string | null;
  diagram_caption: string | null;
  display_order: number;
  generated_at: string | null;
};
