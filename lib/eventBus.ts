import { EventEmitter } from 'node:events';

/**
 * ---------------------------------------------------------------------------
 * In-process event bus
 * ---------------------------------------------------------------------------
 * The server is a single Express process, so a plain EventEmitter is all that
 * is needed to let the Command Center's SSE stream know something changed.
 * Every mutation that a dashboard renders publishes here; the stream endpoint
 * filters events down to what each viewer is allowed to see.
 */

export type CommandEvent =
  | { type: 'appointment.status'; appointmentId: string; status: string; doctorId?: string; facilityId?: string }
  | { type: 'appointment.created'; appointmentId: string; doctorId?: string; facilityId?: string }
  | { type: 'token.created'; tokenId: string; facilityId?: string; doctorId?: string }
  | { type: 'token.status'; tokenId: string; status: string; facilityId?: string; doctorId?: string }
  | { type: 'doctor.changed'; doctorId: string; facilityId?: string };

const emitter = new EventEmitter();
// Dashboards, the SSE stream and the background worker can all listen at once.
emitter.setMaxListeners(100);

const CHANNEL = 'command';

/** Fire-and-forget: publishing must never break the request that caused it. */
export function publishEvent(event: CommandEvent): void {
  try {
    emitter.emit(CHANNEL, { ...event, at: new Date().toISOString() });
  } catch (error) {
    console.error('Failed to publish command event:', error);
  }
}

export function subscribeToEvents(listener: (event: CommandEvent & { at: string }) => void): () => void {
  emitter.on(CHANNEL, listener);
  return () => emitter.off(CHANNEL, listener);
}
