import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

// Legacy email-verification URL retained only to provide a clear route. The
// current product supports Firebase Google authentication exclusively.
export const Route = createFileRoute("/auth/verified")({
  component: VerifiedPage,
});

function VerifiedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold">Continue with Google</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Email-link sign-in is no longer used. Sign in securely with your Google account.
        </p>
        <Button asChild className="mt-5">
          <Link to="/auth">Go to sign in</Link>
        </Button>
      </div>
    </main>
  );
}
