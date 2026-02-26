import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("timezone-meeting-find", async (input: CapabilityInput) => {
  const timezones = (input.timezones as string[]) ?? [];
  if (timezones.length < 2) throw new Error("'timezones' must contain at least 2 timezone names.");

  const preferredHours = ((input.preferred_hours as string) ?? "09:00-17:00").trim();
  const durationMinutes = Math.max((input.duration_minutes as number) ?? 60, 15);

  const [prefStartStr, prefEndStr] = preferredHours.split("-");
  const prefStart = parseTime(prefStartStr?.trim() ?? "09:00");
  const prefEnd = parseTime(prefEndStr?.trim() ?? "17:00");

  // Get offsets for each timezone
  const now = new Date();
  const tzOffsets = timezones.map((tz) => {
    try {
      const offset = getTimezoneOffset(tz, now);
      return { timezone: tz, offsetMinutes: offset };
    } catch {
      throw new Error(`Invalid timezone: '${tz}'.`);
    }
  });

  // Find slots for the next 5 business days
  const slots: Array<{
    utc_start: string;
    utc_end: string;
    local_times: Record<string, string>;
    fairness_score: number;
    all_within_preferred: boolean;
  }> = [];

  const startDate = new Date(now);
  startDate.setUTCHours(0, 0, 0, 0);
  startDate.setUTCDate(startDate.getUTCDate() + 1);

  let daysChecked = 0;
  let dayOffset = 0;
  while (daysChecked < 5 && dayOffset < 10) {
    const day = new Date(startDate);
    day.setUTCDate(day.getUTCDate() + dayOffset);
    dayOffset++;

    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue; // Skip weekends
    daysChecked++;

    // Check each 30-minute slot
    for (let minuteOfDay = 0; minuteOfDay < 24 * 60; minuteOfDay += 30) {
      const slotStart = new Date(day);
      slotStart.setUTCMinutes(minuteOfDay);
      const slotEnd = new Date(slotStart);
      slotEnd.setUTCMinutes(slotEnd.getUTCMinutes() + durationMinutes);

      // Check if all participants are within preferred hours
      let allWithin = true;
      let totalDeviationMinutes = 0;
      const localTimes: Record<string, string> = {};

      for (const tz of tzOffsets) {
        const localStartMin = (minuteOfDay + tz.offsetMinutes + 24 * 60) % (24 * 60);
        const localEndMin = localStartMin + durationMinutes;

        localTimes[tz.timezone] = `${formatMinutes(localStartMin)} - ${formatMinutes(localEndMin % (24 * 60))}`;

        if (localStartMin < prefStart || localEndMin > prefEnd) {
          allWithin = false;
          // Calculate deviation
          if (localStartMin < prefStart) totalDeviationMinutes += prefStart - localStartMin;
          if (localEndMin > prefEnd) totalDeviationMinutes += localEndMin - prefEnd;
        }
      }

      if (allWithin) {
        // Calculate fairness: how balanced is the time across participants
        const localStarts = tzOffsets.map((tz) => {
          return (minuteOfDay + tz.offsetMinutes + 24 * 60) % (24 * 60);
        });
        const avgStart = localStarts.reduce((a, b) => a + b, 0) / localStarts.length;
        const variance = localStarts.reduce((sum, s) => sum + Math.pow(s - avgStart, 2), 0) / localStarts.length;
        const fairnessScore = Math.max(0, Math.round(100 - Math.sqrt(variance) / 3));

        slots.push({
          utc_start: slotStart.toISOString(),
          utc_end: slotEnd.toISOString(),
          local_times: localTimes,
          fairness_score: fairnessScore,
          all_within_preferred: true,
        });
      }
    }
  }

  // Sort by fairness score, take top 10
  slots.sort((a, b) => b.fairness_score - a.fairness_score);
  const optimalSlots = slots.slice(0, 10);

  return {
    output: {
      timezones: tzOffsets.map((tz) => ({
        timezone: tz.timezone,
        utc_offset: formatOffset(tz.offsetMinutes),
      })),
      preferred_hours: preferredHours,
      duration_minutes: durationMinutes,
      optimal_slots: optimalSlots,
      total_viable_slots: slots.length,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});

function parseTime(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

function getTimezoneOffset(tz: string, date: Date): number {
  const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = date.toLocaleString("en-US", { timeZone: tz });
  const utcDate = new Date(utcStr);
  const tzDate = new Date(tzStr);
  return Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
}
