import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Youtube,
  Send,
  MessageCircle,
  Twitter,
  Instagram,
  Facebook,
  Linkedin,
  Github,
  Globe,
  Share2,
  ChevronDown,
} from "lucide-react";
import { listSocialLinks, type SocialLink } from "@/lib/social.functions";

export function useSocialLinks() {
  return useQuery({
    queryKey: ["social-links"],
    queryFn: () => listSocialLinks(),
    staleTime: 5 * 60 * 1000,
  });
}

export function socialIcon(platform: string, className = "h-4 w-4") {
  const p = platform.toLowerCase();
  if (p.includes("youtube")) return <Youtube className={className} />;
  if (p.includes("telegram")) return <Send className={className} />;
  if (p.includes("discord") || p.includes("whatsapp"))
    return <MessageCircle className={className} />;
  if (p.includes("twitter") || p === "x") return <Twitter className={className} />;
  if (p.includes("instagram")) return <Instagram className={className} />;
  if (p.includes("facebook")) return <Facebook className={className} />;
  if (p.includes("linkedin")) return <Linkedin className={className} />;
  if (p.includes("github")) return <Github className={className} />;
  return <Globe className={className} />;
}

/** Collapsible "Follow us" group for the sidebar / mobile drawer. */
export function SocialLinksDropdown({ onNavigate }: { onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const { data } = useSocialLinks();
  const links = data ?? [];
  if (links.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent"
        aria-expanded={open}
      >
        <Share2 className="h-3.5 w-3.5" />
        <span>Follow us</span>
        <ChevronDown
          className={`ml-auto h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <ul className="mt-0.5 space-y-0.5">
          {links.map((l: SocialLink) => (
            <li key={l.id}>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onNavigate}
                className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground/80 transition-colors hover:bg-accent"
              >
                {socialIcon(l.platform)}
                <span>{l.label}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Icon row for the bottom of the user profile page. */
export function SocialLinksRow({ className = "" }: { className?: string }) {
  const { data } = useSocialLinks();
  const links = data ?? [];
  if (links.length === 0) return null;

  return (
    <div className={className}>
      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Follow Last Topper</h2>
      <div className="flex flex-wrap gap-2">
        {links.map((l: SocialLink) => (
          <a
            key={l.id}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium transition-colors hover:bg-accent"
          >
            {socialIcon(l.platform, "h-4 w-4")}
            <span>{l.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
