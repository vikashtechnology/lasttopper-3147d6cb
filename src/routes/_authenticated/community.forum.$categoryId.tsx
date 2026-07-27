import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listForumPosts, createForumPost } from "@/lib/community.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, ArrowUp, MessageCircle } from "lucide-react";
import { failMessage } from "@/lib/friendly-error";

export const Route = createFileRoute("/_authenticated/community/forum/$categoryId")({
  component: ForumCategory,
});

function ForumCategory() {
  const { categoryId } = useParams({ from: "/_authenticated/community/forum/$categoryId" });
  const qc = useQueryClient();
  const posts = useQuery({
    queryKey: ["forum-posts", categoryId],
    queryFn: () => listForumPosts({ data: { category_id: categoryId } }),
  });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const create = useMutation({
    mutationFn: () => createForumPost({ data: { category_id: categoryId, title, body } }),
    onSuccess: () => {
      toast.success("Post created");
      setOpen(false); setTitle(""); setBody("");
      qc.invalidateQueries({ queryKey: ["forum-posts", categoryId] });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  return (
    <section className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Posts</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" />New post</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create post</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
              <Textarea placeholder="What's on your mind?" value={body} onChange={(e) => setBody(e.target.value)} maxLength={8000} rows={8} />
              <Button className="w-full" onClick={() => create.mutate()} disabled={create.isPending || title.length < 4 || body.length < 4}>
                {create.isPending ? "Posting…" : "Post"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-2">
        {posts.data?.map((p) => (
          <Link key={p.id} to="/community/post/$postId" params={{ postId: p.id }}
            className="block rounded-2xl border border-border bg-card p-4 hover:bg-muted/50">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div className="font-medium">{p.title}</div>
            </div>
            <div className="line-clamp-2 text-sm text-muted-foreground">{p.body}</div>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              {p.author?.full_name && <span>{p.author.full_name}</span>}
              <span className="inline-flex items-center gap-1"><ArrowUp className="h-3 w-3" />{p.upvote_count}</span>
              <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" />{p.reply_count}</span>
            </div>
          </Link>
        ))}
        {posts.data && posts.data.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No posts yet. Be the first!
          </div>
        )}
      </div>
    </section>
  );
}
