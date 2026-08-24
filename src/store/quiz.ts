import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Answer = "A" | "B" | "C" | "D";

type QuizState = {
  // sessionId -> { answers, currentIndex, startedAt }
  sessions: Record<
    string,
    {
      answers: Record<string, Answer>;
      currentIndex: number;
      startedAt: number;
    }
  >;
  setAnswer: (sessionId: string, questionId: string, answer: Answer) => void;
  setIndex: (sessionId: string, index: number) => void;
  init: (sessionId: string) => void;
  clearSession: (sessionId: string) => void;
};

export const useQuizStore = create<QuizState>()(
  persist(
    (set, get) => ({
      sessions: {},
      init: (sessionId) => {
        if (get().sessions[sessionId]) return;
        set((s) => ({
          sessions: {
            ...s.sessions,
            [sessionId]: { answers: {}, currentIndex: 0, startedAt: Date.now() },
          },
        }));
      },
      setAnswer: (sessionId, questionId, answer) =>
        set((s) => {
          const cur = s.sessions[sessionId] ?? {
            answers: {},
            currentIndex: 0,
            startedAt: Date.now(),
          };
          return {
            sessions: {
              ...s.sessions,
              [sessionId]: { ...cur, answers: { ...cur.answers, [questionId]: answer } },
            },
          };
        }),
      setIndex: (sessionId, index) =>
        set((s) => {
          const cur = s.sessions[sessionId] ?? {
            answers: {},
            currentIndex: 0,
            startedAt: Date.now(),
          };
          return { sessions: { ...s.sessions, [sessionId]: { ...cur, currentIndex: index } } };
        }),
      clearSession: (sessionId) =>
        set((s) => {
          const { [sessionId]: _drop, ...rest } = s.sessions;
          return { sessions: rest };
        }),
    }),
    {
      name: "lt-quiz",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : (undefined as unknown as Storage),
      ),
    },
  ),
);
