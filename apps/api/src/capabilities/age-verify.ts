import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("age-verify", async (input: CapabilityInput) => {
  const dobStr = ((input.date_of_birth as string) ?? (input.dob as string) ?? (input.task as string) ?? "").trim();
  if (!dobStr) {
    throw new Error("'date_of_birth' is required (YYYY-MM-DD format).");
  }

  const dob = new Date(dobStr + "T00:00:00Z");
  if (isNaN(dob.getTime())) {
    return {
      output: {
        date_of_birth: dobStr,
        date_of_birth_valid: false,
        error: "Invalid date format. Use YYYY-MM-DD.",
      },
      provenance: { source: "strale-age-calculator", fetched_at: new Date().toISOString() },
    };
  }

  const minimumAge = (input.minimum_age as number) ?? 18;
  const refStr = ((input.reference_date as string) ?? "").trim();
  const refDate = refStr ? new Date(refStr + "T00:00:00Z") : new Date();
  if (isNaN(refDate.getTime())) {
    throw new Error("Invalid reference_date format. Use YYYY-MM-DD.");
  }

  // Validate DOB is in the past
  if (dob > refDate) {
    return {
      output: {
        date_of_birth: dobStr,
        date_of_birth_valid: false,
        error: "Date of birth is in the future.",
      },
      provenance: { source: "strale-age-calculator", fetched_at: new Date().toISOString() },
    };
  }

  // Calculate exact age
  let years = refDate.getUTCFullYear() - dob.getUTCFullYear();
  let months = refDate.getUTCMonth() - dob.getUTCMonth();
  let days = refDate.getUTCDate() - dob.getUTCDate();

  if (days < 0) {
    months--;
    // Days in the previous month of refDate
    const prevMonth = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), 0));
    days += prevMonth.getUTCDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  const meetsMinimum = years >= minimumAge;

  // Calculate days until minimum age is met
  let daysUntilMinimum: number | null = null;
  if (!meetsMinimum) {
    const minDate = new Date(Date.UTC(dob.getUTCFullYear() + minimumAge, dob.getUTCMonth(), dob.getUTCDate()));
    daysUntilMinimum = Math.ceil((minDate.getTime() - refDate.getTime()) / (24 * 60 * 60 * 1000));
    if (daysUntilMinimum < 0) daysUntilMinimum = 0;
  }

  return {
    output: {
      date_of_birth: dobStr,
      date_of_birth_valid: true,
      age_years: years,
      age_months: months,
      age_days: days,
      meets_minimum: meetsMinimum,
      minimum_age_checked: minimumAge,
      days_until_minimum: daysUntilMinimum,
      reference_date: refDate.toISOString().split("T")[0],
    },
    provenance: { source: "strale-age-calculator", fetched_at: new Date().toISOString() },
  };
});
