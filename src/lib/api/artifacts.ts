/**
 * Client-side helpers for the artifact-generator lane (`/api/generate-artifacts`).
 *
 * The route streams Server-Sent Events back to the browser; we parse them
 * incrementally so the UI can render artifacts as they arrive instead of
 * waiting for the slowest single artifact in the batch (~30s for all 6 in
 * parallel).
 *
 * We deliberately avoid `EventSource` because it only supports GET requests
 * and we want to POST a substantial JSON payload (the full finalized plan).
 * Instead we use `fetch` + a manual SSE line parser. The parser is small
 * because we control both ends; we only emit `event:` + `data:` lines.
 */

import type { ArtifactPayload, ArtifactType } from '../llm/artifactSchemas';
import type { LearnerProfile, LessonPlanData, TextOption } from '../../types';

export interface ArtifactStreamHandlers {
  onArtifact?: (artifact: ArtifactPayload) => void;
  onError?: (info: { type: ArtifactType; message: string }) => void;
  onDone?: (info: {
    succeeded: ArtifactType[];
    failed: { type: ArtifactType; error: string }[];
    latencyMs: number;
    model: string;
  }) => void;
  onFatal?: (message: string) => void;
}

export interface ArtifactStreamArgs {
  plan: Partial<LessonPlanData>;
  selectedText?: TextOption | null;
  learnerProfile?: LearnerProfile | null;
  types?: ArtifactType[];
  /** Optional AbortSignal so callers can cancel mid-stream (e.g. on unmount). */
  signal?: AbortSignal;
}

/**
 * POST to /api/generate-artifacts and dispatch SSE events to the provided
 * handlers. Resolves once the stream closes (either after `done` or `fatal`).
 */
export async function streamArtifacts(
  args: ArtifactStreamArgs,
  handlers: ArtifactStreamHandlers,
): Promise<void> {
  const response = await fetch('/api/generate-artifacts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      plan: args.plan,
      selectedText: args.selectedText ?? null,
      learnerProfile: args.learnerProfile ?? null,
      ...(args.types ? { types: args.types } : {}),
    }),
    signal: args.signal,
  });

  if (!response.ok || !response.body) {
    const message = `Artifact generation failed: HTTP ${response.status}`;
    handlers.onFatal?.(message);
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE messages are separated by a blank line. Process any complete
      // messages we've accumulated; leave a partial trailing message for
      // the next chunk.
      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex !== -1) {
        const raw = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        dispatchSseMessage(raw, handlers);

        separatorIndex = buffer.indexOf('\n\n');
      }
    }

    if (buffer.trim().length > 0) {
      dispatchSseMessage(buffer, handlers);
    }
  } finally {
    reader.releaseLock();
  }
}

function dispatchSseMessage(raw: string, handlers: ArtifactStreamHandlers): void {
  let eventType = 'message';
  let dataLine = '';

  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) eventType = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
  }
  if (!dataLine) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(dataLine);
  } catch {
    return;
  }

  if (!parsed || typeof parsed !== 'object') return;
  const evt = parsed as Record<string, unknown>;

  switch (eventType) {
    case 'artifact':
      if (evt.artifact && typeof evt.artifact === 'object') {
        handlers.onArtifact?.(evt.artifact as ArtifactPayload);
      }
      break;
    case 'error':
      handlers.onError?.({
        type: (evt.artifact as ArtifactType) ?? ('unknown' as ArtifactType),
        message: typeof evt.message === 'string' ? evt.message : 'Unknown error',
      });
      break;
    case 'done':
      handlers.onDone?.({
        succeeded: Array.isArray(evt.succeeded) ? (evt.succeeded as ArtifactType[]) : [],
        failed: Array.isArray(evt.failed)
          ? (evt.failed as { type: ArtifactType; error: string }[])
          : [],
        latencyMs: typeof evt.latencyMs === 'number' ? evt.latencyMs : 0,
        model: typeof evt.model === 'string' ? evt.model : '',
      });
      break;
    case 'fatal':
      handlers.onFatal?.(typeof evt.message === 'string' ? evt.message : 'Unknown fatal error');
      break;
  }
}
