import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { getProStudyPlan } from "@/lib/pro.functions";
import { ProLock, ProChip } from "@/components/ProLock";
import { toast } from "sonner";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getAnalytics, startProgressiveQuiz } from "@/lib/learning.functions";
import { getMyProfile } from "@/lib/user.functions";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Flame, Target, ListChecks, Sparkles } from "lucide-react";
import { failMessage } from "@/lib/friendly-error";

const analyticsQuery = {
  queryKey: ["analytics"] as const,
  queryFn: () => getAnalytics(),
};

const profileQuery = {
  queryKey: ["my-profile"] as const,
  queryFn: () => getMyProfile(),
};

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Mastery — Last Topper" },
      { name: "description", content: "See your subject accuracy, weak areas, and study time." },
      { property: "og:title", content: "Mastery — Last Topper" },
      { property: "og:description", content: "Your mastery dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(analyticsQuery),
      context.queryClient.ensureQueryData(profileQuery),
    ]),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const nav = useNavigate();
  const { data: a } = useSuspenseQuery(analyticsQuery);
  const { data: profile } = useSuspenseQuery(profileQuery);
  const [starting, setStarting] = useState(false);
  const plan = useQuery({ queryKey: ["pro-study-plan"], queryFn: () => getProStudyPlan() });

  async function practiceWeak() {
    const chapterIds = a.weakChapters.map((c) => c.chapter_id).slice(0, 5);
    if (chapterIds.length === 0) return;
    setStarting(true);
    try {
      const s = await startProgressiveQuiz({
        data: {
          chapter_ids: chapterIds,
          target_count: 20,
          timer_enabled: false,
          duration_seconds: null,
        },
      });
      nav({ to: "/quiz/$sessionId", params: { sessionId: s.id } });
    } catch (e) {
      toast.error(failMessage(e, "Failed"));
    } finally {
      setStarting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => nav({ to: "/home" })}
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="text-xs text-muted-foreground">Progress</div>
            <div className="text-base font-semibold">Mastery dashboard</div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 pt-6">
        <div className="grid grid-cols-3 gap-3">
          <KpiCard
            icon={<ListChecks className="h-4 w-4" />}
            label="Attempted"
            value={String(a.totalAttempted)}
          />
          <KpiCard
            icon={<Target className="h-4 w-4" />}
            label="Accuracy"
            value={`${a.overallAccuracy.toFixed(1)}%`}
          />
          <KpiCard
            icon={<Flame className="h-4 w-4" />}
            label="Streak"
            value={`${profile?.streak ?? 0}d`}
          />
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 pt-6">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            AI weak-chapter study plan
          </h2>
          <ProChip />
        </div>
        {plan.isLoading ? (
          <div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
            Building your plan…
          </div>
        ) : plan.data?.is_pro ? (
          <div className="rounded-2xl border bg-card p-5">
            {plan.data.weak.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {plan.data.weak.map((w) => (
                  <span key={w.chapter} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                    {w.chapter} · {w.accuracy.toFixed(0)}%
                  </span>
                ))}
              </div>
            )}
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {plan.data.plan ?? "Plan unavailable right now — try again shortly."}
            </p>
          </div>
        ) : (
          <ProLock
            title="Your personalised 7-day plan"
            body="Pro members get an AI study plan built from their weakest chapters, refreshed with every quiz."
          />
        )}
      </section>

      <section className="mx-auto max-w-3xl px-5 py-6">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Subject accuracy</h2>
        <div className="rounded-2xl border bg-card p-4">
          {a.bySubject.length === 0 ? (
            <Empty />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={a.bySubject} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="subject" fontSize={11} />
                  <YAxis domain={[0, 100]} fontSize={11} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="accuracy" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Chapter accuracy heatmap
        </h2>
        <div className="rounded-2xl border bg-card p-4">
          {a.byChapter.length === 0 ? (
            <Empty />
          ) : (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {a.byChapter
                .sort((x, y) => x.accuracy - y.accuracy)
                .map((c) => (
                  <div
                    key={c.chapter_id}
                    className="flex items-center justify-between rounded-md px-3 py-2 text-xs"
                    style={{ backgroundColor: heatColor(c.accuracy) }}
                    title={`${c.subject} · ${c.attempted} attempted`}
                  >
                    <span className="truncate pr-2 font-medium text-slate-900">{c.chapter}</span>
                    <span className="tabular-nums text-slate-900">{c.accuracy.toFixed(0)}%</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Study time (last 14 days)
        </h2>
        <div className="rounded-2xl border bg-card p-4">
          {a.studyTimeByDay.length === 0 ? (
            <Empty />
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={a.studyTimeByDay}
                  margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="day" fontSize={10} tickFormatter={(d) => d.slice(5)} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v) => `${v} min`} />
                  <Line
                    type="monotone"
                    dataKey="minutes"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-10">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Weak chapters (&lt; 40%)</h2>
          {a.weakChapters.length > 0 && (
            <Button size="sm" onClick={practiceWeak} disabled={starting}>
              <Sparkles className="mr-1 h-4 w-4" /> {starting ? "Preparing…" : "Practice weak"}
            </Button>
          )}
        </div>
        <div className="mt-3 rounded-2xl border bg-card p-4">
          {a.weakChapters.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground">
              No weak chapters yet — attempt more questions to see this.
            </div>
          ) : (
            <ul className="space-y-2">
              {a.weakChapters.map((w) => (
                <li
                  key={w.chapter_id}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <div>
                    <div className="font-medium">{w.chapter}</div>
                    <div className="text-xs text-muted-foreground">
                      {w.subject} · {w.attempted} attempted
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-red-600">{w.accuracy.toFixed(0)}%</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Empty() {
  return (
    <div className="py-8 text-center text-xs text-muted-foreground">
      Attempt a few quizzes to unlock this chart.
    </div>
  );
}

function heatColor(accuracy: number): string {
  // 0 → red-200, 100 → emerald-200
  const t = Math.max(0, Math.min(1, accuracy / 100));
  const r = Math.round(254 + (167 - 254) * t);
  const g = Math.round(202 + (243 - 202) * t);
  const b = Math.round(202 + (208 - 202) * t);
  return `rgb(${r}, ${g}, ${b})`;
}
