export type TranscriptRole = "user" | "assistant";

export type TranscriptEntry =
  | {
      id: string;
      kind: "message";
      role: TranscriptRole;
      text: string;
      partial: boolean;
    }
  | {
      id: string;
      kind: "tool-call";
      names: string[];
      toolCallIds: string[];
      completed: boolean;
    };
