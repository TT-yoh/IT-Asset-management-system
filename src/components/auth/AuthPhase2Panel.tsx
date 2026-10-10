import React, { useState, useEffect } from 'react';
import { Organization, User, AuthSession, PendingRegistration } from '../../types';
import { LoginForm } from './LoginForm';
import { MockAuthEngine, NEXTAUTH_CONFIG_CODE } from '../../lib/auth';
import { ROLE_PERMISSIONS, createPermissionCheck } from '../../lib/rbac';
import {
  ShieldCheck,
  KeyRound,
  UserPlus,
  FileCode,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  Mail,
  Phone,
  AlertCircle,
  RefreshCw,
  Lock,
  ArrowLeft,
  Users,
  Check,
  Code2,
  Copy,
  Terminal,
  Server
} from 'lucide-react';

interface AuthPhase2PanelProps {
  organizations: Organization[];
  currentOrg: Organization;
  currentUser: User | null;
  onUserSwitch: (user: User | null) => void;
  users?: User[];
  branches?: any[];
  onRegisterUser?: (newUser: User) => void;
  onRegisterBranch?: (newBranch: any) => void;
  isFullScreen?: boolean;
}

// Initial mock pending registrations for admin review workflow
const INITIAL_PENDING: PendingRegistration[] = [
  {
    id: 'pend-101',
    orgId: 'org-mineazy',
    orgName: 'Mineazy Mining Co.',
    email: 'k.weber@mineazy.com',
    fullName: 'Klaus Weber',
    phone: '+1 (555) 238-9941',
    departmentId: 'dept-ops',
    departmentName: 'Mining Operations',
    status: 'PENDING',
    requestedAt: '10 mins ago'
  },
  {
    id: 'pend-102',
    orgId: 'org-mineazy',
    orgName: 'Mineazy Mining Co.',
    email: 's.patel@mineazy.com',
    fullName: 'Sanjay Patel',
    phone: '+1 (555) 891-4412',
    departmentId: 'dept-it',
    departmentName: 'IT Infrastructure',
    status: 'PENDING',
    requestedAt: '1 hour ago'
  },
  {
    id: 'pend-201',
    orgId: 'org-ebs',
    orgName: 'EBS Power & Energy',
    email: 'm.dubois@ebs-power.com',
    fullName: 'Marc Dubois',
    phone: '+1 (555) 341-0082',
    departmentId: 'dept-fin',
    departmentName: 'Finance & Procurement',
    status: 'PENDING',
    requestedAt: '3 hours ago'
  }
];

export const AuthPhase2Panel: React.FC<AuthPhase2PanelProps> = ({
  organizations,
  currentOrg,
  currentUser,
  onUserSwitch,
  users = [],
  branches = [],
  onRegisterUser,
  onRegisterBranch,
  isFullScreen = false
}) => {
  // Navigation inside Auth Panel
  const [panelMode, setPanelMode] = useState<'SIMULATOR' | 'CODE_DELIVERABLES'>('SIMULATOR');
  const [simStep, setSimStep] = useState<string>('LOGIN');

  // Simulator State
  const [selectedOrgId, setSelectedOrgId] = useState<string>(currentOrg.id);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [totpHint, setTotpHint] = useState<string>('123456');
  const [totpInput, setTotpInput] = useState('');
  const [totpTimer, setTotpTimer] = useState(60);
  const [activeSession, setActiveSession] = useState<AuthSession | null>(null);

  // Registration request state
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regDept, setRegDept] = useState('dept-it');
  const [regRole, setRegRole] = useState('IT_SUPPORT');
  const [regBranchId, setRegBranchId] = useState('');
  const [regSuccess, setRegSuccess] = useState(false);
  const [pendingQueue, setPendingQueue] = useState<PendingRegistration[]>(INITIAL_PENDING);

  // Direct User Registration states (Admin usage)
  const [directFullName, setDirectFullName] = useState('');
  const [directEmail, setDirectEmail] = useState('');
  const [directRole, setDirectRole] = useState('IT_SUPPORT');
  const [directDept, setDirectDept] = useState('dept-it');
  const [directBranchId, setDirectBranchId] = useState('');
  const [directSuccess, setDirectSuccess] = useState(false);

  // Direct Branch Registration states (Admin usage)
  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [branchCity, setBranchCity] = useState('');
  const [branchLocation, setBranchLocation] = useState('');
  const [branchSuccess, setBranchSuccess] = useState(false);

  // Deliverables code tab
  const [activeCodeFile, setActiveCodeFile] = useState<string>('route_login');
  const [copiedCode, setCopiedCode] = useState(false);

  // 60s TOTP Countdown Timer
  useEffect(() => {
    if (simStep !== '2FA_TOTP') return;
    const interval = setInterval(() => {
      setTotpTimer(prev => (prev <= 1 ? 60 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [simStep]);

  // Handle Login Attempt
  const handleLoginSubmit = (email: string, pass: string) => {
    setIsLoading(true);
    setLoginError(null);
    setTimeout(() => {
      setIsLoading(false);
      const res = MockAuthEngine.loginAttempt(email, selectedOrgId, users, pass);
      if (res.error) {
        setLoginError(res.error);
        return;
      }
      if (res.requires_2fa) {
        setTotpHint(res.totpHint || '123456');
        setTotpInput('');
        setSimStep('2FA_TOTP');
        return;
      }
      if (res.session) {
        setActiveSession(res.session);
        onUserSwitch(res.session.user);
        alert(`Authentication Successful! Signed in as ${res.session.user.fullName} (${res.session.user.role}) for DB Tenant ${res.session.user.orgId}`);
      }
    }, 600);
  };

  // Handle 2FA Verification
  const handleVerify2FA = (e: React.FormEvent) => {
    e.preventDefault();
    const res = MockAuthEngine.verify2FA(totpInput, totpHint);
    if (res.error) {
      setLoginError(res.error);
      return;
    }
    if (res.session) {
      setActiveSession(res.session);
      onUserSwitch(res.session.user);
      setSimStep('LOGIN');
      alert(`2FA Verified! Session established for ${res.session.user.fullName} (${res.session.user.role}). JWT token generated with multi-tenant claims.`);
    }
  };

  // Handle Registration Submit
  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regEmail || !regFullName) return;
    const org = organizations.find(o => o.id === selectedOrgId);
    const newItem: PendingRegistration = {
      id: `pend-${Date.now()}`,
      orgId: selectedOrgId,
      orgName: org?.name || 'Organization',
      email: regEmail,
      fullName: regFullName,
      phone: regPhone || '+1 (555) 000-0000',
      departmentId: regDept,
      departmentName: regDept === 'dept-it' ? 'IT Infrastructure' : regDept === 'dept-fin' ? 'Finance & Budget' : 'Mining Operations',
      status: 'PENDING',
      requestedAt: 'Just now'
    };
    
    // Attach requested role and branch properties
    (newItem as any).role = regRole;
    (newItem as any).branchId = regBranchId;

    setPendingQueue(prev => [newItem, ...prev]);
    setRegSuccess(true);
    setTimeout(() => setRegSuccess(false), 5000);
  };

  // Admin approval action
  const handleAdminApproval = (id: string, action: 'APPROVE' | 'REJECT') => {
    if (currentUser?.role !== 'ADMIN') {
      alert('RBAC Violation: Only organization ADMIN users can approve or reject user requests.');
      return;
    }
    
    setPendingQueue(prev => prev.map(p => p.id === id ? { ...p, status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' } : p));
    const target = pendingQueue.find(p => p.id === id);
    
    if (action === 'APPROVE' && target) {
      const selectedBranch = branches.find(b => b.id === (target as any).branchId) || branches[0];
      const newUser: User = {
        id: `usr-${Date.now()}`,
        orgId: target.orgId,
        email: target.email,
        fullName: target.fullName,
        role: (target as any).role || 'IT_SUPPORT',
        branchId: (target as any).branchId || (selectedBranch ? selectedBranch.id : 'branch-hq'),
        branchName: selectedBranch ? selectedBranch.name : 'HQ',
        departmentId: target.departmentId,
        departmentName: target.departmentName,
        avatar: `https://images.unsplash.com/photo-${Math.floor(1500000000000 + Math.random() * 100000000000)}?w=128&h=128&fit=crop&crop=faces`,
        twoFactorEnabled: true,
        twoFactorSecret: 'MOCKSECRET321'
      };

      if (onRegisterUser) {
        onRegisterUser(newUser);
      }
    }

    alert(`[SYSTEM NOTIFICATION] User ${target?.fullName} has been ${action === 'APPROVE' ? 'APPROVED' : 'REJECTED'}. Automated confirmation email sent to ${target?.email}. Audit record written.`);
  };

  // Direct User Creation (Admin Mode)
  const handleDirectUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directFullName || !directEmail) return;

    const selectedBranch = branches.find(b => b.id === directBranchId) || branches[0];
    const newUser: User = {
      id: `usr-${Date.now()}`,
      orgId: selectedOrgId,
      email: directEmail,
      fullName: directFullName,
      role: directRole as any,
      branchId: directBranchId || (selectedBranch ? selectedBranch.id : 'branch-hq'),
      branchName: selectedBranch ? selectedBranch.name : 'HQ',
      departmentId: directDept,
      departmentName: directDept === 'dept-it' ? 'IT Infrastructure' : directDept === 'dept-fin' ? 'Finance & Budget' : 'Mining Operations',
      avatar: `https://images.unsplash.com/photo-${Math.floor(1500000000000 + Math.random() * 100000000000)}?w=128&h=128&fit=crop&crop=faces`,
      twoFactorEnabled: true,
      twoFactorSecret: 'MOCKSECRET321'
    };

    if (onRegisterUser) {
      onRegisterUser(newUser);
    }

    setDirectSuccess(true);
    setDirectFullName('');
    setDirectEmail('');
    setTimeout(() => setDirectSuccess(false), 4000);
  };

  // Direct Branch Creation
  const handleBranchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName || !branchCode) return;

    const newBranch = {
      id: `branch-${Date.now()}`,
      orgId: selectedOrgId,
      name: branchName,
      code: branchCode,
      city: branchCity || 'HQ',
      location: branchLocation || 'Main Hub',
      managerId: '',
      managerName: 'Unassigned',
      assetsCount: 0
    };

    if (onRegisterBranch) {
      onRegisterBranch(newBranch);
    }

    setBranchSuccess(true);
    setBranchName('');
    setBranchCode('');
    setBranchCity('');
    setBranchLocation('');
    setTimeout(() => setBranchSuccess(false), 4000);
  };

  // Code snippets dictionary for Phase 2 deliverables
  const CODE_SNIPPETS: Record<string, { title: string; desc: string; code: string }> = {
    route_login: {
      title: 'File 2: src/app/api/auth/login/route.ts',
      desc: 'POST endpoint verifying org tenant, checking user password, generating TOTP challenge, & logging audit trail.',
      code: `// File 2: src/app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const { email, password, org_id } = await req.json();

    if (!email || !password || !org_id) {
      return NextResponse.json({ error: 'Missing credentials parameters' }, { status: 400 });
    }

    // 1. Check organization tenant exists
    const org = await prisma.organization.findUnique({ where: { id: org_id } });
    if (!org) {
      return NextResponse.json({ error: 'Organization tenant not found' }, { status: 404 });
    }

    // 2. Verify user account inside organization
    const user = await prisma.user.findFirst({
      where: { orgId: org_id, email: email.toLowerCase(), isActive: true }
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      await prisma.auditLog.create({
        data: { orgId: org_id, action: 'USER_LOGIN_FAILED', entityType: 'Auth', changes: { email } }
      });
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // 3. Two-Factor challenge check
    if (user.twoFactorEnabled) {
      await prisma.auditLog.create({
        data: { orgId: org_id, userId: user.id, action: 'USER_LOGIN_ATTEMPT', entityType: 'Auth', changes: { step: '2FA_CHALLENGE' } }
      });
      return NextResponse.json({ requires_2fa: true, session_token: user.id });
    }

    // Direct login payload if 2FA off
    return NextResponse.json({
      session: { id: user.id, email: user.email, role: user.role, org_id: user.orgId },
      token: 'jwt_signed_token'
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}`
    },
    route_verify2fa: {
      title: 'File 3: src/app/api/auth/verify-2fa/route.ts',
      desc: 'POST endpoint validating Speakeasy TOTP 6-digit code against user secret and returning JWT session.',
      code: `// File 3: src/app/api/auth/verify-2fa/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import speakeasy from 'speakeasy';
import jwt from 'jsonwebtoken';

export async function POST(req: Request) {
  try {
    const { session_token, two_fa_code } = await req.json();

    const user = await prisma.user.findUnique({
      where: { id: session_token },
      include: { assignedAssets: true }
    });

    if (!user || !user.twoFactorSecret) {
      return NextResponse.json({ error: 'Session challenge invalid or expired' }, { status: 400 });
    }

    // Verify TOTP token
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: two_fa_code,
      window: 1
    });

    if (!verified) {
      await prisma.auditLog.create({
        data: { orgId: user.orgId, userId: user.id, action: 'USER_LOGIN_FAILED', entityType: 'Auth', changes: { reason: 'BAD_2FA_TOTP' } }
      });
      return NextResponse.json({ error: 'Invalid 6-digit code' }, { status: 401 });
    }

    // Generate JWT signed token with multi-tenant claims
    const token = jwt.sign(
      {
        sub: user.id,
        org_id: user.orgId,
        role: user.role,
        department_id: user.departmentId,
        branch_id: user.branchId,
        assigned_assets: user.assignedAssets.map(a => a.id)
      },
      process.env.NEXTAUTH_SECRET!,
      { expiresIn: '24h' }
    );

    await prisma.auditLog.create({
      data: { orgId: user.orgId, userId: user.id, action: 'USER_LOGIN_SUCCESS', entityType: 'Auth', changes: { 2fa: true } }
    });

    return NextResponse.json({ session: { user }, token });
  } catch (err) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}`
    },
    route_approval: {
      title: 'File 4: src/app/api/auth/user-approval/route.ts',
      desc: 'POST & GET endpoints allowing admins to review pending user registration queues and dispatch email triggers.',
      code: `// File 4: src/app/api/auth/user-approval/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sendEmailNotification } from '@/lib/email';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized. Admin role required.' }, { status: 403 });
  }

  const pendingUsers = await prisma.pendingRegistration.findMany({
    where: { orgId: session.user.org_id, status: 'PENDING' }
  });

  return NextResponse.json({ pendingUsers });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { user_id, action, reason } = await req.json();

  const targetReq = await prisma.pendingRegistration.update({
    where: { id: user_id },
    data: { status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' }
  });

  if (action === 'APPROVE') {
    await prisma.user.create({
      data: {
        orgId: targetReq.orgId,
        email: targetReq.email,
        fullName: targetReq.fullName,
        departmentId: targetReq.departmentId,
        role: 'USER',
        isActive: true
      }
    });
  }

  // Send Email Notification
  await sendEmailNotification({
    to: targetReq.email,
    subject: \`IT Asset Management Account \${action}\`,
    text: \`Your registration request for \${targetReq.orgName} has been \${action}.\`
  });

  await prisma.auditLog.create({
    data: {
      orgId: session.user.org_id,
      userId: session.user.id,
      action: action === 'APPROVE' ? 'USER_APPROVED' : 'USER_REJECTED',
      entityType: 'User',
      entityName: targetReq.email
    }
  });

  return NextResponse.json({ success: true });
}`
    },
    middleware: {
      title: 'File 7: src/middleware.ts',
      desc: 'Next.js Edge Middleware verifying JWT tokens, redirecting unauthenticated users, & extracting multi-tenant headers.',
      code: `// File 7: src/middleware.ts - Edge Authentication & Tenancy Router
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;

  // Allow public authentication endpoints
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/login') || pathname.startsWith('/auth/2fa')) {
    return NextResponse.next();
  }

  // Check if session token exists
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', req.url);
    return NextResponse.redirect(loginUrl);
  }

  // Extract multi-tenant headers & inject into downstream requests
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-org-id', token.org_id as string);
  requestHeaders.set('x-user-role', token.role as string);
  requestHeaders.set('x-department-id', (token.department_id as string) || '');
  requestHeaders.set('x-branch-id', (token.branch_id as string) || '');

  return NextResponse.next({
    request: { headers: requestHeaders }
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};`
    },
    route_register: {
      title: 'File 9: src/app/api/users/register/route.ts',
      desc: 'Public POST endpoint allowing employees to request workspace account access with notification triggers.',
      code: `// File 9: src/app/api/users/register/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendAdminAlertEmail } from '@/lib/email';

export async function POST(req: Request) {
  try {
    const { email, full_name, phone, org_id, department_id } = await req.json();

    // Check duplicate email
    const existing = await prisma.user.findFirst({ where: { orgId: org_id, email } });
    if (existing) {
      return NextResponse.json({ error: 'Account already registered in this organization.' }, { status: 409 });
    }

    const newReq = await prisma.pendingRegistration.create({
      data: { orgId: org_id, email, fullName: full_name, phone, departmentId: department_id, status: 'PENDING' }
    });

    // Notify organization admins
    await sendAdminAlertEmail({ orgId: org_id, subject: 'New User Registration Request', applicant: full_name });

    await prisma.auditLog.create({
      data: { orgId: org_id, action: 'USER_REGISTRATION_REQUESTED', entityType: 'User', entityName: email }
    });

    return NextResponse.json({ message: 'Registration request submitted for admin review.' }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Registration submission failed' }, { status: 500 });
  }
}`
    },
    nextauth_lib: {
      title: 'File 1: src/lib/auth.ts',
      desc: 'NextAuth options setup with custom Speakeasy TOTP verification & session claim injections.',
      code: NEXTAUTH_CONFIG_CODE
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-100">
                Phase 2: Authentication & User Management
              </h1>
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Active Deliverable
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              NextAuth + Speakeasy 2FA TOTP, Multi-Tenant Org Isolation, RBAC Permission Engine, & Admin Approvals.
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
          <button
            onClick={() => setPanelMode('SIMULATOR')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              panelMode === 'SIMULATOR'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Live Interactive Simulator</span>
          </button>
          <button
            onClick={() => setPanelMode('CODE_DELIVERABLES')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              panelMode === 'CODE_DELIVERABLES'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-4 h-4" />
            <span>Generated API Code (Files 1-10)</span>
          </button>
        </div>
      </div>

      {/* ====================================================================
          MODE 1: LIVE INTERACTIVE SIMULATOR SUITE
         ==================================================================== */}
      {panelMode === 'SIMULATOR' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Simulator Navigation Menu */}
          <div className="lg:col-span-1 space-y-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 px-2">
                Simulated Auth Modules
              </h3>
              <div className="space-y-1">
                <button
                  onClick={() => setSimStep('LOGIN')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-medium transition ${
                    simStep === 'LOGIN' || simStep === '2FA_TOTP'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold'
                      : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <KeyRound className="w-4 h-4 text-emerald-400" />
                    <span>Login & 2FA Flow</span>
                  </div>
                  <span className="text-[10px] font-mono bg-slate-950 px-1.5 py-0.5 rounded text-slate-400">
                    File 5 & 6
                  </span>
                </button>

                <button
                  onClick={() => setSimStep('REGISTER_REQUEST')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-medium transition ${
                    simStep === 'REGISTER_REQUEST'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold'
                      : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <UserPlus className="w-4 h-4 text-sky-400" />
                    <span>Request Account Access</span>
                  </div>
                  <span className="text-[10px] font-mono bg-slate-950 px-1.5 py-0.5 rounded text-slate-400">
                    File 9
                  </span>
                </button>

                <button
                  onClick={() => setSimStep('ADMIN_APPROVALS')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-medium transition ${
                    simStep === 'ADMIN_APPROVALS'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold'
                      : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="w-4 h-4 text-amber-400" />
                    <span>Admin Approval Queue</span>
                  </div>
                  <span className="bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {pendingQueue.filter(p => p.status === 'PENDING').length}
                  </span>
                </button>

                <button
                  onClick={() => setSimStep('RBAC_MATRIX')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-medium transition ${
                    simStep === 'RBAC_MATRIX'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold'
                      : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-purple-400" />
                    <span>RBAC Permission Matrix</span>
                  </div>
                  <span className="text-[10px] font-mono bg-slate-950 px-1.5 py-0.5 rounded text-slate-400">
                    File 8
                  </span>
                </button>

                <div className="pt-2 border-t border-slate-800/60 mt-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2 px-2">Workspace Creators</span>
                  
                  <button
                    onClick={() => setSimStep('REGISTER_BRANCH')}
                    className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-medium transition ${
                      simStep === 'REGISTER_BRANCH'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Building2 className="w-4 h-4 text-emerald-400" />
                      <span>Register New Branch</span>
                    </div>
                    <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded font-bold uppercase">
                      New
                    </span>
                  </button>

                  <button
                    onClick={() => setSimStep('REGISTER_USER')}
                    className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-medium transition ${
                      simStep === 'REGISTER_USER'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <UserPlus className="w-4 h-4 text-sky-400" />
                      <span>Register New User</span>
                    </div>
                    <span className="text-[9px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-1.5 py-0.2 rounded font-bold uppercase">
                      New
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Active User Context Status Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current JWT User</span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">Active Claims</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1 text-xs">
                <p className="font-bold text-slate-200">{currentUser.fullName}</p>
                <p className="text-[11px] text-slate-400">{currentUser.email}</p>
                <div className="flex items-center gap-2 pt-1">
                  <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                    {currentUser.role}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">{currentUser.orgId}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Main Viewport */}
          <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8">
            {/* STEP A: LOGIN FORM */}
            {simStep === 'LOGIN' && (
              <LoginForm
                organizations={organizations}
                selectedOrgId={selectedOrgId}
                onSelectOrg={setSelectedOrgId}
                onLoginSubmit={handleLoginSubmit}
                isLoading={isLoading}
                error={loginError}
                onRequestAccessClick={() => setSimStep('REGISTER_REQUEST')}
              />
            )}

            {/* STEP B: 2FA TOTP VERIFICATION (File 6) */}
            {simStep === '2FA_TOTP' && (
              <div className="w-full max-w-md mx-auto bg-slate-950 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl relative animate-fadeIn">
                <button
                  onClick={() => setSimStep('LOGIN')}
                  className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition mb-6"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to login</span>
                </button>

                <div className="text-center mb-6">
                  <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-center mx-auto mb-3 text-emerald-400">
                    <Clock className="w-6 h-6 animate-pulse" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-100">Two-Factor Authentication (2FA)</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Enter the 6-digit TOTP code from your Speakeasy Authenticator app.
                  </p>
                </div>

                {/* Simulated Speakeasy Hint Banner */}
                <div className="mb-6 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
                  <p className="text-[10px] text-emerald-300 uppercase tracking-wider font-bold">Speakeasy TOTP Simulator Hint</p>
                  <p className="text-xl font-mono tracking-widest text-emerald-400 font-bold mt-1 select-all">
                    {totpHint}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">Accepts this code or 123456</p>
                </div>

                {loginError && (
                  <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                <form onSubmit={handleVerify2FA} className="space-y-6">
                  <div>
                    <input
                      type="text"
                      maxLength={6}
                      value={totpInput}
                      onChange={(e) => setTotpInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="• • • • • •"
                      required
                      className="w-full text-center tracking-[0.5em] font-mono text-2xl py-3 bg-slate-900 border border-slate-700 rounded-xl text-emerald-400 focus:outline-none focus:border-emerald-500 shadow-inner"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Code refreshes in <strong className="text-slate-200">{totpTimer}s</strong></span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTotpHint(Math.floor(100000 + Math.random() * 900000).toString());
                        setTotpTimer(60);
                      }}
                      className="text-emerald-400 hover:text-emerald-300 underline font-medium flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Resend code</span>
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 px-4 rounded-xl shadow-lg shadow-emerald-500/20 transition text-sm"
                  >
                    Verify Authenticator Token
                  </button>
                </form>
              </div>
            )}

            {/* STEP C: REQUEST ACCOUNT ACCESS (File 9 Simulation) */}
            {simStep === 'REGISTER_REQUEST' && (
              <div className="max-w-lg mx-auto bg-slate-950 border border-slate-800 rounded-2xl p-6 md:p-8 animate-fadeIn">
                <button
                  onClick={() => setSimStep('LOGIN')}
                  className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition mb-6"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Sign In</span>
                </button>

                <div className="mb-6">
                  <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-sky-400" />
                    <span>Request IT Workspace Access</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Submit registration. Org admins must approve account creation before login is enabled.
                  </p>
                </div>

                {regSuccess && (
                  <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                    <div>
                      <p className="font-bold">Registration Request Submitted!</p>
                      <p className="text-[11px] text-emerald-400/80 mt-0.5">
                        Alert email sent to Organization Admins. You can review this application in the Admin Approval tab.
                      </p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleRegisterSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Organization Tenant
                    </label>
                    <select
                      value={selectedOrgId}
                      onChange={(e) => setSelectedOrgId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      {organizations.map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder="Elena Rostova"
                      required
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Work Email
                    </label>
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="e.rostova@company.com"
                      required
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        placeholder="+1 (555) 000-0000"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Department
                      </label>
                      <select
                        value={regDept}
                        onChange={(e) => setRegDept(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="dept-it">IT Infrastructure</option>
                        <option value="dept-ops">Mining / Field Ops</option>
                        <option value="dept-fin">Finance & Budget</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Requested Role
                      </label>
                      <select
                        value={regRole}
                        onChange={(e) => setRegRole(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="ADMIN">System Admin ("me")</option>
                        <option value="DIRECTOR">Director</option>
                        <option value="IT_SUPPORT">IT Tech</option>
                        <option value="BRANCH_MANAGER">Branch Manager</option>
                        <option value="USER">Standard User</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Target Branch Location
                      </label>
                      <select
                        value={regBranchId || (branches.filter(b => b.orgId === selectedOrgId)[0]?.id || '')}
                        onChange={(e) => setRegBranchId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                      >
                        {branches.filter(b => b.orgId === selectedOrgId).map(b => (
                          <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
                        ))}
                        {branches.filter(b => b.orgId === selectedOrgId).length === 0 && (
                          <option value="">No branches registered yet</option>
                        )}
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold py-3 px-4 rounded-xl shadow-lg shadow-sky-500/20 transition mt-4 text-sm"
                  >
                    Submit Approval Request
                  </button>
                </form>
              </div>
            )}

            {/* STEP D: ADMIN USER APPROVAL WORKFLOW (File 4 Simulation) */}
            {simStep === 'ADMIN_APPROVALS' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                      <Users className="w-5 h-5 text-amber-400" />
                      <span>Admin User Approval Queue</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Admins review registration requests. Approving triggers database provisioning and sends notification emails.
                    </p>
                  </div>

                  {currentUser.role !== 'ADMIN' && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>You are logged in as {currentUser.role}. Switch to an ADMIN user to execute approval actions.</span>
                    </div>
                  )}
                </div>

                {/* Pending Applicants List */}
                <div className="space-y-3">
                  {pendingQueue.length === 0 ? (
                    <div className="p-8 text-center bg-slate-950 rounded-2xl border border-slate-800 text-slate-400 text-sm">
                      No pending user registration requests found.
                    </div>
                  ) : (
                    pendingQueue.map((item) => (
                      <div
                        key={item.id}
                        className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition hover:border-slate-700"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2.5">
                            <span className="font-bold text-slate-200 text-base">{item.fullName}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              item.status === 'PENDING' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                              item.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                              'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}>
                              {item.status}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">({item.orgName})</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
                            <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-slate-500" /> {item.email}</span>
                            <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-500" /> {item.phone}</span>
                            <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-emerald-400" /> {item.departmentName}</span>
                            <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-500" /> {item.requestedAt}</span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        {item.status === 'PENDING' && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleAdminApproval(item.id, 'APPROVE')}
                              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Approve & Provision</span>
                            </button>
                            <button
                              onClick={() => handleAdminApproval(item.id, 'REJECT')}
                              className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                            >
                              <XCircle className="w-4 h-4" />
                              <span>Reject</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* STEP E: RBAC GRANULAR PERMISSION MATRIX (File 8 Display) */}
            {simStep === 'RBAC_MATRIX' && (
              <div className="space-y-6 animate-fadeIn">
                <div>
                  <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-purple-400" />
                    <span>Role-Based Access Control (RBAC) Matrix</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Granular permission definitions enforced across all middleware and UI components.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 bg-slate-950">
                        <th className="py-3 px-4 font-bold uppercase tracking-wider">System Permission / Action</th>
                        <th className="py-3 px-2 text-center text-rose-400 font-bold">ADMIN</th>
                        <th className="py-3 px-2 text-center text-purple-400 font-bold">DIRECTOR</th>
                        <th className="py-3 px-2 text-center text-emerald-400 font-bold">BRANCH MGR</th>
                        <th className="py-3 px-2 text-center text-sky-400 font-bold">IT SUPPORT</th>
                        <th className="py-3 px-2 text-center text-amber-400 font-bold">FINANCE</th>
                        <th className="py-3 px-2 text-center text-slate-400 font-bold">USER</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-slate-300">
                      {[
                        { action: 'VIEW_ALL_ASSETS', name: 'View All Organization Assets' },
                        { action: 'CREATE_ASSET', name: 'Register New IT Assets' },
                        { action: 'UPDATE_ASSET', name: 'Modify Asset Specs & Value' },
                        { action: 'DELETE_ASSET', name: 'Decommission / Delete Devices' },
                        { action: 'APPROVE_USERS', name: 'Approve Pending User Requests' },
                        { action: 'MANAGE_BUDGETS', name: 'Allocate Fiscal Branch Budgets' },
                        { action: 'VIEW_DEPRECIATION', name: 'Access Depreciation & Audit Reports' },
                        { action: 'CREATE_MAINTENANCE', name: 'Log Repair & Maintenance Tickets' },
                        { action: 'CHECKOUT_ASSETS', name: 'Checkout Devices to Employees' },
                        { action: 'VIEW_ASSIGNED_ONLY', name: 'Restricted to Assigned Custody Only' }
                      ].map(row => (
                        <tr key={row.action} className="hover:bg-slate-950/50">
                          <td className="py-3 px-4 font-medium text-slate-200">
                            {row.name}
                            <span className="block text-[10px] font-mono text-slate-500">{row.action}</span>
                          </td>
                          {(['ADMIN', 'DIRECTOR', 'BRANCH_MANAGER', 'IT_SUPPORT', 'FINANCE', 'USER'] as const).map(role => {
                            const hasAccess = createPermissionCheck(role, row.action as any);
                            return (
                              <td key={role} className="py-3 px-2 text-center">
                                {hasAccess ? (
                                  <Check className="w-4 h-4 text-emerald-400 inline-block" />
                                ) : (
                                  <span className="text-slate-700 font-bold text-sm">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* STEP F: REGISTER NEW BRANCH FORM */}
            {simStep === 'REGISTER_BRANCH' && (
              <div className="max-w-lg mx-auto bg-slate-950 border border-slate-800 rounded-2xl p-6 md:p-8 animate-fadeIn">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-emerald-400" />
                    <span>Register New Branch</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Provision new local or regional field offices. Once registered, branches can be assigned assets and employees.
                  </p>
                </div>

                {branchSuccess && (
                  <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <p className="font-bold">Branch Registered Successfully!</p>
                      <p className="text-[11px] text-emerald-400/80 mt-0.5">
                        Branch is now active in the system. You can now assign users and manage IT assets isolated to this branch.
                      </p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleBranchSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Target Organization
                    </label>
                    <select
                      value={selectedOrgId}
                      onChange={(e) => setSelectedOrgId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      {organizations.map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Branch Name
                    </label>
                    <input
                      type="text"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      placeholder="e.g. Nevada Lithium Basin Branch"
                      required
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Branch Unique Code
                      </label>
                      <input
                        type="text"
                        value={branchCode}
                        onChange={(e) => setBranchCode(e.target.value)}
                        placeholder="e.g. NV-LIT-01"
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        City / Operational Hub
                      </label>
                      <input
                        type="text"
                        value={branchCity}
                        onChange={(e) => setBranchCity(e.target.value)}
                        placeholder="e.g. Reno"
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Geographic Address or GPS Coordinates
                    </label>
                    <input
                      type="text"
                      value={branchLocation}
                      onChange={(e) => setBranchLocation(e.target.value)}
                      placeholder="e.g. Grid Sector 4, Basin 2, NV"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 px-4 rounded-xl shadow-lg shadow-emerald-500/20 transition mt-4 text-sm"
                  >
                    Register Active Branch
                  </button>
                </form>
              </div>
            )}

            {/* STEP G: REGISTER NEW USER FORM */}
            {simStep === 'REGISTER_USER' && (
              <div className="max-w-lg mx-auto bg-slate-950 border border-slate-800 rounded-2xl p-6 md:p-8 animate-fadeIn">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-sky-400" />
                    <span>Direct User Registration Console</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    As an Administrator, directly register fully verified personnel to join any branch of the selected organization.
                  </p>
                </div>

                {directSuccess && (
                  <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <p className="font-bold">User Direct Provisioning Complete!</p>
                      <p className="text-[11px] text-emerald-400/80 mt-0.5">
                        User is registered with an active role & Speakeasy 2FA enabled. They can immediately log in under this organization tenant.
                      </p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleDirectUserSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Select Organization
                      </label>
                      <select
                        value={selectedOrgId}
                        onChange={(e) => {
                          setSelectedOrgId(e.target.value);
                          // Reset branch to first branch of that org
                          const orgBranches = branches.filter(b => b.orgId === e.target.value);
                          setDirectBranchId(orgBranches[0]?.id || '');
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                      >
                        {organizations.map(o => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Target Branch Location
                      </label>
                      <select
                        value={directBranchId || (branches.filter(b => b.orgId === selectedOrgId)[0]?.id || '')}
                        onChange={(e) => setDirectBranchId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                      >
                        {branches.filter(b => b.orgId === selectedOrgId).map(b => (
                          <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
                        ))}
                        {branches.filter(b => b.orgId === selectedOrgId).length === 0 && (
                          <option value="">No branches registered yet</option>
                        )}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={directFullName}
                      onChange={(e) => setDirectFullName(e.target.value)}
                      placeholder="e.g. John Doe"
                      required
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Work Email (Username)
                    </label>
                    <input
                      type="email"
                      value={directEmail}
                      onChange={(e) => setDirectEmail(e.target.value)}
                      placeholder="e.g. j.doe@company.com"
                      required
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Assign Role
                      </label>
                      <select
                        value={directRole}
                        onChange={(e) => setDirectRole(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="ADMIN">System Admin ("me")</option>
                        <option value="DIRECTOR">Director</option>
                        <option value="IT_SUPPORT">IT Tech</option>
                        <option value="BRANCH_MANAGER">Branch Manager</option>
                        <option value="FINANCE">Finance Manager</option>
                        <option value="USER">Standard User</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                        Department
                      </label>
                      <select
                        value={directDept}
                        onChange={(e) => setDirectDept(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="dept-it">IT Infrastructure</option>
                        <option value="dept-ops">Mining / Field Ops</option>
                        <option value="dept-fin">Finance & Budget</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold py-3 px-4 rounded-xl shadow-lg shadow-sky-500/20 transition mt-4 text-sm"
                  >
                    Directly Register & Activate User
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          MODE 2: PRODUCTION CODE DELIVERABLES VIEWER (FILES 1-10)
         ==================================================================== */}
      {panelMode === 'CODE_DELIVERABLES' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fadeIn">
          {/* File Selector Rail */}
          <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 px-2 flex items-center gap-2">
              <FileCode className="w-4 h-4 text-emerald-400" />
              <span>Phase 2 Deliverables</span>
            </h3>

            {Object.entries(CODE_SNIPPETS).map(([key, item]) => (
              <button
                key={key}
                onClick={() => {
                  setActiveCodeFile(key);
                  setCopiedCode(false);
                }}
                className={`w-full text-left p-3 rounded-xl text-xs transition block ${
                  activeCodeFile === key
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/80'
                }`}
              >
                <p className="truncate font-mono font-bold">{item.title.split(':')[0]}</p>
                <p className={`text-[10px] truncate mt-0.5 ${activeCodeFile === key ? 'text-slate-900' : 'text-slate-400'}`}>
                  {item.title.split(':')[1]}
                </p>
              </button>
            ))}
          </div>

          {/* Code Viewport */}
          <div className="lg:col-span-3 bg-slate-950 border border-slate-800 rounded-2xl p-6 relative flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800/80">
              <div>
                <h3 className="text-base font-bold text-slate-100 font-mono">
                  {CODE_SNIPPETS[activeCodeFile]?.title}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {CODE_SNIPPETS[activeCodeFile]?.desc}
                </p>
              </div>

              <button
                onClick={async () => {
                  const code = CODE_SNIPPETS[activeCodeFile]?.code || '';
                  try {
                    if (navigator?.clipboard?.writeText) {
                      await navigator.clipboard.writeText(code);
                    } else {
                      throw new Error("Clipboard API unavailable");
                    }
                  } catch {
                    try {
                      const textArea = document.createElement("textarea");
                      textArea.value = code;
                      textArea.style.position = "fixed";
                      textArea.style.opacity = "0";
                      document.body.appendChild(textArea);
                      textArea.focus();
                      textArea.select();
                      document.execCommand("copy");
                      document.body.removeChild(textArea);
                    } catch (err) {
                      console.warn("Fallback copy failed", err);
                    }
                  }
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 3000);
                }}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition flex items-center gap-2 shrink-0"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                <span>{copiedCode ? 'Copied Deliverable Code!' : 'Copy Code'}</span>
              </button>
            </div>

            {/* Code Block */}
            <div className="flex-1 overflow-auto max-h-[600px] bg-slate-900/60 p-4 rounded-xl border border-slate-800 font-mono text-xs text-emerald-300 selection:bg-emerald-500 selection:text-slate-950 whitespace-pre">
              {CODE_SNIPPETS[activeCodeFile]?.code}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
