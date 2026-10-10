import { User, UserRole, AuthSession, PendingRegistration } from '../types';
import { USERS, ORGANIZATIONS } from '../mockData';

/**
 * Simulated NextAuth Configuration for Next.js 14 (src/lib/auth.ts)
 * Configures Credentials Provider, TOTP 2FA, JWT Multi-Tenant Context, & Session Callbacks.
 */

export const NEXTAUTH_CONFIG_CODE = `// src/lib/auth.ts - NextAuth Configuration with 2FA & Multi-Tenant Context
import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import speakeasy from 'speakeasy';
import prisma from '@/lib/prisma';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Organization Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        org_id: { label: 'Organization ID', type: 'text' },
        two_fa_code: { label: '2FA Code', type: 'text' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password || !credentials?.org_id) {
          throw new Error('Missing required login parameters');
        }

        // 1. Check organization tenant exists
        const org = await prisma.organization.findUnique({ where: { id: credentials.org_id } });
        if (!org) throw new Error('Organization tenant not found');

        // 2. Verify user credentials
        const user = await prisma.user.findUnique({
          where: { orgId_email: { orgId: credentials.org_id, email: credentials.email } },
          include: { assignedAssets: true }
        });

        if (!user || !user.isActive) {
          throw new Error('Invalid credentials or inactive account');
        }

        // 3. Check 2FA Multi-Factor verification requirement
        if (user.twoFactorEnabled) {
          if (!credentials.two_fa_code) {
            // Signal client that 2FA step is required
            throw new Error('REQUIRES_2FA');
          }
          const verified = speakeasy.totp.verify({
            secret: user.twoFactorSecret,
            encoding: 'base32',
            token: credentials.two_fa_code,
            window: 1
          });
          if (!verified) throw new Error('Invalid 2FA Authenticator code');
        }

        // Return JWT payload object
        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          org_id: user.orgId,
          role: user.role,
          department_id: user.departmentId,
          branch_id: user.branchId,
          assigned_asset_ids: user.assignedAssets.map(a => a.id)
        };
      }
    })
  ],
  session: { strategy: 'jwt', maxAge: 24 * 60 * 60 },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.org_id = user.org_id;
        token.role = user.role;
        token.department_id = user.department_id;
        token.branch_id = user.branch_id;
        token.assigned_assets = user.assigned_asset_ids;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub!;
      session.user.org_id = token.org_id as string;
      session.user.role = token.role as any;
      session.user.department_id = token.department_id as string;
      session.user.branch_id = token.branch_id as string;
      session.user.assigned_assets = token.assigned_assets as string[];
      return session;
    }
  },
  events: {
    async signIn({ user }) {
      await prisma.auditLog.create({
        data: { orgId: user.org_id, userId: user.id, action: 'USER_LOGIN_SUCCESS', entityType: 'Auth', changes: { ip: 'Client_IP' } }
      });
    }
  }
};`;

// Simulated Runtime Authentication Engine for live testing
let pending2FAUser: User | null = null;

export const MockAuthEngine = {
  /**
   * Simulate POST /api/auth/login
   */
  loginAttempt(email: string, orgId: string, customUsersList?: User[], password?: string): { status: number; requires_2fa?: boolean; session?: AuthSession; error?: string; totpHint?: string } {
    const org = ORGANIZATIONS.find(o => o.id === orgId);
    if (!org) return { status: 404, error: 'Tenant organization not found' };

    const list = customUsersList || USERS;
    const normalizedInput = email.trim().toLowerCase();
    const isSuperAdmin = normalizedInput === 'ishmaelt42@gmail.com';

    if (isSuperAdmin && password && password !== 'Tatenda3@4') {
      return { status: 401, error: 'Invalid password for Super Administrator account.' };
    }

    const user = list.find(u => 
      (u.orgId === orgId || isSuperAdmin) && (
        u.email.toLowerCase() === normalizedInput || 
        (isSuperAdmin && (u.id === 'usr-super-admin-ishmael' || u.email.toLowerCase() === 'ishmaelt42@gmail.com')) ||
        u.email.toLowerCase().split('@')[0] === normalizedInput
      )
    );
    if (!user) return { status: 401, error: 'Invalid user email or credentials for this organization' };

    if (user.twoFactorEnabled) {
      pending2FAUser = user;
      // Generate simulated TOTP code for testing convenience
      const mockTotp = Math.floor(100000 + Math.random() * 900000).toString();
      return {
        status: 200,
        requires_2fa: true,
        totpHint: mockTotp
      };
    }

    const session: AuthSession = {
      user,
      token: `jwt_tenant_${user.orgId}_${user.id}_${Date.now()}`,
      expires: new Date(Date.now() + 86400000).toISOString(),
      requires2FA: false,
      is2FAVerified: true
    };
    return { status: 200, session };
  },

  /**
   * Simulate POST /api/auth/verify-2fa
   */
  verify2FA(code: string, expectedTotp?: string): { status: number; session?: AuthSession; error?: string } {
    if (!pending2FAUser) return { status: 400, error: 'No pending 2FA login attempt active' };

    // In preview simulator, accept either the generated hint or '123456'
    if (code !== expectedTotp && code !== '123456') {
      return { status: 401, error: 'Invalid 6-digit TOTP code. Try the hint or 123456.' };
    }

    const user = pending2FAUser;
    pending2FAUser = null;
    const session: AuthSession = {
      user,
      token: `jwt_2fa_verified_${user.orgId}_${user.id}_${Date.now()}`,
      expires: new Date(Date.now() + 86400000).toISOString(),
      requires2FA: true,
      is2FAVerified: true
    };
    return { status: 200, session };
  }
};
