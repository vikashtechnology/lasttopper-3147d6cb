import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wallet, ArrowDownToLine, Plus, Gift, Copy, Share2 } from "lucide-react";
import { TopperCoin } from "@/components/TopperCoin";
import { supabase } from "@/integrations/supabase/client";
import { getWallet, requestWithdrawal, getWithdrawals } from "@/lib/battle.functions";
import { getMyProfile } from "@/lib/user.functions";
import { getMyReferral, applyReferralCode } from "@/lib/referral.functions";
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
  const ref = useQuery({ queryKey: ["referral"], queryFn: () => getMyReferral() });
  const [topupAmt, setTopupAmt] = useState<number>(100);
  const [topupLoading, setTopupLoading] = useState(false);
  const [showTopup, setShowTopup] = useState(false);
  const [codeInput, setCodeInput] = useState("");

  const applyRef = useMutation({
    mutationFn: (code: string) => applyReferralCode({ data: { code } }),
    onSuccess: () => {
      toast.success("Referral applied — top up to reward your friend!");
      setCodeInput("");
      qc.invalidateQueries({ queryKey: ["referral"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const shareCode = async () => {
    const code = ref.data?.code;
    if (!code) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const text = `Join me on Last Topper — use my code ${code} at signup and I earn 5 TC (Mega Test only) on your first wallet top-up. ${origin}`;
    const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
    try {
      if (nav.share) {
        await nav.share({ text });
      } else {
        await nav.clipboard.writeText(text);
        toast.success("Copied invite link");
      }
    } catch {
      /* user cancelled */
    }
  };

  const copyCode = async () => {
    const code = ref.data?.code;
    if (!code) return;
    await (navigator as Navigator).clipboard.writeText(code);
    toast.success("Code copied");
  };

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
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_transactions" },
        () => {
          qc.invalidateQueries({ queryKey: ["wallet"] });
          qc.invalidateQueries({ queryKey: ["referral"] });
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests" },
        () => {
          qc.invalidateQueries({ queryKey: ["withdrawals"] });
          qc.invalidateQueries({ queryKey: ["wallet"] });
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "users" },
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
  const [bankName, setBankName] = useState("");

  const req = useMutation({
    mutationFn: () => requestWithdrawal({
      data: {
        amount: amt, method,
        upi_id: method === "upi" ? upi : undefined,
        account_name: method === "bank" ? name : undefined,
        account_number: method === "bank" ? acc : undefined,
        ifsc: method === "bank" ? ifsc : undefined,
        bank_name: method === "bank" ? bankName : undefined,
      },
    }),
    onSuccess: () => {
      toast.success("Withdrawal requested — processes in 20 min");
      setShowForm(false);
      setAmt(0); setUpi(""); setAcc(""); setIfsc(""); setName(""); setBankName("");
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
          <span className="text-xs uppercase tracking-widest">Topper Coin balance</span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="battle-title inline-flex items-center gap-1.5 text-4xl"><TopperCoin size={32} />{bal.toFixed(2)} TC</span>
          <span className="text-xs text-white/50">1 TC = ₹1</span>
        </div>
        {(ref.data?.mega_credits ?? 0) > 0 && (
          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-fuchsia-400/10 px-2 py-0.5 text-[11px] text-fuchsia-200">
            <Gift className="h-3 w-3" /> <TopperCoin size={12} />{ref.data?.mega_credits} referral credits · Mega Test only
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-xl border border-cyan-500/60 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-700 dark:text-cyan-100 inline-flex items-center gap-1.5"
            onClick={() => setShowTopup(true)}
          >
            <Plus className="h-4 w-4" /> Add money
          </button>
          <button
            className="rounded-xl border border-border bg-background/60 px-4 py-2 text-sm text-foreground inline-flex items-center gap-1.5"
            onClick={() => setShowForm(true)}
          >
            <ArrowDownToLine className="h-4 w-4" /> Withdraw
          </button>
        </div>
      </div>

      <div className="battle-glass p-3 space-y-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Gift className="h-3.5 w-3.5" />
          <span className="text-[10px] uppercase tracking-widest">Refer & earn — 5 TC per friend</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          Friend signs up + first top-up → you get <TopperCoin size={10} className="inline" /> 5 TC (Mega Test only).
        </p>

        {ref.data?.code && (
          <div className="flex items-center gap-1.5">
            <code className="flex-1 rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-xs tracking-widest">
              {ref.data.code}
            </code>
            <button onClick={copyCode} className="rounded-md border border-border p-1.5" aria-label="Copy code">
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button onClick={shareCode} className="rounded-md border border-border p-1.5" aria-label="Share">
              <Share2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex gap-3 text-[11px] text-muted-foreground">
          <span>Invited: <b className="text-foreground">{ref.data?.invited ?? 0}</b></span>
          <span>Converted: <b className="text-foreground">{ref.data?.converted ?? 0}</b></span>
        </div>
        {!ref.data?.referred_by && (
          <div className="flex items-center gap-1.5 border-t border-border pt-2">
            <input
              className="flex-1 rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-xs uppercase tracking-widest"
              placeholder="Have a code?"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              maxLength={16}
            />
            <button
              className="rounded-md border border-cyan-500/60 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-700 dark:text-cyan-100"
              disabled={applyRef.isPending || codeInput.length < 4}
              onClick={() => applyRef.mutate(codeInput)}
            >
              Apply
            </button>
          </div>
        )}
      </div>


      {showTopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => !topupLoading && setShowTopup(false)}
        >
          <div
            className="battle-modal w-full max-w-md p-5 space-y-3 text-sm animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Add money via Razorpay</div>
              <button
                onClick={() => !topupLoading && setShowTopup(false)}
                className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground"
                aria-label="Close"
              >✕</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {[50, 100, 200, 500].map((v) => (
                <button
                  key={v}
                  onClick={() => setTopupAmt(v)}
                  className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs ${topupAmt === v ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-700 dark:text-cyan-100" : "border-border"}`}
                ><TopperCoin size={12} />{v}</button>
              ))}
            </div>
            <input
              className="w-full rounded-lg border border-border bg-background/60 px-3 py-2"
              type="number" min={10} max={5000} placeholder="Amount (Topper Coins)"
              value={topupAmt || ""} onChange={(e) => setTopupAmt(Number(e.target.value))}
            />
            <button className="battle-btn w-full" disabled={topupLoading} onClick={topup}>
              {topupLoading ? "Opening checkout…" : (
                <span className="inline-flex items-center gap-1">Pay ₹{topupAmt} · get <TopperCoin size={14} />{topupAmt} TC</span>
              )}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => !req.isPending && setShowForm(false)}
        >
          <div
            className="battle-modal w-full max-w-md p-5 space-y-3 text-sm animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Withdraw to {method.toUpperCase()}</div>
              <button
                onClick={() => !req.isPending && setShowForm(false)}
                className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground"
                aria-label="Close"
              >✕</button>
            </div>
            <div className="flex gap-2">
              <button
                className={`flex-1 rounded-lg border p-2 ${method === "upi" ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-700 dark:text-cyan-100" : "border-border"}`}
                onClick={() => setMethod("upi")}
              >UPI</button>
              <button
                className={`flex-1 rounded-lg border p-2 ${method === "bank" ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-700 dark:text-cyan-100" : "border-border"}`}
                onClick={() => setMethod("bank")}
              >Bank</button>
            </div>
            <input
              className="w-full rounded-lg border border-border bg-background/60 px-3 py-2"
              type="number" min={1} max={bal} placeholder="Amount (Topper Coins)"
              value={amt || ""} onChange={(e) => setAmt(Number(e.target.value))}
            />
            {method === "upi" ? (
              <input className="w-full rounded-lg border border-border bg-background/60 px-3 py-2" placeholder="you@upi" value={upi} onChange={(e) => setUpi(e.target.value)} />
            ) : (
              <>
                <select
                  className="w-full rounded-lg border border-border bg-background/60 px-3 py-2"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                >
                  <option value="">Select bank</option>
                  {[
                    "State Bank of India","HDFC Bank","ICICI Bank","Axis Bank","Kotak Mahindra Bank",
                    "Punjab National Bank","Bank of Baroda","Canara Bank","Union Bank of India","Bank of India",
                    "IndusInd Bank","Yes Bank","IDFC First Bank","IDBI Bank","Federal Bank",
                    "RBL Bank","Central Bank of India","Indian Bank","Indian Overseas Bank","UCO Bank",
                    "Bank of Maharashtra","Karnataka Bank","South Indian Bank","City Union Bank","AU Small Finance Bank",
                    "Bandhan Bank","DCB Bank","Jammu & Kashmir Bank","Karur Vysya Bank","Tamilnad Mercantile Bank",
                    "Paytm Payments Bank","Airtel Payments Bank","India Post Payments Bank",
                  ].map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                  <option value="Other">Other</option>
                </select>
                <input className="w-full rounded-lg border border-border bg-background/60 px-3 py-2" placeholder="Account holder name" value={name} onChange={(e) => setName(e.target.value)} />
                <input className="w-full rounded-lg border border-border bg-background/60 px-3 py-2" placeholder="Account number" value={acc} onChange={(e) => setAcc(e.target.value)} />
                <input className="w-full rounded-lg border border-border bg-background/60 px-3 py-2" placeholder="IFSC" value={ifsc} onChange={(e) => setIfsc(e.target.value)} />
              </>
            )}
            <button
              className="battle-btn w-full"
              disabled={req.isPending || amt <= 0 || amt > bal || (method === "upi" ? !upi : !acc || !ifsc || !name || !bankName)}
              onClick={() => req.mutate()}
            >
              {req.isPending ? "Submitting…" : "Confirm withdrawal"}
            </button>
          </div>
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
                  <div className="inline-flex items-center gap-1 font-medium"><TopperCoin size={14} />{Number(r.amount).toFixed(2)} TC · {r.method.toUpperCase()}</div>
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
                <span className={`inline-flex items-center gap-0.5 ${t.type === "credit" ? "text-emerald-300" : "text-red-300"}`}>
                  {t.type === "credit" ? "+" : "−"}<TopperCoin size={12} />{Number(t.amount).toFixed(2)}

                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="mt-4 flex items-center justify-center gap-4 pb-6 text-xs text-white/50">
        <Link to="/terms" className="hover:text-white/80 hover:underline">Terms</Link>
        <span aria-hidden>•</span>
        <Link to="/privacy" className="hover:text-white/80 hover:underline">Privacy Policy</Link>
        <span aria-hidden>•</span>
        <Link to="/refund" className="hover:text-white/80 hover:underline">Refund Policy</Link>
      </footer>
    </div>
  );
}
