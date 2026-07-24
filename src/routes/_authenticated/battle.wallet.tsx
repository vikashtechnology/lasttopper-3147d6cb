import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wallet, ArrowDownToLine, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getWallet, requestWithdrawal, getWithdrawals } from "@/lib/battle.functions";
import { getMyProfile } from "@/lib/user.functions";
import { payWithRazorpay } from "@/lib/razorpay-client";

export const Route = createFileRoute("/_authenticated/battle/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet — Last Topper" },
      { name: "description", content: "Your battle balance, transactions, and withdrawals." },
      { property: "og:title", content: "Wallet" },
      { property: "og:description", content: "Manage your Last Topper battle wallet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WalletPage,
});

function WalletPage() {
  const qc = useQueryClient();
  const w = useQuery({ queryKey: ["wallet"], queryFn: () => getWallet() });
  const wr = useQuery({ queryKey: ["withdrawals"], queryFn: () => getWithdrawals() });
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => getMyProfile() });
  const [topupAmt, setTopupAmt] = useState<number>(100);
  const [topupLoading, setTopupLoading] = useState(false);
  const [showTopup, setShowTopup] = useState(false);

  const topup = async () => {
    if (topupAmt < 10) return toast.error("Minimum 🪙10 TC");
    setTopupLoading(true);
    try {
      await payWithRazorpay({
        purpose: "wallet_topup",
        amount_inr: topupAmt,
        name: profile.data?.full_name,
        email: profile.data?.email,
      });
      toast.success(`🪙${topupAmt} TC added to wallet`);
      setShowTopup(false);
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Payment failed";
      if (msg !== "Payment cancelled") toast.error(msg);
    } finally {
      setTopupLoading(false);
    }
  };

  useEffect(() => {
    const ch = supabase
      .channel("wallet-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wallet_transactions" },
        () => qc.invalidateQueries({ queryKey: ["wallet"] }))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [qc]);


  const [showForm, setShowForm] = useState(false);
  const [amt, setAmt] = useState<number>(0);
  const [method, setMethod] = useState<"upi" | "bank">("upi");
  const [upi, setUpi] = useState("");
  const [acc, setAcc] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [name, setName] = useState("");

  const req = useMutation({
    mutationFn: () => requestWithdrawal({
      data: {
        amount: amt, method,
        upi_id: method === "upi" ? upi : undefined,
        account_name: method === "bank" ? name : undefined,
        account_number: method === "bank" ? acc : undefined,
        ifsc: method === "bank" ? ifsc : undefined,
      },
    }),
    onSuccess: () => {
      toast.success("Withdrawal requested — processes in 20 min");
      setShowForm(false);
      setAmt(0); setUpi(""); setAcc(""); setIfsc(""); setName("");
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["withdrawals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bal = w.data?.balance ?? 0;

  return (
    <div className="space-y-4">
      <div className="battle-glass battle-slide-up p-6">
        <div className="flex items-center gap-2 text-white/70">
          <Wallet className="h-4 w-4" />
          <span className="text-xs uppercase tracking-widest">Balance</span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="battle-title text-4xl">🪙{bal.toFixed(2)} TC</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-xl border border-cyan-400/60 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 inline-flex items-center gap-1.5"
            onClick={() => setShowTopup((v) => !v)}
          >
            <Plus className="h-4 w-4" /> Add money
          </button>
          <button
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 inline-flex items-center gap-1.5"
            onClick={() => setShowForm((v) => !v)}
          >
            <ArrowDownToLine className="h-4 w-4" /> Withdraw
          </button>
        </div>
      </div>

      {showTopup && (
        <div className="battle-glass p-5 space-y-3 text-sm">
          <div className="text-xs uppercase tracking-widest text-white/60">Add money via Razorpay</div>
          <div className="flex flex-wrap gap-2">
            {[50, 100, 200, 500].map((v) => (
              <button
                key={v}
                onClick={() => setTopupAmt(v)}
                className={`rounded-lg border px-3 py-1.5 text-xs ${topupAmt === v ? "border-cyan-400/60 bg-cyan-400/10" : "border-white/15"}`}
              >🪙{v}</button>
            ))}
          </div>
          <input
            className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
            type="number" min={10} max={5000} placeholder="Amount (Topper Coins)"
            value={topupAmt || ""} onChange={(e) => setTopupAmt(Number(e.target.value))}
          />
          <button className="battle-btn w-full" disabled={topupLoading} onClick={topup}>
            {topupLoading ? "Opening checkout…" : `Pay ₹${topupAmt} · get 🪙${topupAmt} TC`}
          </button>
        </div>
      )}

      {showForm && (
        <div className="battle-glass p-5 space-y-3 text-sm">
          <div className="flex gap-2">
            <button
              className={`flex-1 rounded-lg border p-2 ${method === "upi" ? "border-cyan-400/60 bg-cyan-400/10" : "border-white/15"}`}
              onClick={() => setMethod("upi")}
            >UPI</button>
            <button
              className={`flex-1 rounded-lg border p-2 ${method === "bank" ? "border-cyan-400/60 bg-cyan-400/10" : "border-white/15"}`}
              onClick={() => setMethod("bank")}
            >Bank</button>
          </div>
          <input
            className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2"
            type="number" min={1} max={bal} placeholder="Amount (Topper Coins)"
            value={amt || ""} onChange={(e) => setAmt(Number(e.target.value))}
          />
          {method === "upi" ? (
            <input className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2" placeholder="you@upi" value={upi} onChange={(e) => setUpi(e.target.value)} />
          ) : (
            <>
              <input className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2" placeholder="Account name" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2" placeholder="Account number" value={acc} onChange={(e) => setAcc(e.target.value)} />
              <input className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2" placeholder="IFSC" value={ifsc} onChange={(e) => setIfsc(e.target.value)} />
            </>
          )}
          <button
            className="battle-btn w-full"
            disabled={req.isPending || amt <= 0 || amt > bal || (method === "upi" ? !upi : !acc || !ifsc || !name)}
            onClick={() => req.mutate()}
          >
            {req.isPending ? "Submitting…" : "Confirm withdrawal"}
          </button>
        </div>
      )}

      <div className="battle-glass p-5">
        <h2 className="mb-3 text-xs uppercase tracking-widest text-white/60">Withdrawal requests</h2>
        {(wr.data ?? []).length === 0 ? (
          <p className="text-sm text-white/50">No requests yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {(wr.data ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                <div>
                  <div className="font-medium">🪙{Number(r.amount).toFixed(2)} TC · {r.method.toUpperCase()}</div>
                  <div className="text-xs text-white/50">
                    {r.status === "pending"
                      ? `Processes at ${new Date(r.process_after).toLocaleTimeString()}`
                      : `${r.status} · ${r.processed_at ? new Date(r.processed_at).toLocaleString() : ""}`}
                  </div>
                </div>
                <span className={`text-xs uppercase ${r.status === "processed" ? "text-emerald-300" : r.status === "failed" ? "text-red-300" : "text-amber-300"}`}>{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="battle-glass p-5">
        <h2 className="mb-3 text-xs uppercase tracking-widest text-white/60">Recent transactions</h2>
        {(w.data?.transactions ?? []).length === 0 ? (
          <p className="text-sm text-white/50">No activity yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {(w.data?.transactions ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                <div>
                  <div className="font-medium">{t.note ?? t.category}</div>
                  <div className="text-xs text-white/50">{new Date(t.created_at).toLocaleString()}</div>
                </div>
                <span className={t.type === "credit" ? "text-emerald-300" : "text-red-300"}>
                  {t.type === "credit" ? "+" : "−"}🪙{Number(t.amount).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
