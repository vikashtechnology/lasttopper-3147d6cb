import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Atom, Dna, Timer, Brain, BookMarked } from "lucide-react";
import { toast } from "sonner";
import { updatePhone, setProfession, completeOnboarding } from "@/lib/user.functions";
import { applyReferralCode } from "@/lib/referral.functions";
import { useUserStore, type Profession } from "@/store/user";

const COUNTRY_CODES = ["+91", "+1", "+44", "+61", "+971", "+65", "+81"];

type Step = "phone" | "profession" | "tutorial";

export function OnboardingFlow({ open }: { open: boolean }) {
  const patch = useUserStore((s) => s.patchProfile);
  const profile = useUserStore((s) => s.profile);
  const [step, setStep] = useState<Step>(profile?.phone ? "profession" : "phone");
  const [country, setCountry] = useState(profile?.country_code ?? "+91");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [prof, setProf] = useState<Profession | null>(profile?.profession ?? null);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [refCode, setRefCode] = useState("");

  async function submitPhone() {
    if (!/^\d{6,15}$/.test(phone)) {
      toast.error("Enter a valid phone number.");
      return;
    }
    setSaving(true);
    try {
      await updatePhone({ data: { country_code: country, phone } });
      patch({ country_code: country, phone });
      const code = refCode.trim().toUpperCase();
      if (code.length >= 4) {
        try {
          await applyReferralCode({ data: { code } });
          toast.success("Referral code applied");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Invalid referral code");
        }
      }
      setStep("profession");
    } catch (e) {
      console.error(e);
      toast.error("Could not save phone. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function chooseProfession(p: Profession) {
    setSaving(true);
    try {
      await setProfession({ data: { profession: p } });
      patch({ profession: p });
      setProf(p);
      setStep("tutorial");
    } catch (e) {
      console.error(e);
      toast.error("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    setSaving(true);
    try {
      await completeOnboarding();
      patch({ onboarded: true });
    } catch (e) {
      console.error(e);
      toast.error("Could not finish onboarding.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md p-0 overflow-hidden [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <AnimatePresence mode="wait">
          {step === "phone" && (
            <motion.div
              key="phone"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-6"
            >
              <h2 className="text-xl font-semibold">Add your phone</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We'll use it for streak alerts and account recovery.
              </p>
              <div className="mt-6 grid grid-cols-[110px_1fr] gap-3">
                <div>
                  <Label className="text-xs">Code</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_CODES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Phone number</Label>
                  <Input
                    className="mt-1"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="9876543210"
                  />
                </div>
              </div>
              <div className="mt-4">
                <Label className="text-xs">Referral code (optional)</Label>
                <Input
                  className="mt-1 font-mono uppercase tracking-widest"
                  value={refCode}
                  onChange={(e) => setRefCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ABCD1234"
                  maxLength={16}
                />
              </div>
              <Button className="mt-6 w-full" onClick={submitPhone} disabled={saving}>
                {saving ? "Saving…" : "Continue"}
              </Button>
            </motion.div>
          )}

          {step === "profession" && (
            <motion.div
              key="profession"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-6"
            >
              <h2 className="text-xl font-semibold">Pick your track</h2>
              <p className="mt-1 text-sm text-muted-foreground">You can change this later.</p>
              <div className="mt-5 grid grid-cols-1 gap-3">
                <ProfessionCard
                  active={prof === "pcm"}
                  disabled={saving}
                  onClick={() => chooseProfession("pcm")}
                  icon={<Atom className="h-6 w-6" />}
                  title="IIT — PCM"
                  body="Physics · Chemistry · Mathematics"
                />
                <ProfessionCard
                  active={prof === "pcb"}
                  disabled={saving}
                  onClick={() => chooseProfession("pcb")}
                  icon={<Dna className="h-6 w-6" />}
                  title="NEET — PCB"
                  body="Physics · Chemistry · Biology"
                />
              </div>
            </motion.div>
          )}

          {step === "tutorial" && (
            <motion.div
              key="tutorial"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-6"
            >
              <TutorialSlide step={tutorialStep} />
              <div className="mt-6 flex items-center justify-between">
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground"
                  onClick={finish}
                  disabled={saving}
                >
                  Skip
                </button>
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-6 rounded-full ${
                        i === tutorialStep ? "bg-primary" : "bg-muted"
                      }`}
                    />
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    if (tutorialStep < 2) setTutorialStep(tutorialStep + 1);
                    else finish();
                  }}
                  disabled={saving}
                >
                  {tutorialStep < 2 ? "Next" : "Start"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

function ProfessionCard({
  active,
  disabled,
  onClick,
  icon,
  title,
  body,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition-colors ${
        active ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
      } disabled:opacity-60`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        {icon}
      </div>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-muted-foreground">{body}</div>
      </div>
    </button>
  );
}

function TutorialSlide({ step }: { step: number }) {
  const slides = [
    {
      icon: <Timer className="h-6 w-6" />,
      title: "Timer mode",
      body: "Practice under exam-like pressure with per-question timers.",
    },
    {
      icon: <Brain className="h-6 w-6" />,
      title: "AI assistant",
      body: "Get concept explanations and step-by-step hints on demand.",
    },
    {
      icon: <BookMarked className="h-6 w-6" />,
      title: "Mistake bank",
      body: "Every wrong answer is saved so you can revisit and master it.",
    },
  ];
  const s = slides[step];
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        {s.icon}
      </div>
      <h3 className="text-lg font-semibold">{s.title}</h3>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{s.body}</p>
    </div>
  );
}
