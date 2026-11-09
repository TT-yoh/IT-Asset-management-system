-- Migration 003 Down: Revert Idempotency Keys v2 Architecture
DROP TABLE IF EXISTS `idempotency_keys_v2`;
