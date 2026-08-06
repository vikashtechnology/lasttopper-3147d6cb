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
  const settings = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.from("admin_settings").select("*");
      return data || [];
    }
  });
  const [newPlatform, setNewPlatform] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const waStatus = settings.data?.find(s => s.key === "whatsapp_ai_enabled");

  const toggleWA = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase
        .from("admin_settings")
        .upsert({ key: "whatsapp_ai_enabled", value: String(enabled), updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("WhatsApp Automation updated");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });



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
        <div className="mt-1 space-y-1">
          <p className="text-sm text-muted-foreground">
            Automation not working configure this as anyone message the reply like telegram bot
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">Status:</span>
              <span className={waStatus?.value === 'true' ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                {waStatus?.value === 'true' ? 'Enabled' : 'Disabled'}
              </span>
              {waStatus?.updated_at && (
                <span className="text-xs text-muted-foreground italic">
                  (Last updated: {new Date(waStatus.updated_at).toLocaleString()})
                </span>
              )}
            </div>
            <Switch
              checked={waStatus?.value === 'true'}
              onCheckedChange={(v) => toggleWA.mutate(v)}
              disabled={toggleWA.isPending}
            />
          </div>
        </div>
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
