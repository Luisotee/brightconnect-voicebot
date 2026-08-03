"use client";

import { useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "@/components/message-bubble";
import { ToolCallChip } from "@/components/tool-call-chip";
import type { TranscriptEntry } from "@/lib/transcript";

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
}

export function TranscriptPanel({ entries }: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <MessageSquare className="size-6" />
        <p className="text-sm">The live transcript will appear here once you start a call.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-2.5 p-4">
        {entries.map((entry) =>
          entry.kind === "message" ? (
            <MessageBubble key={entry.id} role={entry.role} text={entry.text} partial={entry.partial} />
          ) : (
            <ToolCallChip key={entry.id} names={entry.names} completed={entry.completed} />
          )
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
