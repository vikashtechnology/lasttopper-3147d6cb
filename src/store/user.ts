import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Profession = "pcm" | "pcb";

export type UserProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  country_code: string;
  phone: string | null;
  profession: Profession | null;
  onboarded: boolean;
  daily_question_limit: number;
  streak: number;
  total_accuracy: number;
  reputation?: number;
  is_pro?: boolean;
  pro_since?: string | null;
  date_of_birth?: string | null;
  terms_accepted_at?: string | null;
};

type UserState = {
  profile: UserProfile | null;
  setProfile: (p: UserProfile | null) => void;
  patchProfile: (p: Partial<UserProfile>) => void;
  clear: () => void;
};

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      profile: null,
      setProfile: (profile) => set({ profile }),
      patchProfile: (patch) =>
        set((s) => ({ profile: s.profile ? { ...s.profile, ...patch } : s.profile })),
      clear: () => set({ profile: null }),
    }),
    {
      name: "lt-user",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : (undefined as unknown as Storage),
      ),
    },
  ),
);
