import { autoRegisterCapabilities } from "../src/capabilities/auto-register.js";
import { getRegisteredCount } from "../src/capabilities/index.js";

await autoRegisterCapabilities();
console.log(JSON.stringify({ registered: getRegisteredCount() }, null, 2));
process.exit(0);
