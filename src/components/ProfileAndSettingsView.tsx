import React, { useEffect, useMemo, useState } from 'react';
import {
  Settings,
  ChevronRight,
  ArrowLeft,
  Camera,
  Palette,
  BadgeCheck,
  Trash2,
  Bell,
  HelpCircle,
  Flag,
  Info,
  FileText,
  Shield,
  Crown,
  LogOut,
  MapPin,
  Copy,
  Check,
  Upload,
  AlertTriangle,
  LayoutDashboard,
} from 'lucide-react';
import {
  AuthUser,
  FeedPost,
  Gender,
  MuteAppealItem,
  PartnerPreference,
  PaymentRequestItem,
  PROFILE_COLORS,
  REPORT_CATEGORIES,
  SafetyReportItem,
  SubscriptionPlan,
  SUPPORT_CATEGORIES,
  SupportTicketItem,
  UpiPaymentOption,
  VerificationRequestItem,
} from '../types/vibenexa';
import { INDIAN_STATES, INDIAN_STATES_DISTRICTS } from '../data/indianLocations';
import { apiFetch, formatRelativeTime, uploadCompressedMedia } from '../lib/api';
import { FIREBASE_PROJECT_INFO } from '../firebase';
import { ConfirmDialog, ProtectedImage, UserAvatar, VerifiedBadge } from './BrandLogo';

export type ProfileSubView =
  | 'profile'
  | 'settings'
  | 'profileSettings'
  | 'verification'
  | 'notifications'
  | 'subscriptions'
  | 'muteAppeal'
  | 'support'
  | 'reports'
  | 'appInfo'
  | 'terms'
  | 'guidelines'
  | 'adminPanel';

interface ProfileAndSettingsViewProps {
  currentUser: AuthUser;
  subView: ProfileSubView;
  onChangeSubView: (view: ProfileSubView) => void;
  onRefreshUser: () => void;
  onLogout: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
  renderAdminPanel: () => React.ReactNode;
}

export function ProfileAndSettingsView({
  currentUser,
  subView,
  onChangeSubView,
  onRefreshUser,
  onLogout,
  onNotify,
  renderAdminPanel,
}: ProfileAndSettingsViewProps) {
  const [myPosts, setMyPosts] = useState<FeedPost[]>([]);
  const [saving, setSaving] = useState(false);

  // Edit profile state
  const [editName, setEditName] = useState(currentUser.name);
  const [editBio, setEditBio] = useState(currentUser.bio);
  const [editState, setEditState] = useState(currentUser.state);
  const [editDistrict, setEditDistrict] = useState(currentUser.district);
  const [editGender, setEditGender] = useState<Gender>(currentUser.gender);
  const [editPref, setEditPref] = useState<PartnerPreference>(currentUser.partnerPreference);
  const [editPhoto, setEditPhoto] = useState(currentUser.photoUrl);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Verification state
  const [verRequests, setVerRequests] = useState<VerificationRequestItem[]>([]);
  const [challengeCode] = useState(() => `VN-${Math.floor(1000 + Math.random() * 9000)}`);
  const [verNote, setVerNote] = useState('');
  const [verProofUrl, setVerProofUrl] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);

  // Notification prefs
  const [notifPrefs, setNotifPrefs] = useState(currentUser.notificationPrefs);
  const [browserPerm, setBrowserPerm] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  // Subscriptions & Manual UPI Payments
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<UpiPaymentOption[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<PaymentRequestItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<UpiPaymentOption | null>(null);
  const [txRef, setTxRef] = useState('');
  const [payScreenshotUrl, setPayScreenshotUrl] = useState('');
  const [uploadingPayProof, setUploadingPayProof] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);

  // Mute Appeals
  const [appeals, setAppeals] = useState<MuteAppealItem[]>([]);
  const [appealPrice, setAppealPrice] = useState(19);
  const [appealOption, setAppealOption] = useState<UpiPaymentOption | null>(null);
  const [appealReason, setAppealReason] = useState('');
  const [appealTxRef, setAppealTxRef] = useState('');
  const [appealScreenshotUrl, setAppealScreenshotUrl] = useState('');

  // Help & Support
  const [tickets, setTickets] = useState<SupportTicketItem[]>([]);
  const [supportCategory, setSupportCategory] = useState(SUPPORT_CATEGORIES[0]);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');

  // Report Center
  const [reports, setReports] = useState<SafetyReportItem[]>([]);
  const [reportTarget, setReportTarget] = useState('');
  const [reportCategory, setReportCategory] = useState(REPORT_CATEGORIES[0]);
  const [reportDetails, setReportDetails] = useState('');
  const [reportScreenshot, setReportScreenshot] = useState('');

  const activeColor =
    PROFILE_COLORS.find((c) => c.id === currentUser.profileColor) || PROFILE_COLORS[0];

  const districts = useMemo(
    () => (editState ? INDIAN_STATES_DISTRICTS[editState] || [] : []),
    [editState]
  );

  useEffect(() => {
    setEditName(currentUser.name);
    setEditBio(currentUser.bio);
    setEditState(currentUser.state);
    setEditDistrict(currentUser.district);
    setEditGender(currentUser.gender);
    setEditPref(currentUser.partnerPreference);
    setEditPhoto(currentUser.photoUrl);
    setNotifPrefs(currentUser.notificationPrefs);
  }, [currentUser]);

  useEffect(() => {
    if (subView === 'profile') {
      apiFetch<{ posts: FeedPost[] }>(`/api/profile/${currentUser.uid}`)
        .then((res) => setMyPosts(res.posts))
        .catch(() => {});
    } else if (subView === 'verification') {
      apiFetch<{ requests: VerificationRequestItem[] }>('/api/profile-verification')
        .then((res) => setVerRequests(res.requests))
        .catch(() => {});
    } else if (subView === 'subscriptions') {
      apiFetch<{
        plans: SubscriptionPlan[];
        paymentOptions: UpiPaymentOption[];
        paymentRequests: PaymentRequestItem[];
      }>('/api/plans')
        .then((res) => {
          setPlans(res.plans);
          setPaymentOptions(res.paymentOptions);
          setPaymentHistory(res.paymentRequests);
        })
        .catch(() => {});
    } else if (subView === 'muteAppeal') {
      apiFetch<{
        appeals: MuteAppealItem[];
        appealPrice: number;
        paymentOption: UpiPaymentOption | null;
      }>('/api/appeals')
        .then((res) => {
          setAppeals(res.appeals);
          setAppealPrice(res.appealPrice);
          setAppealOption(res.paymentOption);
        })
        .catch(() => {});
    } else if (subView === 'support') {
      apiFetch<{ tickets: SupportTicketItem[] }>('/api/support')
        .then((res) => setTickets(res.tickets))
        .catch(() => {});
    } else if (subView === 'reports') {
      apiFetch<{ reports: SafetyReportItem[] }>('/api/reports')
        .then((res) => setReports(res.reports))
        .catch(() => {});
    }
  }, [subView, currentUser.uid]);

  // Strict protection: If non-admin somehow reaches adminPanel subView, redirect to settings
  if (subView === 'adminPanel') {
    if (currentUser.role !== 'SUPER_ADMIN') {
      onChangeSubView('settings');
      return null;
    }
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => onChangeSubView('settings')}
          className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-xl text-sm font-semibold text-zinc-700 hover:bg-rose-50"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Settings
        </button>
        {renderAdminPanel()}
      </div>
    );
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/profile', {
        method: 'PUT',
        body: {
          name: editName,
          bio: editBio,
          state: editState,
          district: editDistrict,
          gender: editGender,
          partnerPreference: editPref,
          photoUrl: editPhoto,
        },
      });
      onRefreshUser();
      onNotify('success', 'Profile updated.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSelectColor(colorId: string) {
    try {
      await apiFetch('/api/profile/color', { method: 'PUT', body: { profileColor: colorId } });
      onRefreshUser();
      onNotify('success', 'Profile color updated.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not change color.');
    }
  }

  async function handleConfirmDeleteAccount() {
    setDeleting(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/profile/delete-account', {
        method: 'POST',
      });
      setDeleteDialogOpen(false);
      onNotify('info', res.message);
      onLogout();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Deletion failed.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleSubmitVerification(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/profile-verification', {
        method: 'POST',
        body: { challengeCode, note: verNote, proofMediaUrl: verProofUrl },
      });
      setVerNote('');
      setVerProofUrl('');
      onNotify('success', 'Verification request submitted for private Admin review.');
      const res = await apiFetch<{ requests: VerificationRequestItem[] }>('/api/profile-verification');
      setVerRequests(res.requests);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleNotif(key: keyof typeof notifPrefs) {
    const next = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(next);
    try {
      await apiFetch('/api/profile/notifications-prefs', { method: 'PUT', body: next });
      onRefreshUser();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not update preference.');
    }
  }

  async function handleRequestBrowserNotifPermission() {
    if (typeof Notification === 'undefined') {
      onNotify('info', 'Push notifications are managed via your device browser/Android settings.');
      return;
    }
    const perm = await Notification.requestPermission();
    setBrowserPerm(perm);
    onNotify(perm === 'granted' ? 'success' : 'info', `Notification permission: ${perm}`);
  }

  async function handleSubmitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProduct) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/payments', {
        method: 'POST',
        body: {
          productId: selectedProduct.productId,
          transactionRef: txRef,
          screenshotUrl: payScreenshotUrl || undefined,
        },
      });
      setSelectedProduct(null);
      setTxRef('');
      setPayScreenshotUrl('');
      onNotify('success', res.message);
      const updated = await apiFetch<{ paymentRequests: PaymentRequestItem[] }>('/api/plans');
      setPaymentHistory(updated.paymentRequests);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not submit payment.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitAppeal(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/appeals', {
        method: 'POST',
        body: {
          reason: appealReason,
          transactionRef: appealTxRef,
          screenshotUrl: appealScreenshotUrl || undefined,
        },
      });
      setAppealReason('');
      setAppealTxRef('');
      setAppealScreenshotUrl('');
      onNotify('success', '₹19 Mute Appeal submitted for moderation review.');
      const res = await apiFetch<{ appeals: MuteAppealItem[] }>('/api/appeals');
      setAppeals(res.appeals);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not submit appeal.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitSupport(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/support', {
        method: 'POST',
        body: { category: supportCategory, subject: supportSubject, message: supportMessage },
      });
      setSupportSubject('');
      setSupportMessage('');
      onNotify('success', 'Support ticket submitted.');
      const res = await apiFetch<{ tickets: SupportTicketItem[] }>('/api/support');
      setTickets(res.tickets);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not submit ticket.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitReport(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        body: {
          targetIdentifier: reportTarget,
          category: reportCategory,
          details: reportDetails,
          screenshotUrl: reportScreenshot || undefined,
        },
      });
      setReportTarget('');
      setReportDetails('');
      setReportScreenshot('');
      onNotify('success', 'Safety report filed. Thank you for helping keep VibeNexa safe.');
      const res = await apiFetch<{ reports: SafetyReportItem[] }>('/api/reports');
      setReports(res.reports);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not submit report.');
    } finally {
      setSaving(false);
    }
  }

  const SubHeader = ({ title, backTo = 'settings' }: { title: string; backTo?: ProfileSubView }) => (
    <div className="flex items-center gap-2 mb-5">
      <button
        type="button"
        onClick={() => onChangeSubView(backTo)}
        aria-label="Go back"
        className="min-h-[44px] min-w-[44px] rounded-xl bg-white border border-rose-100 flex items-center justify-center text-zinc-700 hover:bg-rose-50"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      <h2 className="font-display text-xl font-bold text-zinc-900">{title}</h2>
    </div>
  );

  // =========================================================================
  // 1. PROFILE OVERVIEW
  // =========================================================================
  if (subView === 'profile') {
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="bg-white rounded-3xl overflow-hidden border border-rose-100 shadow-sm">
          {/* Custom Profile Color Banner */}
          <div className={`h-32 sm:h-40 bg-gradient-to-r ${activeColor.gradient} relative p-4 flex justify-end items-start`}>
            <button
              type="button"
              onClick={() => onChangeSubView('settings')}
              className="min-h-[42px] px-4 rounded-xl bg-black/25 hover:bg-black/35 backdrop-blur-md text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>

          <div className="px-5 sm:px-7 pb-6">
            <div className="-mt-12 flex flex-wrap items-end justify-between gap-4">
              <UserAvatar photoUrl={currentUser.photoUrl} name={currentUser.name} size="xl" isOnline />
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => onChangeSubView('profileSettings')}
                  className="min-h-[42px] px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold"
                >
                  Edit Profile
                </button>
                <button
                  type="button"
                  onClick={() => onChangeSubView('subscriptions')}
                  className="min-h-[42px] px-4 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Crown className="w-3.5 h-3.5" />
                  {currentUser.activeSubscription ? currentUser.activeSubscription.planName : 'Premium'}
                </button>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center gap-1.5">
                <h2 className="font-display text-2xl font-bold text-zinc-900">
                  {currentUser.name}, <span className="tabular-nums">{currentUser.age}</span>
                </h2>
                {currentUser.isVerified && <VerifiedBadge size={20} />}
              </div>
              <p className="text-sm text-zinc-500 mt-0.5">
                @{currentUser.username} · {currentUser.gender} · Looking for {currentUser.partnerPreference}
              </p>
              <p className="text-sm text-zinc-600 flex items-center gap-1.5 mt-2">
                <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                {currentUser.district}, {currentUser.state}
              </p>
              {currentUser.bio ? (
                <p className="mt-3 text-sm text-zinc-700 leading-relaxed max-w-xl">{currentUser.bio}</p>
              ) : (
                <p className="mt-3 text-xs text-zinc-400">Add a bio in Profile Settings so others can get to know you.</p>
              )}
            </div>
          </div>
        </div>

        {/* User Posts */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-rose-100">
          <h3 className="font-display text-base font-bold text-zinc-900 mb-4">
            My Posts ({myPosts.length})
          </h3>
          {myPosts.length === 0 ? (
            <p className="text-sm text-zinc-500 py-6 text-center">
              You haven't published any posts on the Home Feed yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {myPosts.map((p) => (
                <div key={p.id} className="rounded-2xl border border-rose-100 overflow-hidden bg-zinc-50/40">
                  {p.imageUrl && (
                    <img
                      src={p.imageUrl}
                      alt="My post"
                      referrerPolicy="no-referrer"
                      className="w-full h-44 object-cover"
                    />
                  )}
                  <div className="p-3.5">
                    <p className="text-sm text-zinc-800 line-clamp-3">{p.caption || 'Photo post'}</p>
                    <p className="text-xs text-zinc-400 mt-2">
                      {p.likesCount} likes · {p.comments.length} comments · {formatRelativeTime(p.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  // =========================================================================
  // 2. SETTINGS ROOT (NO separate Privacy Settings, NO Delete Account at root,
  //    Admin Panel STRICTLY invisible to normal users, Logout at bottom!)
  // =========================================================================
  if (subView === 'settings') {
    const rows: {
      view: ProfileSubView;
      icon: React.ReactNode;
      title: string;
      subtitle: string;
    }[] = [
      {
        view: 'profileSettings',
        icon: <Palette className="w-5 h-5 text-rose-600" />,
        title: 'Profile Settings',
        subtitle: 'Edit profile, photo, location, profile color, verification & delete account',
      },
      {
        view: 'subscriptions',
        icon: <Crown className="w-5 h-5 text-rose-600" />,
        title: 'Premium Subscriptions & Payments',
        subtitle: currentUser.activeSubscription
          ? `Active: ${currentUser.activeSubscription.planName}`
          : 'Plans, blue verification tick & UPI payment history',
      },
      {
        view: 'notifications',
        icon: <Bell className="w-5 h-5 text-rose-600" />,
        title: 'Notification Settings',
        subtitle: 'Manage push alert switches for matches, messages, likes & announcements',
      },
      {
        view: 'support',
        icon: <HelpCircle className="w-5 h-5 text-rose-600" />,
        title: 'Help & Support',
        subtitle: 'Submit support tickets, track complaints & free assistance',
      },
      {
        view: 'reports',
        icon: <Flag className="w-5 h-5 text-rose-600" />,
        title: 'Report Center',
        subtitle: 'Report fake profiles, harassment, or spam (always free)',
      },
      ...(currentUser.isMuted
        ? [
            {
              view: 'muteAppeal' as ProfileSubView,
              icon: <AlertTriangle className="w-5 h-5 text-rose-600" />,
              title: 'Mute Appeal (₹19)',
              subtitle: 'Request moderation review or check refund eligibility',
            },
          ]
        : []),
      {
        view: 'appInfo',
        icon: <Info className="w-5 h-5 text-rose-600" />,
        title: 'App Information',
        subtitle: 'VibeNexa platform details, ₹0 Firebase Spark setup & Android guide',
      },
      {
        view: 'terms',
        icon: <FileText className="w-5 h-5 text-rose-600" />,
        title: 'Terms & Conditions',
        subtitle: 'Eligibility, age safety, subscription & refund terms',
      },
      {
        view: 'guidelines',
        icon: <Shield className="w-5 h-5 text-rose-600" />,
        title: 'Community Guidelines',
        subtitle: 'Respect, authenticity & safety rules for all VibeNexa members',
      },
    ];

    return (
      <div className="max-w-2xl mx-auto">
        <SubHeader title="Settings" backTo="profile" />

        <div className="bg-white rounded-3xl border border-rose-100 divide-y divide-zinc-100 overflow-hidden shadow-sm">
          {rows.map((row) => (
            <button
              key={row.view}
              type="button"
              onClick={() => onChangeSubView(row.view)}
              className="w-full px-5 py-4 flex items-center gap-3.5 text-left hover:bg-rose-50/50 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                {row.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900">{row.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5 truncate">{row.subtitle}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
            </button>
          ))}

          {/* STRICT SUPER ADMIN VISIBILITY: Completely absent from DOM for normal users */}
          {currentUser.role === 'SUPER_ADMIN' && (
            <button
              type="button"
              onClick={() => onChangeSubView('adminPanel')}
              className="w-full px-5 py-4 flex items-center gap-3.5 text-left bg-rose-50/70 hover:bg-rose-100/70 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-rose-950">Admin Panel</p>
                <p className="text-xs text-rose-700 mt-0.5">
                  Super Admin Dashboard · Users, Payments, Verifications, Moderation & Logs
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-rose-600 shrink-0" />
            </button>
          )}
        </div>

        {/* Logout at the bottom of Settings */}
        <div className="mt-6">
          <button
            type="button"
            onClick={onLogout}
            className="w-full min-h-[48px] rounded-2xl bg-white border border-red-200 hover:bg-red-50 text-red-600 font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 3. PROFILE SETTINGS (Includes Profile Verification & Delete Account)
  // =========================================================================
  if (subView === 'profileSettings') {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <SubHeader title="Profile Settings" backTo="settings" />

        <ConfirmDialog
          open={deleteDialogOpen}
          title="Delete Account?"
          description={
            'Confirming will immediately disable your VibeNexa account, sign you out of all sessions, and schedule permanent deletion within 24 hours.\n\nDisclosure: Minimal payment audit and safety moderation records may be retained strictly as required under applicable Indian law.'
          }
          cancelLabel="Cancel"
          confirmLabel="Confirm Delete"
          destructive
          loading={deleting}
          onConfirm={handleConfirmDeleteAccount}
          onCancel={() => setDeleteDialogOpen(false)}
        />

        {/* Edit Profile Form */}
        <form onSubmit={handleSaveProfile} className="bg-white rounded-3xl p-5 sm:p-6 border border-rose-100 space-y-4">
          <h3 className="font-display font-bold text-base text-zinc-900">Edit Profile</h3>

          <div className="flex items-center gap-4">
            <UserAvatar photoUrl={editPhoto} name={editName} size="lg" />
            <label className="min-h-[44px] px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer">
              <Camera className="w-4 h-4" />
              {uploadingPhoto ? 'Uploading...' : 'Change Profile Photo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploadingPhoto(true);
                  try {
                    const url = await uploadCompressedMedia(f, 'public', 640);
                    setEditPhoto(url);
                  } catch (err) {
                    onNotify('error', err instanceof Error ? err.message : 'Upload failed.');
                  } finally {
                    setUploadingPhoto(false);
                  }
                }}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">Display Name</label>
            <input
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-200 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">Bio</label>
            <textarea
              rows={3}
              maxLength={500}
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              className="w-full p-3.5 rounded-xl border border-zinc-200 text-sm resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Indian State / UT</label>
              <select
                value={editState}
                onChange={(e) => {
                  setEditState(e.target.value);
                  setEditDistrict('');
                }}
                className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 bg-white text-sm"
              >
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">District</label>
              <select
                value={editDistrict}
                onChange={(e) => setEditDistrict(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 bg-white text-sm"
              >
                <option value="">Select District</option>
                {districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Gender</label>
              <select
                value={editGender}
                onChange={(e) => setEditGender(e.target.value as Gender)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 bg-white text-sm"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Partner Preference</label>
              <select
                value={editPref}
                onChange={(e) => setEditPref(e.target.value as PartnerPreference)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 bg-white text-sm"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Everyone">Everyone</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || uploadingPhoto}
            className="w-full min-h-[46px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Profile Changes'}
          </button>
        </form>

        {/* Change Profile Color */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-rose-100">
          <h3 className="font-display font-bold text-base text-zinc-900">Change Profile Color</h3>
          <p className="text-xs text-zinc-500 mt-1">Customize the header gradient on your profile.</p>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {PROFILE_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectColor(c.id)}
                className={`min-h-[46px] px-3 rounded-xl border flex items-center gap-2.5 text-xs font-semibold transition-all ${
                  currentUser.profileColor === c.id
                    ? 'border-rose-600 bg-rose-50 text-rose-900'
                    : 'border-zinc-200 hover:border-rose-300 text-zinc-700'
                }`}
              >
                <span className={`w-5 h-5 rounded-full bg-gradient-to-br ${c.gradient} shrink-0`} />
                <span className="truncate">{c.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Profile Verification Entry */}
        <button
          type="button"
          onClick={() => onChangeSubView('verification')}
          className="w-full bg-white rounded-3xl p-5 border border-rose-100 flex items-center justify-between text-left hover:border-rose-300 transition-colors"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center">
              <BadgeCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-900">Profile Verification</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {currentUser.isVerified
                  ? 'Approved — Blue verified tick is active on your profile'
                  : 'Submit a privacy-preserving selfie check for the blue tick'}
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-zinc-400" />
        </button>

        {/* Delete Account (Strictly inside Profile Settings, NOT Settings Root) */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-red-100">
          <h3 className="font-display font-bold text-base text-red-700">Delete Account</h3>
          <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
            Permanently deactivate and schedule your account for deletion within 24 hours. Legally required payment and safety audit records may be retained where mandated by law.
          </p>
          <button
            type="button"
            onClick={() => setDeleteDialogOpen(true)}
            className="mt-4 min-h-[44px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account
          </button>
        </section>
      </div>
    );
  }

  // =========================================================================
  // 4. PROFILE VERIFICATION
  // =========================================================================
  if (subView === 'verification') {
    const latest = verRequests[0];
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <SubHeader title="Profile Verification" backTo="profileSettings" />

        <div className="bg-white rounded-3xl p-6 border border-rose-100 space-y-4">
          <div className="flex items-center gap-3">
            <VerifiedBadge size={28} />
            <div>
              <h3 className="font-display font-bold text-lg text-zinc-900">Blue Verified Tick</h3>
              <p className="text-xs text-zinc-500">
                Privacy-preserving verification: no public exposure of private identity documents.
              </p>
            </div>
          </div>

          {currentUser.isVerified ? (
            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-sm text-blue-900">
              Your profile is verified! The blue verified badge is displayed on your profile, feed posts, discover card, and chats.
            </div>
          ) : (
            <form onSubmit={handleSubmitVerification} className="space-y-4">
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200">
                <p className="text-xs font-semibold text-rose-900">Privacy-Safe Challenge Code</p>
                <p className="font-mono text-xl font-bold text-rose-700 mt-1 tracking-wider">
                  {challengeCode}
                </p>
                <p className="text-xs text-rose-800 mt-1">
                  Take a quick selfie holding a paper with this code (no government ID required). Your verification photo is stored privately and visible only to authorized reviewers.
                </p>
              </div>

              <div>
                <label className="w-full min-h-[48px] rounded-xl border border-dashed border-rose-300 bg-rose-50/40 hover:bg-rose-50 text-rose-700 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  {uploadingProof
                    ? 'Uploading privately...'
                    : verProofUrl
                    ? 'Verification Selfie Uploaded (Change)'
                    : 'Upload Verification Selfie'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setUploadingProof(true);
                      try {
                        const url = await uploadCompressedMedia(f, 'private', 960);
                        setVerProofUrl(url);
                      } catch (err) {
                        onNotify('error', err instanceof Error ? err.message : 'Upload failed.');
                      } finally {
                        setUploadingProof(false);
                      }
                    }}
                    className="hidden"
                  />
                </label>
                {verProofUrl && (
                  <div className="mt-3">
                    <ProtectedImage
                      url={verProofUrl}
                      alt="Verification preview"
                      className="w-40 h-40 object-cover rounded-2xl border border-rose-200"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Optional Note</label>
                <input
                  type="text"
                  maxLength={200}
                  value={verNote}
                  onChange={(e) => setVerNote(e.target.value)}
                  placeholder="Any helpful context for the reviewer"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-200 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={saving || uploadingProof || !verProofUrl || latest?.status === 'pending'}
                className="w-full min-h-[46px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {latest?.status === 'pending'
                  ? 'Request Pending Review'
                  : saving
                  ? 'Submitting...'
                  : 'Submit Verification Request'}
              </button>
            </form>
          )}

          {/* Request History */}
          {verRequests.length > 0 && (
            <div className="pt-4 border-t border-zinc-100 space-y-2.5">
              <h4 className="text-xs font-bold text-zinc-700">Verification Status History</h4>
              {verRequests.map((vr) => (
                <div key={vr.id} className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/80 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-zinc-800">{vr.challengeCode}</span>
                    <span className="font-semibold capitalize text-rose-700">{vr.status}</span>
                  </div>
                  <p className="text-zinc-500 mt-1">Submitted {formatRelativeTime(vr.createdAt)}</p>
                  {vr.rejectionReason && (
                    <p className="text-red-600 mt-1">Reason: {vr.rejectionReason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // 5. NOTIFICATION SETTINGS
  // =========================================================================
  if (subView === 'notifications') {
    const items: { key: keyof typeof notifPrefs; label: string; desc: string }[] = [
      { key: 'newMatch', label: 'New Match', desc: 'Notify immediately when you match with someone' },
      { key: 'newMessage', label: 'New Message', desc: 'Alerts for incoming Personal Chat messages' },
      { key: 'newLike', label: 'New Like', desc: 'Alerts when someone likes your profile or post' },
      {
        key: 'adminAnnouncement',
        label: 'Admin Announcement',
        desc: 'Important safety notices and VibeNexa platform updates',
      },
    ];
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <SubHeader title="Notification Settings" backTo="settings" />

        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-rose-100 space-y-4">
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-zinc-100">
            <div>
              <p className="text-sm font-semibold text-zinc-900">Device Notification Permission</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Current status: <span className="font-medium capitalize">{browserPerm}</span> · Firebase Cloud Messaging ready
              </p>
            </div>
            <button
              type="button"
              onClick={handleRequestBrowserNotifPermission}
              className="min-h-[42px] px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold whitespace-nowrap"
            >
              Enable Alerts
            </button>
          </div>

          <div className="divide-y divide-zinc-100">
            {items.map((item) => {
              const checked = notifPrefs[item.key];
              return (
                <div key={item.key} className="py-3.5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{item.label}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    aria-label={item.label}
                    onClick={() => handleToggleNotif(item.key)}
                    className={`w-12 h-7 rounded-full p-0.5 transition-colors shrink-0 ${
                      checked ? 'bg-rose-600' : 'bg-zinc-300'
                    }`}
                  >
                    <span
                      className={`block w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${
                        checked ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 6. PREMIUM SUBSCRIPTIONS & MANUAL UPI PAYMENT WORKFLOW
  // =========================================================================
  if (subView === 'subscriptions') {
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <SubHeader title="Premium Subscriptions" backTo="settings" />

        {/* Status Banner */}
        <div className="relative rounded-3xl overflow-hidden text-white p-6 shadow-md bg-rose-950">
          <img
            src="/src/assets/images/vibenexa_premium_card_bg_1795350138951.jpg"
            alt="VibeNexa Premium Membership"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-rose-950/60 to-black/40" />
          <div className="relative z-10">
            <p className="text-xs font-medium text-rose-200">Subscription Status</p>
            <h3 className="font-display text-2xl font-bold mt-1">
              {currentUser.activeSubscription
                ? currentUser.activeSubscription.planName
                : 'Free Member'}
            </h3>
            <p className="text-xs text-rose-100/90 mt-1">
              {currentUser.activeSubscription
                ? `Active until ${new Date(currentUser.activeSubscription.expiresAt).toLocaleDateString('en-IN')}`
                : 'Upgrade for the blue verification tick, unlimited Global Chat, media sharing & custom chat wallpapers.'}
            </p>
          </div>
        </div>

        {/* Manual UPI Payment Modal */}
        {selectedProduct && (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-100 my-auto">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display text-lg font-bold text-zinc-900">
                  Manual UPI Payment
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="p-2 rounded-xl hover:bg-zinc-100"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-zinc-500">
                {selectedProduct.productName} · <strong className="text-rose-700 tabular-nums">₹{selectedProduct.priceInr}</strong>
              </p>

              <div className="mt-4 p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-3">
                {selectedProduct.qrImageUrl ? (
                  <img
                    src={selectedProduct.qrImageUrl}
                    alt="UPI QR Code"
                    referrerPolicy="no-referrer"
                    className="w-44 h-44 mx-auto rounded-xl bg-white p-2 object-contain border border-rose-100"
                  />
                ) : (
                  <div className="w-44 h-44 mx-auto rounded-xl bg-white border border-dashed border-rose-300 flex flex-col items-center justify-center text-center p-3">
                    <span className="text-xs font-semibold text-rose-700">UPI QR Pending</span>
                    <span className="text-[11px] text-zinc-500 mt-1">
                      Pay directly to the UPI ID below
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 bg-white rounded-xl px-3 py-2 border border-rose-100">
                  <span className="font-mono text-xs font-semibold text-zinc-900 truncate">
                    {selectedProduct.upiId}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(selectedProduct.upiId);
                      setCopiedUpi(true);
                      setTimeout(() => setCopiedUpi(false), 1800);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-semibold inline-flex items-center gap-1 shrink-0"
                  >
                    {copiedUpi ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedUpi ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <p className="text-xs text-rose-900 leading-relaxed">{selectedProduct.instructions}</p>
              </div>

              <form onSubmit={handleSubmitPayment} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    UPI Transaction / UTR Reference <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    minLength={4}
                    value={txRef}
                    onChange={(e) => setTxRef(e.target.value)}
                    placeholder="e.g. 432198765432"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-200 text-sm font-mono"
                  />
                </div>

                <label className="w-full min-h-[44px] rounded-xl border border-dashed border-zinc-300 bg-zinc-50 hover:bg-rose-50 text-zinc-700 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  {uploadingPayProof
                    ? 'Uploading...'
                    : payScreenshotUrl
                    ? 'Payment Screenshot Attached'
                    : 'Upload Payment Screenshot (Optional)'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setUploadingPayProof(true);
                      try {
                        const url = await uploadCompressedMedia(f, 'private', 960);
                        setPayScreenshotUrl(url);
                      } catch (err) {
                        onNotify('error', err instanceof Error ? err.message : 'Upload failed.');
                      } finally {
                        setUploadingPayProof(false);
                      }
                    }}
                    className="hidden"
                  />
                </label>

                <p className="text-[11px] text-zinc-500">
                  Note: A screenshot alone does not activate a subscription. An administrator verifies the actual UPI transaction before approval.
                </p>

                <button
                  type="submit"
                  disabled={saving || uploadingPayProof}
                  className="w-full min-h-[46px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {saving ? 'Submitting...' : 'Submit Payment Reference'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 3 Admin-Configurable Subscription Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const payOpt = paymentOptions.find((o) => o.productId === plan.id);
            return (
              <div
                key={plan.id}
                className="bg-white rounded-3xl p-5 border border-rose-100 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <h4 className="font-display text-lg font-bold text-zinc-900">{plan.name}</h4>
                  <p className="text-xs text-zinc-500 mt-1">{plan.tagline}</p>
                  <p className="mt-4 font-display text-3xl font-bold text-rose-600 tabular-nums">
                    ₹{plan.priceInr}
                    <span className="text-xs font-sans font-medium text-zinc-500">
                      {' '}
                      / {plan.durationDays} days
                    </span>
                  </p>
                  <ul className="mt-4 space-y-2 text-xs text-zinc-700">
                    {plan.features.verifiedBadge && (
                      <li className="flex items-center gap-2">
                        <VerifiedBadge size={14} /> Blue Verification Tick
                      </li>
                    )}
                    {plan.features.unlimitedGlobalChat && (
                      <li>· Unlimited Global Chat messages</li>
                    )}
                    {plan.features.mediaSharing && (
                      <li>· Photo & media sharing in Global Chat</li>
                    )}
                    {plan.features.chatWallpaper && (
                      <li>· Custom Personal Chat wallpaper</li>
                    )}
                    {plan.features.profileCustomization && (
                      <li>· Custom Profile Color themes</li>
                    )}
                  </ul>
                </div>

                <button
                  type="button"
                  disabled={!payOpt}
                  onClick={() => payOpt && setSelectedProduct(payOpt)}
                  className="mt-5 w-full min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {payOpt ? 'Select & Pay via UPI' : 'Unavailable'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Payment History */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-rose-100">
          <h3 className="font-display font-bold text-base text-zinc-900 mb-3">
            Purchase & Payment History
          </h3>
          {paymentHistory.length === 0 ? (
            <p className="text-sm text-zinc-500">No payment requests yet.</p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {paymentHistory.map((p) => (
                <div key={p.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="font-semibold text-zinc-900">
                      {p.productName} · <span className="tabular-nums">₹{p.amount}</span>
                    </p>
                    <p className="text-zinc-500 font-mono mt-0.5">UTR: {p.transactionRef}</p>
                    {p.adminNote && <p className="text-zinc-600 mt-0.5">Note: {p.adminNote}</p>}
                  </div>
                  <div className="text-right">
                    <span className="font-semibold capitalize text-rose-700">{p.status}</span>
                    <p className="text-zinc-400 mt-0.5">{formatRelativeTime(p.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  // =========================================================================
  // 7. ₹19 MUTE APPEAL SYSTEM
  // =========================================================================
  if (subView === 'muteAppeal') {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <SubHeader title={`Mute Appeal (₹${appealPrice})`} backTo="settings" />

        <div className="bg-white rounded-3xl p-6 border border-rose-100 space-y-4">
          <p className="text-sm text-zinc-700 leading-relaxed">
            If your account was muted for suspected spam or inappropriate behavior, you may submit a priority moderation appeal for <strong className="tabular-nums">₹{appealPrice}</strong>.
          </p>
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1.5">
            <p><strong>Refund Policy:</strong> If the mute was mistaken or no violation is established, your ₹{appealPrice} appeal payment is refunded.</p>
            <p><strong>Confirmed Violation:</strong> If the violation is confirmed upon review, the ₹{appealPrice} appeal fee is non-refundable.</p>
            <p><strong>Free Path:</strong> Need help with a payment issue or mistaken restriction without paying? Use Help & Support for free.</p>
          </div>

          {appealOption && (
            <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2 text-xs">
              <p className="font-semibold text-zinc-900">UPI Details for ₹{appealPrice} Mute Appeal</p>
              <p className="font-mono text-rose-700 font-semibold">{appealOption.upiId}</p>
              {appealOption.qrImageUrl && (
                <img
                  src={appealOption.qrImageUrl}
                  alt="Appeal UPI QR"
                  className="w-36 h-36 rounded-xl bg-white p-1.5 object-contain border"
                />
              )}
              <p className="text-zinc-600">{appealOption.instructions}</p>
            </div>
          )}

          {currentUser.isMuted ? (
            <form onSubmit={handleSubmitAppeal} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Why should your mute be overturned?
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={10}
                  value={appealReason}
                  onChange={(e) => setAppealReason(e.target.value)}
                  className="w-full p-3.5 rounded-xl border border-zinc-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  UPI Transaction / UTR Reference (₹{appealPrice})
                </label>
                <input
                  type="text"
                  required
                  minLength={4}
                  value={appealTxRef}
                  onChange={(e) => setAppealTxRef(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-200 text-sm font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full min-h-[46px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold"
              >
                {saving ? 'Submitting Appeal...' : `Submit ₹${appealPrice} Mute Appeal`}
              </button>
            </form>
          ) : (
            <p className="text-xs text-zinc-500">Your account is not currently muted.</p>
          )}

          <button
            type="button"
            onClick={() => onChangeSubView('support')}
            className="w-full min-h-[44px] rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold"
          >
            Use Free Help & Support Instead
          </button>

          {appeals.length > 0 && (
            <div className="pt-4 border-t border-zinc-100 space-y-2.5">
              <h4 className="text-xs font-bold text-zinc-700">My Appeal History</h4>
              {appeals.map((a) => (
                <div key={a.id} className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 text-xs">
                  <div className="flex justify-between font-semibold">
                    <span className="capitalize text-rose-700">{a.status}</span>
                    <span className="text-zinc-600">Refund: {a.refundStatus.replace('_', ' ')}</span>
                  </div>
                  <p className="text-zinc-700 mt-1">{a.reason}</p>
                  {a.adminNote && <p className="text-zinc-500 mt-1">Admin Note: {a.adminNote}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // 8. HELP & SUPPORT
  // =========================================================================
  if (subView === 'support') {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <SubHeader title="Help & Support" backTo="settings" />

        <form onSubmit={handleSubmitSupport} className="bg-white rounded-3xl p-6 border border-rose-100 space-y-4">
          <p className="text-xs text-zinc-500">
            Free support for payment issues, mistaken restrictions, account recovery, or technical problems.
          </p>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">Category</label>
            <select
              value={supportCategory}
              onChange={(e) => setSupportCategory(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 bg-white text-sm"
            >
              {SUPPORT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">Subject</label>
            <input
              type="text"
              required
              minLength={3}
              value={supportSubject}
              onChange={(e) => setSupportSubject(e.target.value)}
              placeholder="Brief summary of your issue"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">Message</label>
            <textarea
              rows={4}
              required
              minLength={5}
              value={supportMessage}
              onChange={(e) => setSupportMessage(e.target.value)}
              placeholder="Describe the problem in detail..."
              className="w-full p-3.5 rounded-xl border border-zinc-200 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[46px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold"
          >
            {saving ? 'Submitting...' : 'Submit Support Ticket'}
          </button>
        </form>

        <section className="bg-white rounded-3xl p-6 border border-rose-100">
          <h3 className="font-display font-bold text-base text-zinc-900 mb-3">My Complaints ({tickets.length})</h3>
          {tickets.length === 0 ? (
            <p className="text-sm text-zinc-500">You have not filed any support tickets.</p>
          ) : (
            <div className="space-y-3">
              {tickets.map((t) => (
                <div key={t.id} className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-zinc-900">{t.subject}</span>
                    <span className="font-semibold capitalize text-rose-700">{t.status.replace('_', ' ')}</span>
                  </div>
                  <p className="text-zinc-500 mt-0.5">{t.category} · {formatRelativeTime(t.createdAt)}</p>
                  <p className="text-zinc-700 mt-2">{t.message}</p>
                  {t.adminReply && (
                    <p className="mt-2 pt-2 border-t border-zinc-200 text-rose-900 font-medium">
                      Support Reply: {t.adminReply}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  // =========================================================================
  // 9. REPORT CENTER (ALWAYS FREE)
  // =========================================================================
  if (subView === 'reports') {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <SubHeader title="Report Center" backTo="settings" />

        <form onSubmit={handleSubmitReport} className="bg-white rounded-3xl p-6 border border-rose-100 space-y-4">
          <p className="text-xs text-zinc-500">
            Safety reporting on VibeNexa is always 100% free. Reports are reviewed confidentially.
          </p>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">Target Username</label>
            <input
              type="text"
              required
              value={reportTarget}
              onChange={(e) => setReportTarget(e.target.value)}
              placeholder="Enter username of the reported account"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">Reason Category</label>
            <select
              value={reportCategory}
              onChange={(e) => setReportCategory(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 bg-white text-sm"
            >
              {REPORT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">Details</label>
            <textarea
              rows={4}
              required
              minLength={5}
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="Explain what happened..."
              className="w-full p-3.5 rounded-xl border border-zinc-200 text-sm"
            />
          </div>
          <label className="w-full min-h-[44px] rounded-xl border border-dashed border-zinc-300 bg-zinc-50 hover:bg-rose-50 text-zinc-700 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            {reportScreenshot ? 'Screenshot Attached' : 'Attach Optional Screenshot'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const url = await uploadCompressedMedia(f, 'private', 960);
                  setReportScreenshot(url);
                } catch (err) {
                  onNotify('error', err instanceof Error ? err.message : 'Upload failed.');
                }
              }}
              className="hidden"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[46px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold"
          >
            {saving ? 'Filing Report...' : 'Submit Free Safety Report'}
          </button>
        </form>

        <section className="bg-white rounded-3xl p-6 border border-rose-100">
          <h3 className="font-display font-bold text-base text-zinc-900 mb-3">My Reports ({reports.length})</h3>
          {reports.length === 0 ? (
            <p className="text-sm text-zinc-500">No reports filed.</p>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <div key={r.id} className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-900">
                      @{r.targetUsername} · {r.category}
                    </span>
                    <span className="font-semibold capitalize text-rose-700">{r.status.replace('_', ' ')}</span>
                  </div>
                  <p className="text-zinc-700 mt-1">{r.details}</p>
                  <p className="text-zinc-400 mt-1">{formatRelativeTime(r.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  // =========================================================================
  // 10. APP INFO, TERMS & COMMUNITY GUIDELINES
  // =========================================================================
  if (subView === 'appInfo') {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <SubHeader title="App Information" backTo="settings" />
        <div className="bg-white rounded-3xl p-6 border border-rose-100 space-y-4 text-sm text-zinc-700 leading-relaxed">
          <div>
            <h3 className="font-display font-bold text-lg text-zinc-900">VibeNexa — Find Your Partner</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Firebase Project: <span className="font-mono">{FIREBASE_PROJECT_INFO.projectId}</span> · Android-first Mobile Web App (PWA)
            </p>
          </div>
          <div className="pt-3 border-t border-zinc-100 space-y-2">
            <h4 className="font-semibold text-zinc-900">₹0 Free Infrastructure Transparency</h4>
            <p className="text-xs text-zinc-600">
              VibeNexa targets ₹0 mandatory operating cost using the Firebase Spark Plan. Because Firebase Cloud Storage requires the paid Blaze billing tier, VibeNexa does not enable Blaze or require a credit card. Instead, profile photos, post images, and private verification/payment proofs use automatic client-side compression (max 2MB) served through access-controlled backend storage. Paid video transcoding/cloud storage remains disabled unless explicitly approved.
            </p>
          </div>
          <div className="pt-3 border-t border-zinc-100 space-y-2">
            <h4 className="font-semibold text-zinc-900">Android Installation & Packaging</h4>
            <p className="text-xs text-zinc-600">
              Install directly on Android via Chrome menu → <strong>Add to Home Screen</strong> (standalone PWA with Android back-button navigation), or wrap the deployed URL into a Google Play AAB/APK using Bubblewrap (Trusted Web Activity) or Capacitor without paying third-party wrapper fees.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (subView === 'terms') {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <SubHeader title="Terms & Conditions" backTo="settings" />
        <div className="bg-white rounded-3xl p-6 border border-rose-100 space-y-3 text-sm text-zinc-700 leading-relaxed">
          <p><strong>1. Age Eligibility:</strong> Adult dating, Discover matching, and 1-to-1 Personal Chat are strictly restricted to individuals aged 18 years or older. Users under 18 are isolated in Teen Safe Social Mode with zero adult dating access.</p>
          <p><strong>2. Account Authenticity:</strong> You agree to provide accurate Date of Birth and location details and refrain from impersonation, spam, or automated bots.</p>
          <p><strong>3. Payments & Verification:</strong> Manual UPI subscription payments activate only after authorized transaction verification. Screenshots alone do not constitute proof of settlement. ₹19 Mute Appeal fees are refunded if a mute is found to be mistaken, and non-refundable if a violation is confirmed.</p>
          <p><strong>4. Account Deletion & Retention:</strong> Deleted accounts are immediately disabled and scheduled for permanent deletion within 24 hours. Minimal safety and financial audit records may be retained strictly as required by Indian law.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <SubHeader title="Community Guidelines" backTo="settings" />
      <div className="bg-white rounded-3xl p-6 border border-rose-100 space-y-3 text-sm text-zinc-700 leading-relaxed">
        <p><strong>Respect & Consent:</strong> Harassment, hate speech, non-consensual content, or unwanted persistent messaging are strictly prohibited.</p>
        <p><strong>Zero Minor Exploitation:</strong> Any attempt to bypass 18+ age separation results in immediate permanent suspension and legal reporting.</p>
        <p><strong>No Scams or Fraud:</strong> Financial solicitation, fake identities, or phishing links will lead to immediate mute or account suspension.</p>
        <p><strong>Free Safety Reporting:</strong> Use the Report and Block buttons on any profile or chat at any time — safety reporting is always free.</p>
      </div>
    </div>
  );
}
