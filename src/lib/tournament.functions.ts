import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) {
      console.error("getProfile error:", error);
      throw new Error(error.message);
    }
    return data || null;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: any) => z.object({
    username: z.string().min(3).max(20).optional(),
    bgmi_uid: z.string().optional(),
    in_game_name: z.string().optional(),
    phone: z.string().optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update(data)
      .eq("id", context.userId);
    if (error) throw error;
    return { success: true };
  });

export const getTournaments = createServerFn({ method: "GET" })
  .validator((data: any) => z.object({ status: z.string().optional() }).optional().parse(data))
  .handler(async ({ data }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    let query = supabase.from("tournaments").select("*");
    if (data?.status) {
      query = query.eq("status", data.status);
    }
    const { data: tournaments, error } = await query.order("start_date", { ascending: true });
    if (error) {
      console.error("getTournaments error:", error);
      throw new Error(error.message);
    }
    return tournaments || [];
  });

export const getTournamentDetails = createServerFn({ method: "GET" })
  .validator((data: any) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: tournament, error } = await supabase
      .from("tournaments")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    return tournament;
  });

export const createTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: any) => z.object({
    team_name: z.string().min(3).max(30),
    members: z.array(z.object({
      uid: z.string(),
      name: z.string(),
      role: z.string()
    }))
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: team, error } = await context.supabase
      .from("teams")
      .insert({
        captain_id: context.userId,
        team_name: data.team_name,
        members: data.members
      })
      .select()
      .single();
    if (error) throw error;
    return team;
  });

export const getMyTeams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("teams")
      .select("*")
      .eq("captain_id", context.userId);
    if (error) throw error;
    return data;
  });
