import type { users } from "./db/schema.js";
import type pino from "pino";

// Row type from Drizzle schema
export type User = typeof users.$inferSelect;

// Hono environment — available via c.get("user") after auth middleware
export type AppEnv = {
  Variables: {
    user: User;
    apiVersion: string;
    // F-0-014: request-scoped child logger with request_id + user_id.
    // Attached by the request-id middleware in app.ts. Always present.
    log: pino.Logger;
  };
};
