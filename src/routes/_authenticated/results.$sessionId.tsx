import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getQuizSession,
  createQuizSession,
  reportIssue,
  type QuizQuestion,
} from "@/lib/learning.functions";
import { Button } from "@/components/ui/button";
import { Latex } from "@/components/Latex";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Home,
  Repeat,
  Share2,
  Flag,
  AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/results/$sessionId")({
  head: () => ({
    meta: [
      { title: "Results — Last Topper" },
      { name: "description", content: "Your quiz results and review." },
      { property: "og:title", content: "Results — Last Topper" },
      { property: "og:description", content: "Review your answers and explanations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["quiz-session", params.sessionId],
      queryFn: () => getQuizSession({ data: { id: params.sessionId } }),
    }),
  component: ResultsPage,
});

function ResultsPage() {
  const { sessionId } = Route.useParams();
  const nav = useNavigate();
  const { data: session } = useSuspenseQuery({
    queryKey: ["quiz-session", sessionId],
    queryFn: () => getQuizSession({ data: { id: sessionId } }),
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);
  const [reportFor, setReportFor] = useState<QuizQuestion | null>(null);
  const [reportReason, setReportReason] = useState("Incorrect answer");
  const [reportMsg, setReportMsg] = useState("");
  const [reporting, setReporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const scorecardRef = useRef<HTMLDivElement>(null);

  const questions = useMemo(
    () => (session?.questions as QuizQuestion[] | undefined) ?? [],
    [session],
  );
  const answers = (session?.answers as Record<string, "A" | "B" | "C" | "D"> | undefined) ?? {};

  if (!session) return <div className="p-6 text-sm">Not found.</div>;

  const total = questions.length;
  const correct = session.correct_count ?? 0;
  const incorrect = session.incorrect_count ?? total - correct;
  const accuracy = Number(session.accuracy ?? 0);
  const timeTaken = session.time_taken_seconds ?? 0;
  const wasAuto = !!session.was_auto_submitted;

  function toggle(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function practiceIncorrect() {
    const wrong = questions.filter((q) => answers[q.id] !== q.correct);
    if (wrong.length === 0) {
      toast.success("No incorrect answers!");
      return;
    }
    setStarting(true);
    try {
      const chapterIds = Array.from(new Set(wrong.map((q) => q.chapter_id))).filter(Boolean);
      const s = await createQuizSession({
        data: {
          chapter_ids: chapterIds,
          question_count: wrong.length,
          questions: wrong.map((q, i) => ({ ...q, id: `${q.id}_r${i}` })),
          timer_enabled: false,
          duration_seconds: null,
        },
      });
      nav({ to: "/quiz/$sessionId", params: { sessionId: s.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setStarting(false);
    }
  }

  async function shareScorecard() {
    setSharing(true);
    try {
      const W = 1080;
      const H = 1080;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");

      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, "#0f172a");
      grad.addColorStop(1, "#1e3a8a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Card
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 2;
      const cardX = 80, cardY = 200, cardW = W - 160, cardH = H - 400;
      const r = 40;
      ctx.beginPath();
      ctx.moveTo(cardX + r, cardY);
      ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + cardH, r);
      ctx.arcTo(cardX + cardW, cardY + cardH, cardX, cardY + cardH, r);
      ctx.arcTo(cardX, cardY + cardH, cardX, cardY, r);
      ctx.arcTo(cardX, cardY, cardX + cardW, cardY, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "600 42px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText("LAST TOPPER", W / 2, 120);
      ctx.font = "500 28px system-ui, sans-serif";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("Scorecard", W / 2, 168);

      ctx.fillStyle = "#38bdf8";
      ctx.font = "800 180px system-ui, sans-serif";
      ctx.fillText(`${accuracy.toFixed(1)}%`, W / 2, 460);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "500 32px system-ui, sans-serif";
      ctx.fillText("Accuracy", W / 2, 510);

      const stats: Array<[string, string, string]> = [
        ["Total", String(total), "#e2e8f0"],
        ["Correct", String(correct), "#22c55e"],
        ["Wrong", String(incorrect), "#ef4444"],
        ["Time", formatTime(timeTaken), "#e2e8f0"],
      ];
      const sy = 640;
      const colW = cardW / 4;
      stats.forEach(([label, value, color], i) => {
        const cx = cardX + colW * i + colW / 2;
        ctx.fillStyle = "#94a3b8";
        ctx.font = "500 24px system-ui, sans-serif";
        ctx.fillText(label, cx, sy);
        ctx.fillStyle = color;
        ctx.font = "700 56px system-ui, sans-serif";
        ctx.fillText(value, cx, sy + 70);
      });

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "500 28px system-ui, sans-serif";
      ctx.fillText("Learn · Compete · Earn", W / 2, H - 120);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "400 22px system-ui, sans-serif";
      ctx.fillText("lasttopper.app", W / 2, H - 80);

      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not create image");
      const file = new File([blob], `scorecard-${sessionId}.png`, { type: "image/png" });
      const nav2 = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav2.canShare && nav2.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "My Last Topper scorecard",
          text: `I scored ${accuracy.toFixed(1)}% (${correct}/${total}) on Last Topper!`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `scorecard-${sessionId}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Scorecard downloaded");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to share";
      if (!/aborted/i.test(msg)) toast.error(msg);
    } finally {
      setSharing(false);
    }
  }

  async function submitReport() {
    if (!reportFor) return;
    setReporting(true);
    try {
      await reportIssue({
        data: {
          session_id: sessionId,
          question_id: reportFor.id,
          question_text: reportFor.question,
          reason: reportReason,
          message: reportMsg.trim() || undefined,
        },
      });
      toast.success("Report sent. Thank you!");
      setReportFor(null);
      setReportMsg("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to report");
    } finally {
      setReporting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <div>
            <div className="text-xs text-muted-foreground">Quiz complete</div>
            <div className="text-base font-semibold">Your results</div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => nav({ to: "/home" })} aria-label="Home">
            <Home className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 pt-6">
        {wasAuto && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              This session was <strong>auto-submitted</strong> because the app was inactive too long.
              Your progress up to that point was saved.
            </div>
          </div>
        )}
        <div
          ref={scorecardRef}
          className="rounded-2xl border bg-card p-5 shadow-sm"
        >
          <div className="text-sm text-muted-foreground">Last Topper · Accuracy</div>
          <div className="mt-1 text-4xl font-bold">{accuracy.toFixed(1)}%</div>
          <div className="mt-4 grid grid-cols-4 gap-3 text-center">
            <Stat label="Total" value={total} />
            <Stat label="Correct" value={correct} tone="pos" />
            <Stat label="Wrong" value={incorrect} tone="neg" />
            <Stat label="Time" value={formatTime(timeTaken)} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="flex-1 min-w-[140px]" onClick={practiceIncorrect} disabled={starting || incorrect === 0}>
            <Repeat className="mr-2 h-4 w-4" /> Practice incorrect
          </Button>
          <Button variant="outline" className="flex-1 min-w-[140px]" onClick={shareScorecard} disabled={sharing}>
            <Share2 className="mr-2 h-4 w-4" /> {sharing ? "Preparing…" : "Share scorecard"}
          </Button>
          <Button variant="outline" className="flex-1 min-w-[120px]" onClick={() => nav({ to: "/learning" })}>
            New quiz
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-6">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Review</h2>
        <ul className="space-y-2">
          {questions.map((q, i) => {
            const chosen = answers[q.id];
            const ok = chosen === q.correct;
            const isOpen = expanded.has(q.id);
            return (
              <li key={q.id} className="rounded-xl border bg-card">
                <button
                  type="button"
                  onClick={() => toggle(q.id)}
                  className="flex w-full items-start gap-3 p-4 text-left"
                >
                  {ok ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                  )}
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground">Q{i + 1}</div>
                    <Latex className="mt-0.5 block text-sm">{q.question}</Latex>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Your answer: <span className="font-medium">{chosen ?? "—"}</span> · Correct:{" "}
                      <span className="font-medium">{q.correct}</span>
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {isOpen && (
                  <div className="border-t p-4">
                    <div className="space-y-1.5 text-sm">
                      {(["A", "B", "C", "D"] as const).map((k) => (
                        <div
                          key={k}
                          className={`flex gap-2 rounded-md p-2 ${
                            k === q.correct
                              ? "bg-emerald-50 text-emerald-900"
                              : k === chosen
                              ? "bg-red-50 text-red-900"
                              : ""
                          }`}
                        >
                          <span className="font-semibold">{k}.</span>
                          <Latex className="block flex-1">{q.options[k]}</Latex>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
                      <div className="mb-1 text-xs font-semibold text-muted-foreground">Step-by-step explanation</div>
                      <Latex className="block">{q.explanation}</Latex>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-muted-foreground"
                        onClick={() => {
                          setReportFor(q);
                          setReportReason("Incorrect answer");
                          setReportMsg("");
                        }}
                      >
                        <Flag className="mr-1 h-3.5 w-3.5" /> Report issue
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <Dialog open={!!reportFor} onOpenChange={(open) => !open && setReportFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this question</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Reason</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {["Incorrect answer", "Unclear wording", "Typo/formatting", "Other"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReportReason(r)}
                    className={`rounded-md border p-2 text-xs ${
                      reportReason === r ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs" htmlFor="report-msg">Details (optional)</Label>
              <Textarea
                id="report-msg"
                value={reportMsg}
                onChange={(e) => setReportMsg(e.target.value)}
                rows={3}
                placeholder="Tell us more…"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReportFor(null)}>Cancel</Button>
            <Button onClick={submitReport} disabled={reporting}>
              {reporting ? "Sending…" : "Send report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-red-600" : "text-foreground";
  return (
    <div className="rounded-lg bg-muted p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-base font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}
