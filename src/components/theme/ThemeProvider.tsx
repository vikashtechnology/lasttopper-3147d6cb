import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark" | "system";
type Ctx = { theme: Theme; resolved: "light" | "dark"; setTheme: (t: Theme) => void };

const ThemeCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "lt-theme";

function apply(theme: Theme): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const resolved = theme === "system" ? sys : theme;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
    setThemeState(stored);
    setResolved(apply(stored));
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const cur = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
      if (cur === "system") setResolved(apply("system"));
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const setTheme = (t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
    setResolved(apply(t));
  };

  return <ThemeCtx.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
