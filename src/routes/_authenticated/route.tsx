// This file is integration-managed. It gates the /_authenticated subtree.
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { firebaseClient } from "@/integrations/firebase/client";
import { useAppNotifications } from "@/lib/useAppNotifications";

function AuthedLayout() {
  useAppNotifications();
  return <Outlet />;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await firebaseClient.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: AuthedLayout,
});
