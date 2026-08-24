import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminListWithdrawals, adminSetWithdrawalStatus } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { failMessage } from "@/lib/friendly-error";

export const Route = createFileRoute("/_authenticated/admin/withdrawals")({
  component: AdminWithdrawals,
});

function AdminWithdrawals() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-wd"], queryFn: () => adminListWithdrawals() });
  const setStatus = useMutation({
    mutationFn: (v: { withdrawal_id: string; status: "processed" | "rejected" }) =>
      adminSetWithdrawalStatus({ data: v }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin-wd"] });
    },
    onError: (e: Error) => toast.error(failMessage(e)),
  });

  return (
    <section className="mx-auto max-w-5xl px-4 py-6">
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs">
            <tr>
              <th className="p-3">Amount</th>
              <th className="p-3">Method</th>
              <th className="p-3">Details</th>
              <th className="p-3">Status</th>
              <th className="p-3">Requested</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.data?.map((w) => (
              <tr key={w.id} className="border-t border-border">
                <td className="p-3 font-semibold">₹{Number(w.amount).toFixed(2)}</td>
                <td className="p-3 text-xs uppercase">{w.method}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  {w.upi_id ??
                    `${w.account_name ?? ""} · ${w.account_number ?? ""} · ${w.ifsc ?? ""}`}
                </td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      w.status === "processed"
                        ? "bg-green-500/10 text-green-600"
                        : w.status === "rejected"
                          ? "bg-red-500/10 text-red-600"
                          : "bg-yellow-500/10 text-yellow-600"
                    }`}
                  >
                    {w.status}
                  </span>
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {new Date(w.created_at).toLocaleString()}
                </td>
                <td className="p-3 text-right">
                  {w.status === "pending" && (
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          setStatus.mutate({ withdrawal_id: w.id, status: "processed" })
                        }
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          setStatus.mutate({ withdrawal_id: w.id, status: "rejected" })
                        }
                      >
                        <X className="mr-1 h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && list.data.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No withdrawal requests.
          </div>
        )}
      </div>
    </section>
  );
}
