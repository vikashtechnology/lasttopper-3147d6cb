import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BookOpenCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  LockKeyhole,
  Play,
  RefreshCw,
  Trophy,
  Users,
} from "lucide-react";
import { showVerifiedRewardedAd } from "@/lib/admob-task-client";
import { getUpcomingMegaTest, joinMegaTest, startMegaSession } from "@/lib/battle.functions";
import { failMessage } from "@/lib/friendly-error";
import {
  getMegaTaskAttemptStatus,
  listMyMegaAccessTasks,
  startMegaProviderTaskAttempt,
  syncMegaStudyTaskCompletions,
  type MyMegaAccessTask,
} from "@/lib/mega-task.functions";
import { isNativeApp } from "@/lib/native-auth";

export const Route = createFileRoute("/_authenticated/battle/mega")({
  head: () => ({
    meta: [
      { title: "Sunday Mega Test — Last Topper" },
      {
        name: "description",
        content: "A task-qualified, rank-based Sunday Mega Test for JEE and NEET students.",
      },
      { property: "og:title", content: "Sunday Mega Test" },
      {
        property: "og:description",
        content: "Complete every assigned access task, register, and compete for rank.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MegaTest,
});

function MegaTest() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mega = useQuery({
    queryKey: ["mega-test"],
    queryFn: () => getUpcomingMegaTest(),
    refetchInterval: 30_000,
  });
  const megaTestId = mega.data?.test.id;
  const tasks = useQuery({
    queryKey: ["mega-access-tasks", megaTestId],
    queryFn: () => listMyMegaAccessTasks({ data: { mega_test_id: megaTestId! } }),
    enabled: !!megaTestId,
    refetchInterval: 15_000,
  });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mega-test"] }),
      queryClient.invalidateQueries({ queryKey: ["mega-access-tasks", megaTestId] }),
    ]);
  };

  const join = useMutation({
    mutationFn: (id: string) => joinMegaTest({ data: { mega_test_id: id } }),
    onSuccess: async () => {
      toast.success("Registered. Come back when the Mega Test opens.");
      await refresh();
    },
    onError: (error) => toast.error(failMessage(error)),
  });

  const start = useMutation({
    mutationFn: (id: string) => startMegaSession({ data: { mega_test_id: id } }),
    onSuccess: (result) =>
      navigate({ to: "/battle/play/$sessionId", params: { sessionId: result.id } }),
    onError: (error) => toast.error(failMessage(error)),
  });

  const syncStudy = useMutation({
    mutationFn: (id: string) => syncMegaStudyTaskCompletions({ data: { mega_test_id: id } }),
    onSuccess: async (result) => {
      await refresh();
      if (!result.checked) toast.info("No study tasks are assigned to this Mega Test.");
      else if (result.completed === result.checked) toast.success("Study-task progress verified.");
      else toast.info("No new eligible study completion was found yet.");
    },
    onError: (error) => toast.error(failMessage(error)),
  });

  const runProviderTask = useMutation({
    mutationFn: async (task: MyMegaAccessTask) => {
      if (task.task_type === "rewarded_ad" && !(await isNativeApp())) {
        throw new Error("AdMob tasks are available in the official Android app only");
      }
      const attempt = await startMegaProviderTaskAttempt({
        data: { assignment_id: task.assignment_id },
      });
      if (attempt.task_type === "rewarded_ad") {
        await showVerifiedRewardedAd({
          adUnitId: attempt.provider_placement_id!,
          userId: attempt.user_id,
          attemptId: attempt.attempt_id,
          nonce: attempt.nonce,
        });
      } else if (attempt.destination_url) {
        window.open(attempt.destination_url, "_blank", "noopener,noreferrer");
      }
      return attempt;
    },
    onSuccess: async (attempt) => {
      toast.info("Waiting for signed provider verification…");
      for (let check = 0; check < 15; check += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        const status = await getMegaTaskAttemptStatus({
          data: { attempt_id: attempt.attempt_id },
        });
        if (status.status === "completed") {
          toast.success("Mega Test task verified.");
          await refresh();
          return;
        }
        if (status.status === "rejected" || status.status === "expired") {
          throw new Error(status.rejection_reason || "Provider verification did not succeed");
        }
      }
      await refresh();
      toast.info("Verification is still pending. This page will keep checking automatically.");
    },
    onError: (error) => toast.error(failMessage(error)),
  });

  if (mega.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const info = mega.data;
  if (!info) return <div className="battle-glass p-5 text-sm">Complete onboarding first.</div>;

  const { test, entry, participants } = info;
  const startMs = new Date(test.scheduled_start).getTime();
  const endMs = new Date(test.scheduled_end).getTime();
  const isLive = now >= startMs && now < endMs;
  const isDone = now >= endMs;
  const untilStartMs = Math.max(0, startMs - now);
  const untilEndMs = Math.max(0, endMs - now);
  const assignedTasks = tasks.data ?? [];
  const completeCount = assignedTasks.filter((task) => task.status === "completed").length;
  const allTasksComplete = assignedTasks.length > 0 && completeCount === assignedTasks.length;
  const registered = !!entry?.access_verified_at;

  return (
    <div className="space-y-4">
      <section className="battle-glass battle-slide-up p-6">
        <div className="flex items-center gap-2 text-yellow-300">
          <Trophy className="h-5 w-5" />
          <span className="text-xs uppercase tracking-widest">Sunday Mega Test</span>
        </div>
        <h1 className="battle-title mt-2 text-2xl">Qualify. Compete. Earn your rank.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {test.question_count} questions · 3-hour window · no entry payment · all assigned tasks
          required
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Stat
            icon={<Users className="h-4 w-4" />}
            label="Registered"
            value={String(participants)}
          />
          <Stat
            icon={<Clock className="h-4 w-4" />}
            label={isDone ? "Ended" : isLive ? "Ends in" : "Starts in"}
            value={isDone ? "—" : formatDuration(isLive ? untilEndMs : untilStartMs)}
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {!registered && !isDone && !isLive && (
            <button
              className="battle-btn inline-flex items-center gap-2"
              disabled={!allTasksComplete || join.isPending}
              onClick={() => join.mutate(test.id)}
            >
              <BookOpenCheck className="h-4 w-4" />
              {join.isPending ? "Registering…" : "Register after all tasks"}
            </button>
          )}
          {!registered && isLive && (
            <div className="rounded-xl border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
              Registration is closed. Access tasks had to be completed before the start time.
            </div>
          )}
          {registered && !entry?.session_id && isLive && (
            <button
              className="battle-btn"
              disabled={start.isPending}
              onClick={() => start.mutate(test.id)}
            >
              {start.isPending ? "Preparing…" : "Enter test"}
            </button>
          )}
          {registered && entry?.session_id && isLive && (
            <button
              className="battle-btn"
              onClick={() =>
                navigate({
                  to: "/battle/play/$sessionId",
                  params: { sessionId: entry.session_id! },
                })
              }
            >
              Resume test
            </button>
          )}
          {registered && !isLive && !isDone && (
            <div className="rounded-xl border border-cyan-400/50 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-200">
              Registered. Come back when the timer reaches zero.
            </div>
          )}
          {isDone && entry?.rank && (
            <div className="inline-flex items-center gap-1 rounded-xl border border-yellow-400/60 bg-yellow-400/10 px-3 py-2 text-sm text-yellow-100">
              Final rank #{entry.rank}
            </div>
          )}
        </div>
      </section>

      <section className="battle-glass p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Registration requirements
            </div>
            <h2 className="mt-1 text-lg font-semibold">
              {completeCount}/{assignedTasks.length} tasks verified
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Each completion belongs only to this Mega Test. Old or client-reported activity does
              not count.
            </p>
          </div>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs"
            disabled={syncStudy.isPending || !assignedTasks.length || isLive || isDone}
            onClick={() => syncStudy.mutate(test.id)}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncStudy.isPending ? "animate-spin" : ""}`} />
            Check study progress
          </button>
        </div>

        {tasks.isLoading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading requirements…
          </div>
        ) : tasks.error ? (
          <div className="mt-4 rounded-xl border border-destructive/30 p-3 text-sm text-destructive">
            {failMessage(tasks.error)}
          </div>
        ) : assignedTasks.length === 0 ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-100">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <strong>Registration locked.</strong>
              <p className="mt-1 text-xs text-amber-100/80">
                An admin must assign at least one active task to this Mega Test. Zero assigned tasks
                never grants access.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {assignedTasks.map((task) => (
              <TaskCard
                key={task.assignment_id}
                task={task}
                deadlinePassed={isLive || isDone}
                providerBusy={runProviderTask.isPending}
                onProvider={() => runProviderTask.mutate(task)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="battle-glass p-5 text-sm">
        <h2 className="font-semibold">Results</h2>
        <p className="mt-2 text-muted-foreground">
          Scores and ranks are recorded from server-scored submissions. Mega Tests recognize
          performance through score, rank, and XP only.
        </p>
      </section>
    </div>
  );
}

function TaskCard({
  task,
  deadlinePassed,
  providerBusy,
  onProvider,
}: {
  task: MyMegaAccessTask;
  deadlinePassed: boolean;
  providerBusy: boolean;
  onProvider: () => void;
}) {
  const complete = task.status === "completed";
  const provider = task.task_type === "rewarded_ad" || task.task_type === "external_link";
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {taskTypeLabel(task)}
          </div>
          <h3 className="mt-1 font-semibold text-white">{task.title}</h3>
          {task.description && (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{task.description}</p>
          )}
        </div>
        {complete ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
        ) : (
          <LockKeyhole className="h-5 w-5 shrink-0 text-amber-300" />
        )}
      </div>
      {(task.task_type === "daily_challenge" || task.task_type === "quiz") && (
        <p className="mt-3 text-xs text-cyan-100/80">
          Fresh server-verified result: at least {task.min_questions} questions and{" "}
          {task.min_score_percent}% score.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {complete ? (
          <span className="rounded-lg bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-300">
            Verified for this Mega Test
          </span>
        ) : provider ? (
          <button
            className="battle-btn inline-flex items-center gap-1.5 px-3 py-2 text-xs"
            disabled={!task.available || deadlinePassed || providerBusy}
            onClick={onProvider}
          >
            {task.task_type === "external_link" ? (
              <ExternalLink className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {task.status === "pending" ? "Resume verification" : "Start verified task"}
          </button>
        ) : (
          <Link
            to={task.task_type === "daily_challenge" ? "/daily" : "/learning"}
            className="battle-btn inline-flex items-center gap-1.5 px-3 py-2 text-xs"
          >
            <BookOpenCheck className="h-3.5 w-3.5" />
            {task.task_type === "daily_challenge" ? "Open Daily Challenge" : "Open chapter quiz"}
          </Link>
        )}
        {!complete && task.unavailable_reason && (
          <span className="text-xs text-amber-200">{task.unavailable_reason}</span>
        )}
      </div>
    </article>
  );
}

function taskTypeLabel(task: MyMegaAccessTask) {
  switch (task.task_type) {
    case "daily_challenge":
      return "Server-verified Daily Challenge";
    case "quiz":
      return "Server-verified quiz";
    case "rewarded_ad":
      return "AdMob SSV verified ad";
    case "external_link":
      return `Signed partner callback · ${task.provider}`;
  }
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-white">{value}</div>
    </div>
  );
}

function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${remainder}s`;
  if (minutes > 0) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}
