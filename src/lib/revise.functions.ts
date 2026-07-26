import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listChapterTopics, readTopicRevision } from "./revise.server";
import type { ReviseTopic } from "./revise.types";

export type { ReviseTopic } from "./revise.types";

export const getChapterTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ chapter_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ chapter: { id: string; name: string; class_level: number | null } | null; topics: ReviseTopic[] }> => {
    return listChapterTopics(data.chapter_id, context);
  });

export const getTopicRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ topic_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ReviseTopic> => {
    return readTopicRevision(data.topic_id, context);
  });
