import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  parseOAuthCallback,
  closeNativeBrowser,
  clearStoredOAuthState,
  isNativeApp,
  appSchemeCallbackUrl,
  NATIVE_CALLBACK_MARKER,
} from "@/lib/native-auth";
import { storeReferralFromUrl } from "@/lib/referral-link";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "Signing in — Last Topper" },
      { name: "description", content: "Completing your Last Topper sign-in." },
      { property: "og:title", content: "Signing in — Last Topper" },
      { property: "og:description", content: "Completing your Last Topper sign-in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  ssr: false,
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Finishing sign-in…");
  const [appLink, setAppLink] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      storeReferralFromUrl();
      const parsed = parseOAuthCallback(window.location.href);
      const callbackUrl = new URL(window.location.href);
      const isNativeReturn =
        callbackUrl.searchParams.get(NATIVE_CALLBACK_MARKER) === "1" ||
        parsed?.state?.includes("native-") === true;

      // Sign-in was started from the installed app but this page is running in
      // Chrome/Safari (App Link verification unavailable). Bounce the tokens
      // back into the app through the lasttopper:// custom scheme.
      if (
        parsed &&
        !parsed.error &&
        isNativeReturn &&
        !(await isNativeApp())
      ) {
        const deepLink = appSchemeCallbackUrl({
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
          state: parsed.state ?? "native-return",
        });
        setAppLink(deepLink);
        setMessage("Returning you to the Last Topper app…");
        window.location.replace(deepLink);
        return;
      }

      if (parsed && !parsed.error) {
        const { error } = await supabase.auth.setSession({
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        });
        clearStoredOAuthState();
        void closeNativeBrowser();
        if (!error) {
          navigate({ to: "/home", replace: true });
          return;
        }
      }

      // No tokens in the URL (e.g. the app already handled the deep link) —
      // fall back to whatever session exists.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate({ to: "/home", replace: true });
        return;
      }
      if (parsed?.error) {
        console.error("OAuth error:", parsed.error);
        setMessage(`Sign-in error: ${parsed.error}`);
      } else {
        setMessage("Sign-in didn't complete. Please try again.");
      }
      setTimeout(() => navigate({ to: "/auth", replace: true }), 3000);
    })();
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{message}</p>
        {appLink && (
          <a
            href={appLink}
            className="mt-2 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Open Last Topper app
          </a>
        )}
      </div>
    </main>
  );
}
