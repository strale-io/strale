Intent: wire apps/web test:built and test:browser into the CI web job (switch-over readiness items 10 and 13).

Both run as blocking steps after build:preview-data; Chromium installs once, before test:browser, and the live review reuses it. Local: test:built 5/5, test:browser 8/8. Not verified: the CI runner itself. HSTS includeSubDomains (item 13) is still not done.
