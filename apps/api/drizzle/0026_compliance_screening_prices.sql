-- DEC-20260320-E: OpenSanctions commercial API tier confirmed at €0.10/call.
-- Raise compliance screening prices to €0.25 to maintain ~60% margin.
UPDATE capabilities SET price_cents = 25 WHERE slug IN ('sanctions-check', 'pep-check', 'adverse-media-check');
