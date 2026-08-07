import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getProfile, updateProfile } from "@/lib/tournament.functions";
import { AppShell, defaultNavGroups } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { toast } from "sonner";
import { User, Smartphone, Trophy, Sword } from "lucide-react";

const profileQuery = {
  queryKey: ["my-profile"],
  queryFn: () => getProfile(),
} as const;

export const Route = createFileRoute("/_authenticated/profile/$userId")({
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery),
  component: ProfilePage,
});

function ProfilePage() {
  const { data: profile } = useSuspenseQuery(profileQuery);
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    username: profile?.username || "",
    bgmi_uid: profile?.bgmi_uid || "",
    in_game_name: profile?.in_game_name || "",
    phone: profile?.phone || "",
  });

  const mutation = useMutation({
    mutationFn: (updates: any) => updateProfile({ data: updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("Profile updated successfully!");
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const groups = defaultNavGroups({ profileUserId: profile?.id });

  return (
    <AppShell header="PROFILE" groups={groups}>
      <div className="max-w-xl mx-auto space-y-6">
        <section className="grid grid-cols-2 gap-4">
          <StatCard label="Winnings" value={`₹${profile?.total_winnings ?? 0}`} icon={<Trophy className="h-4 w-4" />} />
          <StatCard label="K/D Ratio" value={profile?.kd_ratio?.toFixed(2) ?? "0.00"} icon={<Sword className="h-4 w-4" />} />
        </section>

        <Card className="mantis-card">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase italic">Player Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-[10px] uppercase font-bold text-muted-foreground">Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="username"
                    className="pl-9 h-11 bg-muted/50"
                    placeholder="Enter username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bgmi_uid" className="text-[10px] uppercase font-bold text-muted-foreground">BGMI Player ID</Label>
                <div className="relative">
                  <Smartphone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="bgmi_uid"
                    className="pl-9 h-11 bg-muted/50"
                    placeholder="e.g. 5123456789"
                    value={formData.bgmi_uid}
                    onChange={(e) => setFormData({ ...formData, bgmi_uid: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="in_game_name" className="text-[10px] uppercase font-bold text-muted-foreground">In-Game Name</Label>
                <div className="relative">
                  <Sword className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="in_game_name"
                    className="pl-9 h-11 bg-muted/50"
                    placeholder="Your gaming handle"
                    value={formData.in_game_name}
                    onChange={(e) => setFormData({ ...formData, in_game_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-[10px] uppercase font-bold text-muted-foreground">Phone Number</Label>
                <div className="relative">
                  <Smartphone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    className="pl-9 h-11 bg-muted/50"
                    placeholder="WhatsApp number"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 uppercase font-black italic tracking-tight"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Saving..." : "Save Profile"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="mantis-card p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className="text-xl font-black italic">{value}</div>
    </Card>
  );
}
