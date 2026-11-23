import React, { useEffect, useState } from 'react';
import {
  Users,
  BadgeCheck,
  CreditCard,
  Crown,
  AlertTriangle,
  Flag,
  MessageSquare,
  Megaphone,
  FileClock,
  Search,
  Check,
  X,
  Trash2,
  KeyRound,
  Upload,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';
import {
  AdminDashboardStats,
  AdminLogItem,
  AppSettingsConfig,
  AuthUser,
  GlobalChatMessage,
  MuteAppealItem,
  PasswordRecoveryItem,
  PaymentRequestItem,
  SafetyReportItem,
  SupportTicketItem,
  VerificationRequestItem,
} from '../types/vibenexa';
import { apiFetch, formatRelativeTime, uploadCompressedMedia } from '../lib/api';
import { ProtectedImage, UserAvatar, VerifiedBadge } from './BrandLogo';

type AdminTab =
  | 'overview'
  | 'users'
  | 'verifications'
  | 'payments'
  | 'config'
  | 'appeals'
  | 'reports'
  | 'support'
  | 'moderation'
  | 'logs';

interface AdminPanelViewProps {
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
  onViewProfile: (uid: string) => void;
}

export function AdminPanelView({ onNotify, onViewProfile }: AdminPanelViewProps) {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(false);

  // Announcement form
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');

  // Users
  const [users, setUsers] = useState<(AuthUser & { suspendReason?: string })[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState('all');
  const [grantPlanByUid, setGrantPlanByUid] = useState<Record<string, string>>({});

  // Queues
  const [verifications, setVerifications] = useState<VerificationRequestItem[]>([]);
  const [rejectReasonById, setRejectReasonById] = useState<Record<string, string>>({});
  const [payments, setPayments] = useState<PaymentRequestItem[]>([]);
  const [payNoteById, setPayNoteById] = useState<Record<string, string>>({});
  const [appeals, setAppeals] = useState<MuteAppealItem[]>([]);
  const [reports, setReports] = useState<SafetyReportItem[]>([]);
  const [investigatedChat, setInvestigatedChat] = useState<{
    reportId: string;
    messages: { id: string; senderUid: string; text: string; createdAt: string }[];
  } | null>(null);
  const [investigationReason, setInvestigationReason] = useState('');

  const [tickets, setTickets] = useState<SupportTicketItem[]>([]);
  const [replyByTicket, setReplyByTicket] = useState<Record<string, string>>({});
  const [recoveries, setRecoveries] = useState<PasswordRecoveryItem[]>([]);
  const [issuedCodeBanner, setIssuedCodeBanner] = useState<{ username: string; code: string } | null>(null);

  const [globalMsgs, setGlobalMsgs] = useState<GlobalChatMessage[]>([]);
  const [blockedRecords, setBlockedRecords] = useState<
    { id: string; blockerUsername: string; blockedUsername: string; createdAt: string }[]
  >([]);
  const [logs, setLogs] = useState<AdminLogItem[]>([]);
  const [settings, setSettings] = useState<AppSettingsConfig | null>(null);

  async function loadStats() {
    try {
      const res = await apiFetch<{ stats: AdminDashboardStats }>('/api/admin/stats');
      setStats(res.stats);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Admin authorization failed.');
    }
  }

  async function loadTabData(activeTab: AdminTab) {
    setLoading(true);
    try {
      if (activeTab === 'overview') {
        await loadStats();
      } else if (activeTab === 'users') {
        const [uRes, sRes] = await Promise.all([
          apiFetch<{ users: (AuthUser & { suspendReason?: string })[] }>(
            `/api/admin/users?q=${encodeURIComponent(userSearch)}&filter=${encodeURIComponent(userFilter)}`
          ),
          apiFetch<{ settings: AppSettingsConfig }>('/api/admin/settings'),
        ]);
        setUsers(uRes.users);
        setSettings(sRes.settings);
      } else if (activeTab === 'verifications') {
        const res = await apiFetch<{ requests: VerificationRequestItem[] }>('/api/admin/verifications');
        setVerifications(res.requests);
      } else if (activeTab === 'payments') {
        const res = await apiFetch<{ payments: PaymentRequestItem[] }>('/api/admin/payments');
        setPayments(res.payments);
      } else if (activeTab === 'config') {
        const res = await apiFetch<{ settings: AppSettingsConfig }>('/api/admin/settings');
        setSettings(res.settings);
      } else if (activeTab === 'appeals') {
        const res = await apiFetch<{ appeals: MuteAppealItem[] }>('/api/admin/appeals');
        setAppeals(res.appeals);
      } else if (activeTab === 'reports') {
        const res = await apiFetch<{ reports: SafetyReportItem[] }>('/api/admin/reports');
        setReports(res.reports);
      } else if (activeTab === 'support') {
        const [tRes, rRes] = await Promise.all([
          apiFetch<{ tickets: SupportTicketItem[] }>('/api/admin/support'),
          apiFetch<{ recoveries: PasswordRecoveryItem[] }>('/api/admin/password-recoveries'),
        ]);
        setTickets(tRes.tickets);
        setRecoveries(rRes.recoveries);
      } else if (activeTab === 'moderation') {
        const [gRes, bRes] = await Promise.all([
          apiFetch<{ messages: GlobalChatMessage[] }>('/api/admin/global-chat'),
          apiFetch<{
            records: { id: string; blockerUsername: string; blockedUsername: string; createdAt: string }[];
          }>('/api/admin/blocked-users'),
        ]);
        setGlobalMsgs(gRes.messages);
        setBlockedRecords(bRes.records);
      } else if (activeTab === 'logs') {
        const res = await apiFetch<{ logs: AdminLogItem[] }>('/api/admin/logs');
        setLogs(res.logs);
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not load admin data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadTabData(tab);
  }, [tab, userFilter]);

  async function handleSendAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await apiFetch<{ deliveredCount: number }>('/api/admin/announcements', {
        method: 'POST',
        body: { title: annTitle, body: annBody },
      });
      setAnnTitle('');
      setAnnBody('');
      onNotify('success', `Announcement broadcast to ${res.deliveredCount} opted-in user(s).`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Broadcast failed.');
    }
  }

  async function handleUserAction(
    uid: string,
    action: 'suspend' | 'restore' | 'mute' | 'unmute',
    reason?: string
  ) {
    try {
      await apiFetch(`/api/admin/users/${uid}/${action}`, {
        method: 'POST',
        body: reason ? { reason } : {},
      });
      onNotify('success', `User ${action} completed.`);
      loadTabData('users');
      loadStats();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Action failed.');
    }
  }

  async function handleGrantSubscription(uid: string) {
    const planId = grantPlanByUid[uid] || settings?.plans[0]?.id;
    if (!planId) return;
    try {
      await apiFetch('/api/admin/subscriptions/grant', {
        method: 'POST',
        body: { userId: uid, planId },
      });
      onNotify('success', 'Subscription activated for user.');
      loadTabData('users');
      loadStats();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Grant failed.');
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    try {
      const res = await apiFetch<{ settings: AppSettingsConfig }>('/api/admin/settings', {
        method: 'PUT',
        body: { settings },
      });
      setSettings(res.settings);
      onNotify('success', 'Plans, UPI payment details, QR codes, and App Settings saved.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not save settings.');
    }
  }

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Dashboard', icon: <Megaphone className="w-4 h-4" /> },
    { id: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
    { id: 'verifications', label: 'Verifications', icon: <BadgeCheck className="w-4 h-4" /> },
    { id: 'payments', label: 'Payments', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'config', label: 'Plans & UPI', icon: <Crown className="w-4 h-4" /> },
    { id: 'appeals', label: 'Appeals', icon: <AlertTriangle className="w-4 h-4" /> },
    { id: 'reports', label: 'Reports', icon: <Flag className="w-4 h-4" /> },
    { id: 'support', label: 'Support & Reset', icon: <HelpCircle className="w-4 h-4" /> },
    { id: 'moderation', label: 'Chat & Blocks', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'logs', label: 'Audit Logs', icon: <FileClock className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="bg-zinc-900 text-white rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-rose-400">Authorized Super Admin Console</p>
          <h2 className="font-display text-2xl font-bold mt-0.5">VibeNexa Admin Dashboard</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            loadStats();
            loadTabData(tab);
          }}
          className="min-h-[42px] px-4 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold whitespace-nowrap self-start sm:self-auto"
        >
          Refresh Live Data
        </button>
      </div>

      {/* Scrollable Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-[42px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all ${
              tab === t.id
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-white text-zinc-700 border border-rose-100 hover:bg-rose-50'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* 1. OVERVIEW & PUSH ANNOUNCEMENTS */}
      {tab === 'overview' && (
        <div className="space-y-5">
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
              {[
                { label: 'Total Users', value: stats.totalUsers },
                { label: 'Active Users', value: stats.activeUsers },
                { label: 'Online Now', value: stats.onlineUsers },
                { label: 'Premium Users', value: stats.premiumUsers },
                { label: 'New (24h)', value: stats.newRegistrations24h },
                { label: 'Matches', value: stats.matches },
                { label: 'Pending Payments', value: stats.pendingPayments },
                { label: 'Pending Appeals', value: stats.pendingAppeals },
                { label: 'Open Reports', value: stats.pendingReports },
                { label: 'Verifications', value: stats.pendingVerifications },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="bg-white rounded-2xl p-4 border border-rose-100 shadow-xs"
                >
                  <p className="text-xs font-medium text-zinc-500">{kpi.label}</p>
                  <p className="font-display text-2xl font-bold text-zinc-900 mt-1 tabular-nums">
                    {kpi.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Push Announcements */}
          <form
            onSubmit={handleSendAnnouncement}
            className="bg-white rounded-3xl p-6 border border-rose-100 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-rose-600" />
              <h3 className="font-display font-bold text-base text-zinc-900">
                Broadcast Push Announcement
              </h3>
            </div>
            <p className="text-xs text-zinc-500">
              Sends a real-time notification to all active users who have Admin Announcements enabled in Notification Settings.
            </p>
            <input
              type="text"
              required
              minLength={3}
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
              placeholder="Announcement Title"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-200 text-sm"
            />
            <textarea
              rows={3}
              required
              minLength={5}
              value={annBody}
              onChange={(e) => setAnnBody(e.target.value)}
              placeholder="Announcement message body..."
              className="w-full p-3.5 rounded-xl border border-zinc-200 text-sm"
            />
            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
            >
              Send Announcement
            </button>
          </form>
        </div>
      )}

      {/* 2. USER MANAGEMENT */}
      {tab === 'users' && (
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-rose-100 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadTabData('users')}
                placeholder="Search by username, name, email, mobile, state..."
                className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-zinc-200 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => loadTabData('users')}
              className="min-h-[44px] px-4 rounded-xl bg-rose-600 text-white text-xs font-semibold"
            >
              Search
            </button>
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="min-h-[44px] px-3 rounded-xl border border-zinc-200 bg-white text-xs font-semibold"
            >
              <option value="all">All Users</option>
              <option value="suspended">Suspended Users</option>
              <option value="muted">Muted Users</option>
              <option value="verified">Verified Users</option>
              <option value="minor">Minors (&lt;18)</option>
            </select>
          </div>

          <div className="divide-y divide-zinc-100">
            {users.map((u) => (
              <div key={u.uid} className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <UserAvatar photoUrl={u.photoUrl} name={u.name} size="md" isOnline={u.isOnline} />
                  <div className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onViewProfile(u.uid)}
                        className="font-bold text-sm text-zinc-900 hover:text-rose-600"
                      >
                        {u.name} (@{u.username})
                      </button>
                      {u.isVerified && <VerifiedBadge size={14} />}
                    </div>
                    <p className="text-zinc-500 mt-0.5">
                      Age {u.age} ({u.ageGroup}) · {u.district}, {u.state} · Role: {u.role}
                    </p>
                    <p className="text-zinc-500 mt-0.5 font-mono">
                      {u.email || 'No email'} · {u.mobile || 'No mobile'}
                    </p>
                    <p className="mt-1 font-medium text-rose-700">
                      {u.isSuspended ? 'Suspended · ' : ''}
                      {u.isMuted ? 'Muted · ' : ''}
                      {u.activeSubscription ? `Plan: ${u.activeSubscription.planName}` : 'Free Tier'}
                    </p>
                  </div>
                </div>

                {u.role !== 'SUPER_ADMIN' && (
                  <div className="flex flex-wrap items-center gap-2">
                    {u.isSuspended ? (
                      <button
                        type="button"
                        onClick={() => handleUserAction(u.uid, 'restore')}
                        className="min-h-[38px] px-3 rounded-xl bg-zinc-900 text-white text-xs font-semibold"
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleUserAction(u.uid, 'suspend', 'Suspended by Super Admin')}
                        className="min-h-[38px] px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold"
                      >
                        Suspend
                      </button>
                    )}

                    {u.isMuted ? (
                      <button
                        type="button"
                        onClick={() => handleUserAction(u.uid, 'unmute')}
                        className="min-h-[38px] px-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold"
                      >
                        Unmute
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleUserAction(u.uid, 'mute', 'Chat guideline violation')}
                        className="min-h-[38px] px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold"
                      >
                        Mute
                      </button>
                    )}

                    {settings && (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={grantPlanByUid[u.uid] || settings.plans[0]?.id || ''}
                          onChange={(e) =>
                            setGrantPlanByUid((prev) => ({ ...prev, [u.uid]: e.target.value }))
                          }
                          className="min-h-[38px] px-2 rounded-xl border border-zinc-200 text-xs bg-white"
                        >
                          {settings.plans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleGrantSubscription(u.uid)}
                          className="min-h-[38px] px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold"
                        >
                          Grant Plan
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. VERIFICATION MANAGEMENT */}
      {tab === 'verifications' && (
        <div className="bg-white rounded-3xl p-6 border border-rose-100 space-y-4">
          <h3 className="font-display font-bold text-base text-zinc-900">
            Profile Verification Queue ({verifications.length})
          </h3>
          {verifications.length === 0 ? (
            <p className="text-sm text-zinc-500">No verification requests yet.</p>
          ) : (
            <div className="space-y-4">
              {verifications.map((v) => (
                <div key={v.id} className="p-4 rounded-2xl border border-zinc-200 flex flex-col sm:flex-row gap-4">
                  {v.proofMediaUrl && (
                    <ProtectedImage
                      url={v.proofMediaUrl}
                      alt={`Verification proof for ${v.username}`}
                      className="w-36 h-36 rounded-xl object-cover shrink-0 border"
                    />
                  )}
                  <div className="flex-1 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-zinc-900">
                        {v.userName} (@{v.username})
                      </span>
                      <span className="font-semibold capitalize text-rose-700">{v.status}</span>
                    </div>
                    <p className="font-mono text-zinc-700">Challenge Code: {v.challengeCode}</p>
                    {v.note && <p className="text-zinc-600">User note: {v.note}</p>}
                    <p className="text-zinc-400">{formatRelativeTime(v.createdAt)}</p>

                    {v.status === 'pending' && (
                      <div className="pt-2 space-y-2">
                        <input
                          type="text"
                          value={rejectReasonById[v.id] || ''}
                          onChange={(e) =>
                            setRejectReasonById((prev) => ({ ...prev, [v.id]: e.target.value }))
                          }
                          placeholder="Internal / rejection reason (if rejecting)"
                          className="w-full min-h-[38px] px-3 rounded-xl border border-zinc-200 text-xs"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/verifications/${v.id}/decision`, {
                                method: 'POST',
                                body: { decision: 'approved' },
                              });
                              onNotify('success', 'Profile verified with blue tick.');
                              loadTabData('verifications');
                              loadStats();
                            }}
                            className="min-h-[38px] px-4 rounded-xl bg-rose-600 text-white text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/verifications/${v.id}/decision`, {
                                method: 'POST',
                                body: {
                                  decision: 'rejected',
                                  rejectionReason: rejectReasonById[v.id] || 'Photo unclear or code mismatch',
                                },
                              });
                              onNotify('info', 'Verification rejected.');
                              loadTabData('verifications');
                              loadStats();
                            }}
                            className="min-h-[38px] px-4 rounded-xl bg-zinc-100 text-zinc-800 text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. PAYMENT MANAGEMENT */}
      {tab === 'payments' && (
        <div className="bg-white rounded-3xl p-6 border border-rose-100 space-y-4">
          <h3 className="font-display font-bold text-base text-zinc-900">
            Manual UPI Payment Verification ({payments.length})
          </h3>
          {payments.length === 0 ? (
            <p className="text-sm text-zinc-500">No UPI payment requests yet.</p>
          ) : (
            <div className="space-y-4">
              {payments.map((p) => (
                <div key={p.id} className="p-4 rounded-2xl border border-zinc-200 flex flex-col sm:flex-row gap-4">
                  {p.screenshotUrl && (
                    <ProtectedImage
                      url={p.screenshotUrl}
                      alt={`Payment screenshot ${p.transactionRef}`}
                      className="w-36 h-44 rounded-xl object-cover shrink-0 border"
                    />
                  )}
                  <div className="flex-1 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-zinc-900">
                        {p.productName} — ₹{p.amount}
                      </span>
                      <span className="font-semibold capitalize text-rose-700">{p.status}</span>
                    </div>
                    <p className="text-zinc-600">
                      User: {p.userName} (@{p.username})
                    </p>
                    <p className="font-mono font-semibold text-zinc-900">
                      Transaction / UTR Ref: {p.transactionRef}
                    </p>
                    <p className="text-zinc-400">{formatRelativeTime(p.createdAt)}</p>

                    {p.status === 'pending' && (
                      <div className="pt-2 space-y-2">
                        <input
                          type="text"
                          value={payNoteById[p.id] || ''}
                          onChange={(e) =>
                            setPayNoteById((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          placeholder="Admin verification note"
                          className="w-full min-h-[38px] px-3 rounded-xl border border-zinc-200 text-xs"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/payments/${p.id}/decision`, {
                                method: 'POST',
                                body: { decision: 'approved', adminNote: payNoteById[p.id] || 'Verified in bank statement' },
                              });
                              onNotify('success', 'Payment approved and product activated.');
                              loadTabData('payments');
                              loadStats();
                            }}
                            className="min-h-[38px] px-4 rounded-xl bg-rose-600 text-white text-xs font-semibold"
                          >
                            Approve & Activate
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/payments/${p.id}/decision`, {
                                method: 'POST',
                                body: { decision: 'rejected', adminNote: payNoteById[p.id] || 'Transaction not found' },
                              });
                              onNotify('info', 'Payment rejected.');
                              loadTabData('payments');
                              loadStats();
                            }}
                            className="min-h-[38px] px-4 rounded-xl bg-zinc-100 text-zinc-800 text-xs font-semibold"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. SUBSCRIPTION TIERS, UPI CONFIG, QR MANAGEMENT & APP SETTINGS */}
      {tab === 'config' && settings && (
        <form onSubmit={handleSaveSettings} className="space-y-5">
          {/* Core App Settings */}
          <div className="bg-white rounded-3xl p-6 border border-rose-100 space-y-4">
            <h3 className="font-display font-bold text-base text-zinc-900">Core App Settings</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Free Global Chat Limit (24h)
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={settings.freeGlobalDailyLimit}
                  onChange={(e) =>
                    setSettings({ ...settings, freeGlobalDailyLimit: Number(e.target.value) || 15 })
                  }
                  className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-200 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Mute Appeal Fee (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  value={settings.muteAppealPrice}
                  onChange={(e) =>
                    setSettings({ ...settings, muteAppealPrice: Number(e.target.value) || 19 })
                  }
                  className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-200 text-sm tabular-nums"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-800 min-h-[42px]">
                  <input
                    type="checkbox"
                    checked={settings.profileColorFreeForAll}
                    onChange={(e) =>
                      setSettings({ ...settings, profileColorFreeForAll: e.target.checked })
                    }
                  />
                  Allow Profile Color for Free Users
                </label>
              </div>
            </div>
          </div>

          {/* 3 Subscription Tiers */}
          <div className="bg-white rounded-3xl p-6 border border-rose-100 space-y-4">
            <h3 className="font-display font-bold text-base text-zinc-900">
              Subscription Tiers Configuration (3 Plans)
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {settings.plans.map((plan, idx) => (
                <div key={plan.id} className="p-4 rounded-2xl border border-zinc-200 space-y-3 text-xs">
                  <input
                    type="text"
                    value={plan.name}
                    onChange={(e) => {
                      const next = [...settings.plans];
                      next[idx] = { ...plan, name: e.target.value };
                      setSettings({ ...settings, plans: next });
                    }}
                    placeholder="Plan Name"
                    className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 font-bold text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-zinc-500">Price (₹)</label>
                      <input
                        type="number"
                        value={plan.priceInr}
                        onChange={(e) => {
                          const next = [...settings.plans];
                          next[idx] = { ...plan, priceInr: Number(e.target.value) || 0 };
                          setSettings({ ...settings, plans: next });
                        }}
                        className="w-full min-h-[38px] px-2.5 rounded-xl border border-zinc-200 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-500">Duration (Days)</label>
                      <input
                        type="number"
                        value={plan.durationDays}
                        onChange={(e) => {
                          const next = [...settings.plans];
                          next[idx] = { ...plan, durationDays: Number(e.target.value) || 30 };
                          setSettings({ ...settings, plans: next });
                        }}
                        className="w-full min-h-[38px] px-2.5 rounded-xl border border-zinc-200 tabular-nums"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 pt-1">
                    {(
                      [
                        ['verifiedBadge', 'Blue Verification Tick'],
                        ['unlimitedGlobalChat', 'Unlimited Global Chat'],
                        ['mediaSharing', 'Global Chat Media Sharing'],
                        ['chatWallpaper', 'Personal Chat Wallpaper'],
                        ['profileCustomization', 'Profile Customization'],
                      ] as const
                    ).map(([fkey, flabel]) => (
                      <label key={fkey} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={plan.features[fkey]}
                          onChange={(e) => {
                            const next = [...settings.plans];
                            next[idx] = {
                              ...plan,
                              features: { ...plan.features, [fkey]: e.target.checked },
                            };
                            setSettings({ ...settings, plans: next });
                          }}
                        />
                        {flabel}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Separate UPI & QR Configuration per Product */}
          <div className="bg-white rounded-3xl p-6 border border-rose-100 space-y-4">
            <h3 className="font-display font-bold text-base text-zinc-900">
              UPI & QR Management (Per Product)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {settings.paymentOptions.map((opt, idx) => (
                <div key={opt.id} className="p-4 rounded-2xl border border-zinc-200 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-zinc-900">{opt.productName}</span>
                    <span className="font-mono text-zinc-500">{opt.productId}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-zinc-500">Product Name</label>
                      <input
                        type="text"
                        value={opt.productName}
                        onChange={(e) => {
                          const next = [...settings.paymentOptions];
                          next[idx] = { ...opt, productName: e.target.value };
                          setSettings({ ...settings, paymentOptions: next });
                        }}
                        className="w-full min-h-[38px] px-2.5 rounded-xl border border-zinc-200"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-500">Price (₹)</label>
                      <input
                        type="number"
                        value={opt.priceInr}
                        onChange={(e) => {
                          const next = [...settings.paymentOptions];
                          next[idx] = { ...opt, priceInr: Number(e.target.value) || 0 };
                          setSettings({ ...settings, paymentOptions: next });
                        }}
                        className="w-full min-h-[38px] px-2.5 rounded-xl border border-zinc-200 tabular-nums"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-500">UPI ID</label>
                    <input
                      type="text"
                      value={opt.upiId}
                      onChange={(e) => {
                        const next = [...settings.paymentOptions];
                        next[idx] = { ...opt, upiId: e.target.value };
                        setSettings({ ...settings, paymentOptions: next });
                      }}
                      className="w-full min-h-[38px] px-2.5 rounded-xl border border-zinc-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-500">Instructions</label>
                    <textarea
                      rows={2}
                      value={opt.instructions}
                      onChange={(e) => {
                        const next = [...settings.paymentOptions];
                        next[idx] = { ...opt, instructions: e.target.value };
                        setSettings({ ...settings, paymentOptions: next });
                      }}
                      className="w-full p-2.5 rounded-xl border border-zinc-200"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    {opt.qrImageUrl && (
                      <img
                        src={opt.qrImageUrl}
                        alt="UPI QR"
                        className="w-16 h-16 rounded-lg object-contain border bg-white p-1"
                      />
                    )}
                    <label className="min-h-[38px] px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      {opt.qrImageUrl ? 'Replace QR Image' : 'Upload QR Image'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try {
                            const url = await uploadCompressedMedia(f, 'public', 640);
                            const next = [...settings.paymentOptions];
                            next[idx] = { ...opt, qrImageUrl: url };
                            setSettings({ ...settings, paymentOptions: next });
                          } catch (err) {
                            onNotify('error', err instanceof Error ? err.message : 'QR upload failed.');
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="min-h-[48px] px-7 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold shadow-sm"
          >
            Save All Plan, UPI & App Settings
          </button>
        </form>
      )}

      {/* 6. MUTE APPEALS */}
      {tab === 'appeals' && (
        <div className="bg-white rounded-3xl p-6 border border-rose-100 space-y-4">
          <h3 className="font-display font-bold text-base text-zinc-900">
            ₹19 Mute Appeals ({appeals.length})
          </h3>
          {appeals.length === 0 ? (
            <p className="text-sm text-zinc-500">No mute appeals filed.</p>
          ) : (
            <div className="space-y-3">
              {appeals.map((a) => (
                <div key={a.id} className="p-4 rounded-2xl border border-zinc-200 text-xs space-y-2">
                  <div className="flex justify-between font-bold text-sm">
                    <span>
                      {a.userName} (@{a.username})
                    </span>
                    <span className="capitalize text-rose-700">
                      {a.status} · Refund: {a.refundStatus.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-zinc-700">{a.reason}</p>
                  {a.transactionRef && (
                    <p className="font-mono text-zinc-500">UTR: {a.transactionRef}</p>
                  )}
                  {a.status === 'pending' && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/appeals/${a.id}/decision`, {
                            method: 'POST',
                            body: { decision: 'approved', mistakenMute: true, adminNote: 'Mistaken mute overturned + ₹19 refund marked' },
                          });
                          onNotify('success', 'Appeal approved, user unmuted & ₹19 marked for refund.');
                          loadTabData('appeals');
                          loadStats();
                        }}
                        className="min-h-[38px] px-3.5 rounded-xl bg-rose-600 text-white font-semibold"
                      >
                        Approve + Refund ₹19 (Mistaken Mute)
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/appeals/${a.id}/decision`, {
                            method: 'POST',
                            body: { decision: 'rejected', mistakenMute: false, adminNote: 'Violation confirmed; non-refundable.' },
                          });
                          onNotify('info', 'Appeal rejected (non-refundable).');
                          loadTabData('appeals');
                          loadStats();
                        }}
                        className="min-h-[38px] px-3.5 rounded-xl bg-zinc-100 text-zinc-800 font-semibold"
                      >
                        Reject (Violation Confirmed)
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 7. REPORT MANAGEMENT + AUDIT-LOGGED SAFETY INVESTIGATION */}
      {tab === 'reports' && (
        <div className="bg-white rounded-3xl p-6 border border-rose-100 space-y-4">
          <h3 className="font-display font-bold text-base text-zinc-900">
            Safety Report Management ({reports.length})
          </h3>
          {reports.length === 0 ? (
            <p className="text-sm text-zinc-500">No safety reports filed.</p>
          ) : (
            <div className="space-y-4">
              {reports.map((r) => (
                <div key={r.id} className="p-4 rounded-2xl border border-zinc-200 text-xs space-y-2">
                  <div className="flex justify-between font-bold text-sm">
                    <span>
                      @{r.reporterUsername} reported @{r.targetUsername} ({r.category})
                    </span>
                    <span className="capitalize text-rose-700">{r.status.replace('_', ' ')}</span>
                  </div>
                  <p className="text-zinc-700">{r.details}</p>
                  {r.screenshotUrl && (
                    <ProtectedImage
                      url={r.screenshotUrl}
                      alt="Report evidence"
                      className="w-40 h-40 object-cover rounded-xl border"
                    />
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(['under_review', 'resolved', 'rejected'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/reports/${r.id}/decision`, {
                            method: 'POST',
                            body: { status: st, adminNote: `Marked ${st}` },
                          });
                          onNotify('success', `Report updated to ${st}.`);
                          loadTabData('reports');
                          loadStats();
                        }}
                        className="min-h-[36px] px-3 rounded-xl bg-zinc-100 hover:bg-rose-50 text-zinc-800 font-semibold capitalize"
                      >
                        Mark {st.replace('_', ' ')}
                      </button>
                    ))}
                  </div>

                  {/* Authorized, logged safety chat review linked ONLY to a filed report */}
                  <div className="pt-2 border-t border-zinc-100 flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={investigationReason}
                      onChange={(e) => setInvestigationReason(e.target.value)}
                      placeholder="Audit justification (min 10 chars) for safety review"
                      className="flex-1 min-h-[36px] px-3 rounded-xl border border-zinc-200 text-xs"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await apiFetch<{
                            hasChat: boolean;
                            recentMessages: { id: string; senderUid: string; text: string; createdAt: string }[];
                          }>(`/api/admin/reports/${r.id}/investigate-chat`, {
                            method: 'POST',
                            body: { justification: investigationReason },
                          });
                          setInvestigatedChat({ reportId: r.id, messages: res.recentMessages });
                          setInvestigationReason('');
                          onNotify('info', 'Safety review logged in Admin Audit Logs.');
                        } catch (err) {
                          onNotify('error', err instanceof Error ? err.message : 'Investigation denied.');
                        }
                      }}
                      className="min-h-[36px] px-3 rounded-xl bg-zinc-900 text-white font-semibold inline-flex items-center gap-1.5"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" /> Logged Safety Review
                    </button>
                  </div>

                  {investigatedChat?.reportId === r.id && (
                    <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1">
                      <p className="font-semibold text-zinc-800">
                        Reported Chat Context ({investigatedChat.messages.length} recent messages):
                      </p>
                      {investigatedChat.messages.length === 0 ? (
                        <p className="text-zinc-500">No private messages between these accounts.</p>
                      ) : (
                        investigatedChat.messages.map((m) => (
                          <p key={m.id} className="text-zinc-700">
                            <span className="font-mono text-[10px] text-zinc-400">{m.senderUid}:</span>{' '}
                            {m.text}
                          </p>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 8. SUPPORT TICKETS & MOBILE PASSWORD RECOVERY */}
      {tab === 'support' && (
        <div className="space-y-5">
          {/* Mobile Password Recovery Queue */}
          <div className="bg-white rounded-3xl p-6 border border-rose-100 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-rose-600" />
              <h3 className="font-display font-bold text-base text-zinc-900">
                Mobile Password Recovery Requests ({recoveries.length})
              </h3>
            </div>
            <p className="text-xs text-zinc-500">
              Existing passwords are never stored or visible. Issue a secure 1-hour single-use reset code after verifying the member's identity.
            </p>
            {issuedCodeBanner && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs">
                <p className="font-semibold text-rose-900">
                  One-time reset code issued for @{issuedCodeBanner.username}:{' '}
                  <span className="font-mono text-base font-bold text-rose-700">
                    {issuedCodeBanner.code}
                  </span>
                </p>
                <p className="text-rose-800 mt-1">
                  Valid for 60 minutes. Share only after verifying ownership. Never transmit an existing password.
                </p>
              </div>
            )}
            {recoveries.length === 0 ? (
              <p className="text-sm text-zinc-500">No mobile password recovery requests.</p>
            ) : (
              <div className="space-y-3">
                {recoveries.map((rec) => (
                  <div key={rec.id} className="p-4 rounded-2xl border border-zinc-200 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-bold text-zinc-900">@{rec.username}</p>
                      <p className="font-mono text-zinc-600">{rec.mobile}</p>
                      <p className="text-zinc-400">
                        Status: <span className="capitalize font-semibold">{rec.status}</span> · {formatRelativeTime(rec.createdAt)}
                      </p>
                    </div>
                    {rec.status === 'pending' && (
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await apiFetch<{ oneTimeCode: string }>(
                            `/api/admin/password-recoveries/${rec.id}/issue-code`,
                            { method: 'POST' }
                          );
                          setIssuedCodeBanner({ username: rec.username, code: res.oneTimeCode });
                          loadTabData('support');
                        }}
                        className="min-h-[38px] px-4 rounded-xl bg-rose-600 text-white font-semibold"
                      >
                        Issue 1-Hour Reset Code
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Support Tickets */}
          <div className="bg-white rounded-3xl p-6 border border-rose-100 space-y-4">
            <h3 className="font-display font-bold text-base text-zinc-900">
              Help & Support Tickets ({tickets.length})
            </h3>
            {tickets.length === 0 ? (
              <p className="text-sm text-zinc-500">No support tickets.</p>
            ) : (
              <div className="space-y-3">
                {tickets.map((t) => (
                  <div key={t.id} className="p-4 rounded-2xl border border-zinc-200 text-xs space-y-2">
                    <div className="flex justify-between font-bold text-sm">
                      <span>
                        {t.subject} (@{t.username})
                      </span>
                      <span className="capitalize text-rose-700">{t.status.replace('_', ' ')}</span>
                    </div>
                    <p className="text-zinc-500">{t.category}</p>
                    <p className="text-zinc-700">{t.message}</p>
                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <input
                        type="text"
                        value={replyByTicket[t.id] || ''}
                        onChange={(e) =>
                          setReplyByTicket((prev) => ({ ...prev, [t.id]: e.target.value }))
                        }
                        placeholder="Write support reply..."
                        className="flex-1 min-h-[38px] px-3 rounded-xl border border-zinc-200"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/support/${t.id}/decision`, {
                            method: 'POST',
                            body: { status: 'resolved', adminReply: replyByTicket[t.id] || 'Resolved by support' },
                          });
                          onNotify('success', 'Support ticket resolved.');
                          loadTabData('support');
                        }}
                        className="min-h-[38px] px-4 rounded-xl bg-rose-600 text-white font-semibold"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 9. GLOBAL CHAT MODERATION & BLOCKED USERS */}
      {tab === 'moderation' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-3xl p-6 border border-rose-100 space-y-3">
            <h3 className="font-display font-bold text-base text-zinc-900">
              Global Chat Moderation ({globalMsgs.length})
            </h3>
            {globalMsgs.length === 0 ? (
              <p className="text-sm text-zinc-500">No global chat messages yet.</p>
            ) : (
              <div className="space-y-2.5 max-h-96 overflow-y-auto">
                {globalMsgs.map((m) => (
                  <div key={m.id} className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-start justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-900">
                        @{m.senderUsername} ({m.room}) · {formatRelativeTime(m.createdAt)}
                      </p>
                      <p className="text-zinc-700 mt-0.5 break-words">{m.text || '[Media]'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/global-chat/${m.id}`, { method: 'DELETE' });
                        onNotify('info', 'Global message deleted.');
                        loadTabData('moderation');
                      }}
                      aria-label="Delete message"
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl p-6 border border-rose-100 space-y-3">
            <h3 className="font-display font-bold text-base text-zinc-900">
              Blocked Users Records ({blockedRecords.length})
            </h3>
            {blockedRecords.length === 0 ? (
              <p className="text-sm text-zinc-500">No block records.</p>
            ) : (
              <div className="divide-y divide-zinc-100 text-xs">
                {blockedRecords.map((b) => (
                  <div key={b.id} className="py-2.5 flex justify-between">
                    <span>
                      <strong>@{b.blockerUsername}</strong> blocked <strong>@{b.blockedUsername}</strong>
                    </span>
                    <span className="text-zinc-400">{formatRelativeTime(b.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 10. AUDIT LOGS */}
      {tab === 'logs' && (
        <div className="bg-white rounded-3xl p-6 border border-rose-100 space-y-3">
          <h3 className="font-display font-bold text-base text-zinc-900">
            Immutable Admin Audit Logs ({logs.length})
          </h3>
          {logs.length === 0 ? (
            <p className="text-sm text-zinc-500">No admin actions recorded yet.</p>
          ) : (
            <div className="divide-y divide-zinc-100 text-xs">
              {logs.map((l) => (
                <div key={l.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <span className="font-mono font-semibold text-rose-700">{l.action}</span>
                    <span className="text-zinc-400"> · Target: {l.targetId}</span>
                    <p className="text-zinc-700 mt-0.5">{l.details}</p>
                  </div>
                  <span className="text-zinc-400 shrink-0">
                    {new Date(l.createdAt).toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-xs text-center text-zinc-400">Refreshing live data...</p>}
    </div>
  );
}
