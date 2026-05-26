export interface WeReadDebugEvent {
  stage: string;
  message?: string;
  data?: Record<string, unknown>;
}

export type WeReadDebugLogger = (event: WeReadDebugEvent) => void;

const DEFAULT_LOG_STAGES = new Set([
  "session_verify_succeeded",
  "session_verify_failed",
  "window_closed_without_verified_session",
  "weread_request_finished",
  "weread_request_failed",
  "weread_notebook_probe_finished",
]);

export function logWeReadDebug(event: WeReadDebugEvent, debugEnabled = false): void {
  if (!debugEnabled && !DEFAULT_LOG_STAGES.has(event.stage)) return;
  console.info("[ReadMind WeRead]", event.stage, event.message ?? "", event.data ?? {});
}

export function describeHeaderNames(headers: Record<string, unknown> | undefined): string[] {
  if (!headers) return [];
  return Object.keys(headers).sort();
}
