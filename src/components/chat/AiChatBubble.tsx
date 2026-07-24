import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { chatWithTopperAi } from "@/lib/chatbot.functions";
import { Latex } from "@/components/Latex";

type Msg = { role: "user" | "assistant"; content: string };

const INTRO: Msg = {
  role: "assistant",
  content:
    "Hi! I'm **Topper AI** ✨\n\nAsk me any NCERT doubt (Physics, Chemistry, Math, Biology) or how to use the app — quizzes, battles, wallet, and more.",
};

export function AiChatBubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([INTRO]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const send = useMutation({
    mutationFn: (history: Msg[]) => chatWithTopperAi({ data: { messages: history } }),
    onSuccess: (res) => setMessages((m) => [...m, { role: "assistant", content: res.reply }]),
    onError: () =>
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]),
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, send.isPending, open]);

  const submit = () => {
    const text = input.trim();
    if (!text || send.isPending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    send.mutate(next.filter((_, i) => i > 0)); // skip intro
  };

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 z-50 flex h-[70vh] max-h-[600px] w-[92vw] max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl lg:bottom-6 lg:right-6">
          <div className="flex items-center gap-2 border-b border-border bg-gradient-to-r from-primary/10 to-transparent px-4 py-3">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">Topper AI</div>
              <div className="text-[11px] text-muted-foreground">NCERT tutor · App help</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

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
                  {m.role === "assistant" ? <Latex>{m.content}</Latex> : m.content}
                </div>
              </div>
            ))}
            {send.isPending && (
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
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a doubt or how to use…"
              className="flex-1 rounded-full border border-input bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={send.isPending || !input.trim()}
              className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-20 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-xl shadow-primary/30 transition-transform hover:scale-105 lg:bottom-6 lg:right-6"
        aria-label="Open Topper AI"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </>
  );
}
