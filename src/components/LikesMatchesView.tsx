import React, { useEffect, useState } from 'react';
import { Heart, MessageCircle, ShieldCheck, MapPin } from 'lucide-react';
import { AuthUser, MatchSummary, PublicProfile } from '../types/vibenexa';
import { apiFetch, formatRelativeTime } from '../lib/api';
import { UserAvatar, VerifiedBadge } from './BrandLogo';

interface LikesMatchesViewProps {
  currentUser: AuthUser;
  onViewProfile: (uid: string) => void;
  onOpenChat: (chatId: string) => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export function LikesMatchesView({
  currentUser,
  onViewProfile,
  onOpenChat,
  onNotify,
}: LikesMatchesViewProps) {
  const [section, setSection] = useState<'likedMe' | 'iLiked' | 'matches'>('matches');
  const [likedMe, setLikedMe] = useState<{ likedAt: string; profile: PublicProfile }[]>([]);
  const [iLiked, setILiked] = useState<{ likedAt: string; profile: PublicProfile }[]>([]);
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    if (currentUser.ageGroup !== 'adult') {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{
        likedMe: { likedAt: string; profile: PublicProfile }[];
        iLiked: { likedAt: string; profile: PublicProfile }[];
        matches: MatchSummary[];
      }>('/api/likes-matches');
      setLikedMe(res.likedMe);
      setILiked(res.iLiked);
      setMatches(res.matches);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not load likes and matches.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [currentUser.ageGroup]);

  async function handleLikeBack(uid: string, name: string) {
    try {
      const res = await apiFetch<{ matched: boolean; chatId: string | null }>(`/api/likes/${uid}`, {
        method: 'POST',
      });
      if (res.matched) {
        onNotify('success', `It's a match with ${name}! You can now message each other.`);
        setSection('matches');
      }
      loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not like back.');
    }
  }

  if (currentUser.ageGroup === 'minor') {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-3xl p-8 border border-rose-100 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <h2 className="font-display text-2xl font-bold text-zinc-900">18+ Only Feature</h2>
        <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
          Dating likes and partner matching are strictly restricted to eligible adults aged 18 or older to protect minor safety.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Segmented Control */}
      <div className="bg-white p-1.5 rounded-2xl border border-rose-100 grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => setSection('likedMe')}
          className={`min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap px-2 ${
            section === 'likedMe'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-zinc-600 hover:bg-rose-50'
          }`}
        >
          Liked Me ({likedMe.length})
        </button>
        <button
          type="button"
          onClick={() => setSection('iLiked')}
          className={`min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap px-2 ${
            section === 'iLiked'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-zinc-600 hover:bg-rose-50'
          }`}
        >
          I Liked ({iLiked.length})
        </button>
        <button
          type="button"
          onClick={() => setSection('matches')}
          className={`min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap px-2 ${
            section === 'matches'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-zinc-600 hover:bg-rose-50'
          }`}
        >
          Matches ({matches.length})
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-3xl h-28 border border-rose-100 animate-pulse" />
          ))}
        </div>
      ) : section === 'likedMe' ? (
        likedMe.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 border border-rose-100 text-center">
            <Heart className="w-8 h-8 text-rose-300 mx-auto mb-3" />
            <h3 className="font-display text-lg font-bold text-zinc-900">No incoming likes yet</h3>
            <p className="text-sm text-zinc-500 mt-1">
              When eligible adult members like your profile, they will appear right here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {likedMe.map(({ likedAt, profile }) => (
              <div
                key={profile.uid}
                className="bg-white rounded-3xl p-4 border border-rose-100 flex items-center gap-3.5"
              >
                <button type="button" onClick={() => onViewProfile(profile.uid)}>
                  <UserAvatar
                    photoUrl={profile.photoUrl}
                    name={profile.name}
                    size="lg"
                    isOnline={profile.isOnline}
                  />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onViewProfile(profile.uid)}
                      className="font-display font-bold text-base text-zinc-900 hover:text-rose-600 truncate"
                    >
                      {profile.name}, {profile.age}
                    </button>
                    {profile.isVerified && <VerifiedBadge size={15} />}
                  </div>
                  <p className="text-xs text-zinc-500 truncate flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {profile.district}, {profile.state}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">Liked {formatRelativeTime(likedAt)}</p>
                  <button
                    type="button"
                    onClick={() => handleLikeBack(profile.uid, profile.name)}
                    className="mt-2.5 min-h-[40px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Heart className="w-3.5 h-3.5 fill-white" />
                    Like Back to Match
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : section === 'iLiked' ? (
        iLiked.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 border border-rose-100 text-center">
            <Heart className="w-8 h-8 text-rose-300 mx-auto mb-3" />
            <h3 className="font-display text-lg font-bold text-zinc-900">No pending likes</h3>
            <p className="text-sm text-zinc-500 mt-1">
              Profiles you like in Discover appear here until they like you back.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {iLiked.map(({ likedAt, profile }) => (
              <button
                key={profile.uid}
                type="button"
                onClick={() => onViewProfile(profile.uid)}
                className="bg-white rounded-3xl p-4 border border-rose-100 flex items-center gap-3.5 text-left hover:border-rose-300 transition-colors"
              >
                <UserAvatar
                  photoUrl={profile.photoUrl}
                  name={profile.name}
                  size="lg"
                  isOnline={profile.isOnline}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-display font-bold text-base text-zinc-900 truncate">
                      {profile.name}, {profile.age}
                    </span>
                    {profile.isVerified && <VerifiedBadge size={15} />}
                  </div>
                  <p className="text-xs text-zinc-500 truncate mt-0.5">
                    {profile.district}, {profile.state}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">Liked {formatRelativeTime(likedAt)}</p>
                </div>
              </button>
            ))}
          </div>
        )
      ) : matches.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 border border-rose-100 text-center">
          <Heart className="w-8 h-8 text-rose-300 mx-auto mb-3" />
          <h3 className="font-display text-lg font-bold text-zinc-900">No matches yet</h3>
          <p className="text-sm text-zinc-500 mt-1">
            A match happens automatically when two eligible adults like each other.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {matches.map((m) => (
            <div
              key={m.id}
              className="bg-white rounded-3xl p-4 border border-rose-100 flex items-center gap-3.5"
            >
              <button type="button" onClick={() => onViewProfile(m.partner.uid)}>
                <UserAvatar
                  photoUrl={m.partner.photoUrl}
                  name={m.partner.name}
                  size="lg"
                  isOnline={m.partner.isOnline}
                />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onViewProfile(m.partner.uid)}
                    className="font-display font-bold text-base text-zinc-900 hover:text-rose-600 truncate"
                  >
                    {m.partner.name}, {m.partner.age}
                  </button>
                  {m.partner.isVerified && <VerifiedBadge size={15} />}
                </div>
                <p className="text-xs text-zinc-500 truncate mt-0.5">
                  {m.partner.district}, {m.partner.state}
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenChat(m.chatId)}
                    className="min-h-[40px] px-4 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Message
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
