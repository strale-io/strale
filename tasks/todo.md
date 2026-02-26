# Strale MVP — Task Tracker

## Current Focus
Week 1-2: Core API + Wallet + First 2 Capabilities

## Plan
- [ ] Project scaffolding (monorepo, packages, tsconfig)
- [ ] Database schema (Drizzle ORM — users, wallets, wallet_transactions, capabilities, transactions)
- [ ] Auth middleware (API key validation, hashed keys)
- [ ] POST /v1/do — core endpoint with matching, wallet locking, execution
- [ ] Wallet system (Stripe Checkout top-up, webhook, balance check)
- [ ] Rate limiting (10 req/sec per key, €100/hr spend cap)
- [ ] Idempotency (on /v1/do and Stripe webhooks)
- [ ] Trial credits (€2.00 on signup)
- [ ] First 2 capabilities: swedish-company-data + vat-validate
- [ ] Health check endpoint
- [ ] Deploy to Railway (EU region)

## Progress

## Review
