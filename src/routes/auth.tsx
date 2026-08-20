import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkAuthConfiguration } from "@/lib/auth-check.functions";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { GraduationCap, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Last Topper" },
      { name: "description", content: "Sign in to Last Topper to continue your learning journey." },
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
  const [configStatus, setConfigStatus] = useState<{ isConfigured: boolean; missing: string[] } | null>(null);

  useEffect(() => {
    checkAuthConfiguration().then(setConfigStatus).catch(console.error);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/home", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleGoogleLogin() {
    setBusy(true);
    try {
      const { startNativeGoogleSignIn, isNativeApp } = await import("@/lib/native-auth");
      
      if (await isNativeApp()) {
        await startNativeGoogleSignIn();
        return;
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err) {
      console.error(err);
      toast.error("Failed to sign in with Google. Please try again.");
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
          <h1 className="text-2xl font-semibold tracking-tighter">Welcome to Last Topper</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to continue your learning journey
          </p>
        </div>

        {configStatus && !configStatus.isConfigured && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Auth Configuration Missing</AlertTitle>
            <AlertDescription>
              Google OAuth is not fully configured. Missing: {configStatus.missing.join(", ")}. 
              Please add these secrets in Lovable Cloud.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <Button
            variant="default"
            className="w-full"
            size="lg"
            disabled={busy}
            onClick={handleGoogleLogin}
          >
            <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
              <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
            </svg>
            {busy ? "Connecting..." : "'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            Please fix error"}
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing, you agree to our{" "}
          <a href="/terms" className="underline hover:text-foreground">Terms</a> and{" "}
          <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>.
        </p>
      </div>
    </main>
  );
}


