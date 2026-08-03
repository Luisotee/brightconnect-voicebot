"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Vapi from "@vapi-ai/web";
import type { TranscriptEntry, TranscriptRole } from "@/lib/transcript";

export type CallStatus = "idle" | "connecting" | "live" | "ended" | "error";

interface UseVapiCallOptions {
  publicKey: string;
  assistantId: string;
}

interface RawToolCall {
  id: string;
  name?: string;
  function?: { name?: string };
}

// Vapi's client `message` event isn't strongly typed in the SDK — this is the
// subset of the wire protocol this demo actually reads. The SDK's own types
// describe a 'tool-calls-result' message, but a captured real call confirmed
// Vapi never sends it for server-side webhook tools (our tools-server calls
// are made backend-to-backend — the browser is never told directly when one
// finishes), so completion is inferred instead of read off an event.
interface RawVapiMessage {
  type: string;
  role?: TranscriptRole;
  transcript?: string;
  transcriptType?: "partial" | "final";
  toolCallList?: RawToolCall[];
  toolCalls?: RawToolCall[];
}

export function useVapiCall({ publicKey, assistantId }: UseVapiCallOptions) {
  const vapiRef = useRef<Vapi | null>(null);
  const [status, setStatus] = useState<CallStatus>("idle");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [assistantVolume, setAssistantVolume] = useState(0);

  const configured = Boolean(publicKey && assistantId);

  useEffect(() => {
    if (!configured) return;

    const vapi = new Vapi(publicKey);
    vapiRef.current = vapi;

    const upsertMessage = (role: TranscriptRole, text: string, partial: boolean) => {
      setEntries((prev) => {
        const last = prev[prev.length - 1];
        if (last?.kind === "message" && last.role === role && last.partial) {
          return [...prev.slice(0, -1), { ...last, text, partial }];
        }
        return [
          ...prev,
          { id: crypto.randomUUID(), kind: "message", role, text, partial },
        ];
      });
    };

    const addToolCall = (names: string[], toolCallIds: string[]) => {
      setEntries((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          kind: "tool-call",
          names,
          toolCallIds,
          completed: false,
        },
      ]);
    };

    // No event reports a specific tool call finishing (see the RawVapiMessage
    // comment above), so this sweeps every still-pending entry instead of
    // matching a toolCallId.
    const completeAllPending = () => {
      setEntries((prev) =>
        prev.map((entry) =>
          entry.kind === "tool-call" && !entry.completed
            ? { ...entry, completed: true }
            : entry
        )
      );
    };

    const onCallStart = () => {
      setStatus("live");
      setErrorMessage(null);
      setEntries([]);
    };

    const onCallEnd = () => {
      completeAllPending();
      setStatus("ended");
      setAssistantVolume(0);
    };

    const onMessage = (message: RawVapiMessage) => {
      if (message.type === "transcript" && message.role && message.transcript) {
        const partial = message.transcriptType === "partial";
        upsertMessage(message.role, message.transcript, partial);
        if (message.role === "assistant" && !partial) completeAllPending();
        return;
      }

      if (message.type === "tool-calls") {
        completeAllPending();
        const list = message.toolCallList ?? message.toolCalls ?? [];
        const names = list
          .map((t) => t.function?.name ?? t.name)
          .filter((n): n is string => Boolean(n));
        const ids = list.map((t) => t.id).filter(Boolean);
        if (names.length) addToolCall(names, ids);
      }
    };

    const onError = (err: { errorMsg?: string; message?: string } | unknown) => {
      const e = err as { errorMsg?: string; message?: string };
      setStatus("error");
      setErrorMessage(e?.errorMsg || e?.message || "Something went wrong.");
    };

    const onVolume = (volume: number) => setAssistantVolume(volume);

    vapi.on("call-start", onCallStart);
    vapi.on("call-end", onCallEnd);
    vapi.on("message", onMessage);
    vapi.on("error", onError);
    vapi.on("volume-level", onVolume);

    return () => {
      vapi.removeAllListeners();
      vapiRef.current = null;
    };
  }, [configured, publicKey]);

  useEffect(() => {
    if (status !== "live") return;
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => clearInterval(interval);
  }, [status]);

  const start = useCallback(async () => {
    if (!vapiRef.current || !configured) return;
    setStatus("connecting");
    setErrorMessage(null);
    setEntries([]);
    setElapsedSeconds(0);
    try {
      await vapiRef.current.start(assistantId);
    } catch (err) {
      const e = err as { message?: string };
      setStatus("error");
      setErrorMessage(
        e?.message ?? "Could not start the call — check microphone permissions."
      );
    }
  }, [assistantId, configured]);

  const stop = useCallback(() => {
    vapiRef.current?.stop();
  }, []);

  return {
    status,
    entries,
    errorMessage,
    elapsedSeconds,
    assistantVolume,
    configured,
    start,
    stop,
  };
}
