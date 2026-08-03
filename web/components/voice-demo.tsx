"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CallControl } from "@/components/call-control";
import { TranscriptPanel } from "@/components/transcript-panel";
import { FixtureHints } from "@/components/fixture-hints";
import { useVapiCall } from "@/hooks/use-vapi-call";

export function VoiceDemo() {
  const [keys, setKeys] = useState({
    publicKey: process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY ?? "",
    assistantId: process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID ?? "",
  });

  useEffect(() => {
    // `?key=&assistant=` only exists in the browser, so this can't be read during
    // the static prerender — it has to sync in after mount, not at initial render.
    const params = new URLSearchParams(window.location.search);
    const key = params.get("key");
    const assistant = params.get("assistant");
    if (!key && !assistant) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKeys((prev) => ({
      publicKey: key || prev.publicKey,
      assistantId: assistant || prev.assistantId,
    }));
  }, []);

  const { status, entries, errorMessage, elapsedSeconds, assistantVolume, configured, start, stop } =
    useVapiCall(keys);

  return (
    <Card className="w-full max-w-3xl overflow-hidden py-0">
      <CardContent className="grid gap-0 p-0 md:grid-cols-[minmax(0,280px)_1fr]">
        <div className="flex flex-col items-center gap-6 border-b p-6 md:border-r md:border-b-0">
          <CallControl
            status={status}
            configured={configured}
            elapsedSeconds={elapsedSeconds}
            assistantVolume={assistantVolume}
            errorMessage={errorMessage}
            onStart={start}
            onStop={stop}
          />
          <Separator />
          <FixtureHints />
        </div>

        <div className="h-[420px] md:h-[520px]">
          <TranscriptPanel entries={entries} />
        </div>
      </CardContent>
    </Card>
  );
}
