import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    const result = await next();
    if (!result) {
      console.error("errorMiddleware: next() returned no result");
    }
    return result;
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error("errorMiddleware caught error:", error);
    // If we're in a server function call context, we shouldn't return an HTML error page
    // as it breaks serialization. However, for actual page requests, we might want it.
    // For now, let's rethrow to see where it leads.
    throw error;
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
