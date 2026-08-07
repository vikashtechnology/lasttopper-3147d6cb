import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Validates a tournament registration and creates a Razorpay order.
 * In MVP, we mock the Razorpay order ID if keys are missing.
 */
export const createTournamentOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: any) => z.object({
    tournament_id: z.string().uuid(),
    team_id: z.string().uuid(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { tournament_id, team_id } = data;
    const supabase = (context as any).supabase;

    // 1. Verify tournament exists and has space
    const { data: tournament, error: tErr } = await supabase
      .from("tournaments")
      .select("entry_fee, max_teams, registered_teams_count, status")
      .eq("id", tournament_id)
      .single();

    if (tErr || !tournament) throw new Error("Tournament not found");
    if (tournament.status !== 'upcoming') throw new Error("Tournament is no longer accepting registrations");
    if (tournament.registered_teams_count >= tournament.max_teams) throw new Error("Tournament is full");

    // 2. Create a pending registration
    const { data: registration, error: rErr } = await supabase
      .from("registrations")
      .insert({
        tournament_id,
        team_id,
        payment_status: 'pending',
        razorpay_order_id: `mock_order_${Math.random().toString(36).slice(2)}`
      })
      .select()
      .single();

    if (rErr) throw rErr;

    return {
      order_id: registration.razorpay_order_id,
      amount: tournament.entry_fee,
      currency: "INR",
      registration_id: registration.id
    };
  });

/**
 * Processes tournament payouts and calculates TDS.
 */
export const processTournamentPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: any) => z.object({
    registration_id: z.string().uuid(),
    amount: z.number().positive(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    
    // Check if user is admin (simplified for MVP handler logic)
    const { data: isAdmin } = await supabase.rpc('has_role', { 
      _user_id: context.userId, 
      _role: 'admin' 
    });
    
    if (!isAdmin) throw new Error("Unauthorized: Admin access required");

    const { registration_id, amount } = data;
    
    // Calculate TDS (30% if > 10,000)
    const tdsThreshold = 10000;
    const tdsRate = 0.3;
    const tdsDeducted = amount > tdsThreshold ? Math.floor(amount * tdsRate) : 0;
    const netAmount = amount - tdsDeducted;

    // Fetch registration details to get team/tournament
    const { data: reg } = await supabase
      .from("registrations")
      .select("tournament_id, team_id")
      .eq("id", registration_id)
      .single();

    if (!reg) throw new Error("Registration not found");

    // Create payout record
    const { data: payout, error: pErr } = await supabase
      .from("payouts")
      .insert({
        tournament_id: reg.tournament_id,
        team_id: reg.team_id,
        amount,
        tds_deducted: tdsDeducted,
        net_amount: netAmount,
        status: 'completed',
        upi_transaction_id: `mock_tx_${Math.random().toString(36).slice(2)}`
      })
      .select()
      .single();

    if (pErr) throw pErr;

    // Update profile total winnings
    const { data: team } = await supabase
      .from("teams")
      .select("captain_id")
      .eq("id", reg.team_id)
      .single();

    if (team) {
      await supabase.rpc('increment_winnings', { 
        user_id: team.captain_id, 
        inc_amount: netAmount 
      });
    }

    return payout;
  });
