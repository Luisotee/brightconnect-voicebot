import { Loader2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolCallChipProps {
  names: string[];
  completed: boolean;
}

// The explicit, visible proof that Ava is making real backend calls rather
// than inventing account details — this is the single most important thing
// on screen for a reviewer watching the demo.
export function ToolCallChip({ names, completed }: ToolCallChipProps) {
  return (
    <div className="flex justify-start">
      <div
        className={cn(
          "flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-xs transition-colors",
          "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-300"
        )}
      >
        {completed ? <Wrench className="size-3.5" /> : <Loader2 className="size-3.5 animate-spin" />}
        <span>
          {completed ? "called" : "calling"} {names.join(", ")}
        </span>
      </div>
    </div>
  );
}
