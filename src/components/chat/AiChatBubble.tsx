import { useEffect, useRef, useState } from "react";
import { X, Send, PenLine, Plus, History, Trash2, Lock } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { getAiChatQuota } from "@/lib/chatbot.functions";
import { isAiLimit } from "@/lib/friendly-error";
import { ProChip } from "@/components/ProLock";
import avatarSrc from "@/assets/topper-ai-avatar.jpg";

import { chatWithTopperAi } from "@/lib/chatbot.functions";
import {
  listChatThreads,
  createChatThread,
  deleteChatThread,
  getChatMessages,
  saveChatTurn,
  generateHandwrittenImage,
} from "@/lib/topper-chat.functions";
import { Latex } from "@/components/Latex";

type Msg = { role: "user" | "assistant"; content: string; image_url?: string | null };

const INTRO: Msg = {
  role: "assistant",
  content:
    "Hi! I'm **Topper AI** ✨\n\nAsk me any NCERT doubt (Physics, Chemistry, Math, Biology) or how to use the app — quizzes, battles, wallet, and more.",
};

export function AiChatBubble() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showThreads, setShowThreads] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([INTRO]);
  const [input, setInput] = useState("");
  const [penOpen, setPenOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const quota = useQuery({ queryKey: ["ai-chat-quota"], queryFn: () => getAiChatQuota() });
  const isPro = !!quota.data?.is_pro;

  const threads = useQuery({
    queryKey: ["ai-chat-threads"],
    queryFn: () => listChatThreads(),
    enabled: open,
  });

  // Pick / create the active thread once the list loads.
  useEffect(() => {
    if (!open || threadId || !threads.data) return;
    if (threads.data.length > 0) {
      setThreadId(threads.data[0].id);
    } else {
      createChatThread()
        .then((t) => {
          setThreadId(t.id);
          qc.invalidateQueries({ queryKey: ["ai-chat-threads"] });
        })
        .catch(() => {});
    }
  }, [open, threadId, threads.data, qc]);

  // Load messages of the active thread.
  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    getChatMessages({ data: { threadId } })
      .then((rows) => {
        if (cancelled) return;
        setMessages(
          rows.length
            ? rows.map((r) => ({ role: r.role, content: r.content, image_url: r.image_url }))
            : [INTRO],
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const send = useMutation({
    mutationFn: (history: Msg[]) =>
      chatWithTopperAi({
        data: { messages: history.map((m) => ({ role: m.role, content: m.content })) },
      }),
    onSuccess: (res) => {
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      quota.refetch();
      if (threadId)
        saveChatTurn({ data: { threadId, role: "assistant", content: res.reply } }).catch(() => {});
      qc.invalidateQueries({ queryKey: ["ai-chat-threads"] });
    },
    onError: (e) =>
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: isAiLimit(e)
            ? "You've used all your free Topper AI messages for today 🔒\n\n**Go Pro** for unlimited tutoring and step-by-step solutions."
            : "Something went wrong. Please try again.",
        },
      ]),
  });

  const handwrite = useMutation({
    mutationFn: (v: { text: string; mode: "notes" | "solution" }) =>
      generateHandwrittenImage({ data: { threadId: threadId!, ...v } }),
    onSuccess: (res) => {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Handwritten page ✍️", image_url: res.url },
      ]);
      qc.invalidateQueries({ queryKey: ["ai-chat-threads"] });
    },
    onError: () =>
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Couldn't create the handwritten page. Please try again." },
      ]),
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, send.isPending, handwrite.isPending, open]);

  const busy = send.isPending || handwrite.isPending;

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    if (threadId) saveChatTurn({ data: { threadId, role: "user", content: text } }).catch(() => {});
    send.mutate(next.filter((m) => !m.image_url).filter((_, i) => i > 0)); // skip intro + images
  };

  const runHandwriting = (mode: "notes" | "solution") => {
    setPenOpen(false);
    if (!isPro) {
      nav({ to: "/pricing" });
      return;
    }
    const text = input.trim() || [...messages].reverse().find((m) => m.role === "user")?.content;
    if (!text || !threadId || busy) return;
    setMessages((m) => [
      ...m,
      {
        role: "user",
        content: mode === "solution" ? `Handwritten solution: ${text}` : `Handwrite: ${text}`,
      },
    ]);
    setInput("");
    handwrite.mutate({ text, mode });
  };

  const startNewThread = async () => {
    const t = await createChatThread().catch(() => null);
    if (!t) return;
    setThreadId(t.id);
    setMessages([INTRO]);
    setShowThreads(false);
    qc.invalidateQueries({ queryKey: ["ai-chat-threads"] });
  };

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 z-50 flex h-[70vh] max-h-[600px] w-[92vw] max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl lg:bottom-6 lg:right-6">
          <div className="flex items-center gap-2 border-b border-border bg-gradient-to-r from-primary/10 to-transparent px-3 py-3">
            <div className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-primary text-primary-foreground">
              <img src={avatarSrc} alt="Topper AI" className="h-full w-full object-cover" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">Topper AI</div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                NCERT tutor · App help
                {isPro ? (
                  <ProChip />
                ) : quota.data ? (
                  <button
                    type="button"
                    onClick={() => nav({ to: "/pricing" })}
                    className="underline decoration-dotted"
                  >
                    {quota.data.remaining} free left today
                  </button>
                ) : null}
              </div>
            </div>
            <button
              onClick={() => setShowThreads((v) => !v)}
              className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Chat history"
            >
              <History className="h-4 w-4" />
            </button>
            <button
              onClick={startNewThread}
              className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="New chat"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {showThreads && (
            <div className="max-h-56 overflow-y-auto border-b border-border bg-muted/30 p-2">
              {(threads.data ?? []).length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground">No saved chats yet.</div>
              )}
              {(threads.data ?? []).map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs ${
                    t.id === threadId ? "bg-primary/10 text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setThreadId(t.id);
                      setShowThreads(false);
                    }}
                    className="flex-1 truncate text-left"
                  >
                    {t.title}
                  </button>
                  <button
                    type="button"
                    aria-label="Delete chat"
                    onClick={async () => {
                      await deleteChatThread({ data: { threadId: t.id } }).catch(() => {});
                      if (t.id === threadId) {
                        setThreadId(null);
                        setMessages([INTRO]);
                      }
                      qc.invalidateQueries({ queryKey: ["ai-chat-threads"] });
                    }}
                    className="rounded p-1 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {m.image_url ? (
                    <a href={m.image_url} target="_blank" rel="noreferrer">
                      <img
                        src={m.image_url}
                        alt="Handwritten page"
                        className="mb-1 max-h-72 w-full rounded-lg object-contain"
                      />
                    </a>
                  ) : null}
                  {m.role === "assistant" ? <Latex>{m.content}</Latex> : m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-muted px-3 py-2 text-muted-foreground">
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
                  </span>
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="relative flex items-center gap-2 border-t border-border p-3"
          >
            {penOpen && (
              <div className="absolute bottom-14 left-3 z-10 w-60 overflow-hidden rounded-xl border border-border bg-popover/95 shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-1 border-b border-border px-3 py-2 text-[11px] font-medium text-muted-foreground">
                  Handwriting {isPro ? <ProChip /> : <Lock className="h-3 w-3" />}
                </div>
                <button
                  type="button"
                  onClick={() => runHandwriting("notes")}
                  className="block w-full px-3 py-2 text-left text-xs hover:bg-accent"
                >
                  ✍️ Handwritten notes from my text
                </button>
                <button
                  type="button"
                  onClick={() => runHandwriting("solution")}
                  className="block w-full px-3 py-2 text-left text-xs hover:bg-accent"
                >
                  📄 Handwritten solution page
                </button>
                {!isPro && (
                  <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                    Pro only — tap to upgrade.
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setPenOpen((v) => !v)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-input text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Handwritten image"
            >
              <PenLine className="h-4 w-4" />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a doubt or how to use…"
              className="min-w-0 flex-1 rounded-full border border-input bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-20 right-4 z-40 grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-xl shadow-primary/30 ring-2 ring-primary/40 transition-transform hover:scale-105 lg:bottom-6 lg:right-6"
        aria-label="Open Topper AI"
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <img src={avatarSrc} alt="Topper AI" className="h-full w-full object-cover" />
        )}
      </button>
    </>
  );
}
