export function TopperCoin({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      role="img"
      aria-label="Topper Coin"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`inline-block rounded-full align-[-2px] shadow-sm ${className}`}
      style={{ width: size, height: size }}
    >
      <circle cx="12" cy="12" r="11" fill="#facc15" stroke="#a16207" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="8.25" fill="#fef08a" stroke="#eab308" strokeWidth="1" />
      <path
        d="M7.2 8.2h9.6M12 8.2v8.1M8.8 16.3h6.4"
        fill="none"
        stroke="#713f12"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
