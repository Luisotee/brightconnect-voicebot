import { Badge } from "@/components/ui/badge";
import { VoiceDemo } from "@/components/voice-demo";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center gap-10 px-4 py-16 sm:py-24">
      <div className="flex max-w-xl flex-col items-center gap-4 text-center">
        <Badge variant="secondary">Live voice demo — built on Vapi</Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Talk to Ava, BrightConnect&apos;s support line
        </h1>
        <p className="text-balance text-muted-foreground">
          An AI voicebot that handles internet faults, bill payment and plan changes on its own —
          and knows when to hand a call to a human. Click the mic and try it in your browser, no
          phone call needed.
        </p>
      </div>

      <VoiceDemo />

      <p className="text-xs text-muted-foreground">
        A hiring-exercise submission for International Application Group.{" "}
        <a
          href="https://github.com/Luisotee/brightconnect-voicebot"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4 hover:text-foreground"
        >
          Source on GitHub
        </a>
      </p>
    </main>
  );
}
