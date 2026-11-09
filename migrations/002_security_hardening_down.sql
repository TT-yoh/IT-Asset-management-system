-- ============================================================================
-- OmniAsset Migration Rollback: 002_security_hardening_down.sql
-- ============================================================================

DROP TABLE IF EXISTS `idempotency_keys_v2`;
DROP TABLE IF EXISTS `audit_chain_heads`;
DROP TABLE IF EXISTS `recovery_codes`;
DROP TABLE IF EXISTS `login_attempts`;

