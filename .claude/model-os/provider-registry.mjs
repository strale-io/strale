// Small provider plug-in contract shared by discovery and execution. A provider
// can contribute either lane or both; duplicate surface/adapter ownership fails
// closed so routing never depends on import order.

export const PROVIDER_PLUGIN_CONTRACT_VERSION = 1;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function identifier(value, label) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]*$/.test(value)) {
    throw new Error(`${label} must be a lowercase identifier`);
  }
  return value;
}

export function validateProviderPlugin(plugin) {
  object(plugin, "provider plugin");
  if (plugin.contract_version !== PROVIDER_PLUGIN_CONTRACT_VERSION) {
    throw new Error(`provider plugin contract_version ${plugin.contract_version ?? "missing"} is unsupported`);
  }
  const id = identifier(plugin.id, "provider plugin id");
  const provider = identifier(plugin.provider, `provider plugin '${id}' provider`);
  const executionAdapters = plugin.execution_adapters == null ? {} : object(plugin.execution_adapters,
    `provider plugin '${id}' execution_adapters`);
  const discoveryAdapters = plugin.discovery_adapters == null ? {} : object(plugin.discovery_adapters,
    `provider plugin '${id}' discovery_adapters`);
  if (!Object.keys(executionAdapters).length && !Object.keys(discoveryAdapters).length) {
    throw new Error(`provider plugin '${id}' contributes no adapters`);
  }
  for (const [surface, adapter] of Object.entries(executionAdapters)) {
    identifier(surface, `provider plugin '${id}' execution surface`);
    if (!adapter || typeof adapter.verifySubscriptionAuth !== "function" || typeof adapter.execute !== "function") {
      throw new Error(`provider plugin '${id}' execution adapter '${surface}' requires verifySubscriptionAuth and execute`);
    }
  }
  for (const [adapterId, adapter] of Object.entries(discoveryAdapters)) {
    identifier(adapterId, `provider plugin '${id}' discovery adapter`);
    if (typeof adapter !== "function") throw new Error(`provider plugin '${id}' discovery adapter '${adapterId}' must be a function`);
  }
  const telemetry = object(plugin.telemetry, `provider plugin '${id}' telemetry`);
  for (const field of ["identity", "usage", "quota", "catalog"]) {
    if (typeof telemetry[field] !== "boolean") throw new Error(`provider plugin '${id}' telemetry.${field} must be boolean`);
  }
  if (Object.keys(executionAdapters).length && (!telemetry.identity || !telemetry.usage)) {
    throw new Error(`provider plugin '${id}' execution requires identity and usage telemetry declarations`);
  }
  return { contract_version: PROVIDER_PLUGIN_CONTRACT_VERSION, id, provider,
    execution_adapters: executionAdapters, discovery_adapters: discoveryAdapters,
    telemetry: { ...telemetry } };
}

export function createProviderRegistry(plugins) {
  if (!Array.isArray(plugins)) throw new Error("provider plugins must be an array");
  const ids = new Set();
  const executionAdapters = {};
  const discoveryAdapters = {};
  const validated = [];
  for (const raw of plugins) {
    const plugin = validateProviderPlugin(raw);
    if (ids.has(plugin.id)) throw new Error(`duplicate provider plugin '${plugin.id}'`);
    ids.add(plugin.id);
    for (const [surface, adapter] of Object.entries(plugin.execution_adapters)) {
      if (executionAdapters[surface]) throw new Error(`duplicate execution surface '${surface}'`);
      executionAdapters[surface] = adapter;
    }
    for (const [adapterId, adapter] of Object.entries(plugin.discovery_adapters)) {
      if (discoveryAdapters[adapterId]) throw new Error(`duplicate discovery adapter '${adapterId}'`);
      discoveryAdapters[adapterId] = adapter;
    }
    validated.push(plugin);
  }
  return { plugins: validated, executionAdapters, discoveryAdapters };
}
