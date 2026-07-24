import coin from "@/assets/topper-coin.jpg.asset.json";

export function TopperCoin({
  size = 16,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={coin.url}
      alt="Topper Coin"
      width={size}
      height={size}
      className={`inline-block rounded-full align-[-2px] shadow-sm ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
