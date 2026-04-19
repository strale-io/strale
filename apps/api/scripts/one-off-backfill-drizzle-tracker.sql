-- ONE-OFF: SCF-5 — backfill drizzle.__drizzle_migrations
--
-- DO NOT RE-RUN. Applied 2026-04-20 to recover from a journal/tracker drift
-- that was blocking every drizzle-kit migrate call. After this backfill,
-- drizzle-kit migrate reports "no migrations to apply" against prod and
-- SA.2a-style commits can ship normally.
--
-- Why this exists rather than running drizzle-kit:
--   - drizzle-kit has no first-class "mark as already applied" command.
--   - The schema migration files have already taken effect on prod via
--     manual psql or drizzle-kit push at various points; only the
--     bookkeeping (journal + tracker) lagged behind.
--   - SHA-256 of file contents (UTF-8) — algorithm matches
--     drizzle-orm/migrator.js:23 readMigrationFiles().
--   - created_at = journal entry whenMs (matches dialect.cjs:64
--     migrate-loop folderMillis check).
--
-- Pre-condition: SELECT COUNT(*) FROM drizzle.__drizzle_migrations = 0
-- Post-condition: SELECT COUNT(*) = 49
--
-- Generated and applied by a Node script (see commit body) inside a
-- transaction with verify-before-commit guards. This file is the
-- audit trail of what was inserted.

BEGIN;

-- idx 0: 0000_damp_mastermind
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('aa55db521bdc9ba0df53554b32d5509ca101352696cd4bfbb4df150e8d135b38', 1772141476838);
-- idx 1: 0001_nervous_human_cannonball
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('591e618f925b473325afa8cf05c548d1831887170c7ba42d4deb58dbda707b7e', 1772153783183);
-- idx 2: 0002_overrated_silver_surfer
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('9819ad023d9ca3edceb606faa7f8d423d29f002e9325982179d33780f68f37fa', 1772442799420);
-- idx 3: 0003_nice_toad
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('08f14ed63e29c8fc325caadffd8247b81c7f0929b337360f5ca30d2103c3a20f', 1772552360398);
-- idx 4: 0004_hot_mongoose
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('28e1c6d72af756b5c108639f42bc697d430d60901891be2add5d4e92c29ff17d', 1772553676700);
-- idx 5: 0005_tiny_robin_chapel
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('423947d954795eaf0890e871a86c2f5d46423d36aed6b71b40bab666e621c88a', 1772554252443);
-- idx 6: 0006_curly_owl
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('1891fac344be84919a0c3944ba88359f7ba5efc2f139a804600e5d9f3579de18', 1772554865549);
-- idx 7: 0007_romantic_skrulls
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('992f17fab26544de5654c46c69eeb513b3afa99c44d2306b5aa538c5726eb24f', 1772748010616);
-- idx 8: 0008_capability_transparency_tag
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('1cc3366a7504c8266bbb0a11f44bb32ebe977a210f4045e9ee51df76c927d418', 1772756294000);
-- idx 9: 0009_cost_smart_testing
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('65438fc5870f81e9b1ebd35a85d4c2c382972cbbb3d895c431d32eb6ecb7af5a', 1772798782000);
-- idx 10: 0010_test_results_composite_index
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('556b8f7930f5b9756109a178f04a91c1326cc196f0285ca8beff32efcb733bbd', 1772805406000);
-- idx 11: 0011_capability_data_source
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('a389faa3daa574c378f54ceecfa5150de186f9eebfd560569f890bbacd8b7007', 1772875954000);
-- idx 12: 0012_free_tier_capabilities
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('70c6bb190d6514e1dda61d4bc5cdbc68f108820b2a9f5f12e66ba46b8bbded47', 1772970287000);
-- idx 13: 0013_solution_description_tiers
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('76c120287fa34615a90bfdad44908f23a0410c34a539bdd1430c07f33f70737f', 1773047058000);
-- idx 14: 0014_capability_data_classification
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('d9a96e5431cdf1ccfe95e91b59e60f7e4b7ad11651fbb0fd991a7baa30b5631f', 1773052719000);
-- idx 15: 0015_freshness_latency
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('271d55e79a45751d23811825515c013c009d88c7dfffa26697a5de6d6253032d', 1773093349000);
-- idx 16: 0016_compliance_coverage
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('6b9d3fa9805c73b226d58d822e24cfe5a519e68ee63290c3d11766dd06365d11', 1773135919000);
-- idx 17: 0017_limitation_title
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('67e446e33ace43015f4a552c97577abcf9b3c6fdf1f1df635992e869899cfec1', 1773146920000);
-- idx 18: 0018_adaptive_test_intelligence
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('f06401e16c25a65e82d7208607b8655f4b0b946ef3ce19429914839f06a605ba', 1773398440000);
-- idx 19: 0019_dual_profile
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('c519d131d9aa1ac7f2c75fba681700c26f3dfb6bc9191d7d923fa6528212363c', 1773603618000);
-- idx 20: 0020_execution_guidance
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('c62e4a73b911b4750f74de90d479ec165b7dc5bfd02742569a6ddc84550f4fff', 1773603618000);
-- idx 21: 0021_free_tier_transactions
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('16d5ae759d741c80fe47798bf90455a0f2690bad907ddda5d45ac4c1d754f6eb', 1773615979000);
-- idx 22: 0022_capability_geography
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('0f242378492fa4c1ac0f20555bdfc11be1a7c3bce96d1ad5ad3e0a0271e95344', 1773696853000);
-- idx 23: 0023_pipeline_foundation
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('31af9f57ed912a0a4f5c98135b531eed4ab11a5d661fe25bb114998cf0efd045', 1773760677000);
-- idx 24: 0024_pipeline_safe_defaults
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('7794667a9b5e1e9d7476ea98ee33bbada66ff152b84f0addfcba4d824ed6caf3', 1773790019000);
-- idx 25: 0025_test_mode_columns
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('ec8e2cb0e9c7a8ab73a306baaf861e9ec35aa1be4d4e1b2709b3198180f0696a', 1774000086000);
-- idx 26: 0026_compliance_screening_prices
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('fe331444caafcbfab0e191d8481cc01c1468ee52fcda37caec83cfa689beccc9', 1774008504000);
-- idx 27: 0027_search_tags
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('17cac46362f786cda9f62b6e1183bab635981c24abcfe0bcf1161e7ab9eccd42', 1774012158000);
-- idx 28: 0028_sqs_daily_snapshot
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('60895a9d788a1f6ffbabccede86858762cf6b94082975e398e906bd2b67d678f', 1774018393000);
-- idx 29: 0029_test_run_actual_cost
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('a27856107c29e5ece8366f8990dd2357af3e8224ef735a812680a9a585c3e46d', 1774039645000);
-- idx 30: 0030_compliance_infrastructure
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('c905cf5c5efe067b5f29fe06527a80116d1f5386654d410417b33a7a15a92ce3', 1774046081000);
-- idx 31: 0031_test_results_suite_executed_index
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('c92cb951835812ba57b3202edefed175f73b8e6e0975df89c7c46bf6f90ff342', 1774049897000);
-- idx 32: 0032_trust_metadata_columns
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('07822e5f3d2de8ecfae2de6eb68a21921b866d9ae2047b992ec9fb923f9bca22', 1774286353000);
-- idx 33: 0033_health_failure_category
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('9790f8453933887141aa4823d7cbe9ea6e6b28c2067b90a513632bd693cdfa13', 1774304179000);
-- idx 34: 0034_solution_steps_capability_fk
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('481b206402f2e292ea13147e23d03e81354af0e7123026dfc2b46873a774eda7', 1774477380000);
-- idx 35: 0035_test_suites_generation_metadata
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('dfebab7a053df2a0b0f00390210f4577b39706fb03236c6d19d04110c90f4d72', 1774484325000);
-- idx 36: 0036_x402_gateway_columns
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('31b52a258c3a85be464d67b21865f824f4f417fc4e0875d0a3944ec792a6784f', 1774813542000);
-- idx 37: 0037_x402_enable_all
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('f529329166630b19fe213e681dfb47fb17eae1180ef2b7a6171cd8c5afc74a0b', 1774813542000);
-- idx 38: 0038_failed_requests_extended
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('24898b95da2a0c8e082fb3a8829b2e5422f58014c2a4c921cc067f2aa3dc724c', 1774967306000);
-- idx 39: 0039_digest_snapshots
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('4963a180bbcaf0118c5630abccd5d82ac5a21bc4cd640b992aefe3c071722bae', 1775041038000);
-- idx 40: 0040_lifecycle_deactivation
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('51bd39a04e98903b895eb82a9d2a9024b5c3c75d23470f220713495f84fcfd8f', 1775078692000);
-- idx 41: 0041_activation_tracking
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('937115ded57ecf2f77f6867a92dde81600795e2a7976ff75b6c2b72af72219c6', 1775111643000);
-- idx 42: 0042_verify_chain_indexes
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('5364afe93df2be61237243d7fac5cefade914795b30dc256aaa18954cbdd1a7b', 1775112041000);
-- idx 43: 0043_solution_transactions
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('953e8a96e5fa0c8c69b28ffed9b5a63c4b35172169cc0d2c937894efeef2070b', 1775396091000);
-- idx 44: 0044_maintenance_class
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('a4936264e26fbbc7a4499c6e2fcf4b9e9ee4c6df06018a64a941d3892418ad46', 1775934369000);
-- idx 45: 0045_baseline_invalidation_trigger
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('d1301433af5b72e3a23f69f732a7a5b53b60dc7082c123fb4ad2ae2a2a9f003e', 1776418849000);
-- idx 46: 0046_rate_limit_counters
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('4d70a5dedcbfddc55c6f3b8e7d03218e890078ff4273cc0edddd5d08b7a20d37', 1776436841000);
-- idx 47: 0047_compliance_hash_state
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('6584aeb8c6e5056318c46b2e93567491724fb2d95a5b7430104b1308a42b63bf', 1776448759000);
-- idx 48: 0046_suggest_log
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('04991b5fbf63f2dffe897d89c2b13d44269c67952b58bb2db002c583bf39bb2f', 1776448910000);

COMMIT;
