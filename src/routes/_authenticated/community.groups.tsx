import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listStudyGroups, createStudyGroup, joinStudyGroup } from "@/lib/community.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, Plus, Lock } from "lucide-react";
import { failMessage } from "@/lib/friendly-error";

export const Route = createFileRoute("/_authenticated/community/groups")({
  component: GroupsList,
});

function GroupsList() {
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: ["study-groups"], queryFn: () => listStudyGroups() });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priv, setPriv] = useState(false);

  const create = useMutation({
    mutationFn: () => createStudyGroup({ data: { name, description: description || undefined, is_private: priv } }),
    onSuccess: () => {
      toast.success("Group created");
      setOpen(false); setName(""); setDescription(""); setPriv(false);
      qc.invalidateQueries({ queryKey: ["study-groups"] });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  const join = useMutation({
    mutationFn: (group_id: string) => joinStudyGroup({ data: { group_id } }),
    onSuccess: () => { toast.success("Joined"); qc.invalidateQueries({ queryKey: ["study-groups"] }); },
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  return (
    <section className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Study Groups</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" />New group</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create study group</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
              <Textarea placeholder="What is this group about?" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} />
              <div className="flex items-center justify-between">
                <Label htmlFor="priv" className="text-sm">Private (invite only)</Label>
                <Switch id="priv" checked={priv} onCheckedChange={setPriv} />
              </div>
              <Button className="w-full" onClick={() => create.mutate()} disabled={create.isPending || name.length < 3}>
                {create.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-2">
        {groups.data?.map((g) => (
          <div key={g.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <Users className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="font-medium">{g.name}</div>
                {g.is_private && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
              {g.description && <div className="text-xs text-muted-foreground">{g.description}</div>}
              <div className="mt-1 text-xs text-muted-foreground">{g.member_count} member{g.member_count !== 1 ? "s" : ""}</div>
            </div>
            <div className="flex gap-2">
              <Link to="/community/group/$groupId" params={{ groupId: g.id }}>
                <Button size="sm" variant="outline">Open</Button>
              </Link>
              {!g.is_private && (
                <Button size="sm" onClick={() => join.mutate(g.id)} disabled={join.isPending}>Join</Button>
              )}
            </div>
          </div>
        ))}
        {groups.data && groups.data.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No groups yet. Create the first!
          </div>
        )}
      </div>
    </section>
  );
}
