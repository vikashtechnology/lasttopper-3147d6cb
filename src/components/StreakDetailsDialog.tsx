import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getStreakDetails } from "@/lib/user.functions";
import { Flame, Trophy, CalendarClock } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fallbackStreak?: number;
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function StreakDetailsDialog({ open, onOpenChange, fallbackStreak = 0 }: Props) {
  const q = useQuery({
    queryKey: ["streak-details"],
    queryFn: () => getStreakDetails(),
    enabled: open,
  });

  const current = q.data?.streak ?? fallbackStreak;
  const best = q.data?.best_streak ?? fallbackStreak;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-500">
            <Flame className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center">Your streak</DialogTitle>
          <DialogDescription className="text-center">
            Practice every day to keep the flame alive.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="mantis-card p-4 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <Flame className="h-3.5 w-3.5" /> Current
            </div>
            <div className="mt-1 text-2xl font-bold">{current}</div>
            <div className="text-xs text-muted-foreground">days</div>
          </div>
          <div className="mantis-card p-4 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <Trophy className="h-3.5 w-3.5" /> Best
            </div>
            <div className="mt-1 text-2xl font-bold">{best}</div>
            <div className="text-xs text-muted-foreground">days</div>
          </div>
        </div>

        <div className="mt-1 space-y-2 text-sm">
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
            <span className="flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="h-4 w-4" /> Last streak day
            </span>
            <span className="font-medium">
              {q.isLoading ? "…" : fmtDate(q.data?.last_streak_date ?? null)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
            <span className="flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="h-4 w-4" /> Last activity
            </span>
            <span className="font-medium">
              {q.isLoading ? "…" : fmtDate(q.data?.last_active_date ?? null)}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
