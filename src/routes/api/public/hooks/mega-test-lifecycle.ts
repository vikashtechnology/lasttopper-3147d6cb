import { createFileRoute } from "@tanstack/react-router";

/**
 * Called periodically by pg_cron to:
 *  - refund entry fees when a mega test ended with < min_participants
 *  - rank paid entries and credit prizes
 *  - mark tests as completed/refunded
 * Auth: apikey header (Supabase publishable key).
 */
export const Route = createFileRoute("/api/public/hooks/mega-test-lifecycle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();
        const { data: tests } = await supabaseAdmin
          .from("mega_tests")
          .select("id, entry_fee, min_participants, status, scheduled_end")
          .lt("scheduled_end", now)
          .in("status", ["scheduled", "live"]);

        const results: Array<{ id: string; action: string }> = [];
        for (const t of tests ?? []) {
          const { data: entries } = await supabaseAdmin
            .from("mega_test_entries")
            .select("id, user_id, paid, refunded, score, correct_count")
            .eq("mega_test_id", t.id)
            .eq("paid", true);
          const paidEntries = entries ?? [];

          if (paidEntries.length < t.min_participants) {
            for (const e of paidEntries) {
              if (e.refunded) continue;
              const { data: u } = await supabaseAdmin.from("users").select("balance").eq("id", e.user_id).maybeSingle();
              const bal = Number(u?.balance ?? 0) + Number(t.entry_fee);
              await supabaseAdmin.from("users").update({ balance: bal }).eq("id", e.user_id);
              await supabaseAdmin.from("wallet_transactions").insert({
                user_id: e.user_id, type: "credit", category: "refund",
                amount: t.entry_fee, balance_after: bal,
                note: "Mega Test refund — under-subscribed", reference_id: t.id,
              });
              await supabaseAdmin.from("mega_test_entries").update({ refunded: true }).eq("id", e.id);
            }
            await supabaseAdmin.from("mega_tests").update({ status: "refunded" }).eq("id", t.id);
            results.push({ id: t.id, action: "refunded" });
            continue;
          }

          const ranked = paidEntries
            .filter((e) => e.score !== null && e.score !== undefined)
            .sort((a, b) => (b.score! - a.score!) || ((b.correct_count ?? 0) - (a.correct_count ?? 0)));
          const prizes: Record<number, number> = { 1: 100, 2: 50, 3: 25 };
          for (let i = 0; i < ranked.length; i += 1) {
            const rank = i + 1;
            const prize = prizes[rank] ?? (rank <= 10 ? 15 : 0);
            const e = ranked[i];
            await supabaseAdmin.from("mega_test_entries").update({ rank, prize }).eq("id", e.id);
            if (prize > 0) {
              const { data: u } = await supabaseAdmin.from("users").select("balance").eq("id", e.user_id).maybeSingle();
              const bal = Number(u?.balance ?? 0) + prize;
              await supabaseAdmin.from("users").update({ balance: bal }).eq("id", e.user_id);
              await supabaseAdmin.from("wallet_transactions").insert({
                user_id: e.user_id, type: "credit", category: "prize",
                amount: prize, balance_after: bal,
                note: `Mega Test rank #${rank}`, reference_id: t.id,
              });
            }
          }
          await supabaseAdmin.from("mega_tests").update({ status: "completed" }).eq("id", t.id);
          results.push({ id: t.id, action: "completed" });
        }

        // Auto-configure next Sunday's mega test.
        // Trigger window: any run after Sunday 14:00 IST (= 08:30 UTC) and before
        // the following Sunday 10:00 IST guarantees the row exists for the
        // upcoming Sunday 10:00 IST start (= 04:30 UTC), for both professions.
        const nowD = new Date();
        function nextSunday1000IST(from: Date): Date {
          for (let i = 0; i < 8; i += 1) {
            const c = new Date(from.getTime() + i * 24 * 60 * 60 * 1000);
            c.setUTCHours(4, 30, 0, 0);
            if (c.getUTCDay() === 0 && c.getTime() > from.getTime()) return c;
          }
          return from;
        }
        // Only pre-provision once the current Sunday's window is clearly over (>= 14:00 IST Sunday, or any later day).
        const isSunday = nowD.getUTCDay() === 0;
        const past2pmIST = nowD.getUTCHours() * 60 + nowD.getUTCMinutes() >= 8 * 60 + 30; // 08:30 UTC = 14:00 IST
        const shouldProvision = !isSunday || past2pmIST;
        if (shouldProvision) {
          const start = nextSunday1000IST(nowD);
          const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
          for (const profession of ["pcm", "pcb"] as const) {
            const { data: existing } = await supabaseAdmin
              .from("mega_tests")
              .select("id")
              .eq("profession", profession)
              .eq("scheduled_start", start.toISOString())
              .maybeSingle();
            if (!existing) {
              await supabaseAdmin.from("mega_tests").insert({
                profession,
                scheduled_start: start.toISOString(),
                scheduled_end: end.toISOString(),
                status: "scheduled",
                entry_fee: 10,
                min_participants: 50,
                question_count: 180,
              });
              results.push({ id: `${profession}-${start.toISOString()}`, action: "provisioned" });
            }
          }
        }

        return Response.json({ ok: true, results });
      },
    },
  },
});
