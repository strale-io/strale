// F5: a scanner must inspect at least one input. Findings/allowlists may be
// empty; the collection being checked may not. Include the gate and selector
// in the error so a broken glob is actionable.
export function requireInputs(inputs, selector) {
  const size = typeof inputs === "number" ? inputs : inputs?.size ?? inputs?.length ?? Object.keys(inputs ?? {}).length;
  if (size === 0) throw new Error(`EMPTY_INPUT: ${selector} matched no inputs; check the checkout, selector and working directory`);
  return inputs;
}
