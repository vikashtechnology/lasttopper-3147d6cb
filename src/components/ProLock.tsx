import { useNavigate } from "@tanstack/react-router";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Locked Pro feature card shown to free users. */
export function ProLock({
  title,
  body,
  className = "",
}: {
  title: string;
  body: string;
  className?: string;
}) {
  const nav = useNavigate();
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-400/10 to-transparent p-5 text-center ${className}`}
    >
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-amber-500/15 text-amber-500">
        <Lock className="h-5 w-5" />
      </div>
      <div className="mt-3 text-sm font-semibold">{title}</div>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{body}</p>
      <Button size="sm" className="mt-3" onClick={() => nav({ to: "/pricing" })}>
        <Sparkles className="mr-1 h-3.5 w-3.5" /> Unlock with Pro
      </Button>
    </div>
  );
}

/** Small gold "PRO" chip. */
export function ProChip({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400/25 to-amber-500/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 ${className}`}
    >
      <Sparkles className="h-3 w-3" /> Pro
    </span>
  );
}
