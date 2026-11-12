-- ============================================================================
-- OmniAsset Migration: 006_cost_source_hardening.sql
-- Description: Add cost_source tracking to distinguish verified manual costs
--              from AI-estimated suggested costs.
-- ============================================================================

ALTER TABLE `assets`
  ADD COLUMN IF NOT EXISTS `cost_source` ENUM('MANUAL', 'ESTIMATED') NOT NULL DEFAULT 'MANUAL' AFTER `current_value`;

