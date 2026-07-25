import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Check } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: string;
  reason?: string;
};

export function ProUpgradeDialog({ open, onOpenChange, title, reason }: Props) {
  const nav = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/20 to-amber-500/20 text-amber-500">
            <Sparkles className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center">{title ?? "Upgrade to Pro"}</DialogTitle>
          <DialogDescription className="text-center">
            {reason ?? "You've hit today's free limit. Go Pro to keep practicing."}
          </DialogDescription>
        </DialogHeader>
        <ul className="mt-2 space-y-2 text-sm">
          {[
            "Up to 100 questions per set",
            "Higher daily quota",
            "Priority AI generation",
            "Cancel anytime",
          ].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-500" /> {f}
            </li>
          ))}
        </ul>
        <DialogFooter className="mt-4 gap-2 sm:justify-center">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Not now</Button>
          <Button onClick={() => { onOpenChange(false); nav({ to: "/pricing" }); }}>
            <Sparkles className="mr-2 h-4 w-4" /> See Pro plans
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
