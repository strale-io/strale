#!/usr/bin/env node
import { main } from "./main.js";

const code = await main(process.argv.slice(2), {
  env: { STRALE_API_KEY: process.env.STRALE_API_KEY },
  io: {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
  fetch: globalThis.fetch,
});
process.exitCode = code;
