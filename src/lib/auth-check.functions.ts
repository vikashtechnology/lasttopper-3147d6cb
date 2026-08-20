import { createServerFn } from "@tanstack/react-start";

export const checkAuthConfiguration = createServerFn({ method: "GET" }).handler(async () => {
  // We check for the presence of variables that should be set in Lovable Cloud
  // Note: We don't return the values themselves, just their presence.
  const googleClientId = process.env.GOOGLE_CLIENT_ID_OUAURLFNUCMVJMBJMVF || process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET_OUAURLFNUCMVJMBJMVF || process.env.GOOGLE_CLIENT_SECRET;

  return {
    isConfigured: !!(googleClientId && googleClientSecret),
    missing: [
      !googleClientId && "GOOGLE_CLIENT_ID",
      !googleClientSecret && "GOOGLE_CLIENT_SECRET",
    ].filter(Boolean) as string[],
  };
});
