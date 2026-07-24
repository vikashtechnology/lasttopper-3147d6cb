import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, ChevronRight } from "lucide-react";
import { listForumCategories } from "@/lib/community.functions";

export const Route = createFileRoute("/_authenticated/community/")({
  component: ForumHome,
});

function ForumHome() {
  const cats = useQuery({ queryKey: ["forum-cats"], queryFn: () => listForumCategories() });
  return (
    <section className="mx-auto max-w-4xl px-4 py-6">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Discussion Forums</h2>
      <div className="space-y-2">
        {cats.data?.map((c) => (
          <Link
            key={c.id}
            to="/community/forum/$categoryId"
            params={{ categoryId: c.id }}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:bg-muted/50"
          >
            <MessageSquare className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <div className="font-medium">{c.name}</div>
              {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
        {cats.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      </div>
    </section>
  );
}
