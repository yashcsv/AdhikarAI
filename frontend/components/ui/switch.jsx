import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "./utils";

export default function Switch({ className, ...props }) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-stroke bg-slate-800/80 p-[2px]",
        "data-[state=checked]:bg-accent data-[state=checked]:border-accent",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
          "data-[state=checked]:translate-x-5"
        )}
      />
    </SwitchPrimitive.Root>
  );
}
