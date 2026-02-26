import type { users } from "./db/schema.js";

// Row type from Drizzle schema
export type User = typeof users.$inferSelect;

// Hono environment — available via c.get("user") after auth middleware
export type AppEnv = {
  Variables: {
    user: User;
  };
};
