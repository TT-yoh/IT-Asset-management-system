import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User, Organization, Branch, UserRole } from '../types';
import { ORGANIZATIONS, INITIAL_BRANCHES, USERS } from '../mockData';
import { persistBranch, persistUser } from '../lib/tidb-storage';
import { clearOfflineStoreOnLogout } from '../lib/offline-sync';
import { RegisterCompanyData } from '../components/RegisterCompanyModal';

/**
 * Validates corporate password complexity:
 * Minimum 8 characters, at least one letter and at least one number.
 */
export const validatePasswordPolicy = (pwd: string): { valid: boolean; message: string } => {
  if (!pwd || typeof pwd !== 'string') {
    return { valid: false, message: 'Password is required.' };
  }
  if (pwd.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long.' };
  }
  if (!/[a-zA-Z]/.test(pwd) || !/[0-9]/.test(pwd)) {
    return { valid: false, message: 'Password must contain at least one letter and one number.' };
  }
  return { valid: true, message: '' };
};

interface AuthContextType {
  currentUser: User | null;
  currentOrg: Organization;
  systemOrgs: Organization[];
  systemUsers: User[];
  systemBranches: Branch[];
  currentOrgBranches: Branch[];
  isBranchRestricted: boolean;
  handleSwitchUser: (user: User | null) => void;
  setCurrentOrg: (org: Organization) => void;
  handleSyncUsers: (users: User[]) => void;
  handleSyncBranches: (branches: Branch[]) => void;
  handleLoginSuccess: (user: User, org: Organization) => void;
  handleLogout: () => void;
  handleSelectOrg: (org: Organization) => void;
  handleRegisterOrganization: (data: RegisterCompanyData) => void;
  handleActivateUser: (inviteToken: string, newPassword: string, twoFactorEnabled: boolean) => boolean;
  handleRegisterUser: (newUser: User) => void;
  handleUpdateUser: (updatedUser: User) => void;
  handleRegisterBranch: (newBranch: Branch) => void;
  handleUpdateBranch: (branchId: string, updatedFields: Partial<Branch>) => void;
  handleClearDummyUsers: () => void;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [systemOrgs, setSystemOrgs] = useState<Organization[]>(ORGANIZATIONS);
  const [systemUsers, setSystemUsers] = useState<User[]>(USERS);
  const [systemBranches, setSystemBranches] = useState<Branch[]>(INITIAL_BRANCHES);
  const [currentOrg, setCurrentOrg] = useState<Organization>(
    ORGANIZATIONS[0] || {
      id: 'org-omnitech',
      name: 'OmniTech Enterprise Systems',
      type: 'Enterprise',
      brandingColor: '#0ea5e9',
      branchesCount: 1
    }
  );
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const isBranchRestricted = Boolean(
    currentUser && (currentUser.role === 'BRANCH_MANAGER' || currentUser.role === 'USER')
  );

  const currentOrgBranches = systemBranches.filter(b => b.orgId === currentOrg.id);

  const handleLoginSuccess = (user: User, org: Organization) => {
    setCurrentOrg(org);
    setCurrentUser(user);
    if (typeof window !== 'undefined') {
      const initialTab = window.location.hash || '#/dashboard';
      window.history.replaceState({ tab: initialTab.replace(/^#\/?/, '') }, '', initialTab);
    }
  };

  const handleLogout = async () => {
    try {
      const result = await clearOfflineStoreOnLogout(false);
      if (!result.cleared && result.pendingCount > 0) {
        const confirmLogout = window.confirm(
          `Warning: You have ${result.pendingCount} pending offline mutation(s) that have not synced to the cloud.\n\nLogging out will clear this device's offline store and permanently lose these changes. Do you want to proceed?`
        );
        if (!confirmLogout) {
          return;
        }
        await clearOfflineStoreOnLogout(true);
      }
    } catch (err) {
      console.warn('Offline store cleanup notice during logout:', err);
    }

    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setCurrentUser(null);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  /**
   * Switch user with organization scoping
   */
  const handleSwitchUser = (user: User | null) => {
    if (!user) {
      setCurrentUser(null);
      return;
    }
    const found = systemUsers.find(u => u.id === user.id);
    if (found) {
      setCurrentUser(found);
    }
  };

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
   * Selecting an organization updates the active tenant view.
   * Selecting an org must NOT change user identity or log in as arbitrary users.
   */
  const handleSelectOrg = (org: Organization) => {
    setCurrentOrg(org);
  };

  const handleRegisterOrganization = (data: RegisterCompanyData) => {
    const adminPassword = data.adminPassword?.trim();
    const policyCheck = validatePasswordPolicy(adminPassword || '');
    if (!policyCheck.valid) {
      throw new Error(`Admin password does not meet security requirements: ${policyCheck.message}`);
    }

    const orgId = `org-${Date.now()}`;
    const branchCount = Math.max(1, data.branches?.length || 1);
    const newOrg: Organization = {
      id: orgId,
      name: data.name,
      type: data.type || 'Enterprise',
      logo: data.logo || '🏢',
      brandingColor: '#10b981',
      branchesCount: branchCount
    };

    const provisionedBranches: Branch[] = (data.branches && data.branches.length > 0)
      ? data.branches.map((b, idx) => ({
          id: `branch-${Date.now()}-${idx}`,
          orgId: newOrg.id,
          name: b.name,
          code: b.code || `BR-${idx + 1}`,
          city: b.city,
          country: b.country || 'Australia',
          location: b.location || 'Site Facility',
          managerName: b.managerName || data.adminName || 'Facility Manager'
        }))
      : [{
          id: `branch-${Date.now()}-0`,
          orgId: newOrg.id,
          name: `${data.name} Main Campus`,
          code: `HQ-${data.name.slice(0, 3).toUpperCase()}`,
          location: 'Central Campus',
          city: 'Headquarters',
          country: 'Global',
          managerName: data.adminName?.trim() || 'Enterprise Admin'
        }];

    const primaryBranch = provisionedBranches[0]!;
    const cleanDomain = data.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'company';
    const finalEmail = data.adminEmail?.trim() || `admin@${cleanDomain}.com`;
    const finalName = data.adminName?.trim() || `${data.name} Global Admin`;

    const newAdminUser: User = {
      id: `usr-${Date.now()}`,
      orgId: newOrg.id,
      email: finalEmail,
      fullName: finalName,
      role: 'ADMIN',
      status: 'ACTIVE',
      departmentId: 'dept-it',
      departmentName: 'IT Infrastructure & SecOps',
      branchId: primaryBranch.id,
      branchName: primaryBranch.name,
      twoFactorEnabled: false,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
    };

    setSystemOrgs(prev => [...prev, newOrg]);

    // Use functional updates to prevent stale closure and persist computed result
    setSystemBranches(prevBranches => {
      const updatedBranches = [...prevBranches, ...provisionedBranches];
      provisionedBranches.forEach(b => persistBranch(b, updatedBranches));
      return updatedBranches;
    });

    setSystemUsers(prevUsers => {
      const updatedUsers = [...prevUsers, newAdminUser];
      persistUser(newAdminUser, updatedUsers);
      return updatedUsers;
    });

    setCurrentOrg(newOrg);
    setCurrentUser(newAdminUser);
  };

  /**
   * Activates an invited user account.
   * - Matches on inviteToken only (never user id)
   * - Requires status to be INVITED
   * - Rejects expired tokens (> 48h)
   * - Consumes token as single-use
   * - Requires password meeting corporate policy
   */
  const handleActivateUser = (inviteToken: string, newPassword: string, twoFactorEnabled: boolean): boolean => {
    const cleanToken = inviteToken.trim();
    if (!cleanToken) {
      console.warn('Activation error: Empty invite token.');
      return false;
    }

    const policyCheck = validatePasswordPolicy(newPassword);
    if (!policyCheck.valid) {
      console.warn(`Activation error: ${policyCheck.message}`);
      return false;
    }

    let activatedSuccess = false;
    let activatedUserInstance: User | null = null;

    setSystemUsers(prevUsers => {
      // Must match on inviteToken only (never u.id)
      const userIndex = prevUsers.findIndex(u => u.inviteToken && u.inviteToken === cleanToken);
      if (userIndex === -1) {
        console.warn('Activation error: No user matching the provided invitation token.');
        return prevUsers;
      }

      const targetUser = prevUsers[userIndex]!;

      // Require user's status to be INVITED
      if (targetUser.status !== 'INVITED') {
        console.warn(`Activation error: Account status is "${targetUser.status}", expected "INVITED".`);
        return prevUsers;
      }

      // Check for token expiration (48 hour validity window)
      if (targetUser.invitedAt) {
        const inviteTimestamp = new Date(targetUser.invitedAt).getTime();
        const maxAgeMs = 48 * 60 * 60 * 1000;
        if (!isNaN(inviteTimestamp) && Date.now() - inviteTimestamp > maxAgeMs) {
          console.warn('Activation error: Invitation token has expired.');
          return prevUsers;
        }
      }

      // Make token single-use by unsetting inviteToken and marking status ACTIVE
      const updatedUser: User = {
        ...targetUser,
        twoFactorEnabled,
        status: 'ACTIVE',
        inviteToken: undefined // single-use: token consumed
      };

      // Call backend activation endpoint
      fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invite_token: cleanToken,
          password: newPassword,
          two_factor_enabled: twoFactorEnabled
        })
      }).catch(() => {});

      const updatedUsers = [...prevUsers];
      updatedUsers[userIndex] = updatedUser;

      activatedSuccess = true;
      activatedUserInstance = updatedUser;

      // Persist computed result to avoid stale render closure
      persistUser(updatedUser, updatedUsers);
      return updatedUsers;
    });

    if (activatedSuccess && activatedUserInstance) {
      const userOrg = systemOrgs.find(o => o.id === (activatedUserInstance as User).orgId) || systemOrgs[0]!;
      setCurrentOrg(userOrg);
      setCurrentUser(activatedUserInstance);
      return true;
    }

    return activatedSuccess;
  };

  const handleRegisterUser = (newUser: User) => {
    setSystemUsers(prevUsers => {
      const updatedUsers = [...prevUsers, newUser];
      persistUser(newUser, updatedUsers);
      return updatedUsers;
    });
  };

  const handleUpdateUser = (updatedUser: User) => {
    setSystemUsers(prevUsers => {
      const updatedUsers = prevUsers.map(u => u.id === updatedUser.id ? updatedUser : u);
      persistUser(updatedUser, updatedUsers);
      return updatedUsers;
    });
    if (currentUser?.id === updatedUser.id) {
      setCurrentUser(updatedUser);
    }
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
        persistBranch(targetUpdatedBranch, updatedBranches);
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

  const handleClearDummyUsers = () => {
    // Only allowed in DEV mode, never in production builds
    if (!import.meta.env.DEV) {
      return;
    }
    setSystemUsers(prev => prev.filter(u => u.id === currentUser?.id || u.status === 'ACTIVE'));
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
        systemOrgs,
        systemUsers,
        systemBranches,
        currentOrgBranches,
        isBranchRestricted,
        handleSwitchUser,
        setCurrentOrg,
        handleSyncUsers,
        handleSyncBranches,
        handleLoginSuccess,
        handleLogout,
        handleSelectOrg,
        handleRegisterOrganization,
        handleActivateUser,
        handleRegisterUser,
        handleUpdateUser,
        handleRegisterBranch,
        handleUpdateBranch,
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
