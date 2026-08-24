import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  isNativeApp,
  NATIVE_CALLBACK_MARKER,
  openNativeAuthUrl,
  PUBLIC_APP_URL,
} from "@/lib/native-auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { toast } from "sonner";
import { ArrowLeft, BarChart3, Check, Repeat2, ShieldCheck, Swords } from "lucide-react";

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/home", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleGoogleSignIn() {
    setBusy(true);
    try {
      const native = await isNativeApp();
      const callbackBase = native ? PUBLIC_APP_URL : window.location.origin;
      const redirectTo = `${callbackBase}/auth/callback${native ? `?${NATIVE_CALLBACK_MARKER}=1` : ""}`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: native },
      });
      if (error) throw error;
      if (native) {
        if (!data.url)
          throw new Error("The authentication provider returned no authorization URL.");
        await openNativeAuthUrl(data.url);
      }
    } catch (error) {
      console.error(error);
      toast.error("Google sign-in failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background/75 px-4 py-4 text-foreground sm:px-6 sm:py-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <ThemeToggle />
      </div>

      <div className="mx-auto grid min-h-[calc(100vh-80px)] max-w-6xl items-center gap-10 py-8 lg:grid-cols-[1.05fr_.95fr] lg:py-12">
        <section className="hidden lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Private, simple access
          </div>
          <h1 className="mt-6 max-w-xl text-4xl font-bold leading-tight tracking-[-0.035em] xl:text-5xl">
            Continue where your last study session ended.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
            One Google account keeps your practice, mistakes, reviews, battles, and progress
            together.
          </p>
          <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
            <Benefit
              icon={<Repeat2 className="h-4 w-4" />}
              title="Smart review"
              body="Return to weak questions when they are due."
            />
            <Benefit
              icon={<Swords className="h-4 w-4" />}
              title="Battle ready"
              body="Keep your scores, rank, wallet, and history."
            />
            <Benefit
              icon={<BarChart3 className="h-4 w-4" />}
              title="Clear progress"
              body="Track accuracy, mastery, streaks, and XP."
            />
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mantis-card bg-card/90 p-6 shadow-2xl shadow-primary/10 sm:p-8">
            <div className="flex items-center gap-3">
              <img
                src="/app-icon-192.png"
                alt="Last Topper"
                className="h-12 w-12 rounded-2xl shadow-sm ring-1 ring-border"
              />
              <div>
                <p className="text-sm font-semibold">Last Topper</p>
                <p className="text-xs text-muted-foreground">JEE &amp; NEET study workspace</p>
              </div>
            </div>

            <div className="mt-8">
              <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Continue with your Google account. New learners will complete a short study-track
                setup.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              className="mt-7 h-12 w-full bg-background text-base shadow-sm"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void handleGoogleSignIn()}
            >
              <GoogleIcon />
              {busy ? "Connecting securely…" : "Continue with Google"}
            </Button>

            <div className="mt-5 flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              Google is the only sign-in method. A phone number is not required.
            </div>

            <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
              By continuing, you agree to our{" "}
              <Link to="/terms" className="underline underline-offset-4 hover:text-foreground">
                Terms
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function Benefit({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/65 p-4">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <h2 className="mt-3 text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="mr-2 h-4 w-4" aria-hidden="true" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.24-.2-1.8h-9.2v3.34h5.4a4.7 4.7 0 0 1-2 3.03l-.02.11 2.88 2.23.2.02c1.84-1.7 2.94-4.2 2.94-6.93Z"
      />
      <path
        fill="#34A853"
        d="M12.2 21.8c2.63 0 4.84-.87 6.46-2.64l-3.07-2.36c-.82.55-1.92.94-3.39.94a5.88 5.88 0 0 1-5.56-4.06l-.1.01-3 2.31-.04.1a9.76 9.76 0 0 0 8.7 5.7Z"
      />
      <path
        fill="#FBBC05"
        d="M6.64 13.68a6.02 6.02 0 0 1-.33-1.94c0-.68.12-1.34.32-1.94V9.7L3.59 7.34l-.1.05a9.87 9.87 0 0 0 0 8.71l3.15-2.42Z"
      />
      <path
        fill="#EA4335"
        d="M12.2 5.74c1.83 0 3.06.79 3.76 1.44l2.76-2.69A9.34 9.34 0 0 0 12.2 1.7a9.76 9.76 0 0 0-8.7 5.69L6.63 9.8A5.9 5.9 0 0 1 12.2 5.74Z"
      />
    </svg>
  );
}
