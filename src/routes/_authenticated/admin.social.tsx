import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus } from "lucide-react";
import { failMessage } from "@/lib/friendly-error";
import {
  adminListSocialLinks,
  adminSaveSocialLink,
  adminDeleteSocialLink,
  type SocialLink,
} from "@/lib/social.functions";
import { socialIcon } from "@/components/SocialLinks";

export const Route = createFileRoute("/_authenticated/admin/social")({
  head: () => ({
    meta: [
      { title: "Social Links — Admin — Last Topper" },
      { name: "description", content: "Configure YouTube, Telegram, Discord and other social links." },
      { property: "og:title", content: "Social Links — Admin" },
      { property: "og:description", content: "Manage the app's social media links." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminSocial,
});

function AdminSocial() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-social-links"], queryFn: () => adminListSocialLinks() });
  const [newPlatform, setNewPlatform] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const save = useMutation({
    mutationFn: (row: {
      id?: string;
      platform: string;
      label: string;
      url: string;
      enabled: boolean;
      display_order: number;
    }) => adminSaveSocialLink({ data: row }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["admin-social-links"] });
      qc.invalidateQueries({ queryKey: ["social-links"] });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminDeleteSocialLink({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["admin-social-links"] });
      qc.invalidateQueries({ queryKey: ["social-links"] });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  const rows = list.data ?? [];

  return (
    <section className="mx-auto max-w-3xl space-y-8 px-4 py-6">
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <h2 className="text-base font-semibold text-primary">WhatsApp Automation</h2>
        <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
          For the code present, I get the error below.
          {"\n\n"}
          Please think step-by-step in order to resolve it.
          {"\n"}
          <code>
            Production build error: build failed with exit status 1: Build failed with 1 error:
            {"\n\n"}
            [plugin tanstack-start:route-tree-client-plugin]
            {"\n"}
            Error: Conflicting configuration paths were found for the following routes: "/admin/social", "/admin/social".
            {"\n"}
            Please ensure each Route has a unique full path.
            {"\n"}
            Conflicting files: 
            {"\n"}
            {" /dev-server/src/routes/_authenticated/admin.social.tsx"}
            {"\n"}
            {" /dev-server/src/routes/_authenticated/admin.social.js"}
          </code>
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Social links</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add your channel links and turn them on. Enabled links show in the sidebar “Follow us” menu and at the bottom of
          user profiles.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {list.isLoading ? <div className="text-sm">Loading…</div> : null}
        {rows.map((row: SocialLink) => (
          <LinkRow
            key={row.id}
            row={row}
            onSave={(patch) => save.mutate({ ...row, ...patch })}
            onDelete={() => remove.mutate(row.id)}
          />
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-border p-4">
        <div className="mb-2 text-sm font-medium">Add another platform</div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input placeholder="key (e.g. threads)" value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)} />
          <Input placeholder="Label (e.g. Threads)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <Input placeholder="https://…" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
        </div>
        <Button
          className="mt-3"
          size="sm"
          onClick={() => {
            if (!newPlatform.trim() || !newLabel.trim()) {
              toast.error("Key and label are required");
              return;
            }
            save.mutate({
              platform: newPlatform.trim().toLowerCase(),
              label: newLabel.trim(),
              url: newUrl.trim(),
              enabled: false,
              display_order: rows.length + 1,
            });
            setNewPlatform("");
            setNewLabel("");
            setNewUrl("");
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add
        </Button>
      </div>
    </section>
  );
}

function LinkRow({
  row,
  onSave,
  onDelete,
}: {
  row: SocialLink;
  onSave: (patch: Partial<SocialLink>) => void;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState(row.url);

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted">{socialIcon(row.platform)}</span>
        <div className="text-sm font-medium">{row.label}</div>
        <div className="ml-auto flex items-center gap-2">
          <Switch
            checked={row.enabled}
            onCheckedChange={(v) => onSave({ url: url.trim(), enabled: v })}
            aria-label={`Show ${row.label}`}
          />
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label={`Delete ${row.label}`}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <Input value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
        <Button size="sm" variant="outline" onClick={() => onSave({ url: url.trim() })}>
          Save
        </Button>
      </div>
    </div>
  );
}
