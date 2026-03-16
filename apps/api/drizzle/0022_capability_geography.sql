-- Add geography column to capabilities (matches solutions.geography pattern)
ALTER TABLE capabilities ADD COLUMN geography VARCHAR(50);

-- Nordic capabilities
UPDATE capabilities SET geography = 'nordic' WHERE slug IN (
  'swedish-company-data', 'danish-company-data', 'norwegian-company-data',
  'finnish-company-data', 'swedish-annual-report', 'swedish-beneficial-owner',
  'business-license-check-se', 'job-board-search'
);

-- UK capabilities
UPDATE capabilities SET geography = 'uk' WHERE slug IN (
  'uk-company-data', 'charity-lookup-uk', 'food-safety-rating-uk'
);

-- US capabilities
UPDATE capabilities SET geography = 'us' WHERE slug IN (
  'us-company-data', 'us-sec-filing', 'us-trademark-search', 'fda-recall-search',
  'us-state-business-search'
);

-- EU-specific capabilities (regulations, registries, EU-wide services)
UPDATE capabilities SET geography = 'eu' WHERE slug IN (
  'vat-validate', 'eori-validate', 'gdpr-website-check', 'eu-ai-act-classify',
  'data-protection-authority-lookup', 'eu-court-case-search', 'gdpr-fine-lookup',
  'ted-procurement', 'customs-duty-lookup', 'ecb-interest-rates',
  'austrian-company-data', 'german-company-data', 'french-company-data',
  'dutch-company-data', 'belgian-company-data', 'spanish-company-data',
  'italian-company-data', 'portuguese-company-data', 'irish-company-data',
  'estonian-company-data', 'latvian-company-data', 'lithuanian-company-data',
  'polish-company-data', 'swiss-company-data',
  'sepa-xml-validate', 'vat-rate-lookup', 'vat-format-validate'
);

-- Everything else defaults to global
UPDATE capabilities SET geography = 'global' WHERE geography IS NULL;
