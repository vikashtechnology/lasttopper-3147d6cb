import { useEffect, useState } from "react";

/**
 * App-wide ambient background: soft radial aurora + drifting particles and
 * pulsing rings. Purely decorative, fixed behind all content.
 */
const PARTICLES = [
  { size: 8, top: "18%", left: "12%", delay: "0s", dur: "9s" },
  { size: 12, top: "32%", left: "78%", delay: "1.2s", dur: "11s" },
  { size: 5, top: "68%", left: "22%", delay: "2.4s", dur: "8s" },
  { size: 9, top: "74%", left: "66%", delay: "0.6s", dur: "12s" },
  { size: 6, top: "48%", left: "48%", delay: "3s", dur: "10s" },
  { size: 14, top: "12%", left: "58%", delay: "1.8s", dur: "13s" },
];

export function AmbientBackground() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div aria-hidden className="ambient-bg">
      <div className="ambient-aurora" />
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="ambient-particle"
          style={{
            width: p.size,
            height: p.size,
            top: p.top,
            left: p.left,
            animationDelay: p.delay,
            animationDuration: p.dur,
          }}
        />
      ))}
      <span className="ambient-ring" style={{ width: 260, height: 260 }} />
      <span className="ambient-ring" style={{ width: 460, height: 460, animationDelay: "1.2s" }} />
      <span className="ambient-ring" style={{ width: 680, height: 680, animationDelay: "2.4s" }} />
    </div>
  );
}
