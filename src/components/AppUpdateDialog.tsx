import { useEffect, useState } from "react";
import { Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getLatestRelease, type AppRelease } from "@/lib/app-release.functions";

const DISMISS_KEY = "lt-update-dismissed";

/**
 * Shows an "update available" popup when the admin publishes a release whose
 * version code is newer than the installed native app. Web visitors always run
 * the latest build, so the popup is native-only.
 */
export function AppUpdateDialog() {
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;

        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) return;

        const { App } = await import("@capacitor/app");
        const info = await App.getInfo();
        const installedCode = Number(info.build) || 0;

        const latest = await getLatestRelease();
        if (cancelled || !latest) return;
        if (latest.version_code <= installedCode) return;

        const dismissed = window.localStorage.getItem(DISMISS_KEY);
        if (!latest.mandatory && dismissed === String(latest.version_code)) return;

        setRelease(latest);
        setOpen(true);
      } catch {
        /* update check is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function later() {
    if (release) {
      try {
        window.localStorage.setItem(DISMISS_KEY, String(release.version_code));
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
  }

  async function update() {
    if (!release) return;
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: release.download_url });
    } catch {
      window.open(release.download_url, "_blank");
    }
  }

  if (!release) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (release.mandatory ? null : v ? setOpen(true) : later())}
    >
      <DialogContent
        className="max-w-sm backdrop-blur-md"
        onInteractOutside={(e) => release.mandatory && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Update available — v{release.version}
          </DialogTitle>
          <DialogDescription>
            {release.mandatory
              ? "This update is required to keep using the app."
              : "A newer version of Last Topper is ready to install."}
          </DialogDescription>
        </DialogHeader>
        {release.notes ? (
          <p className="whitespace-pre-line rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            {release.notes}
          </p>
        ) : null}
        <div className="mt-2 flex gap-2">
          {!release.mandatory ? (
            <Button variant="outline" className="flex-1" onClick={later}>
              Later
            </Button>
          ) : null}
          <Button className="flex-1" onClick={update}>
            <Download className="mr-2 h-4 w-4" />
            Update now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
