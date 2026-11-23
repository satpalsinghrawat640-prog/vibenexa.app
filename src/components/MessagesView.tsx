import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  Globe,
  MessageCircle,
  MoreVertical,
  Reply,
  Flag,
  Ban,
  User,
  Image as ImageIcon,
  Palette,
  ArrowLeft,
  X,
  Lock,
  Crown,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import {
  AuthUser,
  DirectMessageItem,
  GlobalChatMessage,
  PublicProfile,
} from '../types/vibenexa';
import { apiFetch, formatRelativeTime, uploadCompressedMedia } from '../lib/api';
import { realtime } from '../lib/realtime';
import { UserAvatar, VerifiedBadge } from './BrandLogo';

interface ChatConversation {
  chatId: string;
  partner: PublicProfile;
  lastMessageText: string;
  lastMessageAt: string;
  unreadCount: number;
}

interface QuotaState {
  unlimited: boolean;
  limit: number;
  used: number;
  remaining: number | null;
  resetsAt: string | null;
}

interface MessagesViewProps {
  currentUser: AuthUser;
  initialSubTab?: 'personal' | 'global';
  initialChatId?: string | null;
  onViewProfile: (uid: string) => void;
  onReportUser: (targetUid: string, targetName: string) => void;
  onOpenUpgrade: () => void;
  onOpenMuteAppeal: () => void;
  onOpenFreeSupport: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
  onRefreshUser: () => void;
}

const REACTION_EMOJIS = ['❤️', '😂', '🔥', '👍', '😍', '👏'];

export function MessagesView({
  currentUser,
  initialSubTab = 'personal',
  initialChatId = null,
  onViewProfile,
  onReportUser,
  onOpenUpgrade,
  onOpenMuteAppeal,
  onOpenFreeSupport,
  onNotify,
  onRefreshUser,
}: MessagesViewProps) {
  const isMinor = currentUser.ageGroup === 'minor';
  const [subTab, setSubTab] = useState<'personal' | 'global'>(
    isMinor ? 'global' : initialSubTab
  );

  // Personal Chat state
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(initialChatId);
  const [dmMessages, setDmMessages] = useState<DirectMessageItem[]>([]);
  const [dmInput, setDmInput] = useState('');
  const [dmReplyTo, setDmReplyTo] = useState<DirectMessageItem | null>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [wallpaperUrl, setWallpaperUrl] = useState('');
  const [wallpaperModalOpen, setWallpaperModalOpen] = useState(false);
  const [wallpaperPreview, setWallpaperPreview] = useState('');
  const [uploadingWallpaper, setUploadingWallpaper] = useState(false);
  const [upgradePromptOpen, setUpgradePromptOpen] = useState(false);

  // Global Chat state
  const [globalMessages, setGlobalMessages] = useState<GlobalChatMessage[]>([]);
  const [globalQuota, setGlobalQuota] = useState<QuotaState | null>(null);
  const [globalInput, setGlobalInput] = useState('');
  const [globalReplyTo, setGlobalReplyTo] = useState<GlobalChatMessage | null>(null);
  const [globalMediaUrl, setGlobalMediaUrl] = useState('');
  const [uploadingGlobalMedia, setUploadingGlobalMedia] = useState(false);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);

  const dmEndRef = useRef<HTMLDivElement>(null);
  const globalEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  const activeConversation = conversations.find((c) => c.chatId === activeChatId) || null;
  const canUseWallpaper = Boolean(
    currentUser.role === 'SUPER_ADMIN' || currentUser.activeSubscription?.features.chatWallpaper
  );
  const canShareGlobalMedia = Boolean(
    currentUser.role === 'SUPER_ADMIN' || currentUser.activeSubscription?.features.mediaSharing
  );

  useEffect(() => {
    if (initialChatId && !isMinor) {
      setSubTab('personal');
      setActiveChatId(initialChatId);
    }
  }, [initialChatId, isMinor]);

  useEffect(() => {
    if (!isMinor && initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab, isMinor]);

  // Load Conversations
  async function loadConversations() {
    if (isMinor) return;
    try {
      const res = await apiFetch<{ chats: ChatConversation[] }>('/api/chats');
      setConversations(res.chats);
    } catch {
      // Handled gracefully
    }
  }

  // Load Global Chat
  async function loadGlobalChat() {
    try {
      const res = await apiFetch<{
        room: 'adult' | 'minor';
        messages: GlobalChatMessage[];
        quota: QuotaState;
      }>('/api/global-chat');
      setGlobalMessages(res.messages);
      setGlobalQuota(res.quota);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not load Global Chat.');
    }
  }

  // Load Personal Chat messages
  async function loadDmMessages(chatId: string) {
    try {
      const res = await apiFetch<{
        chatId: string;
        messages: DirectMessageItem[];
        wallpaperUrl: string;
      }>(`/api/chats/${chatId}/messages`);
      setDmMessages(res.messages);
      setWallpaperUrl(res.wallpaperUrl || '');
      setPartnerTyping(false);
      await apiFetch(`/api/chats/${chatId}/seen`, { method: 'POST' });
      setConversations((prev) =>
        prev.map((c) => (c.chatId === chatId ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not open conversation.');
    }
  }

  useEffect(() => {
    loadConversations();
    loadGlobalChat();
  }, [isMinor]);

  useEffect(() => {
    if (activeChatId && !isMinor) {
      loadDmMessages(activeChatId);
    }
  }, [activeChatId, isMinor]);

  // WebSocket Real-Time Subscriptions
  useEffect(() => {
    const offGlobal = realtime.on('global:message', (payload) => {
      const msg = payload as GlobalChatMessage;
      setGlobalMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    });
    const offGlobalReact = realtime.on('global:reaction', (payload) => {
      const updated = payload as GlobalChatMessage;
      setGlobalMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    });
    const offGlobalDelete = realtime.on('global:deleted', (payload) => {
      const { id } = payload as { id: string };
      setGlobalMessages((prev) => prev.filter((m) => m.id !== id));
    });
    const offDm = realtime.on('dm:message', (payload) => {
      const dm = payload as DirectMessageItem;
      if (dm.chatId === activeChatId) {
        setDmMessages((prev) => (prev.some((m) => m.id === dm.id) ? prev : [...prev, dm]));
        if (dm.recipientUid === currentUser.uid) {
          apiFetch(`/api/chats/${dm.chatId}/seen`, { method: 'POST' }).catch(() => {});
        }
      }
      loadConversations();
    });
    const offTyping = realtime.on('dm:typing', (payload) => {
      const data = payload as { chatId: string; fromUid: string; isTyping: boolean };
      if (data.chatId === activeChatId && data.fromUid !== currentUser.uid) {
        setPartnerTyping(data.isTyping);
      }
    });
    const offStatus = realtime.on('dm:status', (payload) => {
      const data = payload as { chatId: string; messageIds: string[]; status: 'delivered' | 'seen' };
      if (data.chatId === activeChatId) {
        setDmMessages((prev) =>
          prev.map((m) => (data.messageIds.includes(m.id) ? { ...m, status: data.status } : m))
        );
      }
    });

    return () => {
      offGlobal();
      offGlobalReact();
      offGlobalDelete();
      offDm();
      offTyping();
      offStatus();
    };
  }, [activeChatId, currentUser.uid]);

  useEffect(() => {
    dmEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dmMessages.length, partnerTyping]);

  useEffect(() => {
    globalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [globalMessages.length]);

  function handleDmInputChange(val: string) {
    setDmInput(val);
    if (!activeChatId) return;
    realtime.sendTyping(activeChatId, val.trim().length > 0);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      realtime.sendTyping(activeChatId, false);
    }, 2000);
  }

  async function handleSendDm(e: React.FormEvent) {
    e.preventDefault();
    if (!activeChatId || !dmInput.trim()) return;
    const text = dmInput.trim();
    const replyToId = dmReplyTo?.id;
    setDmInput('');
    setDmReplyTo(null);
    realtime.sendTyping(activeChatId, false);
    try {
      const res = await apiFetch<{ message: DirectMessageItem }>(
        `/api/chats/${activeChatId}/messages`,
        { method: 'POST', body: { text, replyToId } }
      );
      setDmMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Message failed.');
    }
  }

  async function handleSendGlobal(e: React.FormEvent) {
    e.preventDefault();
    if (!globalInput.trim() && !globalMediaUrl) return;
    const text = globalInput.trim();
    const mediaUrl = globalMediaUrl;
    const replyToId = globalReplyTo?.id;
    setGlobalInput('');
    setGlobalMediaUrl('');
    setGlobalReplyTo(null);

    try {
      const res = await apiFetch<{ message: GlobalChatMessage; quota: QuotaState }>(
        '/api/global-chat',
        { method: 'POST', body: { text, mediaUrl: mediaUrl || undefined, replyToId } }
      );
      setGlobalMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
      );
      setGlobalQuota(res.quota);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not send message.');
    }
  }

  async function handleGlobalMediaPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!canShareGlobalMedia) {
      setUpgradePromptOpen(true);
      e.target.value = '';
      return;
    }
    setUploadingGlobalMedia(true);
    try {
      const url = await uploadCompressedMedia(file, 'public', 960);
      setGlobalMediaUrl(url);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Media upload failed.');
    } finally {
      setUploadingGlobalMedia(false);
      e.target.value = '';
    }
  }

  async function handleGlobalReact(msgId: string, emoji: string) {
    setActiveReactionMsgId(null);
    try {
      const res = await apiFetch<{ message: GlobalChatMessage }>(
        `/api/global-chat/${msgId}/react`,
        { method: 'POST', body: { emoji } }
      );
      setGlobalMessages((prev) => prev.map((m) => (m.id === msgId ? res.message : m)));
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not react.');
    }
  }

  async function handleBlockUser(uid: string, name: string) {
    try {
      await apiFetch(`/api/block/${uid}`, { method: 'POST' });
      onNotify('info', `${name} has been blocked.`);
      setChatMenuOpen(false);
      if (activeConversation?.partner.uid === uid) {
        setActiveChatId(null);
      }
      loadConversations();
      loadGlobalChat();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not block user.');
    }
  }

  function handleOpenChatTheme() {
    setChatMenuOpen(false);
    if (!canUseWallpaper) {
      setUpgradePromptOpen(true);
      return;
    }
    setWallpaperPreview(wallpaperUrl);
    setWallpaperModalOpen(true);
  }

  async function handleWallpaperFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingWallpaper(true);
    try {
      const url = await uploadCompressedMedia(file, 'private', 1080);
      setWallpaperPreview(url);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Wallpaper upload failed.');
    } finally {
      setUploadingWallpaper(false);
      e.target.value = '';
    }
  }

  async function handleSaveWallpaper(nextUrl: string) {
    if (!activeChatId) return;
    try {
      await apiFetch('/api/profile/chat-wallpaper', {
        method: 'PUT',
        body: { chatId: activeChatId, wallpaperUrl: nextUrl },
      });
      setWallpaperUrl(nextUrl);
      setWallpaperModalOpen(false);
      onRefreshUser();
      onNotify('success', nextUrl ? 'Personal chat wallpaper applied.' : 'Chat theme reset to default.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not update wallpaper.');
    }
  }

  const lastOwnDmId = [...dmMessages]
    .reverse()
    .find((m) => m.senderUid === currentUser.uid)?.id;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Upgrade Plan Modal (when free user taps Change Theme or Media Share) */}
      {upgradePromptOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-rose-100 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Crown className="w-7 h-7" />
            </div>
            <h3 className="font-display text-xl font-bold text-zinc-900 mt-4">Upgrade Plan</h3>
            <p className="text-sm text-zinc-600 mt-1.5">
              Custom personal chat wallpapers, unlimited Global Chat messaging, and media sharing are available on eligible Premium plans.
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setUpgradePromptOpen(false);
                  onOpenUpgrade();
                }}
                className="w-full min-h-[46px] rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 text-white text-sm font-semibold"
              >
                View Premium Plans
              </button>
              <button
                type="button"
                onClick={() => setUpgradePromptOpen(false)}
                className="w-full min-h-[44px] rounded-xl bg-zinc-100 text-zinc-700 text-sm font-semibold"
              >
                Not Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Premium Chat Wallpaper Modal (Personal View Only) */}
      {wallpaperModalOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-bold text-zinc-900">Change Chat Theme</h3>
              <button
                type="button"
                onClick={() => setWallpaperModalOpen(false)}
                className="p-2 rounded-xl hover:bg-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              Select a photo from your device gallery to personalize this conversation. Only your own chat view changes.
            </p>

            {/* Preview */}
            <div
              className="mt-4 h-48 rounded-2xl border border-rose-100 overflow-hidden relative flex flex-col justify-end p-3 bg-[#FFF5F7]"
              style={
                wallpaperPreview
                  ? {
                      backgroundImage: `url(${wallpaperPreview})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : undefined
              }
            >
              <div className="absolute inset-0 bg-black/15 pointer-events-none" />
              <div className="relative z-10 space-y-2">
                <div className="bg-white/95 text-zinc-900 text-xs px-3 py-2 rounded-2xl rounded-bl-sm w-fit max-w-[75%] shadow-sm">
                  Hey! Love the vibe here.
                </div>
                <div className="bg-rose-600 text-white text-xs px-3 py-2 rounded-2xl rounded-br-sm w-fit ml-auto shadow-sm">
                  Looks awesome with this wallpaper!
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              <label className="w-full min-h-[44px] rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer">
                <ImageIcon className="w-4 h-4" />
                {uploadingWallpaper ? 'Loading preview...' : 'Select Photo from Gallery'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleWallpaperFilePick}
                  className="hidden"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveWallpaper('')}
                  className="min-h-[44px] rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold"
                >
                  Reset to Default
                </button>
                <button
                  type="button"
                  disabled={!wallpaperPreview || uploadingWallpaper}
                  onClick={() => handleSaveWallpaper(wallpaperPreview)}
                  className="min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  Apply Wallpaper
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Muted Notice Banner */}
      {currentUser.isMuted && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-900">Your chat access is muted</p>
              <p className="text-xs text-red-700 mt-0.5">
                {currentUser.muteReason || 'Account muted by moderation.'} You cannot send Global or Personal Chat messages while muted.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenMuteAppeal}
              className="min-h-[40px] px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold whitespace-nowrap"
            >
              ₹19 Mute Appeal
            </button>
            <button
              type="button"
              onClick={onOpenFreeSupport}
              className="min-h-[40px] px-3.5 rounded-xl bg-white border border-red-200 text-red-700 text-xs font-semibold whitespace-nowrap"
            >
              Free Support
            </button>
          </div>
        </div>
      )}

      {/* Messages Sub-Navigation */}
      <div className="bg-white p-1.5 rounded-2xl border border-rose-100 grid grid-cols-2 gap-1.5">
        {!isMinor && (
          <button
            type="button"
            onClick={() => setSubTab('personal')}
            className={`min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
              subTab === 'personal'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-zinc-600 hover:bg-rose-50'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            Personal Chat
          </button>
        )}
        <button
          type="button"
          onClick={() => setSubTab('global')}
          className={`min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
            isMinor ? 'col-span-2' : ''
          } ${
            subTab === 'global'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-zinc-600 hover:bg-rose-50'
          }`}
        >
          <Globe className="w-4 h-4" />
          {isMinor ? 'Teen Safe Global Chat' : 'Global Chat (18+)'}
        </button>
      </div>

      {/* PERSONAL 1-TO-1 CHAT */}
      {subTab === 'personal' && !isMinor && (
        <div className="bg-white rounded-3xl border border-rose-100 shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[540px] max-h-[72vh]">
          {/* Conversations List */}
          <div
            className={`md:col-span-4 border-r border-zinc-100 overflow-y-auto ${
              activeChatId ? 'hidden md:block' : 'block'
            }`}
          >
            <div className="p-4 border-b border-zinc-100">
              <h3 className="font-display font-bold text-sm text-zinc-900">Matched Conversations</h3>
            </div>
            {conversations.length === 0 ? (
              <div className="p-8 text-center">
                <MessageCircle className="w-8 h-8 text-rose-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-zinc-800">No personal chats yet</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Match with eligible adult profiles in Discover to start 1-to-1 messaging.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {conversations.map((c) => (
                  <button
                    key={c.chatId}
                    type="button"
                    onClick={() => setActiveChatId(c.chatId)}
                    className={`w-full p-3.5 flex items-center gap-3 text-left hover:bg-rose-50/50 transition-colors ${
                      activeChatId === c.chatId ? 'bg-rose-50' : ''
                    }`}
                  >
                    <UserAvatar
                      photoUrl={c.partner.photoUrl}
                      name={c.partner.name}
                      size="md"
                      isOnline={c.partner.isOnline}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="font-semibold text-sm text-zinc-900 truncate">
                            {c.partner.name}
                          </span>
                          {c.partner.isVerified && <VerifiedBadge size={14} />}
                        </div>
                        <span className="text-[11px] text-zinc-400 shrink-0">
                          {formatRelativeTime(c.lastMessageAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-zinc-500 truncate">{c.lastMessageText}</p>
                        {c.unreadCount > 0 && (
                          <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Active Chat Pane */}
          <div
            className={`md:col-span-8 flex flex-col relative ${
              activeChatId ? 'flex' : 'hidden md:flex'
            }`}
          >
            {!activeConversation ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500">
                <MessageCircle className="w-10 h-10 text-rose-200 mb-3" />
                <p className="font-display font-semibold text-zinc-800">Select a conversation</p>
                <p className="text-xs mt-1 max-w-xs">
                  Real-time messaging with typing indicators, delivery & seen status, and customizable themes.
                </p>
              </div>
            ) : (
              <>
                {/* Chat Header */}
                <div className="px-4 py-3 border-b border-zinc-100 bg-white flex items-center justify-between gap-2 z-20">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => setActiveChatId(null)}
                      aria-label="Back to conversations"
                      className="md:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-zinc-100"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onViewProfile(activeConversation.partner.uid)}
                      className="flex items-center gap-2.5 min-w-0 text-left"
                    >
                      <UserAvatar
                        photoUrl={activeConversation.partner.photoUrl}
                        name={activeConversation.partner.name}
                        size="sm"
                        isOnline={activeConversation.partner.isOnline}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-semibold text-sm text-zinc-900 truncate">
                            {activeConversation.partner.name}
                          </span>
                          {activeConversation.partner.isVerified && <VerifiedBadge size={14} />}
                        </div>
                        <p className="text-[11px] text-zinc-500 truncate">
                          {partnerTyping
                            ? 'typing...'
                            : activeConversation.partner.isOnline
                            ? 'Online'
                            : `${activeConversation.partner.district}, ${activeConversation.partner.state}`}
                        </p>
                      </div>
                    </button>
                  </div>

                  {/* Chat Menu */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setChatMenuOpen((v) => !v)}
                      aria-label="Chat menu"
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-zinc-100 text-zinc-600"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>

                    {chatMenuOpen && (
                      <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-2xl shadow-xl border border-rose-100 py-1.5 z-30">
                        <button
                          type="button"
                          onClick={() => {
                            setChatMenuOpen(false);
                            onViewProfile(activeConversation.partner.uid);
                          }}
                          className="w-full px-4 py-2.5 text-left text-xs font-medium text-zinc-700 hover:bg-rose-50 flex items-center gap-2.5"
                        >
                          <User className="w-4 h-4 text-zinc-500" /> View Profile
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenChatTheme}
                          className="w-full px-4 py-2.5 text-left text-xs font-medium text-zinc-700 hover:bg-rose-50 flex items-center gap-2.5"
                        >
                          <Palette className="w-4 h-4 text-rose-500" />
                          Chat Theme {!canUseWallpaper && <Lock className="w-3 h-3 ml-auto text-zinc-400" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setChatMenuOpen(false);
                            onReportUser(activeConversation.partner.uid, activeConversation.partner.name);
                          }}
                          className="w-full px-4 py-2.5 text-left text-xs font-medium text-zinc-700 hover:bg-rose-50 flex items-center gap-2.5"
                        >
                          <Flag className="w-4 h-4 text-amber-600" /> Report User
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleBlockUser(activeConversation.partner.uid, activeConversation.partner.name)
                          }
                          className="w-full px-4 py-2.5 text-left text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2.5"
                        >
                          <Ban className="w-4 h-4" /> Block User
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Messages Stream with Optional Personal Wallpaper */}
                <div
                  className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-[#FFF9FA] relative"
                  style={
                    wallpaperUrl
                      ? {
                          backgroundImage: `linear-gradient(rgba(255,255,255,0.28), rgba(255,255,255,0.28)), url(${wallpaperUrl})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }
                      : undefined
                  }
                >
                  {dmMessages.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-xs text-zinc-500 bg-white/85 inline-block px-4 py-2 rounded-full">
                        Say hello to {activeConversation.partner.name}!
                      </p>
                    </div>
                  ) : (
                    dmMessages.map((m) => {
                      const isMine = m.senderUid === currentUser.uid;
                      return (
                        <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                          <div className="group flex items-end gap-1.5 max-w-[82%]">
                            {isMine && (
                              <button
                                type="button"
                                onClick={() => setDmReplyTo(m)}
                                aria-label="Reply to message"
                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 text-zinc-400 hover:text-rose-600 transition-opacity"
                              >
                                <Reply className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <div
                              className={`rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                                isMine
                                  ? 'bg-gradient-to-br from-rose-600 to-pink-600 text-white rounded-br-sm'
                                  : 'bg-white text-zinc-900 border border-rose-100/80 rounded-bl-sm'
                              }`}
                            >
                              {m.replyTo && (
                                <div
                                  className={`mb-1.5 pl-2 border-l-2 text-xs opacity-85 ${
                                    isMine ? 'border-white/70' : 'border-rose-400'
                                  }`}
                                >
                                  <p className="font-semibold text-[11px]">{m.replyTo.senderName}</p>
                                  <p className="truncate max-w-[200px]">{m.replyTo.text}</p>
                                </div>
                              )}
                              <p className="whitespace-pre-wrap break-words leading-snug">{m.text}</p>
                            </div>
                            {!isMine && (
                              <button
                                type="button"
                                onClick={() => setDmReplyTo(m)}
                                aria-label="Reply to message"
                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 text-zinc-400 hover:text-rose-600 transition-opacity"
                              >
                                <Reply className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Subtle Instagram-style status under last sent message */}
                          {isMine && m.id === lastOwnDmId && (
                            <span className="text-[10px] font-medium text-zinc-500 mt-0.5 mr-1 capitalize">
                              {m.status}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}

                  {partnerTyping && (
                    <div className="flex items-center">
                      <span className="text-[11px] text-zinc-500 bg-white/90 px-3 py-1 rounded-full shadow-xs">
                        typing...
                      </span>
                    </div>
                  )}
                  <div ref={dmEndRef} />
                </div>

                {/* Reply Preview */}
                {dmReplyTo && (
                  <div className="px-4 py-2 bg-rose-50 border-t border-rose-100 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <span className="font-semibold text-rose-700">Replying to message: </span>
                      <span className="text-zinc-600 truncate">{dmReplyTo.text}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDmReplyTo(null)}
                      className="p-1 text-zinc-500 hover:text-zinc-900"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Input Bar */}
                <form
                  onSubmit={handleSendDm}
                  className="p-3 border-t border-zinc-100 bg-white flex items-center gap-2"
                >
                  <input
                    type="text"
                    disabled={currentUser.isMuted}
                    value={dmInput}
                    onChange={(e) => handleDmInputChange(e.target.value)}
                    placeholder={
                      currentUser.isMuted ? 'Account muted from chat' : 'Write a message...'
                    }
                    className="flex-1 min-h-[44px] px-4 rounded-xl bg-zinc-50 border border-zinc-200 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={currentUser.isMuted || !dmInput.trim()}
                    aria-label="Send message"
                    className="min-h-[44px] min-w-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* REAL-TIME GLOBAL CHAT */}
      {subTab === 'global' && (
        <div className="bg-white rounded-3xl border border-rose-100 shadow-sm overflow-hidden flex flex-col min-h-[540px] max-h-[72vh]">
          <div className="px-4 sm:px-5 py-3.5 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-bold text-base text-zinc-900">
                {isMinor ? 'Teen Safe Global Room (<18)' : 'VibeNexa Global Chat (18+)'}
              </h3>
              <p className="text-xs text-zinc-500">
                {isMinor
                  ? 'Moderated teen-only room with zero adult access'
                  : 'Real-time community chat · Be respectful & follow guidelines'}
              </p>
            </div>
            {globalQuota && (
              <div className="text-xs font-medium text-zinc-600 tabular-nums">
                {globalQuota.unlimited ? (
                  <span className="text-rose-600 font-semibold">Unlimited Premium Chat</span>
                ) : (
                  <span>
                    {globalQuota.remaining} / {globalQuota.limit} free messages left (24h)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FFF9FA]">
            {globalMessages.length === 0 ? (
              <div className="text-center py-14">
                <Globe className="w-9 h-9 text-rose-200 mx-auto mb-2.5" />
                <p className="font-display font-semibold text-zinc-800">Start the live conversation</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Messages appear here instantly for all members in your age group.
                </p>
              </div>
            ) : (
              globalMessages.map((msg) => {
                const isMine = msg.senderUid === currentUser.uid;
                const reactionEntries = Object.entries(msg.reactions || {}).filter(
                  ([, uids]) => uids.length > 0
                );
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2.5 ${isMine ? 'flex-row-reverse' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => onViewProfile(msg.senderUid)}
                      className="shrink-0"
                    >
                      <UserAvatar
                        photoUrl={msg.senderPhotoUrl}
                        name={msg.senderName}
                        size="sm"
                      />
                    </button>

                    <div className={`max-w-[82%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-1.5 text-xs mb-1">
                        <button
                          type="button"
                          onClick={() => onViewProfile(msg.senderUid)}
                          className="font-semibold text-zinc-800 hover:text-rose-600"
                        >
                          {msg.senderName}
                        </button>
                        {msg.senderVerified && <VerifiedBadge size={13} />}
                        <span className="text-[11px] text-zinc-400">
                          {formatRelativeTime(msg.createdAt)}
                        </span>
                      </div>

                      <div
                        className={`rounded-2xl px-3.5 py-2.5 text-sm shadow-xs ${
                          isMine
                            ? 'bg-gradient-to-br from-rose-600 to-pink-600 text-white rounded-tr-sm'
                            : 'bg-white text-zinc-900 border border-rose-100 rounded-tl-sm'
                        }`}
                      >
                        {msg.replyTo && (
                          <div
                            className={`mb-1.5 pl-2 border-l-2 text-xs opacity-85 ${
                              isMine ? 'border-white/70' : 'border-rose-400'
                            }`}
                          >
                            <p className="font-semibold text-[11px]">{msg.replyTo.senderName}</p>
                            <p className="truncate max-w-[200px]">{msg.replyTo.text}</p>
                          </div>
                        )}
                        {msg.mediaUrl && (
                          <img
                            src={msg.mediaUrl}
                            alt="Shared in Global Chat"
                            referrerPolicy="no-referrer"
                            className="rounded-xl max-h-56 object-cover mb-2"
                          />
                        )}
                        {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
                      </div>

                      {/* Reactions + Quick Actions */}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {reactionEntries.map(([emoji, uids]) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleGlobalReact(msg.id, emoji)}
                            className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                              uids.includes(currentUser.uid)
                                ? 'bg-rose-50 border-rose-300 text-rose-700'
                                : 'bg-white border-zinc-200 text-zinc-600'
                            }`}
                          >
                            {emoji} <span className="tabular-nums">{uids.length}</span>
                          </button>
                        ))}

                        <button
                          type="button"
                          onClick={() =>
                            setActiveReactionMsgId((curr) => (curr === msg.id ? null : msg.id))
                          }
                          className="text-[11px] text-zinc-400 hover:text-rose-600 px-1.5 py-0.5"
                        >
                          React
                        </button>
                        <button
                          type="button"
                          onClick={() => setGlobalReplyTo(msg)}
                          className="text-[11px] text-zinc-400 hover:text-rose-600 px-1.5 py-0.5"
                        >
                          Reply
                        </button>
                        {!isMine && (
                          <>
                            <button
                              type="button"
                              onClick={() => onReportUser(msg.senderUid, msg.senderName)}
                              className="text-[11px] text-zinc-400 hover:text-amber-600 px-1.5 py-0.5"
                            >
                              Report
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBlockUser(msg.senderUid, msg.senderName)}
                              className="text-[11px] text-zinc-400 hover:text-red-600 px-1.5 py-0.5"
                            >
                              Block
                            </button>
                          </>
                        )}
                      </div>

                      {activeReactionMsgId === msg.id && (
                        <div className="mt-1 bg-white border border-rose-100 shadow-md rounded-full px-2 py-1 flex items-center gap-1">
                          {REACTION_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => handleGlobalReact(msg.id, emoji)}
                              className="w-8 h-8 rounded-full hover:bg-rose-50 flex items-center justify-center text-base"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={globalEndRef} />
          </div>

          {/* Reply / Media Preview Bar */}
          {(globalReplyTo || globalMediaUrl) && (
            <div className="px-4 py-2 bg-rose-50 border-t border-rose-100 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                {globalMediaUrl && (
                  <img
                    src={globalMediaUrl}
                    alt="Attachment preview"
                    className="w-9 h-9 rounded-lg object-cover"
                  />
                )}
                {globalReplyTo && (
                  <span className="truncate text-zinc-700">
                    <strong className="text-rose-700">Replying to {globalReplyTo.senderName}:</strong>{' '}
                    {globalReplyTo.text}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setGlobalReplyTo(null);
                  setGlobalMediaUrl('');
                }}
                className="p-1 text-zinc-500 hover:text-zinc-900"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Global Input Bar */}
          <form
            onSubmit={handleSendGlobal}
            className="p-3 border-t border-zinc-100 bg-white flex items-center gap-2"
          >
            <label
              title={
                canShareGlobalMedia
                  ? 'Share photo in Global Chat'
                  : 'Premium feature — Upgrade to share media'
              }
              className="min-h-[44px] min-w-[44px] rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center cursor-pointer shrink-0"
            >
              <ImageIcon className="w-4 h-4" />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={currentUser.isMuted || uploadingGlobalMedia}
                onChange={handleGlobalMediaPick}
                className="hidden"
              />
            </label>
            <input
              type="text"
              disabled={currentUser.isMuted}
              value={globalInput}
              onChange={(e) => setGlobalInput(e.target.value)}
              placeholder={
                currentUser.isMuted
                  ? 'Account muted from Global Chat'
                  : uploadingGlobalMedia
                  ? 'Uploading photo...'
                  : 'Message Global Chat...'
              }
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-zinc-50 border border-zinc-200 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={currentUser.isMuted || (!globalInput.trim() && !globalMediaUrl)}
              aria-label="Send global message"
              className="min-h-[44px] min-w-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
