import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Upload, Database, FileJson } from "lucide-react";
import { adminBankStats, adminBulkUploadQuestions } from "@/lib/admin.functions";
import { failMessage } from "@/lib/friendly-error";

export const Route = createFileRoute("/_authenticated/admin/bank")({
  head: () => ({
    meta: [
      { title: "Question Bank — Admin" },
      { name: "description", content: "Upload bulk NCERT questions." },
      { property: "og:title", content: "Question Bank" },
      { property: "og:description", content: "Bulk question upload." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BankAdmin,
});

const SAMPLE = `[
  {
    "question": "Which of the following is a vector quantity?",
    "options": { "A": "Speed", "B": "Distance", "C": "Displacement", "D": "Mass" },
    "correct": "C",
    "hint": "Vectors have magnitude and direction.",
    "explanation": "Displacement is a vector; the others are scalars.",
    "profession": "pcm",
    "subject_code": "physics"
  }
]`;

function BankAdmin() {
  const qc = useQueryClient();
  const stats = useQuery({ queryKey: ["bank-stats"], queryFn: () => adminBankStats() });
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);

  const upload = useMutation({
    mutationFn: async (text: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("Invalid JSON — check syntax.");
      }
      if (!Array.isArray(parsed)) throw new Error("Root must be an array of question objects.");
      return adminBulkUploadQuestions({ data: { rows: parsed as never } });
    },
    onSuccess: (r) => {
      toast.success(`Uploaded ${r.inserted} questions`);
      setJson("");
      qc.invalidateQueries({ queryKey: ["bank-stats"] });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      setJson(text);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <section className="grid grid-cols-3 gap-3">
        <StatCard icon={<Database className="h-4 w-4" />} label="Total in bank" value={stats.data?.total ?? 0} />
        <StatCard icon={<FileJson className="h-4 w-4" />} label="AI-saved" value={stats.data?.ai ?? 0} />
        <StatCard icon={<Upload className="h-4 w-4" />} label="Admin-uploaded" value={stats.data?.admin ?? 0} />
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-base font-semibold">Bulk upload questions (JSON)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Root must be an array. Each item needs <code>question</code>, <code>options</code> (A/B/C/D),
          and <code>correct</code>. Optional: <code>hint</code>, <code>explanation</code>,
          <code>profession</code> (pcm/pcb), <code>chapter_id</code>, <code>subject_code</code>.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted">
            <Upload className="h-4 w-4" />
            <span>{busy ? "Reading…" : "Choose JSON file"}</span>
            <input type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
          </label>
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
            onClick={() => setJson(SAMPLE)}
          >
            Insert sample
          </button>
        </div>

        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder={SAMPLE}
          className="mt-3 h-64 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs"
          spellCheck={false}
        />

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            disabled={!json.trim() || upload.isPending}
            onClick={() => upload.mutate(json)}
          >
            {upload.isPending ? "Uploading…" : "Upload to bank"}
          </button>
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-2xl font-bold">{value.toLocaleString()}</div>
    </div>
  );
}
