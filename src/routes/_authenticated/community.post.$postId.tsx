import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getForumPost, replyToPost, voteOnTarget, reportContent } from "@/lib/community.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, ArrowDown, Flag, MessageCircle } from "lucide-react";
import { useEffect } from "react";
import { failMessage } from "@/lib/friendly-error";

export const Route = createFileRoute("/_authenticated/community/post/$postId")({
  component: PostDetail,
});

function PostDetail() {
  const { postId } = useParams({ from: "/_authenticated/community/post/$postId" });
  const qc = useQueryClient();
  const post = useQuery({
    queryKey: ["forum-post", postId],
    queryFn: () => getForumPost({ data: { post_id: postId } }),
    refetchInterval: 15_000,
  });

  const [body, setBody] = useState("");
  const reply = useMutation({
    mutationFn: () => replyToPost({ data: { post_id: postId, body } }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["forum-post", postId] });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  const vote = useMutation({
    mutationFn: (v: { target_type: "post" | "reply"; target_id: string; value: 1 | -1 | 0 }) =>
      voteOnTarget({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forum-post", postId] }),
  });

  const flag = useMutation({
    mutationFn: (payload: { target_type: "forum_post" | "forum_reply"; target_id: string }) =>
      reportContent({ data: { ...payload, reason: "Reported by user" } }),
    onSuccess: () => toast.success("Reported. Admins notified."),
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  if (post.isLoading) return <div className="p-6 text-sm">Loading…</div>;
  if (!post.data?.post) return <div className="p-6 text-sm">Post not found.</div>;

  const p = post.data.post;

  return (
    <section className="mx-auto max-w-3xl px-4 py-6">
      <article className="rounded-2xl border border-border bg-card p-5">
        <h1 className="text-xl font-semibold">{p.title}</h1>
        {p.author?.id && (
          <Link
            to="/profile/$userId"
            params={{ userId: p.author.id }}
            className="mt-1 block text-xs text-muted-foreground hover:underline"
          >
            by {p.author.full_name ?? "Anon"}
          </Link>
        )}
        <div className="mt-3 whitespace-pre-wrap text-sm">{p.body}</div>
        <div className="mt-4 flex items-center gap-2">
          <Button
            size="sm"
            variant={post.data.my_vote === 1 ? "default" : "outline"}
            onClick={() =>
              vote.mutate({
                target_type: "post",
                target_id: p.id,
                value: post.data!.my_vote === 1 ? 0 : 1,
              })
            }
          >
            <ArrowUp className="h-4 w-4" />
            <span className="ml-1">{p.upvote_count}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => flag.mutate({ target_type: "forum_post", target_id: p.id })}
          >
            <Flag className="h-4 w-4" />
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">{p.view_count} views</span>
        </div>
      </article>

      <div className="mt-6 space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircle className="h-4 w-4" />
          {p.reply_count} replies
        </h2>
        {post.data.replies.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-card p-4">
            {r.author?.id && (
              <Link
                to="/profile/$userId"
                params={{ userId: r.author.id }}
                className="text-xs text-muted-foreground hover:underline"
              >
                {r.author.full_name ?? "Anon"} · rep {r.author.reputation ?? 0}
              </Link>
            )}
            <div className="mt-1 whitespace-pre-wrap text-sm">{r.body}</div>
            <div className="mt-2 flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => vote.mutate({ target_type: "reply", target_id: r.id, value: 1 })}
              >
                <ArrowUp className="h-4 w-4" />
                <span className="ml-1">{r.upvote_count}</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => flag.mutate({ target_type: "forum_reply", target_id: r.id })}
              >
                <Flag className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <Textarea
          placeholder="Write a reply…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={4000}
        />
        <Button
          className="mt-2"
          onClick={() => reply.mutate()}
          disabled={reply.isPending || body.trim().length < 1}
        >
          {reply.isPending ? "Posting…" : "Reply"}
        </Button>
      </div>
    </section>
  );
}
