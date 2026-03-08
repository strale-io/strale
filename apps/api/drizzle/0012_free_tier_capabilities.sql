-- Sprint 4B: Free-tier capabilities — no auth, no wallet required
ALTER TABLE capabilities ADD COLUMN is_free_tier BOOLEAN NOT NULL DEFAULT false;

-- Set 5 capabilities as free-tier (algorithmic/low-cost, high first-contact value)
UPDATE capabilities SET is_free_tier = true WHERE slug IN (
  'email-validate',
  'dns-lookup',
  'json-repair',
  'url-to-markdown',
  'iban-validate'
);
