import { createFileRoute } from "@tanstack/react-router";
import { getFirebaseAdminAuth } from "@/integrations/firebase/admin.server";
import { uploadImageToImgBB } from "@/integrations/imgbb/upload.server";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export const Route = createFileRoute("/api/images/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
        if (!token) return json({ error: "Unauthorized" }, 401);
        try {
          await (await getFirebaseAdminAuth()).verifyIdToken(token);
        } catch {
          return json({ error: "Invalid or expired Firebase ID token" }, 401);
        }

        let file: File;
        try {
          const value = (await request.formData()).get("image");
          if (!(value instanceof File)) return json({ error: "An image file is required" }, 400);
          file = value;
        } catch {
          return json({ error: "Invalid multipart form data" }, 400);
        }
        if (!file.type.startsWith("image/"))
          return json({ error: "Only image files are allowed" }, 415);
        if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
          return json({ error: "Image must be no larger than 4 MB" }, 413);
        }

        try {
          return json(
            await uploadImageToImgBB(file, {
              fileName: file.name || "upload",
              contentType: file.type,
              maxBytes: MAX_IMAGE_BYTES,
            }),
          );
        } catch (error) {
          console.error("Authenticated image upload failed", error);
          return json({ error: "Image upload failed" }, 502);
        }
      },
      GET: () => new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } }),
    },
  },
});
