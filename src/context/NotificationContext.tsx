import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SystemNotification, Asset, CheckoutRecord, MaintenanceRecord } from '../types';
import { INITIAL_NOTIFICATIONS } from '../mockData';
import { persistNotification } from '../lib/tidb-storage';

interface NotificationContextType {
  notifications: SystemNotification[];
  unreadCount: number;
  addNotification: (notif: Omit<SystemNotification, 'id' | 'timestamp'> & { timestamp?: string }) => void;
  markAllAsRead: (orgId?: string) => void;
  markAsRead: (notificationId: string) => void;
  removeNotification: (notificationId: string) => void;
  setNotifications: React.Dispatch<React.SetStateAction<SystemNotification[]>>;
  evaluateAutomatedAlerts: (assets: Asset[], checkouts: CheckoutRecord[], maintenances: MaintenanceRecord[], orgId: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<SystemNotification[]>(INITIAL_NOTIFICATIONS);

  const unreadCount = notifications.filter(n => !n.read).length;

  const addNotification = (notifData: Omit<SystemNotification, 'id' | 'timestamp'> & { timestamp?: string }) => {
    const newNotif: SystemNotification = {
      ...notifData,
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: notifData.timestamp || 'Just now',
      read: false
    };

    setNotifications(prev => {
      const updated = [newNotif, ...prev];
      persistNotification(newNotif, updated);
      return updated;
    });
  };

  const markAllAsRead = (orgId?: string) => {
    setNotifications(prev => prev.map(n => (!orgId || n.orgId === orgId) ? { ...n, read: true } : n));
  };

  const markAsRead = (notificationId: string) => {
    setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
  };

  const removeNotification = (notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  // Automated Alert Detection Engine (Warranty Expiration, Overdue Checkouts, Scheduled Maintenance)
  const evaluateAutomatedAlerts = (
    assets: Asset[],
    checkouts: CheckoutRecord[],
    maintenances: MaintenanceRecord[],
    orgId: string
  ) => {
    const now = new Date();
    const generatedAlerts: SystemNotification[] = [];

    // 1. Check for upcoming warranty expirations (< 30 days, < 60 days, < 90 days)
    assets
      .filter(a => a.orgId === orgId && a.warrantyExpiry)
      .forEach(asset => {
        const expiryDate = new Date(asset.warrantyExpiry);
        const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays >= 0 && diffDays <= 30) {
          generatedAlerts.push({
            id: `alert-warr-${asset.id}-30`,
            orgId: asset.orgId,
            type: 'WARRANTY',
            title: 'Warranty Expiring Soon (< 30 Days)',
            message: `${asset.name} (${asset.assetCode}) warranty expires in ${diffDays} days on ${asset.warrantyExpiry}.`,
            timestamp: 'Automated Fleet Guard',
            read: false
          });
        }
      });

    // 2. Check for overdue checkouts
    checkouts
      .filter(c => c.status === 'ACTIVE' && c.expectedReturnDate)
      .forEach(chk => {
        const returnDate = new Date(chk.expectedReturnDate!);
        const isOverdue = returnDate.getTime() < now.getTime();
        const diffDays = Math.ceil((now.getTime() - returnDate.getTime()) / (1000 * 60 * 60 * 24));

        if (isOverdue) {
          generatedAlerts.push({
            id: `alert-overdue-${chk.id}`,
            orgId: orgId,
            type: 'ALERT',
            title: 'Overdue Asset Checkout',
            message: `Asset ${chk.assetCode} checked out by ${chk.checkedOutToUserName} is ${diffDays} day(s) overdue (Expected: ${chk.expectedReturnDate}).`,
            timestamp: 'Automated Fleet Guard',
            read: false
          });
        }
      });

    // 3. Check for pending high-priority repairs
    maintenances
      .filter(m => m.status === 'IN_PROGRESS' || m.status === 'PENDING')
      .forEach(m => {
        if (m.type === 'REPAIR') {
          generatedAlerts.push({
            id: `alert-maint-${m.id}`,
            orgId: orgId,
            type: 'MAINTENANCE',
            title: 'Active Hardware Repair Ticket',
            message: `Ticket ${m.id}: ${m.assetCode} (${m.description}) under repair with technician ${m.assignedTechnician}.`,
            timestamp: 'Automated Fleet Guard',
            read: false
          });
        }
      });

    // Deduplicate against existing alerts
    setNotifications(prev => {
      const existingIds = new Set(prev.map(n => n.id));
      const newItems = generatedAlerts.filter(a => !existingIds.has(a.id));
      if (newItems.length === 0) return prev;
      return [...newItems, ...prev];
    });
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAllAsRead,
        markAsRead,
        removeNotification,
        setNotifications,
        evaluateAutomatedAlerts
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
