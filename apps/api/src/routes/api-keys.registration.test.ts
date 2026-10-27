import { expect, it } from "vitest";
import { app } from "../app.js";

it.each([
  ["POST", "/v1/api-keys"],
  ["GET", "/v1/api-keys"],
  ["PATCH", "/v1/api-keys/00000000-0000-4000-8000-000000000000"],
  ["DELETE", "/v1/api-keys/00000000-0000-4000-8000-000000000000"],
])("%s %s is mounted and requires authentication", async (method, path) => {
  const response = await app.request(`http://localhost${path}`, { method });
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ error_code: "unauthorized" });
});
