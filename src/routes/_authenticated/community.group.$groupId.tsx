import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getStudyGroup,
  listGroupMessages,
  sendGroupMessage,
  joinStudyGroup,
  leaveStudyGroup,
} from "@/lib/community.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Send, LogOut, LogIn } from "lucide-react";
import { failMessage } from "@/lib/friendly-error";

export const Route = createFileRoute("/_authenticated/community/group/$groupId")({
  component: GroupChat,
});

function GroupChat() {
  const { groupId } = useParams({ from: "/_authenticated/community/group/$groupId" });
  const qc = useQueryClient();
  const info = useQuery({
    queryKey: ["group", groupId],
    queryFn: () => getStudyGroup({ data: { group_id: groupId } }),
  });
  const msgs = useQuery({
    queryKey: ["group-msgs", groupId],
    queryFn: () => listGroupMessages({ data: { group_id: groupId } }),
    enabled: !!info.data?.is_member,
    refetchInterval: 10_000,
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs.data]);

  const [text, setText] = useState("");
  const send = useMutation({
    mutationFn: () => sendGroupMessage({ data: { group_id: groupId, body: text } }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["group-msgs", groupId] });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });
  const join = useMutation({
    mutationFn: () => joinStudyGroup({ data: { group_id: groupId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group", groupId] }),
  });
  const leave = useMutation({
    mutationFn: () => leaveStudyGroup({ data: { group_id: groupId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group", groupId] }),
  });

  if (info.isLoading) return <div className="p-6 text-sm">Loading…</div>;
  if (!info.data?.group) return <div className="p-6 text-sm">Group not found or private.</div>;
  const g = info.data.group;

  return (
    <section
      className="mx-auto flex max-w-4xl flex-col px-4 py-4"
      style={{ height: "calc(100vh - 120px)" }}
    >
      <div className="mb-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="font-semibold">{g.name}</div>
            <div className="text-xs text-muted-foreground">{info.data.members.length} members</div>
          </div>
          {info.data.is_member ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => leave.mutate()}
              disabled={leave.isPending}
            >
              <LogOut className="mr-1 h-3.5 w-3.5" />
              Leave
            </Button>
          ) : !g.is_private ? (
            <Button size="sm" onClick={() => join.mutate()} disabled={join.isPending}>
              <LogIn className="mr-1 h-3.5 w-3.5" />
              Join
            </Button>
          ) : null}
        </div>
        {g.description && <p className="mt-2 text-sm text-muted-foreground">{g.description}</p>}
      </div>

      {info.data.is_member ? (
        <>
          <div
            ref={scrollRef}
            className="flex-1 space-y-2 overflow-y-auto rounded-2xl border border-border bg-card p-4"
          >
            {msgs.data?.map((m) => (
              <div key={m.id} className="text-sm">
                <span className="font-medium">{m.author?.full_name ?? "Anon"}: </span>
                <span>{m.body}</span>
              </div>
            ))}
            {msgs.data && msgs.data.length === 0 && (
              <div className="text-center text-sm text-muted-foreground">
                No messages yet. Say hi 👋
              </div>
            )}
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) send.mutate();
            }}
          >
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message…"
              maxLength={2000}
            />
            <Button type="submit" disabled={send.isPending || !text.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Join this group to see messages.
        </div>
      )}
    </section>
  );
}
