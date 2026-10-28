import { cn } from "./utils";

export default function Badge({ className, children }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-stroke bg-white/5 px-2.5 py-1 text-xs font-medium uppercase tracking-wide",
        className
      )}
    >
      {children}
    </span>
  );
}
