"use client";

import { AlertCircle, Loader2, Mic, PhoneOff, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CallStatus } from "@/hooks/use-vapi-call";

interface CallControlProps {
  status: CallStatus;
  configured: boolean;
  elapsedSeconds: number;
  assistantVolume: number;
  errorMessage: string | null;
  onStart: () => void;
  onStop: () => void;
}

const STATUS_LABEL: Record<CallStatus, string> = {
  idle: "Ready to call",
  connecting: "Connecting…",
  live: "Connected — Ava is listening",
  ended: "Call ended",
  error: "Something went wrong",
};

const formatDuration = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export function CallControl({
  status,
  configured,
  elapsedSeconds,
  assistantVolume,
  errorMessage,
  onStart,
  onStop,
}: CallControlProps) {
  const isLive = status === "live";
  const isConnecting = status === "connecting";
  const disabled = !configured || isConnecting;

  const handleClick = () => (isLive ? onStop() : onStart());

  const ringScale = 1 + Math.min(assistantVolume, 1) * 0.35;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex size-40 items-center justify-center">
        {(isLive || isConnecting) && (
          <span
            className={cn(
              "absolute inset-0 rounded-full opacity-60",
              isLive && "bg-emerald-500/20 dark:bg-emerald-400/20",
              isConnecting && "animate-ping bg-amber-500/20 dark:bg-amber-400/20"
            )}
            style={isLive ? { transform: `scale(${ringScale})`, transition: "transform 100ms ease-out" } : undefined}
          />
        )}

        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          aria-label={isLive ? "End call" : "Start call"}
          className={cn(
            "relative flex size-28 items-center justify-center rounded-full border shadow-lg transition-all duration-200",
            "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
            status === "idle" && "border-primary/20 bg-primary text-primary-foreground hover:scale-105",
            status === "connecting" && "border-amber-500/30 bg-amber-500 text-white",
            status === "live" && "border-red-500/30 bg-red-500 text-white hover:scale-105",
            status === "ended" && "border-border bg-secondary text-secondary-foreground hover:scale-105",
            status === "error" && "border-destructive/30 bg-destructive text-white hover:scale-105"
          )}
        >
          {status === "idle" && <Mic className="size-10" />}
          {status === "connecting" && <Loader2 className="size-10 animate-spin" />}
          {status === "live" && <PhoneOff className="size-10" />}
          {status === "ended" && <RotateCcw className="size-10" />}
          {status === "error" && <AlertCircle className="size-10" />}
        </button>
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm font-medium">{STATUS_LABEL[status]}</p>
        {isLive && (
          <p className="font-mono text-xs text-muted-foreground">{formatDuration(elapsedSeconds)}</p>
        )}
        {status === "error" && errorMessage && (
          <p className="max-w-xs text-xs text-destructive">{errorMessage}</p>
        )}
        {!configured && (
          <p className="max-w-xs text-xs text-destructive">
            Not configured — set{" "}
            <code className="rounded bg-muted px-1 py-0.5">NEXT_PUBLIC_VAPI_PUBLIC_KEY</code> and{" "}
            <code className="rounded bg-muted px-1 py-0.5">NEXT_PUBLIC_VAPI_ASSISTANT_ID</code>, or pass{" "}
            <code className="rounded bg-muted px-1 py-0.5">?key=&assistant=</code> in the URL.
          </p>
        )}
      </div>
    </div>
  );
}
