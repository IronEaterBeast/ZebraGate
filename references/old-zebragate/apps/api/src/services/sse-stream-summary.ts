const PREVIEW_MAX_CHARS = 1000;

export interface SseStreamSummary {
  chunkCount: number;
  outputTextPreview: string;
  finishReason: string | null;
  completed: boolean;
}

export interface SseStreamSummaryAccumulator {
  push(chunk: Uint8Array | string): void;
  finish(): SseStreamSummary;
}

export function createSseStreamSummaryAccumulator(): SseStreamSummaryAccumulator {
  const decoder = new TextDecoder();
  let buffer = "";
  let chunkCount = 0;
  let outputTextPreview = "";
  let finishReason: string | null = null;
  let completed = false;

  function consumeEvent(eventText: string): void {
    chunkCount += 1;
    const summary = extractStreamSummaryFromSseEvent(eventText);
    if (summary.outputTextFragment) {
      outputTextPreview = truncateText(`${outputTextPreview}${summary.outputTextFragment}`, PREVIEW_MAX_CHARS);
    }
    finishReason = summary.finishReason ?? finishReason;
    completed = summary.completed || completed;
  }

  return {
    push(chunk: Uint8Array | string): void {
      buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      const parts = splitSseEvents(buffer);
      buffer = parts.remaining;
      for (const eventText of parts.events) {
        consumeEvent(eventText);
      }
    },
    finish(): SseStreamSummary {
      buffer += decoder.decode();
      if (buffer) {
        consumeEvent(buffer);
        buffer = "";
      }

      return {
        chunkCount,
        outputTextPreview,
        finishReason,
        completed
      };
    }
  };
}

export function splitSseEvents(buffer: string): { events: string[]; remaining: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");

  return {
    events: parts.slice(0, -1),
    remaining: parts[parts.length - 1] ?? ""
  };
}

export function extractStreamSummaryFromSseEvent(eventText: string): {
  outputTextFragment: string;
  finishReason: string | null;
  completed: boolean;
} {
  const dataLines = eventText
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  if (dataLines.length === 0) {
    return {
      outputTextFragment: "",
      finishReason: null,
      completed: false
    };
  }

  const payload = dataLines.join("\n");
  if (payload === "[DONE]") {
    return {
      outputTextFragment: "",
      finishReason: null,
      completed: true
    };
  }

  try {
    const jsonPayload = JSON.parse(payload) as {
      choices?: Array<{
        delta?: {
          content?: string;
        };
        finish_reason?: string | null;
      }>;
    };

    const choices = Array.isArray(jsonPayload.choices) ? jsonPayload.choices : [];
    const outputTextFragment = choices
      .map((choice) => choice.delta?.content ?? "")
      .join("");
    const firstFinishReason = choices.find((choice) => typeof choice.finish_reason === "string" && choice.finish_reason.length > 0)?.finish_reason ?? null;

    return {
      outputTextFragment,
      finishReason: firstFinishReason,
      completed: false
    };
  } catch {
    return {
      outputTextFragment: "",
      finishReason: null,
      completed: false
    };
  }
}

export function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function summarizeSseStreamSummaryForTrace(summary: SseStreamSummary, prefix: string): string {
  const parts = [
    prefix,
    `chunks=${summary.chunkCount}`,
    summary.finishReason ? `finish=${summary.finishReason}` : null,
    summary.outputTextPreview ? `preview=${summary.outputTextPreview.slice(0, 120)}` : null
  ].filter(Boolean);

  return parts.join(" | ");
}
