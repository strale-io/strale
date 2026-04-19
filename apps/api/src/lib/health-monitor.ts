/**
 * Health Monitor — HM-1
 *
 * Provides a single logHealthEvent() function that all subsystems use to
 * write structured entries to the health_monitor_events table.
 *
 * Monitoring code must never crash the thing it monitors — every call
 * is wrapped in a try/catch that swallows errors and logs to console.
 */

import { getDb } from "../db/index.js";
import { healthMonitorEvents } from "../db/schema.js";
import { logError } from "./log.js";

export interface HealthEventInput {
  eventType: string;
  capabilitySlug?: string;
  tier: 1 | 2 | 3;
  actionTaken: string;
  details: Record<string, unknown>;
  humanOverride?: boolean;
}

/**
 * Insert a structured event into health_monitor_events.
 * Never throws — failures are logged to console.error.
 */
export async function logHealthEvent(event: HealthEventInput): Promise<void> {
  try {
    const db = getDb();
    await db.insert(healthMonitorEvents).values({
      eventType: event.eventType,
      capabilitySlug: event.capabilitySlug ?? null,
      tier: event.tier,
      actionTaken: event.actionTaken,
      details: event.details,
      humanOverride: event.humanOverride ?? false,
    });
  } catch (err) {
    logError("health-monitor-log-event-failed", err);
  }
}
