import { describe, expect, it } from "vitest";

import { getDirectExecutor } from "./index.js";
import "./phone-validate.js";

const validatePhone = getDirectExecutor("phone-validate")!;

describe("phone-validate reserved fictional ranges", () => {
  it.each(["+13055550100", "+13055550150", "+13055550199"])(
    "reports %s as invalid and explains why",
    async (phoneNumber) => {
      const result = await validatePhone({ phone_number: phoneNumber });

      expect(result.output).toMatchObject({
        valid: false,
        e164: phoneNumber,
        reason: "reserved_fictional_range",
      });
    },
  );

  it.each(["+13055550099", "+13055550200"])(
    "does not apply the reserved-range rule to adjacent number %s",
    async (phoneNumber) => {
      const result = await validatePhone({ phone_number: phoneNumber });

      expect(result.output.valid).toBe(true);
      expect(result.output).not.toHaveProperty("reason");
    },
  );

  it.each(["+15555550150", "+10555550150"])(
    "does not give the fictional reason to %s, which is invalid for another cause",
    async (phoneNumber) => {
      const result = await validatePhone({ phone_number: phoneNumber });

      expect(result.output.valid).toBe(false);
      expect(result.output).not.toHaveProperty("reason");
    },
  );

  it("leaves a non-NANP number unchanged", async () => {
    const result = await validatePhone({ phone_number: "+46701234567" });

    expect(result.output.valid).toBe(true);
    expect(result.output).not.toHaveProperty("reason");
  });
});
