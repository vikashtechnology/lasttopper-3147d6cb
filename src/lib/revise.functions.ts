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
    const topic = await readTopicRevision(data.topic_id, context);
    await context.supabase
      .from("activity_events")
      .insert({ user_id: context.userId, kind: "revise_view", payload: { topic_id: data.topic_id } })
      .then(() => undefined, () => undefined);
    return topic;
  });
