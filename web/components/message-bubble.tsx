import { cn } from "@/lib/utils";
import type { TranscriptRole } from "@/lib/transcript";

interface MessageBubbleProps {
  role: TranscriptRole;
  text: string;
  partial: boolean;
}

export function MessageBubble({ role, text, partial }: MessageBubbleProps) {
  const isAssistant = role === "assistant";

  return (
    <div className={cn("flex", isAssistant ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
          isAssistant
            ? "bg-secondary text-secondary-foreground"
            : "bg-primary text-primary-foreground",
          partial && "opacity-70"
        )}
      >
        {text}
      </div>
    </div>
  );
}
