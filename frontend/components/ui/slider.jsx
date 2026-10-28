import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "./utils";

export default function Slider({ className, ...props }) {
  return (
    <SliderPrimitive.Root
      className={cn("relative flex w-full touch-none select-none items-center", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-slate-700/60">
        <SliderPrimitive.Range className="absolute h-full bg-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border border-accent bg-slate-950 shadow" />
    </SliderPrimitive.Root>
  );
}
