import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listDoubts,
  createDoubt,
  createDoubtImageUploadUrl,
  getDoubtImageUrl,
} from "@/lib/community.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, ArrowUp, MessageCircle, CheckCircle2, ImagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { failMessage } from "@/lib/friendly-error";

export const Route = createFileRoute("/_authenticated/community/doubts")({
  component: DoubtsList,
});

function DoubtsList() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const doubts = useQuery({ queryKey: ["doubts", q], queryFn: () => listDoubts({ data: { q } }) });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const signed = await createDoubtImageUploadUrl({ data: { ext } });
      const { error } = await supabase.storage
        .from("doubt-images")
        .uploadToSignedUrl(signed.path, signed.token, file);
      if (error) throw error;
      setImagePath(signed.path);
      toast.success("Image attached");
    } catch (e) {
      toast.error(failMessage(e, "Upload failed"));
    } finally {
      setUploading(false);
    }
  }

  const create = useMutation({
    mutationFn: async () => {
      let image_url: string | undefined;
      if (imagePath) {
        const s = await getDoubtImageUrl({ data: { path: imagePath } });
        image_url = s.url;
      }
      return createDoubt({ data: { title, body, image_url } });
    },
    onSuccess: () => {
      toast.success("Doubt posted");
      setOpen(false);
      setTitle("");
      setBody("");
      setImagePath(null);
      qc.invalidateQueries({ queryKey: ["doubts"] });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  return (
    <section className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <Input
          placeholder="Search doubts…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1"
        />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              Ask
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ask a doubt</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
              <Textarea
                placeholder="Describe your doubt…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={4000}
                rows={6}
              />
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground hover:bg-muted/50">
                <ImagePlus className="h-4 w-4" />
                <span>
                  {imagePath
                    ? "Image attached ✓"
                    : uploading
                      ? "Uploading…"
                      : "Attach image (optional)"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                  }}
                />
              </label>
              <Button
                className="w-full"
                onClick={() => create.mutate()}
                disabled={create.isPending || title.length < 4 || body.length < 4}
              >
                {create.isPending ? "Posting…" : "Post doubt"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-2">
        {doubts.data?.map((d) => (
          <Link
            key={d.id}
            to="/community/doubt/$doubtId"
            params={{ doubtId: d.id }}
            className="block rounded-2xl border border-border bg-card p-4 hover:bg-muted/50"
          >
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{d.title}</div>
                  {d.resolved && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                </div>
                <div className="line-clamp-2 text-sm text-muted-foreground">{d.body}</div>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  {d.author?.full_name && <span>{d.author.full_name}</span>}
                  <span className="inline-flex items-center gap-1">
                    <ArrowUp className="h-3 w-3" />
                    {d.upvote_count}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" />
                    {d.reply_count}
                  </span>
                </div>
              </div>
              {d.image_url && (
                <img src={d.image_url} alt="" className="h-16 w-16 rounded-lg object-cover" />
              )}
            </div>
          </Link>
        ))}
        {doubts.data && doubts.data.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No doubts yet.
          </div>
        )}
      </div>
    </section>
  );
}
