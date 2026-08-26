const EXPIRATION_SECONDS = 604800;
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

export type ImgBBUpload = {
  url: string;
  expiresIn: number;
};

export async function uploadImageToImgBB(
  bytes: Uint8Array | Blob,
  options: { fileName?: string; contentType?: string; maxBytes?: number } = {},
): Promise<ImgBBUpload> {
  const apiKey = process.env.IMGBB_API_KEY?.trim();
  if (!apiKey) throw new Error("Image uploads are not configured");

  const blob =
    bytes instanceof Blob
      ? bytes
      : new Blob([Buffer.from(bytes)], { type: options.contentType ?? "image/png" });
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;
  if (blob.size < 1 || blob.size > maxBytes) throw new Error("Image file size is not allowed");
  if (blob.type && !blob.type.startsWith("image/")) throw new Error("Only image files are allowed");

  const body = new FormData();
  body.set("image", blob, options.fileName || "upload.png");
  const response = await fetch(
    `https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}&expiration=${EXPIRATION_SECONDS}`,
    { method: "POST", body },
  );
  const result = (await response.json().catch(() => null)) as {
    success?: boolean;
    data?: { url?: string };
    error?: { message?: string };
  } | null;
  const url = result?.data?.url;
  if (!response.ok || !result?.success || !url) {
    console.error(
      "ImgBB upload failed",
      response.status,
      result?.error?.message ?? "unknown error",
    );
    throw new Error("Image upload failed");
  }
  return { url, expiresIn: EXPIRATION_SECONDS };
}
