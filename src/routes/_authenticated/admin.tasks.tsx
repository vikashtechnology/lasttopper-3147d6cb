import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  BadgeCheck,
  BookOpenCheck,
  CircleOff,
  Download,
  ExternalLink,
  Loader2,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { showAdMobIntegrationTest } from "@/lib/admob-task-client";
import { failMessage } from "@/lib/friendly-error";
import {
  adminDeleteMegaAccessTask,
  adminGetMegaProviderTasks,
  adminListMegaAccessTasks,
  adminListMegaTaskTargets,
  adminSaveMegaAccessTask,
  type MegaAccessTask,
  type MegaTaskType,
  type ProviderTaskCatalogItem,
} from "@/lib/mega-task.functions";

export const Route = createFileRoute("/_authenticated/admin/tasks")({
  component: AdminMegaTasksPage,
});

type FormState = {
  id?: string;
  task_type: MegaTaskType;
  title: string;
  description: string;
  provider: string;
  provider_placement_id: string;
  provider_task_id: string;
  destination_url: string;
  min_score_percent: number;
  min_questions: number;
  is_active: boolean;
  mega_test_ids: string[];
};

const emptyForm: FormState = {
  task_type: "daily_challenge",
  title: "Complete a Daily Challenge",
  description: "Finish a fresh Daily Challenge after this task is assigned.",
  provider: "",
  provider_placement_id: "",
  provider_task_id: "",
  destination_url: "",
  min_score_percent: 0,
  min_questions: 10,
  is_active: true,
  mega_test_ids: [],
};

function AdminMegaTasksPage() {
  const queryClient = useQueryClient();
  const tasks = useQuery({
    queryKey: ["admin-mega-tasks"],
    queryFn: () => adminListMegaAccessTasks(),
  });
  const targets = useQuery({
    queryKey: ["admin-mega-task-targets"],
    queryFn: () => adminListMegaTaskTargets(),
  });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [providerTasks, setProviderTasks] = useState<ProviderTaskCatalogItem[]>([]);
  const [showProviderTasks, setShowProviderTasks] = useState(false);

  const getProviderTasks = useMutation({
    mutationFn: () => adminGetMegaProviderTasks(),
    onSuccess: (items) => {
      setProviderTasks(items);
      setShowProviderTasks(true);
      if (!items.length) toast.info("The provider has no available tasks right now");
    },
    onError: (error) => toast.error(failMessage(error, "Provider tasks could not be fetched")),
  });

  const save = useMutation({
    mutationFn: () => adminSaveMegaAccessTask({ data: form }),
    onSuccess: () => {
      toast.success("Mega Test access task saved");
      setShowForm(false);
      setForm(emptyForm);
      void queryClient.invalidateQueries({ queryKey: ["admin-mega-tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["mega-access-tasks"] });
    },
    onError: (error) => toast.error(failMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminDeleteMegaAccessTask({ data: { id } }),
    onSuccess: () => {
      toast.success("Unused task deleted");
      void queryClient.invalidateQueries({ queryKey: ["admin-mega-tasks"] });
    },
    onError: (error) => toast.error(failMessage(error)),
  });

  const edit = (task: MegaAccessTask & { assigned_mega_test_ids?: string[] }) => {
    setForm({
      id: task.id,
      task_type: task.task_type,
      title: task.title,
      description: task.description ?? "",
      provider: task.provider ?? "",
      provider_placement_id: task.provider_placement_id ?? "",
      provider_task_id: task.provider_task_id ?? "",
      destination_url: task.destination_url ?? "",
      min_score_percent: task.min_score_percent,
      min_questions: task.min_questions,
      is_active: task.is_active,
      mega_test_ids: task.assigned_mega_test_ids ?? [],
    });
    setShowForm(true);
  };

  const importProviderTask = (task: ProviderTaskCatalogItem) => {
    setForm({
      ...emptyForm,
      task_type: "external_link",
      title: task.title,
      description: task.description,
      provider: task.provider,
      provider_task_id: task.provider_task_id,
      destination_url: task.destination_url,
      is_active: task.configuration_ready,
    });
    setShowProviderTasks(false);
    setShowForm(true);
  };

  const runTestAd = async () => {
    try {
      await showAdMobIntegrationTest();
      toast.success("Official AdMob test completed. It did not satisfy any Mega Test task.");
    } catch (error) {
      toast.error(failMessage(error, "AdMob test could not run"));
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mega Test tasks</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Create tasks manually or use Get Task to import provider tasks, then assign them to
            future Mega Tests. Students must finish every assigned task before registration.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-xl border border-border px-3 py-2 text-sm" onClick={runTestAd}>
            <Play className="mr-1.5 inline h-4 w-4" /> Test AdMob
          </button>
          <button
            className="rounded-xl border border-border px-3 py-2 text-sm"
            disabled={getProviderTasks.isPending}
            onClick={() => getProviderTasks.mutate()}
          >
            {getProviderTasks.isPending ? (
              <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 inline h-4 w-4" />
            )}
            Get Task
          </button>
          <button
            className="battle-btn inline-flex items-center gap-2 px-4"
            onClick={() => {
              setForm(emptyForm);
              setShowForm(true);
            }}
          >
            <Plus className="h-4 w-4" /> New task
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
        <strong>Registration fails closed.</strong> A Mega Test with zero assignments cannot accept
        registrations. Provider tasks activate only after signed callbacks are configured. Official
        test ads and client events never count.
      </div>

      {targets.data?.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          No future scheduled Mega Test exists yet. Run the authenticated Mega lifecycle scheduler,
          then return here to assign at least one active task.
        </div>
      )}

      {tasks.isLoading ? (
        <div className="flex items-center gap-2 p-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : tasks.error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {failMessage(tasks.error)}
        </div>
      ) : (tasks.data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No access tasks yet. Create one, activate it, and assign it to a future Mega Test.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(tasks.data ?? []).map((task) => (
            <article key={task.id} className="mantis-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                        task.is_active
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {task.is_active ? "Active" : "Inactive"}
                    </span>
                    <span className="text-xs text-muted-foreground">{taskTypeLabel(task)}</span>
                  </div>
                  <h2 className="mt-2 font-semibold">{task.title}</h2>
                </div>
                <BookOpenCheck className="h-5 w-5 shrink-0 text-primary" />
              </div>
              {task.description && (
                <p className="mt-2 text-sm text-muted-foreground">{task.description}</p>
              )}
              {isStudy(task.task_type) && (
                <p className="mt-3 rounded-lg bg-muted/60 p-2 text-xs">
                  Minimum: {task.min_questions} questions · {task.min_score_percent}% score
                </p>
              )}
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <Stat label="Mega Tests" value={task.assigned_count} />
                <Stat label="Completed" value={task.completed_count} />
                <Stat label="Pending" value={task.pending_count} />
              </div>
              <div
                className={`mt-3 flex items-start gap-2 rounded-lg p-2.5 text-xs ${
                  task.configuration_ready
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/10 text-amber-800 dark:text-amber-200"
                }`}
              >
                {task.configuration_ready ? (
                  <BadgeCheck className="h-4 w-4 shrink-0" />
                ) : (
                  <CircleOff className="h-4 w-4 shrink-0" />
                )}
                {task.configuration_ready
                  ? isStudy(task.task_type)
                    ? "Completion is checked from server-owned study records."
                    : "Provider callback verification is configured."
                  : task.configuration_reason}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {task.assigned_mega_test_ids.length ? (
                  task.assigned_mega_test_ids.map((id) => {
                    const test = targets.data?.find((target) => target.id === id);
                    return (
                      <span
                        key={id}
                        className="rounded-full border border-border px-2 py-1 text-[11px]"
                      >
                        {test
                          ? `${test.profession.toUpperCase()} · ${formatDate(test.scheduled_start)}`
                          : `Assigned · ${id.slice(0, 8)}`}
                      </span>
                    );
                  })
                ) : (
                  <span className="text-xs text-amber-700 dark:text-amber-300">
                    Not assigned — this task gates no registration.
                  </span>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm"
                  onClick={() => edit(task)}
                >
                  Edit & assign
                </button>
                <button
                  className="rounded-lg border border-destructive/30 px-3 py-2 text-destructive"
                  aria-label={`Delete ${task.title}`}
                  disabled={remove.isPending || task.assigned_count > 0}
                  onClick={() => {
                    if (window.confirm("Delete this unassigned, unused task?"))
                      remove.mutate(task.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {showProviderTasks && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setShowProviderTasks(false)}
        >
          <div
            className="mx-auto my-6 w-full max-w-2xl rounded-2xl border border-border bg-background p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Get Task from provider</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose a task to import as a draft, then assign it to a future Sunday Mega Test.
                </p>
              </div>
              <button
                className="rounded-lg border border-border px-2 py-1 text-sm"
                onClick={() => setShowProviderTasks(false)}
              >
                ✕
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {providerTasks.length ? (
                providerTasks.map((task) => (
                  <article
                    key={task.provider_task_id}
                    className="rounded-xl border border-border p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                          {task.provider} · {task.provider_task_id}
                        </div>
                        <h3 className="mt-1 font-semibold">{task.title}</h3>
                        {task.description && (
                          <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
                        )}
                        {!task.configuration_ready && (
                          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                            The task will be imported inactive until this provider's signed callback
                            secret is configured.
                          </p>
                        )}
                      </div>
                      <button
                        className="battle-btn shrink-0 px-3 py-2 text-xs"
                        onClick={() => importProviderTask(task)}
                      >
                        Import
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No provider tasks are currently available.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => !save.isPending && setShowForm(false)}
        >
          <div
            className="mx-auto my-6 w-full max-w-2xl rounded-2xl border border-border bg-background p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {form.id ? "Edit and assign task" : "Create and assign task"}
              </h2>
              <button
                className="rounded-lg border border-border px-2 py-1 text-sm"
                onClick={() => setShowForm(false)}
              >
                ✕
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Task type">
                <select
                  className="admin-input"
                  value={form.task_type}
                  onChange={(event) => {
                    const task_type = event.target.value as MegaTaskType;
                    setForm((old) => ({
                      ...old,
                      task_type,
                      provider: task_type === "rewarded_ad" ? "admob" : "",
                      provider_placement_id: "",
                      provider_task_id: "",
                      destination_url: "",
                      min_score_percent: 0,
                      min_questions: task_type === "daily_challenge" ? 10 : 1,
                      is_active: isStudy(task_type),
                      mega_test_ids: [],
                    }));
                  }}
                >
                  <option value="daily_challenge">Daily Challenge</option>
                  <option value="quiz">Verified quiz</option>
                  <option value="external_link">Signed partner link</option>
                  <option value="rewarded_ad">AdMob rewarded ad</option>
                </select>
              </Field>
              <label className="flex items-center gap-3 rounded-xl border border-border p-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={form.is_active}
                  onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                />
                <span className="text-sm font-medium">Active</span>
              </label>
              <Field label="Title" wide>
                <input
                  className="admin-input"
                  maxLength={120}
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
              </Field>
              <Field label="Description" wide>
                <textarea
                  className="admin-input min-h-20"
                  maxLength={500}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </Field>

              {form.task_type === "rewarded_ad" && (
                <>
                  <Field label="Provider">
                    <input className="admin-input" value="admob" disabled />
                  </Field>
                  <Field label="Live rewarded ad unit ID">
                    <input
                      className="admin-input"
                      placeholder="ca-app-pub-…/…"
                      value={form.provider_placement_id}
                      onChange={(event) =>
                        setForm({ ...form, provider_placement_id: event.target.value })
                      }
                    />
                  </Field>
                </>
              )}

              {form.task_type === "external_link" && (
                <>
                  <Field label="Partner key">
                    <input
                      className="admin-input"
                      placeholder="e.g. survey_partner"
                      value={form.provider}
                      onChange={(event) =>
                        setForm({ ...form, provider: event.target.value.toLowerCase() })
                      }
                    />
                  </Field>
                  <Field label="Provider task ID (optional)">
                    <input
                      className="admin-input"
                      maxLength={200}
                      placeholder="Filled by Get Task"
                      value={form.provider_task_id}
                      onChange={(event) =>
                        setForm({ ...form, provider_task_id: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="HTTPS destination URL" wide>
                    <div className="relative">
                      <ExternalLink className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <input
                        className="admin-input pl-9"
                        type="url"
                        placeholder="https://partner.example/task"
                        value={form.destination_url}
                        onChange={(event) =>
                          setForm({ ...form, destination_url: event.target.value })
                        }
                      />
                    </div>
                  </Field>
                </>
              )}

              {isStudy(form.task_type) && (
                <>
                  <Field label="Minimum questions">
                    <input
                      className="admin-input"
                      type="number"
                      min={1}
                      max={500}
                      value={form.min_questions}
                      onChange={(event) =>
                        setForm({ ...form, min_questions: Number(event.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Minimum score (%)">
                    <input
                      className="admin-input"
                      type="number"
                      min={0}
                      max={100}
                      value={form.min_score_percent}
                      onChange={(event) =>
                        setForm({ ...form, min_score_percent: Number(event.target.value) })
                      }
                    />
                  </Field>
                </>
              )}

              <Field label="Assign to future Mega Tests" wide>
                <div className="space-y-2 rounded-xl border border-border p-3">
                  {(targets.data ?? []).length ? (
                    (targets.data ?? []).map((test) => (
                      <label key={test.id} className="flex items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={form.mega_test_ids.includes(test.id)}
                          onChange={(event) =>
                            setForm((old) => ({
                              ...old,
                              mega_test_ids: event.target.checked
                                ? [...old.mega_test_ids, test.id]
                                : old.mega_test_ids.filter((id) => id !== test.id),
                            }))
                          }
                        />
                        <span>
                          {test.profession.toUpperCase()} · {formatDate(test.scheduled_start)}
                        </span>
                      </label>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No future Mega Tests available.</p>
                  )}
                </div>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Every checked task becomes mandatory for that Mega Test. Completions cannot be
                  reused for another event.
                </span>
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-xl border border-border px-4 py-2 text-sm"
                onClick={() => setShowForm(false)}
                disabled={save.isPending}
              >
                Cancel
              </button>
              <button
                className="battle-btn min-w-28"
                onClick={() => save.mutate()}
                disabled={save.isPending || !form.title.trim()}
              >
                {save.isPending ? "Saving…" : "Save task"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-muted/60 p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold text-foreground">{value}</div>
    </div>
  );
}

function isStudy(type: MegaTaskType) {
  return type === "daily_challenge" || type === "quiz";
}

function taskTypeLabel(task: Pick<MegaAccessTask, "task_type" | "provider">) {
  switch (task.task_type) {
    case "daily_challenge":
      return "Daily Challenge";
    case "quiz":
      return "Verified quiz";
    case "rewarded_ad":
      return "AdMob rewarded ad";
    case "external_link":
      return `Signed link · ${task.provider}`;
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}
