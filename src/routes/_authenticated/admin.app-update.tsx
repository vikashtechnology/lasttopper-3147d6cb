import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus } from "lucide-react";
import { failMessage } from "@/lib/friendly-error";
import {
  adminListReleases,
  adminSaveRelease,
  adminDeleteRelease,
  type AppRelease,
} from "@/lib/app-release.functions";

type ReleaseInput = {
  id?: string;
  version: string;
  version_code: number;
  download_url: string;
  notes: string;
  mandatory: boolean;
  is_active: boolean;
};

export const Route = createFileRoute("/_authenticated/admin/app-update")({
  head: () => ({
    meta: [
      { title: "App Update — Admin — Last Topper" },
      { name: "description", content: "Publish a new app version and download link for users." },
      { property: "og:title", content: "App Update — Admin" },
      { property: "og:description", content: "Push app update notices to every user." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAppUpdate,
});

function AdminAppUpdate() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-app-releases"], queryFn: () => adminListReleases() });

  const [version, setVersion] = useState("");
  const [code, setCode] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [mandatory, setMandatory] = useState(false);

  const save = useMutation({
    mutationFn: (row: ReleaseInput) => adminSaveRelease({ data: row }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["admin-app-releases"] });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminDeleteRelease({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["admin-app-releases"] });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  function publish() {
    const versionCode = Number(code);
    if (!version.trim() || !versionCode || !url.trim()) {
      toast.error("Version, version code and download link are required.");
      return;
    }
    save.mutate(
      {
        version: version.trim(),
        version_code: versionCode,
        download_url: url.trim(),
        notes,
        mandatory,
        is_active: true,
      },
      {
        onSuccess: () => {
          setVersion("");
          setCode("");
          setUrl("");
          setNotes("");
          setMandatory(false);
        },
      },
    );
  }

  const rows = list.data ?? [];

  return (
    <section className="mx-auto max-w-3xl px-4 py-6">
      <h2 className="text-lg font-semibold">App update</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Publish a new version. Anyone running an older build of the Android/iOS app sees an update
        popup with your download link the next time they open it.
      </p>

      <div className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          <span className="text-sm font-medium">Publish a release</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Version name (e.g. 1.2.0)"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          />
          <Input
            placeholder="Version code (e.g. 3)"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <Input
          placeholder="Download URL (Play Store or APK link)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Textarea
          placeholder="What's new (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={mandatory} onCheckedChange={setMandatory} />
            Force update (users can't dismiss)
          </label>
          <Button onClick={publish} disabled={save.isPending}>
            Publish
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {list.isLoading ? <div className="text-sm">Loading…</div> : null}
        {rows.map((r: AppRelease) => (
          <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  v{r.version}{" "}
                  <span className="text-muted-foreground">(code {r.version_code})</span>
                </div>
                <a
                  href={r.download_url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-xs text-primary underline"
                >
                  {r.download_url}
                </a>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs">
                  <Switch
                    checked={r.is_active}
                    onCheckedChange={(v) =>
                      save.mutate({
                        id: r.id,
                        version: r.version,
                        version_code: r.version_code,
                        download_url: r.download_url,
                        notes: r.notes ?? "",
                        mandatory: r.mandatory,
                        is_active: v,
                      })
                    }
                  />
                  Live
                </label>
                <button
                  className="rounded p-2 text-destructive"
                  onClick={() => remove.mutate(r.id)}
                  aria-label="Delete release"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {r.notes ? (
              <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">{r.notes}</p>
            ) : null}
            {r.mandatory ? (
              <div className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                Forced update
              </div>
            ) : null}
          </div>
        ))}
        {!list.isLoading && rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No releases published yet.</div>
        ) : null}
      </div>
    </section>
  );
}
