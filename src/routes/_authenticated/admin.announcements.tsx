import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminBroadcast, adminListAnnouncements } from "@/lib/admin.functions";
import { Megaphone, Send, Loader2 } from "lucide-react";
import { failMessage } from "@/lib/friendly-error";

export const Route = createFileRoute("/_authenticated/admin/announcements")({
  component: AdminAnnouncements,
});

function AdminAnnouncements() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [audience, setAudience] = useState<"all" | "pro" | "free">("all");
  const [msg, setMsg] = useState<string | null>(null);

  const history = useQuery({ queryKey: ["admin-announcements"], queryFn: () => adminListAnnouncements() });

  const send = useMutation({
    mutationFn: () => adminBroadcast({ data: { title, body, link, audience } }),
    onSuccess: (r) => {
      setMsg(`Sent to ${r.sent} user${r.sent === 1 ? "" : "s"}.`);
      setTitle("");
      setBody("");
      setLink("");
      void qc.invalidateQueries({ queryKey: ["admin-announcements"] });
    },
    onError: (e: Error) => setMsg(failMessage(e)),
  });

  const disabled = title.trim().length < 3 || send.isPending;

  return (
    <section className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Megaphone className="h-4 w-4 text-primary" /> Send announcement
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Delivered to every user's notifications (and as a device alert if the app is open).
        </p>

        <div className="mt-4 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Title (e.g. Mega Test this Sunday 10 AM!)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="Message (optional)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Link (optional, e.g. /battle/mega)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "pro", "free"] as const).map((a) => (
              <button
                key={a}
                onClick={() => setAudience(a)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  audience === a ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {a === "all" ? "All users" : a === "pro" ? "Pro only" : "Free only"}
              </button>
            ))}
          </div>
          <button
            disabled={disabled}
            onClick={() => { setMsg(null); send.mutate(); }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send announcement
          </button>
          {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Recent announcements</h2>
        {history.isLoading && <p className="mt-2 text-xs text-muted-foreground">Loading…</p>}
        {!history.isLoading && !(history.data ?? []).length && (
          <p className="mt-2 text-xs text-muted-foreground">Nothing sent yet.</p>
        )}
        <ul className="mt-3 space-y-3">
          {(history.data ?? []).map((a, i) => (
            <li key={i} className="rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium">{a.title}</div>
                <div className="whitespace-nowrap text-[11px] text-muted-foreground">
                  {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
              {a.body && <p className="mt-1 text-xs text-muted-foreground">{a.body}</p>}
              <div className="mt-1 text-[11px] text-muted-foreground">{a.count} recipients</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
