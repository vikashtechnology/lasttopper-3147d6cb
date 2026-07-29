import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { GraduationCap } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Last Topper" },
      { name: "description", content: "Sign in to Last Topper to start practicing for JEE & NEET." },
      { property: "og:title", content: "Sign in — Last Topper" },
      { property: "og:description", content: "Sign in to Last Topper." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/home", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleGoogle() {
    setBusy(true);
    try {
      // Native app: Google blocks WebView sign-in, so open the system browser
      // and come back via the /auth/callback app link.
      if (await isNativeApp()) {
        await startNativeGoogleSignIn();
        return;
      }
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Sign-in failed. Please try again.");
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/home", replace: true });
    } catch (err) {
      console.error(err);
      toast.error("Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }


  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <GraduationCap className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold">Welcome to Last Topper</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with Google to continue.
          </p>
        </div>

        <Button onClick={handleGoogle} disabled={busy} className="w-full" size="lg">
          <GoogleIcon />
          <span className="ml-2">{busy ? "Signing in…" : "Continue with Google"}</span>
        </Button>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing, you agree to our{" "}
          <a href="/terms" className="underline hover:text-foreground">Terms</a> and{" "}
          <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>.
        </p>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.68 4.1-5.5 4.1-3.3 0-6-2.75-6-6.15S8.7 5.9 12 5.9c1.9 0 3.15.8 3.88 1.5l2.65-2.55C16.9 3.35 14.7 2.4 12 2.4 6.75 2.4 2.5 6.65 2.5 12s4.25 9.6 9.5 9.6c5.5 0 9.15-3.85 9.15-9.3 0-.62-.07-1.1-.17-1.6H12z"
      />
    </svg>
  );
}
