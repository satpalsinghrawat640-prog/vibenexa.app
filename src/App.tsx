/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Home, Compass, Heart, MessageCircle, User, Bell } from 'lucide-react';
import { AuthUser, NotificationItem } from './types/vibenexa';
import { apiFetch, setAuthToken } from './lib/api';
import { realtime } from './lib/realtime';
import { logoutFirebaseClient, testFirestoreConnection } from './firebase';
import { ToastBanner, VibeNexaLogo, UserAvatar, VerifiedBadge } from './components/BrandLogo';
import { AuthScreen } from './components/AuthScreen';
import { HomeFeedView } from './components/HomeFeedView';
import { DiscoverView } from './components/DiscoverView';
import { LikesMatchesView } from './components/LikesMatchesView';
import { MessagesView } from './components/MessagesView';
import { ProfileAndSettingsView, ProfileSubView } from './components/ProfileAndSettingsView';
import { AdminPanelView } from './components/AdminPanelView';
import {
  AppErrorBoundary,
  NotificationsDrawer,
  QuickReportModal,
  UserProfileModal,
} from './components/ProfileAndSafetyModals';

type MainTab = 'home' | 'discover' | 'likes' | 'messages' | 'profile';

function VibeNexaApp() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [profileSubView, setProfileSubView] = useState<ProfileSubView>('profile');
  const [messagesSubTab, setMessagesSubTab] = useState<'personal' | 'global'>('personal');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [viewingProfileUid, setViewingProfileUid] = useState<string | null>(null);
  const [reportingTarget, setReportingTarget] = useState<{ uid: string; name: string } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Verify Firestore connectivity on startup
  useEffect(() => {
    testFirestoreConnection();
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiFetch<{ user: AuthUser }>('/api/auth/me');
      setUser(res.user);
    } catch {
      // Token invalid or expired
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await apiFetch<{ notifications: NotificationItem[] }>('/api/notifications');
      setNotifications(res.notifications);
    } catch {
      // Ignore if unauthenticated
    }
  }, []);

  // Push browser history state for smooth Android back-button navigation
  const navigateTab = useCallback((tab: MainTab, subView?: ProfileSubView) => {
    setActiveTab(tab);
    if (subView) setProfileSubView(subView);
    window.history.pushState({ tab, subView: subView || 'profile' }, '');
  }, []);

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      if (viewingProfileUid) {
        setViewingProfileUid(null);
        return;
      }
      if (notifDrawerOpen) {
        setNotifDrawerOpen(false);
        return;
      }
      if (e.state && e.state.tab) {
        setActiveTab(e.state.tab as MainTab);
        if (e.state.subView) setProfileSubView(e.state.subView as ProfileSubView);
      } else if (activeTab === 'profile' && profileSubView !== 'profile') {
        setProfileSubView('profile');
      } else if (activeTab !== 'home') {
        setActiveTab('home');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [activeTab, profileSubView, viewingProfileUid, notifDrawerOpen]);

  // Subscribe to real-time notifications when logged in
  useEffect(() => {
    if (!user) return;
    loadNotifications();
    const offNotif = realtime.on('notification:new', (payload) => {
      const item = payload as NotificationItem;
      setNotifications((prev) => (prev.some((n) => n.id === item.id) ? prev : [item, ...prev]));
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(item.title, { body: item.body });
        } catch {
          // Fallback silently in sandboxed iframes
        }
      }
    });
    return () => {
      offNotif();
    };
  }, [user?.uid, loadNotifications]);

  function handleAuthSuccess(token: string, authedUser: AuthUser) {
    setAuthToken(token);
    setUser(authedUser);
    realtime.connect(token);
    setActiveTab('home');
    setProfileSubView('profile');
    setMessagesSubTab(authedUser.ageGroup === 'minor' ? 'global' : 'personal');
    window.history.replaceState({ tab: 'home', subView: 'profile' }, '');
  }

  async function handleLogout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Proceed with local cleanup even if session already expired
    }
    await logoutFirebaseClient();
    realtime.disconnect();
    setAuthToken(null);
    setUser(null);
    setNotifications([]);
    setActiveChatId(null);
    setViewingProfileUid(null);
    setNotifDrawerOpen(false);
    showToast('info', 'Logged out securely.');
  }

  async function handleMarkAllRead() {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // Ignore
    }
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  if (!user) {
    return (
      <>
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />
        <AuthScreen onAuthSuccess={handleAuthSuccess} onNotify={showToast} />
      </>
    );
  }

  const navItems: { id: MainTab; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Home', icon: <Home className="w-5 h-5" /> },
    { id: 'discover', label: 'Discover', icon: <Compass className="w-5 h-5" /> },
    { id: 'likes', label: 'Likes & Matches', icon: <Heart className="w-5 h-5" /> },
    { id: 'messages', label: 'Messages', icon: <MessageCircle className="w-5 h-5" /> },
    { id: 'profile', label: 'Profile', icon: <User className="w-5 h-5" /> },
  ];

  const pageTitle = {
    home: 'Home Feed',
    discover: 'Discover',
    likes: 'Likes & Matches',
    messages: 'Messages',
    profile: 'Profile',
  }[activeTab];

  return (
    <div className="min-h-screen bg-[#FFF9FA] text-zinc-900 flex flex-col lg:flex-row">
      <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

      {/* Desktop Left Navigation Rail (Expands cleanly on desktop viewports) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 xl:w-72 lg:fixed lg:inset-y-0 bg-white border-r border-rose-100 px-5 py-6 z-30">
        <div className="flex items-center gap-3 px-2 mb-8">
          <VibeNexaLogo size={40} />
          <div>
            <span className="font-display text-xl font-bold tracking-tight text-zinc-900 block leading-none">
              VibeNexa
            </span>
            <span className="text-xs font-medium text-rose-600">Find Your Partner</span>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5" aria-label="Main navigation">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'profile') {
                    navigateTab('profile', 'profile');
                  } else {
                    navigateTab(item.id);
                  }
                }}
                className={`w-full min-h-[48px] px-4 rounded-2xl flex items-center gap-3 text-sm font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-sm shadow-rose-500/20'
                    : 'text-zinc-600 hover:bg-rose-50 hover:text-rose-700'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Signed-in User Summary */}
        <button
          type="button"
          onClick={() => navigateTab('profile', 'profile')}
          className="mt-6 p-3 rounded-2xl bg-rose-50/70 hover:bg-rose-100/70 flex items-center gap-3 text-left transition-colors"
        >
          <UserAvatar photoUrl={user.photoUrl} name={user.name} size="sm" isOnline />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold text-zinc-900 truncate">{user.name}</span>
              {user.isVerified && <VerifiedBadge size={13} />}
            </div>
            <p className="text-[11px] text-zinc-500 truncate">@{user.username}</p>
          </div>
        </button>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 xl:pl-72 flex flex-col min-h-screen">
        {/* Compact Sticky Top App Bar (Mobile + Desktop) */}
        <header className="sticky top-0 z-30 h-14 bg-white/90 backdrop-blur-md border-b border-rose-100 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="lg:hidden">
              <VibeNexaLogo size={32} />
            </div>
            <h1 className="font-display text-lg font-bold text-zinc-900 truncate">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setNotifDrawerOpen(true)}
              aria-label="Open notifications"
              className="relative min-h-[44px] min-w-[44px] rounded-xl hover:bg-rose-50 text-zinc-700 flex items-center justify-center transition-colors"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Scrollable Workspace */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-5 pb-24 lg:pb-10">
          {activeTab === 'home' && (
            <HomeFeedView
              currentUser={user}
              onViewProfile={(uid) => setViewingProfileUid(uid)}
              onNotify={showToast}
            />
          )}

          {activeTab === 'discover' && (
            <DiscoverView
              currentUser={user}
              onViewProfile={(uid) => setViewingProfileUid(uid)}
              onOpenChat={(chatId) => {
                setActiveChatId(chatId);
                setMessagesSubTab('personal');
                navigateTab('messages');
              }}
              onGoGlobalChat={() => {
                setMessagesSubTab('global');
                navigateTab('messages');
              }}
              onNotify={showToast}
            />
          )}

          {activeTab === 'likes' && (
            <LikesMatchesView
              currentUser={user}
              onViewProfile={(uid) => setViewingProfileUid(uid)}
              onOpenChat={(chatId) => {
                setActiveChatId(chatId);
                setMessagesSubTab('personal');
                navigateTab('messages');
              }}
              onNotify={showToast}
            />
          )}

          {activeTab === 'messages' && (
            <MessagesView
              currentUser={user}
              initialSubTab={messagesSubTab}
              initialChatId={activeChatId}
              onViewProfile={(uid) => setViewingProfileUid(uid)}
              onReportUser={(uid, name) => setReportingTarget({ uid, name })}
              onOpenUpgrade={() => navigateTab('profile', 'subscriptions')}
              onOpenMuteAppeal={() => navigateTab('profile', 'muteAppeal')}
              onOpenFreeSupport={() => navigateTab('profile', 'support')}
              onNotify={showToast}
              onRefreshUser={refreshUser}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileAndSettingsView
              currentUser={user}
              subView={profileSubView}
              onChangeSubView={(next) => navigateTab('profile', next)}
              onRefreshUser={refreshUser}
              onLogout={handleLogout}
              onNotify={showToast}
              renderAdminPanel={() => (
                <AdminPanelView
                  onNotify={showToast}
                  onViewProfile={(uid) => setViewingProfileUid(uid)}
                />
              )}
            />
          )}
        </main>
      </div>

      {/* Android-First Fixed 5-Tab Bottom Navigation Bar */}
      <nav
        aria-label="Mobile bottom navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-rose-100 pb-safe"
      >
        <div className="grid grid-cols-5 h-16 items-center">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const shortLabel = item.id === 'likes' ? 'Matches' : item.label;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'profile') {
                    navigateTab('profile', 'profile');
                  } else {
                    navigateTab(item.id);
                  }
                }}
                className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  isActive ? 'text-rose-600' : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">
                  {shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Global Overlays */}
      <UserProfileModal
        uid={viewingProfileUid}
        currentUser={user}
        onClose={() => setViewingProfileUid(null)}
        onOpenChat={(chatId) => {
          setActiveChatId(chatId);
          setMessagesSubTab('personal');
          navigateTab('messages');
        }}
        onReportUser={(uid, name) => setReportingTarget({ uid, name })}
        onNotify={showToast}
      />

      <QuickReportModal
        target={reportingTarget}
        onClose={() => setReportingTarget(null)}
        onNotify={showToast}
      />

      <NotificationsDrawer
        open={notifDrawerOpen}
        notifications={notifications}
        onClose={() => setNotifDrawerOpen(false)}
        onMarkAllRead={handleMarkAllRead}
      />
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <VibeNexaApp />
    </AppErrorBoundary>
  );
}
