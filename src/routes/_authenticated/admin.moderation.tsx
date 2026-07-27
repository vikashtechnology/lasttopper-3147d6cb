import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminListReports, adminResolveReport } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2, X } from "lucide-react";
import { failMessage } from "@/lib/friendly-error";

export const Route = createFileRoute("/_authenticated/admin/moderation")({
  component: AdminModeration,
});

function AdminModeration() {
  const qc = useQueryClient();
  const reports = useQuery({ queryKey: ["admin-reports"], queryFn: () => adminListReports() });

  const resolve = useMutation({
    mutationFn: (v: { report_id: string; action: "dismiss" | "delete_content" }) => adminResolveReport({ data: v }),
    onSuccess: () => { toast.success("Done"); qc.invalidateQueries({ queryKey: ["admin-reports"] }); },
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  return (
    <section className="mx-auto max-w-4xl px-4 py-6">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Pending reports</h2>
      <div className="space-y-2">
        {reports.data?.map((r) => (
          <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="text-sm">
              <span className="font-medium">{r.target_type}</span>
              <span className="ml-2 text-muted-foreground">{r.target_id}</span>
            </div>
            <div className="mt-1 text-sm">Reason: {r.reason}</div>
            {r.message && <div className="text-xs text-muted-foreground">{r.message}</div>}
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => resolve.mutate({ report_id: r.id, action: "delete_content" })}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />Delete content
              </Button>
              <Button size="sm" variant="outline" onClick={() => resolve.mutate({ report_id: r.id, action: "dismiss" })}>
                <X className="mr-1 h-3.5 w-3.5" />Dismiss
              </Button>
            </div>
          </div>
        ))}
        {reports.data && reports.data.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No pending reports.
          </div>
        )}
      </div>
    </section>
  );
}
