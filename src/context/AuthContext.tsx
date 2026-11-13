import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { User, Organization, Branch, Department, UserRole } from '../types';
import { 
  persistBranch, 
  deleteBranchFromStorage, 
  persistUser, 
  deleteUserFromStorage, 
  persistDepartment, 
  deleteDepartmentFromStorage,
  getStoredSession,
  setStoredSession,
  clearStoredSession,
  wipeUserAndOrgCaches,
  saveToStorage,
  STORAGE_KEYS,
  setSaveFailureReporter,
  RESYNC_EVENT,
  SESSION_EXPIRED_EVENT
} from '../lib/tidb-storage';
import { clearOfflineStoreOnLogout, setActiveSessionContext } from '../lib/offline-sync';
import { useFeedback } from './FeedbackContext';
import { RegisterCompanyData } from '../components/RegisterCompanyModal';
import { validatePasswordPolicy as sharedValidatePasswordPolicy } from '../../shared/password-policy';

export const validatePasswordPolicy = (
  pwd: string,
  user?: { email?: string; fullName?: string }
): { valid: boolean; message: string; error?: string } => {
  const res = sharedValidatePasswordPolicy(pwd, user);
  return {
    valid: res.valid,
    message: res.message || res.error || '',
    error: res.error
  };
};

interface AuthContextType {
  currentUser: User | null;
  currentOrg: Organization;
  isSessionLoading: boolean;
  systemOrgs: Organization[];
  systemUsers: User[];
  systemBranches: Branch[];
  currentOrgBranches: Branch[];
  systemDepartments: Department[];
  currentOrgDepartments: Department[];
  isBranchRestricted: boolean;
  setCurrentOrg: (org: Organization) => void;
  handleSyncUsers: (users: User[]) => void;
  handleSyncBranches: (branches: Branch[]) => void;
  handleSyncDepartments: (departments: Department[]) => void;
  handleSyncOrganizations: (orgs: Organization[]) => void;
  handleLoginSuccess: (user: User, org: Organization) => void;
  handleLogout: () => void;
  handleSelectOrg: (org: Organization) => void;
  handleRegisterOrganization: (data: RegisterCompanyData) => Promise<{ success: boolean; error?: string }>;
  handleActivateUser: (inviteToken: string, newPassword: string, twoFactorEnabled: boolean) => Promise<{ success: boolean; user?: User; error?: string }>;
  handleInviteUser: (data: {
    fullName: string;
    email: string;
    role: UserRole;
    departmentId?: string;
    departmentName?: string;
    branchId?: string;
    branchName?: string;
  }) => Promise<{ success: boolean; inviteToken?: string; emailDelivered?: boolean; user?: User; error?: string }>;
  handleRegisterUser: (newUser: User) => void;
  handleUpdateUser: (updatedUser: User) => void;
  /** Show changes that another route has already saved on the server (no second save). */
  handleApplySavedUser: (updatedUser: User) => void;
  handleDeleteUser: (userId: string) => Promise<{ success: boolean; error?: string }>;
  handleRegisterBranch: (newBranch: Branch) => void;
  handleUpdateBranch: (branchId: string, updatedFields: Partial<Branch>) => void;
  handleDeleteBranch: (branchId: string) => Promise<{ success: boolean; error?: string }>;
  handleRegisterDepartment: (newDept: Department) => void;
  handleUpdateDepartment: (deptId: string, updatedFields: Partial<Department>) => void;
  handleDeleteDepartment: (deptId: string) => Promise<{ success: boolean; error?: string }>;
  handleClearDummyUsers: () => void;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { confirm, toast } = useFeedback();

  // Saves that the server refuses, or that never reach it, are shown to the user.
  useEffect(() => {
    setSaveFailureReporter((message) => toast(message, 'error'));
    return () => setSaveFailureReporter(null);
  }, [toast]);

  // The server says this session no longer exists: go back to sign-in and say why.
  useEffect(() => {
    const onExpired = () => {
      if (!currentUserRef.current) return;
      clearStoredSession();
      wipeUserAndOrgCaches();
      setActiveSessionContext(null);
      setCurrentUser(null);
      window.history.replaceState({ tab: 'login' }, '', '#/login');
      toast('Your session has ended (it expired or you were signed out on another device). Please sign in again.', 'info');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [toast]);
  const [systemOrgs, setSystemOrgs] = useState<Organization[]>([]);
  const [systemUsers, setSystemUsers] = useState<User[]>([]);
  const [systemBranches, setSystemBranches] = useState<Branch[]>([]);
  const [systemDepartments, setSystemDepartments] = useState<Department[]>([]);

  const [currentOrg, setCurrentOrg] = useState<Organization>(() => ({
    id: 'org-omnitech',
    name: 'OmniTech Enterprise Systems',
    type: 'Enterprise',
    brandingColor: '#0ea5e9',
    branchesCount: 1
  }));

  // Server session cookie is authoritative; client never trusts localStorage on boot
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const currentUserRef = React.useRef<User | null>(null);
  currentUserRef.current = currentUser;
  const [isSessionLoading, setIsSessionLoading] = useState<boolean>(true);

  // Server session verification against backend /api/auth/me cookie
  useEffect(() => {
    let isCancelled = false;
    let controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // A slow answer is not a "no": only an explicit 401/403 means signed out. Each attempt
    // gets a generous limit and transient failures are retried, so a slow database does not
    // bounce a signed-in user to the sign-in screen on page load.
    const SESSION_CHECK_TIMEOUT_MS = 10000;
    const SESSION_CHECK_ATTEMPTS = 3;

    const fetchSessionWithRetry = async (): Promise<Response> => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= SESSION_CHECK_ATTEMPTS; attempt++) {
        if (isCancelled) break;
        controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT_MS);
        try {
          const response = await fetch('/api/auth/me', { credentials: 'include', signal: controller.signal });
          clearTimeout(timeoutId);
          // Retry server-side hiccups (5xx / gateway errors); accept everything else.
          if (response.status < 500 || attempt === SESSION_CHECK_ATTEMPTS) return response;
          lastError = new Error(`Session check returned ${response.status}`);
        } catch (err) {
          clearTimeout(timeoutId);
          lastError = err;
        }
        if (attempt < SESSION_CHECK_ATTEMPTS && !isCancelled) {
          await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
        }
      }
      throw lastError ?? new Error('Session check cancelled');
    };

    const verifyServerSession = async () => {
      try {
        const res = await fetchSessionWithRetry();

        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.user && !isCancelled) {
            const serverUser: User = {
              id: data.user.id,
              orgId: data.user.orgId || data.user.org_id,
              email: data.user.email,
              fullName: data.user.fullName || data.user.full_name,
              role: data.user.role,
              isSuperAdmin: Boolean(data.user.isSuperAdmin || data.user.is_super_admin),
              status: data.user.status || 'ACTIVE',
              departmentId: data.user.departmentId || data.user.department_id,
              departmentName: data.user.departmentName || data.user.department_name,
              branchId: data.user.branchId || data.user.branch_id,
              branchName: data.user.branchName || data.user.branch_name,
              twoFactorEnabled: Boolean(data.user.twoFactorEnabled || data.user.two_factor_enabled),
              avatar: data.user.avatar || `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`
            };

            setCurrentUser(serverUser);
            setActiveSessionContext({
              userId: serverUser.id,
              orgId: serverUser.orgId,
              sessionEpoch: Date.now()
            });

            setCurrentOrg(prevOrg => {
              const matchedOrg = systemOrgs.find(o => o.id === serverUser.orgId) || {
                id: serverUser.orgId,
                name: 'Enterprise Organization',
                type: 'Enterprise',
                brandingColor: '#0ea5e9',
                branchesCount: 1
              };
              setStoredSession(serverUser, matchedOrg);
              return matchedOrg;
            });
          }
        } else if (res.status === 401 || res.status === 403) {
          // Explicit rejection: clear stale stored session and offline queue session
          if (!isCancelled) {
            clearStoredSession();
            wipeUserAndOrgCaches();
            setActiveSessionContext(null);
            setCurrentUser(null);
          }
        }
      } catch (err) {
        console.warn('Session verification fallback notice:', err);
      } finally {
        if (!isCancelled) {
          setIsSessionLoading(false);
        }
      }
    };

    verifyServerSession();

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
    // Verify the session once per page load. This effect used to depend on `systemOrgs`,
    // which gets a new array on every background refresh, so the app called /api/auth/me
    // every 30 seconds and exhausted the sign-in rate limit within minutes of normal use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the active organization's details (name, branding) in step with data refreshes.
  // Only details of the organization already selected are updated; identity never changes here.
  useEffect(() => {
    if (!currentUser) return;
    setCurrentOrg(prev => {
      const matched = systemOrgs.find(o => o.id === prev.id);
      if (!matched) return prev;
      const unchanged =
        matched.name === prev.name &&
        matched.type === prev.type &&
        matched.logo === prev.logo &&
        matched.brandingColor === prev.brandingColor &&
        matched.branchesCount === prev.branchesCount;
      return unchanged ? prev : matched;
    });
  }, [systemOrgs, currentUser]);

  const isBranchRestricted = Boolean(
    currentUser && (currentUser.role === 'BRANCH_MANAGER' || currentUser.role === 'USER')
  );

  const currentOrgBranches = systemBranches.filter(b => b.orgId === currentOrg.id);
  const currentOrgDepartments = systemDepartments.filter(d => d.orgId === currentOrg.id);

  const handleLoginSuccess = useCallback((user: User, org: Organization) => {
    setCurrentOrg(org);
    setCurrentUser(user);
    setStoredSession(user, org);
    setActiveSessionContext({
      userId: user.id,
      orgId: user.orgId,
      sessionEpoch: Date.now()
    });
    setIsSessionLoading(false);
    if (typeof window !== 'undefined') {
      const pendingRedirect = sessionStorage.getItem('omni_redirect_tab');
      sessionStorage.removeItem('omni_redirect_tab');
      const validTabs = ['dashboard', 'assets', 'checkout', 'repair', 'branches', 'users', 'reports', 'budget', 'audit'];
      const targetTab = pendingRedirect && validTabs.includes(pendingRedirect) ? pendingRedirect : 'dashboard';
      window.history.pushState({ tab: targetTab }, '', `#/${targetTab}`);
      window.dispatchEvent(new Event('hashchange'));
      window.dispatchEvent(new PopStateEvent('popstate', { state: { tab: targetTab } }));
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      const result = await clearOfflineStoreOnLogout(false);
      if (!result.cleared && result.pendingCount > 0) {
        const confirmLogout = await confirm({
          title: 'Log out with unsynced changes?',
          message: `You have ${result.pendingCount} offline change${result.pendingCount === 1 ? '' : 's'} that have not synced to the cloud.\n\nLogging out clears this device's offline store and permanently loses them.`,
          confirmLabel: 'Log out anyway',
          cancelLabel: 'Stay signed in',
          tone: 'danger'
        });
        if (!confirmLogout) {
          return;
        }
        await clearOfflineStoreOnLogout(true);
      }
    } catch (err) {
      console.warn('Offline store cleanup notice during logout:', err);
    }

    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {}

    clearStoredSession();
    wipeUserAndOrgCaches();
    setActiveSessionContext(null);
    setCurrentUser(null);
    if (typeof window !== 'undefined') {
      window.history.replaceState({ tab: 'login' }, '', '#/login');
    }
  }, [confirm]);

  /**
   * Narrow action to synchronize users from remote database/storage
   */
  const handleSyncUsers = (users: User[]) => {
    setSystemUsers(users);
  };

  /**
   * Narrow action to synchronize branches from remote database/storage
   */
  const handleSyncBranches = (branches: Branch[]) => {
    setSystemBranches(branches);
  };

  /**
   * Narrow action to synchronize departments from remote database/storage
   */
  const handleSyncDepartments = (departments: Department[]) => {
    setSystemDepartments(departments);
  };

  /**
   * Narrow action to synchronize organizations from remote database/storage
   */
  const handleSyncOrganizations = (orgs: Organization[]) => {
    if (orgs && orgs.length > 0) {
      setSystemOrgs(prev => {
        const map = new Map<string, Organization>();
        prev.forEach(o => map.set(o.id, o));
        orgs.forEach(o => map.set(o.id, o));
        return Array.from(map.values());
      });
    }
  };

  /**
   * Selecting an organization updates the active tenant view.
   * Selecting an org must NOT change user identity or log in as arbitrary users.
   */
  const handleSelectOrg = (org: Organization) => {
    setCurrentOrg(org);
  };

  /**
   * Addendum 4 Section C: Transactional Server Registration
   * Calls POST /api/auth/register-organization to create tenant, branches,
   * departments, and admin user in the database.
   */
  const handleRegisterOrganization = async (data: RegisterCompanyData): Promise<{ success: boolean; error?: string }> => {
    const adminPassword = data.adminPassword?.trim() || '';
    const policyCheck = validatePasswordPolicy(adminPassword, {
      email: data.adminEmail,
      fullName: data.adminName
    });
    if (!policyCheck.valid) {
      throw new Error(`Admin password does not meet security requirements: ${policyCheck.message || policyCheck.error}`);
    }

    const res = await fetch('/api/auth/register-organization', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: 'include',
      body: JSON.stringify({
        name: data.name,
        type: data.type,
        logo: data.logo,
        adminEmail: data.adminEmail,
        adminName: data.adminName,
        adminPassword: adminPassword,
        branches: data.branches
      })
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Failed to register organization.');
    }

    const newOrg: Organization = result.organization;
    const newAdminUser: User = result.user;
    const branches: Branch[] = result.branches || [];

    setSystemOrgs(prev => [...prev, newOrg]);
    setSystemBranches(prevBranches => [...prevBranches, ...branches]);
    setSystemUsers(prevUsers => [...prevUsers, newAdminUser]);

    setCurrentOrg(newOrg);
    setCurrentUser(newAdminUser);
    setStoredSession(newAdminUser, newOrg);
    setActiveSessionContext({
      userId: newAdminUser.id,
      orgId: newOrg.id,
      sessionEpoch: Date.now()
    });

    return { success: true };
  };

  /**
   * Activates an invited user account.
   * - Connects directly to /api/auth/activate to consume token and authenticate session
   * - Sets active session cookie and logs user straight into their dashboard
   * - Offline resilient with localStorage fallback
   */
  const handleActivateUser = async (
    inviteToken: string,
    newPassword: string,
    twoFactorEnabled: boolean
  ): Promise<{ success: boolean; user?: User; error?: string }> => {
    const cleanToken = inviteToken.trim();
    if (!cleanToken) {
      return { success: false, error: 'Empty invitation token.' };
    }

    const policyCheck = validatePasswordPolicy(newPassword);
    if (!policyCheck.valid) {
      return { success: false, error: policyCheck.message };
    }

    try {
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          inviteToken: cleanToken,
          invite_token: cleanToken,
          newPassword,
          password: newPassword
        })
      });

      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        const activeUser: User = data.user || {
          id: data.user?.id || `usr-${Date.now()}`,
          orgId: data.user?.orgId || currentOrg.id,
          email: data.user?.email || '',
          fullName: data.user?.fullName || '',
          role: data.user?.role || 'USER',
          status: 'ACTIVE',
          twoFactorEnabled
        };
        const userOrg = data.organization || systemOrgs.find(o => o.id === activeUser.orgId) || systemOrgs[0]!;

        setSystemUsers(prev => {
          const updated = prev.map(u => u.id === activeUser.id
            ? { ...u, ...activeUser, status: 'ACTIVE' as const }
            : u
          );
          persistUser(activeUser, updated);
          return updated;
        });

        setCurrentOrg(userOrg);
        setCurrentUser(activeUser);
        return { success: true, user: activeUser };
      } else {
        return { success: false, error: data?.error || 'Failed to activate invitation.' };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Could not connect to server to verify invitation token.' };
    }
  };

  /**
   * Invites a new user by generating a verifiable database token in TiDB
   */
  const handleInviteUser = async (data: {
    fullName: string;
    email: string;
    role: UserRole;
    departmentId?: string;
    departmentName?: string;
    branchId?: string;
    branchName?: string;
  }): Promise<{ success: boolean; inviteToken?: string; emailDelivered?: boolean; user?: User; error?: string }> => {
    try {
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fullName: data.fullName.trim(),
          email: data.email.trim().toLowerCase(),
          role: data.role,
          departmentId: data.departmentId || undefined,
          departmentName: data.departmentName || undefined,
          branchId: data.branchId,
          branchName: data.branchName
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        return { success: false, error: resData.error || 'Failed to issue invitation.' };
      }

      const invitedUser: User = {
        id: resData.userId || `usr-${Date.now()}`,
        orgId: currentOrg.id,
        email: data.email.trim().toLowerCase(),
        fullName: data.fullName.trim(),
        role: data.role,
        departmentId: data.departmentId || undefined,
        departmentName: data.departmentName || undefined,
        branchId: data.branchId,
        branchName: data.branchName,
        twoFactorEnabled: false,
        avatar: `https://images.unsplash.com/photo-${1534528741775 + (systemUsers.length % 10)}?w=100&auto=format&fit=crop&q=80`,
        status: 'INVITED',
        // A newly created account starts at version 1; edits must send the version they are based on.
        version: 1,
        invitedAt: resData.invitedAt || new Date().toISOString()
      };

      setSystemUsers(prev => {
        const exists = prev.findIndex(u => u.email.toLowerCase() === invitedUser.email.toLowerCase());
        const updated = exists !== -1
          ? prev.map((u, i) => i === exists ? invitedUser : u)
          : [...prev, invitedUser];
        persistUser(invitedUser, updated);
        return updated;
      });

      return {
        success: true,
        inviteToken: resData.inviteToken,
        emailDelivered: resData.emailDelivered === true,
        user: invitedUser
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Could not connect to server to issue invitation.' };
    }
  };

  const handleRegisterUser = (newUser: User) => {
    setSystemUsers(prevUsers => {
      const updatedUsers = [...prevUsers, newUser];
      persistUser(newUser, updatedUsers);
      return updatedUsers;
    });
  };

  const handleUpdateUser = (updatedUser: User) => {
    setSystemUsers(prevUsers => prevUsers.map(u => u.id === updatedUser.id ? updatedUser : u));
    if (currentUser?.id === updatedUser.id) {
      setCurrentUser(updatedUser);
    }

    // Save outside the state updater (updaters may run twice). On success the server has
    // advanced the record version, so advance the local copy too: the next edit must be based
    // on the new version or the server rejects it as a conflict.
    persistUser(updatedUser, undefined, true).then(saved => {
      if (!saved) return;
      const nextVersion = (updatedUser.version || 1) + 1;
      setSystemUsers(prevUsers => prevUsers.map(u => (u.id === updatedUser.id ? { ...u, version: nextVersion } : u)));
      setCurrentUser(prev => (prev && prev.id === updatedUser.id ? { ...prev, version: nextVersion } : prev));
    });
  };

  const handleApplySavedUser = (updatedUser: User) => {
    setSystemUsers(prevUsers => prevUsers.map(u => (u.id === updatedUser.id ? { ...u, ...updatedUser, version: u.version } : u)));
    if (currentUser?.id === updatedUser.id) {
      setCurrentUser(prev => (prev ? { ...prev, ...updatedUser } : updatedUser));
    }
    // The server advanced the record version; reload so the next edit is based on it.
    window.dispatchEvent(new Event(RESYNC_EVENT));
  };

  const handleDeleteUser = async (userId: string): Promise<{ success: boolean; error?: string }> => {
    if (currentUser?.id === userId) {
      return { success: false, error: 'You cannot delete or suspend your own active administrator account.' };
    }
    setSystemUsers(prevUsers => {
      const updatedUsers = prevUsers.filter(u => u.id !== userId);
      deleteUserFromStorage(userId, updatedUsers);
      return updatedUsers;
    });
    return { success: true };
  };

  const handleRegisterBranch = (newBranch: Branch) => {
    setSystemBranches(prevBranches => {
      const updatedBranches = [...prevBranches, newBranch];
      persistBranch(newBranch, updatedBranches);
      return updatedBranches;
    });
  };

  const handleUpdateBranch = (branchId: string, updatedFields: Partial<Branch>) => {
    setSystemBranches(prevBranches => {
      let targetUpdatedBranch: Branch | undefined;
      const updatedBranches = prevBranches.map(b => {
        if (b.id === branchId) {
          targetUpdatedBranch = { ...b, ...updatedFields };
          return targetUpdatedBranch;
        }
        return b;
      });
      if (targetUpdatedBranch) {
        persistBranch(targetUpdatedBranch, updatedBranches, true);
      }
      return updatedBranches;
    });

    if (updatedFields.name) {
      const newName = updatedFields.name;
      setSystemUsers(prev => prev.map(u => u.branchId === branchId ? { ...u, branchName: newName } : u));
      if (currentUser?.branchId === branchId) {
        setCurrentUser(prev => prev ? { ...prev, branchName: newName } : null);
      }
    }
  };

  const handleDeleteBranch = async (branchId: string): Promise<{ success: boolean; error?: string }> => {
    // Check if branch exists
    const target = systemBranches.find(b => b.id === branchId);
    if (!target) return { success: false, error: 'Branch not found.' };

    // Prevent deleting only remaining branch
    const orgBranches = systemBranches.filter(b => b.orgId === currentOrg.id);
    if (orgBranches.length <= 1) {
      return { success: false, error: 'Cannot delete the organization\'s only operating facility.' };
    }

    // Check if users are assigned to branch
    const assignedUsers = systemUsers.filter(u => u.branchId === branchId && u.orgId === currentOrg.id);
    if (assignedUsers.length > 0) {
      return { success: false, error: `Cannot delete branch with ${assignedUsers.length} stationed staff member(s). Reassign staff first.` };
    }

    setSystemBranches(prevBranches => {
      const updated = prevBranches.filter(b => b.id !== branchId);
      deleteBranchFromStorage(branchId, updated);
      return updated;
    });

    return { success: true };
  };

  const handleRegisterDepartment = (newDept: Department) => {
    setSystemDepartments(prevDepts => {
      const updated = [...prevDepts, newDept];
      persistDepartment(newDept, updated);
      return updated;
    });
  };

  const handleUpdateDepartment = (deptId: string, updatedFields: Partial<Department>) => {
    setSystemDepartments(prevDepts => {
      let targetUpdatedDept: Department | undefined;
      const updated = prevDepts.map(d => {
        if (d.id === deptId) {
          targetUpdatedDept = { ...d, ...updatedFields };
          return targetUpdatedDept;
        }
        return d;
      });
      if (targetUpdatedDept) {
        persistDepartment(targetUpdatedDept, updated, true);
      }
      return updated;
    });

    if (updatedFields.name) {
      const newName = updatedFields.name;
      setSystemUsers(prev => prev.map(u => u.departmentId === deptId ? { ...u, departmentName: newName } : u));
      if (currentUser?.departmentId === deptId) {
        setCurrentUser(prev => prev ? { ...prev, departmentName: newName } : null);
      }
    }
  };

  const handleDeleteDepartment = async (deptId: string): Promise<{ success: boolean; error?: string }> => {
    const target = systemDepartments.find(d => d.id === deptId);
    if (!target) return { success: false, error: 'Department not found.' };

    const orgDepts = systemDepartments.filter(d => d.orgId === currentOrg.id);
    if (orgDepts.length <= 1) {
      return { success: false, error: 'Cannot delete the organization\'s only operating department.' };
    }

    const assignedUsers = systemUsers.filter(u => u.departmentId === deptId && u.orgId === currentOrg.id);
    if (assignedUsers.length > 0) {
      return { success: false, error: `Cannot delete department with ${assignedUsers.length} assigned staff member(s). Reassign staff first.` };
    }

    setSystemDepartments(prevDepts => {
      const updated = prevDepts.filter(d => d.id !== deptId);
      deleteDepartmentFromStorage(deptId, updated);
      return updated;
    });

    return { success: true };
  };

  const handleClearDummyUsers = () => {
    setSystemUsers(prev => {
      const remaining = prev.filter(u => u.id === currentUser?.id || u.role === 'ADMIN');
      return remaining;
    });
  };

  const hasRole = (roles: UserRole | UserRole[]): boolean => {
    if (!currentUser) return false;
    if (Array.isArray(roles)) {
      return roles.includes(currentUser.role);
    }
    return currentUser.role === roles;
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentOrg,
        isSessionLoading,
        systemOrgs,
        systemUsers,
        systemBranches,
        currentOrgBranches,
        systemDepartments,
        currentOrgDepartments,
        isBranchRestricted,
        setCurrentOrg,
        handleSyncUsers,
        handleSyncBranches,
        handleSyncDepartments,
        handleSyncOrganizations,
        handleLoginSuccess,
        handleLogout,
        handleSelectOrg,
        handleRegisterOrganization,
        handleActivateUser,
        handleInviteUser,
        handleRegisterUser,
        handleUpdateUser,
        handleApplySavedUser,
        handleDeleteUser,
        handleRegisterBranch,
        handleUpdateBranch,
        handleDeleteBranch,
        handleRegisterDepartment,
        handleUpdateDepartment,
        handleDeleteDepartment,
        handleClearDummyUsers,
        hasRole
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

