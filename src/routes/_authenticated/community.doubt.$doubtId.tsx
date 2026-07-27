import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getDoubt, replyToDoubt, acceptDoubtReply, reportContent } from "@/lib/community.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Check, Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserStore } from "@/store/user";
import { failMessage } from "@/lib/friendly-error";

export const Route = createFileRoute("/_authenticated/community/doubt/$doubtId")({
  component: DoubtDetail,
});

function DoubtDetail() {
  const { doubtId } = useParams({ from: "/_authenticated/community/doubt/$doubtId" });
  const qc = useQueryClient();
  const myId = useUserStore((s) => s.profile?.id);
  const d = useQuery({ queryKey: ["doubt", doubtId], queryFn: () => getDoubt({ data: { doubt_id: doubtId } }) });

  useEffect(() => {
    const ch = supabase.channel(`doubt-${doubtId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "doubt_replies", filter: `doubt_id=eq.${doubtId}` },
        () => qc.invalidateQueries({ queryKey: ["doubt", doubtId] }))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [doubtId, qc]);

  const [body, setBody] = useState("");
  const reply = useMutation({
    mutationFn: () => replyToDoubt({ data: { doubt_id: doubtId, body } }),
    onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["doubt", doubtId] }); },
    onError: (e: Error) => toast.error(failMessage(e)),
  });
  const accept = useMutation({
    mutationFn: (reply_id: string) => acceptDoubtReply({ data: { reply_id } }),
    onSuccess: () => { toast.success("Marked as accepted (+10 rep)"); qc.invalidateQueries({ queryKey: ["doubt", doubtId] }); },
  });
  const flag = useMutation({
    mutationFn: (id: string) => reportContent({ data: { target_type: "doubt_reply", target_id: id, reason: "Reported" } }),
    onSuccess: () => toast.success("Reported"),
  });

  if (d.isLoading) return <div className="p-6 text-sm">Loading…</div>;
  if (!d.data?.doubt) return <div className="p-6 text-sm">Not found.</div>;
  const doubt = d.data.doubt;
  const isOwner = myId === doubt.user_id;

  return (
    <section className="mx-auto max-w-3xl px-4 py-6">
      <article className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{doubt.title}</h1>
          {doubt.resolved && <CheckCircle2 className="h-5 w-5 text-green-500" />}
        </div>
        {doubt.author?.id && (
          <Link to="/profile/$userId" params={{ userId: doubt.author.id }} className="mt-1 block text-xs text-muted-foreground hover:underline">
            by {doubt.author.full_name ?? "Anon"}
          </Link>
        )}
        <div className="mt-3 whitespace-pre-wrap text-sm">{doubt.body}</div>
        {doubt.image_url && (
          <img src={doubt.image_url} alt="" className="mt-3 max-h-96 rounded-lg border border-border" />
        )}
      </article>

      <div className="mt-6 space-y-3">
        <h2 className="text-sm font-semibold">{doubt.reply_count} answers</h2>
        {d.data.replies.map((r) => (
          <div key={r.id} className={`rounded-xl border p-4 ${r.is_accepted ? "border-green-500/60 bg-green-500/5" : "border-border bg-card"}`}>
            <div className="flex items-center justify-between">
              {r.author?.id ? (
                <Link to="/profile/$userId" params={{ userId: r.author.id }} className="text-xs text-muted-foreground hover:underline">
                  {r.author.full_name ?? "Anon"} · rep {r.author.reputation ?? 0}
                </Link>
              ) : <span className="text-xs text-muted-foreground">Anon</span>}
              {r.is_accepted && <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3 w-3" />Accepted</span>}
            </div>
            <div className="mt-2 whitespace-pre-wrap text-sm">{r.body}</div>
            {r.image_url && <img src={r.image_url} alt="" className="mt-2 max-h-72 rounded-md" />}
            <div className="mt-2 flex items-center gap-2">
              {isOwner && !r.is_accepted && (
                <Button size="sm" variant="outline" onClick={() => accept.mutate(r.id)}>
                  <Check className="mr-1 h-3.5 w-3.5" />Accept
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => flag.mutate(r.id)}>
                <Flag className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <Textarea placeholder="Write your answer…" value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={4000} />
        <Button className="mt-2" onClick={() => reply.mutate()} disabled={reply.isPending || body.trim().length < 1}>
          {reply.isPending ? "Posting…" : "Answer"}
        </Button>
      </div>
    </section>
  );
}
