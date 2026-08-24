import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Latex } from "@/components/Latex";
import { explainStepByStep } from "@/lib/chatbot.functions";
import { getMyProfile } from "@/lib/user.functions";
import { failMessage } from "@/lib/friendly-error";

type Q = {
  question: string;
  options: Record<string, string>;
  correct: string;
};

/** Pro-only deep worked solution for a single question. Locked for free users. */
export function ProSolution({ question }: { question: Q }) {
  const nav = useNavigate();
  const [solution, setSolution] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => getMyProfile() });
  const isPro = !!(profile.data as { is_pro?: boolean } | undefined)?.is_pro;

  const ask = useMutation({
    mutationFn: () =>
      explainStepByStep({
        data: { question: question.question, options: question.options, correct: question.correct },
      }),
    onSuccess: (r) => {
      setError(null);
      setSolution(r.solution);
    },
    onError: (e) => setError(failMessage(e)),
  });

  if (!isPro) {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-400/5 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 text-amber-500" />
          Full AI step-by-step solution is a Pro feature.
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => nav({ to: "/pricing" })}
        >
          <Sparkles className="mr-1 h-3.5 w-3.5" /> Go Pro
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      {solution ? (
        <div className="rounded-lg border bg-card p-3 text-sm">
          <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
            <Sparkles className="h-3.5 w-3.5" /> Topper AI solution
          </div>
          <Latex className="block whitespace-pre-wrap leading-relaxed">{solution}</Latex>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={ask.isPending}
          onClick={() => ask.mutate()}
        >
          {ask.isPending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-3.5 w-3.5" />
          )}
          {ask.isPending ? "Solving…" : "AI step-by-step solution"}
        </Button>
      )}
      {error ? <div className="mt-2 text-xs text-red-500">{error}</div> : null}
    </div>
  );
}
