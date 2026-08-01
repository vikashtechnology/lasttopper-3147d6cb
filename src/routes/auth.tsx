import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { GraduationCap, Mail, KeyRound } from "lucide-react";

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

/**
 * Magic-link return target: always the public website page, which just confirms
 * the sign-in. The user then reopens/refreshes the app or site, already logged in.
 */
function magicLinkRedirectUrl() {
  return "https://lasttopper.lovable.app/auth/verified";
}


function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/home", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      toast.error("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: magicLinkRedirectUrl() },
      });
      if (error) {
        toast.error("Failed. Please try again.");
        return;
      }
      setSent(true);
      toast.success("Sign-in email sent — check your inbox.");
    } catch (err) {
      console.error(err);
      toast.error("Failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length !== 6) {
      toast.error("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: "email",
      });
      if (error) {
        toast.error("Code is invalid or expired.");
        return;
      }
      toast.success("Signed in.");
      navigate({ to: "/home", replace: true });
    } catch (err) {
      console.error(err);
      toast.error("Failed. Please try again.");
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
            {sent
              ? `We emailed ${email.trim().toLowerCase()}. Enter the 6-digit code below, or tap the link in the email.`
              : "Enter your email and we'll send you a sign-in code."}
          </p>
        </div>

        {sent ? (
          <div className="space-y-3">
            <form onSubmit={handleVerifyCode} className="space-y-3">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                disabled={busy}
                className="text-center text-lg tracking-[0.4em]"
                required
              />
              <Button type="submit" disabled={busy} className="w-full" size="lg">
                <KeyRound className="h-4 w-4" />
                <span className="ml-2">{busy ? "Verifying…" : "Verify code"}</span>
              </Button>
            </form>
            <Button
              variant="outline"
              className="w-full"
              size="lg"
              disabled={busy}
              onClick={() => {
                setSent(false);
                setCode("");
              }}
            >
              Use a different email
            </Button>
          </div>
        ) : (
          <form onSubmit={handleMagicLink} className="space-y-3">
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              required
            />
            <Button type="submit" disabled={busy} className="w-full" size="lg">
              <Mail className="h-4 w-4" />
              <span className="ml-2">{busy ? "Sending…" : "Send sign-in code"}</span>
            </Button>
          </form>
        )}


        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing, you agree to our{" "}
          <a href="/terms" className="underline hover:text-foreground">Terms</a> and{" "}
          <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>.
        </p>
      </div>
    </main>
  );
}

