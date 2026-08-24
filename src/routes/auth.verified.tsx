import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseOAuthCallback } from "@/lib/native-auth";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

export const Route = createFileRoute("/auth/verified")({
  head: () => ({
    meta: [
      { title: "Email verified — Last Topper" },
      { name: "description", content: "Your Last Topper sign-in link has been verified." },
      { property: "og:title", content: "Email verified — Last Topper" },
      { property: "og:description", content: "Your Last Topper sign-in link has been verified." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  ssr: false,
  component: VerifiedPage,
});

function VerifiedPage() {
  const [status, setStatus] = useState<"working" | "ok" | "fail">("working");

  useEffect(() => {
    void (async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const get = (k: string) => url.searchParams.get(k) ?? hash.get(k);

      // 1) Tokens delivered directly in the URL (implicit flow).
      const parsed = parseOAuthCallback(window.location.href);
      if (parsed && !parsed.error) {
        const { error } = await supabase.auth.setSession({
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        });
        setStatus(error ? "fail" : "ok");
        return;
      }

      // 2) One-time email token (works even when opened in another browser).
      const tokenHash = get("token_hash") ?? get("token");
      const type = get("type");
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          type: type as "magiclink" | "signup" | "recovery" | "email" | "invite" | "email_change",
          token_hash: tokenHash,
        });
        setStatus(error ? "fail" : "ok");
        return;
      }

      // 3) PKCE code exchange.
      const code = get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        setStatus(error ? "fail" : "ok");
        return;
      }

      const { data } = await supabase.auth.getSession();
      setStatus(data.session ? "ok" : "fail");
    })();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card/80 p-8 text-center shadow-lg backdrop-blur-md">
        {status === "working" && (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Verifying your link…</p>
          </>
        )}
        {status === "ok" && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-4 text-xl font-semibold">Sign-in successful</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your email is verified. Just reopen or refresh the Last Topper app (or website) —
              you're already logged in.
            </p>
          </>
        )}
        {status === "fail" && (
          <>
            <XCircle className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-4 text-xl font-semibold">Link didn't work</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This sign-in link is invalid or expired. Request a new magic link and try again.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
