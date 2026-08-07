import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { requestPhoneOtp, verifyPhoneOtp } from "@/lib/phone-auth.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { GraduationCap, MessageCircle, KeyRound } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Last Topper" },
      { name: "description", content: "Sign in to Last Topper with your WhatsApp number and start practicing for JEE & NEET." },
      { property: "og:title", content: "Sign in — Last Topper" },
      { property: "og:description", content: "Sign in to Last Topper with WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const sendCode = useServerFn(requestPhoneOtp);
  const checkCode = useServerFn(verifyPhoneOtp);

  const [phone, setPhone] = useState("");
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

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      toast.error("Enter a valid WhatsApp number.");
      return;
    }
    setBusy(true);
    try {
      const res = await sendCode({ data: { phone } });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setSent(true);
      toast.success("Code sent on WhatsApp.");
    } catch (err) {
      console.error(err);
      toast.error("Failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length !== 6) {
      toast.error("Enter the 6-digit code from WhatsApp.");
      return;
    }
    setBusy(true);
    try {
      const res = await checkCode({ data: { phone, code: token } });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      const { error } = await supabase.auth.verifyOtp({
        token_hash: res.tokenHash,
        type: "email",
      });
      if (error) {
        console.error(error);
        toast.error("Failed. Please try again.");
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
              ? `We sent a 6-digit code on WhatsApp to +${phone.replace(/\D/g, "").length === 10 ? "91" : ""}${phone.replace(/\D/g, "")}.`
              : "Enter your WhatsApp number and we'll send you a login code."}
          </p>
        </div>

        {sent ? (
          <div className="space-y-3">
            <form onSubmit={handleVerify} className="space-y-3">
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
              Use a different number
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                +91
              </span>
              <Input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy}
                required
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full" size="lg">
              <MessageCircle className="h-4 w-4" />
              <span className="ml-2">{busy ? "Sending…" : "Send code on WhatsApp"}</span>
            </Button>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              size="lg"
              disabled={busy}
              onClick={() => {
                supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                  },
                });
              }}
            >
              <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
              </svg>
              Continue with Google
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


