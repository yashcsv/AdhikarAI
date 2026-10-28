import Badge from "./ui/badge";

const levelStyle = {
  high: "border-mint/70 bg-mint/15 text-mint",
  medium: "border-warn/70 bg-warn/15 text-warn",
  low: "border-danger/70 bg-danger/15 text-danger",
};

export default function ConfidenceBadge({ confidence = 0, label = "low" }) {
  const safeLabel = (label || "low").toLowerCase();
  const css = levelStyle[safeLabel] || levelStyle.low;
  return (
    <Badge className={css}>
      {safeLabel} · {(Number(confidence) * 100).toFixed(1)}%
    </Badge>
  );
}
