import React, { useEffect, useState } from 'react';
import {
  X,
  Heart,
  MessageCircle,
  Flag,
  Ban,
  MapPin,
  Bell,
  CheckCheck,
  Upload,
} from 'lucide-react';
import {
  AuthUser,
  FeedPost,
  NotificationItem,
  PROFILE_COLORS,
  PublicProfile,
  REPORT_CATEGORIES,
} from '../types/vibenexa';
import { apiFetch, formatRelativeTime, uploadCompressedMedia } from '../lib/api';
import { UserAvatar, VerifiedBadge } from './BrandLogo';

/**
 * Other-User Profile Viewer Modal with Like, Message (if matched), Report, and Block actions.
 */
export function UserProfileModal({
  uid,
  currentUser,
  onClose,
  onOpenChat,
  onReportUser,
  onNotify,
}: {
  uid: string | null;
  currentUser: AuthUser;
  onClose: () => void;
  onOpenChat: (chatId: string) => void;
  onReportUser: (targetUid: string, targetName: string) => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}) {
  const [data, setData] = useState<{
    profile: PublicProfile;
    likedByMe: boolean;
    isMatched: boolean;
    chatId: string | null;
    posts: FeedPost[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    setData(null);
    apiFetch<{
      profile: PublicProfile;
      likedByMe: boolean;
      isMatched: boolean;
      chatId: string | null;
      posts: FeedPost[];
    }>(`/api/profile/${uid}`)
      .then((res) => setData(res))
      .catch((err) => {
        onNotify('error', err instanceof Error ? err.message : 'Profile unavailable.');
        onClose();
      })
      .finally(() => setLoading(false));
  }, [uid]);

  if (!uid) return null;

  const colorObj =
    PROFILE_COLORS.find((c) => c.id === data?.profile.profileColor) || PROFILE_COLORS[0];

  async function handleLike() {
    if (!data) return;
    try {
      const res = await apiFetch<{ matched: boolean; chatId: string | null }>(
        `/api/likes/${data.profile.uid}`,
        { method: 'POST' }
      );
      setData((prev) =>
        prev
          ? { ...prev, likedByMe: true, isMatched: res.matched || prev.isMatched, chatId: res.chatId || prev.chatId }
          : null
      );
      onNotify('success', res.matched ? `It's a match with ${data.profile.name}!` : `You liked ${data.profile.name}.`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not like profile.');
    }
  }

  async function handleBlock() {
    if (!data) return;
    try {
      await apiFetch(`/api/block/${data.profile.uid}`, { method: 'POST' });
      onNotify('info', `${data.profile.name} has been blocked.`);
      onClose();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Block failed.');
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-rose-100 my-auto">
        {loading || !data ? (
          <div className="p-10 text-center text-sm text-zinc-500">Loading profile...</div>
        ) : (
          <>
            <div className={`h-28 bg-gradient-to-r ${colorObj.gradient} relative p-4 flex justify-end`}>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close profile"
                className="w-10 h-10 rounded-full bg-black/30 hover:bg-black/45 text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 pb-6">
              <div className="-mt-11 flex items-end justify-between gap-3">
                <UserAvatar
                  photoUrl={data.profile.photoUrl}
                  name={data.profile.name}
                  size="xl"
                  isOnline={data.profile.isOnline}
                />
                {data.profile.uid !== currentUser.uid && (
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onReportUser(data.profile.uid, data.profile.name);
                      }}
                      aria-label="Report user"
                      className="min-h-[40px] px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold inline-flex items-center gap-1"
                    >
                      <Flag className="w-3.5 h-3.5" /> Report
                    </button>
                    <button
                      type="button"
                      onClick={handleBlock}
                      aria-label="Block user"
                      className="min-h-[40px] px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold inline-flex items-center gap-1"
                    >
                      <Ban className="w-3.5 h-3.5" /> Block
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-3">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-display text-xl font-bold text-zinc-900">
                    {data.profile.name}, <span className="tabular-nums">{data.profile.age}</span>
                  </h3>
                  {data.profile.isVerified && <VerifiedBadge size={18} />}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  @{data.profile.username} · {data.profile.gender}
                  {data.profile.isOnline ? ' · Online now' : ''}
                </p>
                <p className="text-xs text-zinc-600 flex items-center gap-1 mt-1.5">
                  <MapPin className="w-3.5 h-3.5 text-rose-500" />
                  {data.profile.district}, {data.profile.state}
                </p>
                {data.profile.bio && (
                  <p className="mt-3 text-sm text-zinc-700 leading-relaxed">{data.profile.bio}</p>
                )}
              </div>

              {data.profile.uid !== currentUser.uid && currentUser.ageGroup === 'adult' && data.profile.ageGroup === 'adult' && (
                <div className="mt-5 flex items-center gap-2.5">
                  {data.isMatched && data.chatId ? (
                    <button
                      type="button"
                      onClick={() => {
                        const cid = data.chatId!;
                        onClose();
                        onOpenChat(cid);
                      }}
                      className="flex-1 min-h-[44px] rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                    >
                      <MessageCircle className="w-4 h-4" /> Message Match
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={data.likedByMe}
                      onClick={handleLike}
                      className="flex-1 min-h-[44px] rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                    >
                      <Heart className={`w-4 h-4 ${data.likedByMe ? 'fill-white' : ''}`} />
                      {data.likedByMe ? 'Liked' : 'Like Profile'}
                    </button>
                  )}
                </div>
              )}

              {data.posts.length > 0 && (
                <div className="mt-5 pt-4 border-t border-zinc-100">
                  <p className="text-xs font-bold text-zinc-700 mb-2.5">Recent Posts</p>
                  <div className="space-y-2.5 max-h-48 overflow-y-auto">
                    {data.posts.slice(0, 4).map((p) => (
                      <div key={p.id} className="p-3 rounded-2xl bg-zinc-50 text-xs">
                        <p className="text-zinc-800">{p.caption}</p>
                        <p className="text-zinc-400 mt-1">{formatRelativeTime(p.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Quick Free Report User Modal (accessible from profiles & chats)
 */
export function QuickReportModal({
  target,
  onClose,
  onNotify,
}: {
  target: { uid: string; name: string } | null;
  onClose: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}) {
  const [category, setCategory] = useState(REPORT_CATEGORIES[0]);
  const [details, setDetails] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!target) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        body: {
          targetUid: target!.uid,
          category,
          details,
          screenshotUrl: screenshotUrl || undefined,
        },
      });
      setDetails('');
      setScreenshotUrl('');
      onNotify('success', 'Safety report submitted (free). Thank you.');
      onClose();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Report failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-100">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-lg font-bold text-zinc-900">Report {target.name}</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-zinc-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-zinc-500">Safety reporting is always free and confidential.</p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
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
              rows={3}
              required
              minLength={5}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Describe the violation..."
              className="w-full p-3 rounded-xl border border-zinc-200 text-sm"
            />
          </div>
          <label className="w-full min-h-[42px] rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-xs font-semibold text-zinc-700 flex items-center justify-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            {screenshotUrl ? 'Screenshot Attached' : 'Attach Optional Screenshot'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const url = await uploadCompressedMedia(f, 'private', 960);
                  setScreenshotUrl(url);
                } catch (err) {
                  onNotify('error', err instanceof Error ? err.message : 'Upload failed.');
                }
              }}
              className="hidden"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[46px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold"
          >
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Notifications Slide-Over Drawer
 */
export function NotificationsDrawer({
  open,
  notifications,
  onClose,
  onMarkAllRead,
}: {
  open: boolean;
  notifications: NotificationItem[];
  onClose: () => void;
  onMarkAllRead: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/45 backdrop-blur-xs">
      <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-rose-600" />
            <h3 className="font-display font-bold text-base text-zinc-900">Notifications</h3>
          </div>
          <div className="flex items-center gap-1">
            {notifications.some((n) => !n.isRead) && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="min-h-[38px] px-3 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1"
              >
                <CheckCheck className="w-4 h-4" /> Mark Read
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-zinc-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-100">
          {notifications.length === 0 ? (
            <div className="p-10 text-center">
              <Bell className="w-8 h-8 text-rose-200 mx-auto mb-2" />
              <p className="text-sm font-semibold text-zinc-800">All caught up</p>
              <p className="text-xs text-zinc-500 mt-1">
                Real alerts for matches, messages, likes, and announcements appear here.
              </p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`p-4 ${n.isRead ? 'bg-white' : 'bg-rose-50/60'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-zinc-900">{n.title}</p>
                  <span className="text-[11px] text-zinc-400 shrink-0">
                    {formatRelativeTime(n.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-zinc-600 mt-1 leading-relaxed">{n.body}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * React ErrorBoundary catching unexpected runtime or Firestore permission errors gracefully.
 */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || 'An unexpected error occurred.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FFF9FA] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl max-w-md w-full p-7 border border-rose-200 text-center shadow-lg">
            <h2 className="font-display text-xl font-bold text-zinc-900">Something went wrong</h2>
            <p className="text-xs text-zinc-600 mt-2 break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 min-h-[44px] px-6 rounded-xl bg-rose-600 text-white text-sm font-semibold"
            >
              Reload VibeNexa
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
