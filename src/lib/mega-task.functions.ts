import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getMegaTaskPartnerSecret } from "@/lib/mega-task-verification.server";

export type MegaTaskType = "rewarded_ad" | "external_link" | "daily_challenge" | "quiz";
export type MegaTaskAttemptStatus = "pending" | "completed" | "rejected" | "expired";

export type MegaAccessTask = {
  id: string;
  task_type: MegaTaskType;
  title: string;
  description: string | null;
  provider: string | null;
  provider_placement_id: string | null;
  destination_url: string | null;
  min_score_percent: number;
  min_questions: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type MyMegaAccessTask = MegaAccessTask & {
  assignment_id: string;
  assigned_at: string;
  status: MegaTaskAttemptStatus | "not_started";
  attempt_id: string | null;
  expires_at: string | null;
  completed_at: string | null;
  available: boolean;
  unavailable_reason: string | null;
};

export type MegaTaskTarget = {
  id: string;
  profession: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
};

export type AdminMegaAccessTask = MegaAccessTask & {
  assigned_mega_test_ids: string[];
  assigned_count: number;
  completed_count: number;
  pending_count: number;
  configuration_ready: boolean;
  configuration_reason: string | null;
};

type AuthContext = {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  userId: string;
};

async function assertAdmin(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw error;
  if (!data) throw new Error("Forbidden: admin only");
}

function publicAppUrl() {
  return (process.env.VITE_PUBLIC_APP_URL || "https://last-topper-web-test.vercel.app").replace(
    /\/+$/,
    "",
  );
}

function isLiveAdUnit(value: string | null) {
  return (
    !!value &&
    /^ca-app-pub-\d{16}\/\d{10}$/.test(value) &&
    !value.startsWith("ca-app-pub-3940256099942544/")
  );
}

function taskConfigurationReason(
  task: Pick<MegaAccessTask, "task_type" | "provider" | "provider_placement_id">,
) {
  if (task.task_type === "rewarded_ad") {
    if (process.env.ADMOB_TASKS_ENABLED !== "true") {
      return "AdMob access tasks are disabled until a live app and ad unit are approved.";
    }
    if (!isLiveAdUnit(task.provider_placement_id)) return "A live AdMob ad unit is required.";
  }
  if (task.task_type === "external_link") {
    if (!task.provider || !getMegaTaskPartnerSecret(task.provider)) {
      return "The signed callback partner is not configured.";
    }
  }
  return null;
}

function parseTask(row: Record<string, unknown>): MegaAccessTask {
  return {
    ...(row as unknown as MegaAccessTask),
    min_score_percent: Number(row.min_score_percent ?? 0),
    min_questions: Number(row.min_questions ?? 1),
  };
}

const megaInput = z.object({ mega_test_id: z.string().uuid() });

export const listMyMegaAccessTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => megaInput.parse(input))
  .handler(async ({ data, context }): Promise<MyMegaAccessTask[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [{ data: test, error: testError }, { data: profile, error: profileError }] =
      await Promise.all([
        db
          .from("mega_tests")
          .select("id, profession, scheduled_start, status")
          .eq("id", data.mega_test_id)
          .maybeSingle(),
        db.from("users").select("profession").eq("id", context.userId).maybeSingle(),
      ]);
    if (testError) throw testError;
    if (profileError) throw profileError;
    if (!test) throw new Error("Mega Test not found");
    if (!profile || profile.profession !== test.profession) {
      throw new Error("This Mega Test is not available for your study track");
    }

    await db
      .from("mega_access_task_attempts")
      .update({ status: "expired", rejection_reason: "attempt expired before verification" })
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString());

    const { data: assignments, error: assignmentError } = await db
      .from("mega_access_task_assignments")
      .select("id, task_id, assigned_at")
      .eq("mega_test_id", data.mega_test_id)
      .order("assigned_at");
    if (assignmentError) throw assignmentError;
    if (!assignments?.length) return [];

    const taskIds = assignments.map((assignment: any) => assignment.task_id);
    const assignmentIds = assignments.map((assignment: any) => assignment.id);
    const [{ data: taskRows, error: taskError }, { data: attempts, error: attemptError }] =
      await Promise.all([
        db.from("mega_access_tasks").select("*").in("id", taskIds),
        db
          .from("mega_access_task_attempts")
          .select("id, assignment_id, status, expires_at, completed_at, created_at")
          .eq("user_id", context.userId)
          .in("assignment_id", assignmentIds)
          .order("created_at", { ascending: false }),
      ]);
    if (taskError) throw taskError;
    if (attemptError) throw attemptError;

    const tasks = new Map<string, MegaAccessTask>(
      (taskRows ?? []).map((row: Record<string, unknown>) => {
        const task = parseTask(row);
        return [task.id, task] as const;
      }),
    );
    const deadlinePassed = Date.now() >= new Date(test.scheduled_start).getTime();

    return assignments.flatMap((assignment: any) => {
      const task = tasks.get(assignment.task_id);
      if (!task) return [];
      const assignmentAttempts = (attempts ?? []).filter(
        (candidate: any) => candidate.assignment_id === assignment.id,
      );
      // A verified completion always wins over a newer pending/rejected retry.
      // This keeps UI eligibility aligned with the database registration check.
      const attempt =
        assignmentAttempts.find((candidate: any) => candidate.status === "completed") ??
        assignmentAttempts[0];
      const reason = !task.is_active
        ? "This requirement is inactive. Registration stays locked until an admin fixes it."
        : deadlinePassed
          ? "The completion deadline has passed."
          : taskConfigurationReason(task);
      return [
        {
          ...task,
          assignment_id: assignment.id,
          assigned_at: assignment.assigned_at,
          status: attempt?.status ?? "not_started",
          attempt_id: attempt?.id ?? null,
          expires_at: attempt?.expires_at ?? null,
          completed_at: attempt?.completed_at ?? null,
          available: !reason && attempt?.status !== "completed",
          unavailable_reason: attempt?.status === "completed" ? null : reason,
        },
      ];
    });
  });

const startInput = z.object({ assignment_id: z.string().uuid() });

export const startMegaProviderTaskAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => startInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const now = new Date();

    const { data: assignment, error: assignmentError } = await db
      .from("mega_access_task_assignments")
      .select("id, task_id, mega_test_id")
      .eq("id", data.assignment_id)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) throw new Error("Mega Test task assignment not found");

    const [{ data: taskRow, error: taskError }, { data: test, error: testError }] =
      await Promise.all([
        db.from("mega_access_tasks").select("*").eq("id", assignment.task_id).maybeSingle(),
        db
          .from("mega_tests")
          .select("id, profession, scheduled_start, status")
          .eq("id", assignment.mega_test_id)
          .maybeSingle(),
      ]);
    if (taskError) throw taskError;
    if (testError) throw testError;
    if (!taskRow || !test) throw new Error("Mega Test task is unavailable");
    const task = parseTask(taskRow);
    if (!task.is_active || !["rewarded_ad", "external_link"].includes(task.task_type)) {
      throw new Error("This provider task is not active");
    }
    const configReason = taskConfigurationReason(task);
    if (configReason) throw new Error(configReason);
    if (test.status !== "scheduled" || now >= new Date(test.scheduled_start)) {
      throw new Error("The Mega Test task deadline has passed");
    }

    const { data: profile, error: profileError } = await db
      .from("users")
      .select("profession")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.profession !== test.profession) {
      throw new Error("This Mega Test is not available for your study track");
    }

    await db
      .from("mega_access_task_attempts")
      .update({ status: "expired", rejection_reason: "attempt expired before verification" })
      .eq("assignment_id", assignment.id)
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .lt("expires_at", now.toISOString());

    const { data: recent, error: recentError } = await db
      .from("mega_access_task_attempts")
      .select("id, status, expires_at, nonce, created_at")
      .eq("assignment_id", assignment.id)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (recentError) throw recentError;
    if ((recent ?? []).some((attempt: any) => attempt.status === "completed")) {
      throw new Error("This Mega Test requirement is already complete");
    }
    let attempt = (recent ?? []).find(
      (candidate: any) =>
        candidate.status === "pending" && new Date(candidate.expires_at).getTime() > now.getTime(),
    );

    const tenMinutesAgo = new Date(now.getTime() - 10 * 60_000).toISOString();
    const { count, error: countError } = await db
      .from("mega_access_task_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gte("created_at", tenMinutesAgo);
    if (countError) throw countError;
    if ((count ?? 0) >= 10) throw new Error("Too many task attempts. Please wait a few minutes.");

    if (!attempt) {
      const providerWindow = task.task_type === "rewarded_ad" ? 24 * 60 * 60_000 : 2 * 60 * 60_000;
      const expiresAt = new Date(
        Math.min(new Date(test.scheduled_start).getTime(), now.getTime() + providerWindow),
      );
      if (expiresAt.getTime() <= now.getTime()) throw new Error("The task deadline has passed");
      const { data: inserted, error } = await db
        .from("mega_access_task_attempts")
        .insert({
          assignment_id: assignment.id,
          user_id: context.userId,
          provider: task.provider,
          expires_at: expiresAt.toISOString(),
        })
        .select("id, status, expires_at, nonce")
        .single();
      if (error) throw error;
      attempt = inserted;
    }

    let destinationUrl: string | null = null;
    if (task.task_type === "external_link") {
      const url = new URL(task.destination_url!);
      url.searchParams.set("lt_attempt", attempt.id);
      url.searchParams.set("lt_nonce", attempt.nonce);
      url.searchParams.set("lt_callback", `${publicAppUrl()}/api/public/hooks/mega-task-partner`);
      destinationUrl = url.toString();
    }

    return {
      attempt_id: attempt.id as string,
      nonce: attempt.nonce as string,
      user_id: context.userId,
      task_type: task.task_type,
      provider: task.provider,
      provider_placement_id: task.provider_placement_id,
      destination_url: destinationUrl,
      expires_at: attempt.expires_at as string,
    };
  });

export const getMegaTaskAttemptStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ attempt_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt, error } = await (supabaseAdmin as any)
      .from("mega_access_task_attempts")
      .select("id, assignment_id, status, expires_at, completed_at, rejection_reason")
      .eq("id", data.attempt_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!attempt) throw new Error("Mega Test task attempt not found");
    return attempt as {
      id: string;
      assignment_id: string;
      status: MegaTaskAttemptStatus;
      expires_at: string;
      completed_at: string | null;
      rejection_reason: string | null;
    };
  });

export const syncMegaStudyTaskCompletions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => megaInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: assignments, error } = await db
      .from("mega_access_task_assignments")
      .select("id, task_id")
      .eq("mega_test_id", data.mega_test_id);
    if (error) throw error;
    if (!assignments?.length) return { checked: 0, completed: 0 };

    const { data: taskRows, error: taskError } = await db
      .from("mega_access_tasks")
      .select("id, task_type")
      .in(
        "id",
        assignments.map((assignment: any) => assignment.task_id),
      );
    if (taskError) throw taskError;
    const studyTaskIds = new Set(
      (taskRows ?? [])
        .filter((task: any) => ["daily_challenge", "quiz"].includes(task.task_type))
        .map((task: any) => task.id),
    );

    let checked = 0;
    let completed = 0;
    for (const assignment of assignments) {
      if (!studyTaskIds.has(assignment.task_id)) continue;
      checked += 1;
      const { data: resultData, error: resultError } = await db.rpc(
        "record_mega_study_task_completion",
        { p_assignment_id: assignment.id, p_user_id: context.userId },
      );
      if (resultError) throw resultError;
      const result = Array.isArray(resultData) ? resultData[0] : resultData;
      if (result?.completed || result?.already_completed) completed += 1;
    }
    return { checked, completed };
  });

const taskSchema = z.object({
  id: z.string().uuid().optional(),
  task_type: z.enum(["rewarded_ad", "external_link", "daily_challenge", "quiz"]),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().default(""),
  provider: z.string().trim().toLowerCase().max(40).optional().default(""),
  provider_placement_id: z.string().trim().max(200).optional().default(""),
  destination_url: z.string().trim().max(1000).optional().default(""),
  min_score_percent: z.number().int().min(0).max(100),
  min_questions: z.number().int().min(1).max(500),
  is_active: z.boolean(),
  mega_test_ids: z.array(z.string().uuid()).max(20),
});

export const adminListMegaTaskTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MegaTaskTarget[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("mega_tests")
      .select("id, profession, scheduled_start, scheduled_end, status")
      .eq("status", "scheduled")
      .gt("scheduled_start", new Date().toISOString())
      .order("scheduled_start")
      .limit(20);
    if (error) throw error;
    return (data ?? []) as MegaTaskTarget[];
  });

export const adminListMegaAccessTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminMegaAccessTask[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: taskRows, error: taskError } = await db
      .from("mega_access_tasks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (taskError) throw taskError;
    const tasks: MegaAccessTask[] = (taskRows ?? []).map((row: Record<string, unknown>) =>
      parseTask(row),
    );
    if (!tasks.length) return [];
    const ids = tasks.map((task: MegaAccessTask) => task.id);
    const { data: assignments, error: assignmentError } = await db
      .from("mega_access_task_assignments")
      .select("id, task_id, mega_test_id")
      .in("task_id", ids);
    if (assignmentError) throw assignmentError;
    let attempts: Array<{ assignment_id: string; status: string }> = [];
    const assignmentIds = (assignments ?? []).map((assignment: any) => assignment.id);
    if (assignmentIds.length) {
      const { data, error } = await db
        .from("mega_access_task_attempts")
        .select("assignment_id, status")
        .in("assignment_id", assignmentIds);
      if (error) throw error;
      attempts = data ?? [];
    }
    const assignmentTask = new Map(
      (assignments ?? []).map((assignment: any) => [assignment.id, assignment.task_id]),
    );

    return tasks.map((task) => {
      const ownAssignments = (assignments ?? []).filter(
        (assignment: any) => assignment.task_id === task.id,
      );
      const ownAttempts = (attempts ?? []).filter(
        (attempt: any) => assignmentTask.get(attempt.assignment_id) === task.id,
      );
      const reason = taskConfigurationReason(task);
      return {
        ...task,
        assigned_mega_test_ids: ownAssignments.map((assignment: any) => assignment.mega_test_id),
        assigned_count: ownAssignments.length,
        completed_count: ownAttempts.filter((attempt: any) => attempt.status === "completed")
          .length,
        pending_count: ownAttempts.filter((attempt: any) => attempt.status === "pending").length,
        configuration_ready: !reason,
        configuration_reason: reason,
      };
    });
  });

export const adminSaveMegaAccessTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => taskSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.task_type === "rewarded_ad") {
      if (data.provider !== "admob") throw new Error("Rewarded ads must use provider admob");
      if (!data.provider_placement_id) throw new Error("An AdMob ad unit ID is required");
      if (data.destination_url) throw new Error("AdMob tasks cannot have a destination URL");
      if (data.is_active && !isLiveAdUnit(data.provider_placement_id)) {
        throw new Error("Only a live AdMob rewarded ad unit can be activated");
      }
    } else if (data.task_type === "external_link") {
      if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(data.provider) || data.provider === "admob") {
        throw new Error("External links require a configured non-AdMob partner key");
      }
      let url: URL;
      try {
        url = new URL(data.destination_url);
      } catch {
        throw new Error("A valid HTTPS destination URL is required");
      }
      if (url.protocol !== "https:" || !url.hostname) {
        throw new Error("Destination URL must use HTTPS");
      }
      if (data.provider_placement_id) throw new Error("External links do not use an ad unit");
    } else if (data.provider || data.provider_placement_id || data.destination_url) {
      throw new Error("Study tasks cannot include provider or destination fields");
    }

    const candidate: MegaAccessTask = {
      id: data.id ?? "00000000-0000-0000-0000-000000000000",
      task_type: data.task_type,
      title: data.title,
      description: data.description || null,
      provider: data.provider || null,
      provider_placement_id: data.provider_placement_id || null,
      destination_url: data.destination_url || null,
      min_score_percent: data.min_score_percent,
      min_questions: data.min_questions,
      is_active: data.is_active,
      created_by: context.userId,
      created_at: "",
      updated_at: "",
    };
    const configReason = taskConfigurationReason(candidate);
    if (data.is_active && configReason) throw new Error(configReason);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (data.mega_test_ids.length) {
      const { data: tests, error: testError } = await db
        .from("mega_tests")
        .select("id, status, scheduled_start")
        .in("id", data.mega_test_ids);
      if (testError) throw testError;
      if (
        (tests ?? []).length !== data.mega_test_ids.length ||
        (tests ?? []).some(
          (test: any) =>
            test.status !== "scheduled" || new Date(test.scheduled_start).getTime() <= Date.now(),
        )
      ) {
        throw new Error("Tasks can be assigned only to future scheduled Mega Tests");
      }
      if (!data.is_active) throw new Error("Activate a task before assigning it to a Mega Test");
    }

    let taskId = data.id;
    let existingAssignments: Array<{ id: string; mega_test_id: string }> = [];
    if (taskId) {
      const { data: rows, error } = await db
        .from("mega_access_task_assignments")
        .select("id, mega_test_id")
        .eq("task_id", taskId);
      if (error) throw error;
      existingAssignments = rows ?? [];
      const changedTestIds = new Set([
        ...existingAssignments.map((row) => row.mega_test_id),
        ...data.mega_test_ids,
      ]);
      if (changedTestIds.size) {
        const { count, error: entryError } = await db
          .from("mega_test_entries")
          .select("id", { count: "exact", head: true })
          .in("mega_test_id", [...changedTestIds])
          .not("access_verified_at", "is", null);
        if (entryError) throw entryError;
        const assignmentSetChanged =
          existingAssignments.length !== data.mega_test_ids.length ||
          existingAssignments.some((row) => !data.mega_test_ids.includes(row.mega_test_id));
        if (assignmentSetChanged && (count ?? 0) > 0) {
          throw new Error("Assignments are locked after the first student registers");
        }
      }
      if (existingAssignments.length) {
        const { count: attemptCount, error: attemptError } = await db
          .from("mega_access_task_attempts")
          .select("id", { count: "exact", head: true })
          .in(
            "assignment_id",
            existingAssignments.map((row) => row.id),
          );
        if (attemptError) throw attemptError;
        if ((attemptCount ?? 0) > 0) {
          throw new Error("A task with student attempts is immutable; create a new task instead");
        }
      }
    }

    const taskRow = {
      task_type: data.task_type,
      title: data.title,
      description: data.description || null,
      provider: ["rewarded_ad", "external_link"].includes(data.task_type) ? data.provider : null,
      provider_placement_id: data.task_type === "rewarded_ad" ? data.provider_placement_id : null,
      destination_url: data.task_type === "external_link" ? data.destination_url : null,
      min_score_percent: data.min_score_percent,
      min_questions: data.min_questions,
      is_active: data.is_active,
      created_by: context.userId,
    };
    if (taskId) {
      const { error } = await db.from("mega_access_tasks").update(taskRow).eq("id", taskId);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await db
        .from("mega_access_tasks")
        .insert(taskRow)
        .select("id")
        .single();
      if (error) throw error;
      taskId = inserted.id;
    }

    const wanted = new Set(data.mega_test_ids);
    const removeIds = existingAssignments
      .filter((row) => !wanted.has(row.mega_test_id))
      .map((row) => row.id);
    if (removeIds.length) {
      const { error } = await db.from("mega_access_task_assignments").delete().in("id", removeIds);
      if (error) throw error;
    }
    const existingTestIds = new Set(existingAssignments.map((row) => row.mega_test_id));
    const additions = data.mega_test_ids
      .filter((megaTestId) => !existingTestIds.has(megaTestId))
      .map((megaTestId) => ({
        mega_test_id: megaTestId,
        task_id: taskId,
        assigned_by: context.userId,
      }));
    if (additions.length) {
      const { error } = await db.from("mega_access_task_assignments").insert(additions);
      if (error) throw error;
    }
    return { ok: true, id: taskId };
  });

export const adminDeleteMegaAccessTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { count, error: assignmentError } = await db
      .from("mega_access_task_assignments")
      .select("id", { count: "exact", head: true })
      .eq("task_id", data.id);
    if (assignmentError) throw assignmentError;
    if ((count ?? 0) > 0)
      throw new Error("Unassign this task from every Mega Test before deleting it");
    const { error } = await db.from("mega_access_tasks").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
