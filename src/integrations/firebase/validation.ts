import { z } from "zod";

/** Firebase Authentication UID: a non-empty string with a maximum of 128 chars. */
export const firebaseUidSchema = z.string().trim().min(1).max(128);
