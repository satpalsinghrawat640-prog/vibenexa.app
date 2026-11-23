import React, { useEffect, useMemo, useState } from 'react';
import { Heart, MapPin, ShieldCheck, SlidersHorizontal, RotateCcw, User } from 'lucide-react';
import { AuthUser, PublicProfile } from '../types/vibenexa';
import { INDIAN_STATES, INDIAN_STATES_DISTRICTS } from '../data/indianLocations';
import { apiFetch } from '../lib/api';
import { VerifiedBadge } from './BrandLogo';

interface DiscoverProfile extends PublicProfile {
  likedByMe: boolean;
}

interface DiscoverViewProps {
  currentUser: AuthUser;
  onViewProfile: (uid: string) => void;
  onOpenChat: (chatId: string) => void;
  onGoGlobalChat: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export function DiscoverView({
  currentUser,
  onViewProfile,
  onOpenChat,
  onGoGlobalChat,
  onNotify,
}: DiscoverViewProps) {
  const [minAge, setMinAge] = useState('18');
  const [maxAge, setMaxAge] = useState('45');
  const [gender, setGender] = useState<'All' | 'Male' | 'Female'>('All');
  const [stateName, setStateName] = useState('');
  const [districtName, setDistrictName] = useState('');

  const [profiles, setProfiles] = useState<DiscoverProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [likingUid, setLikingUid] = useState<string | null>(null);
  const [matchBanner, setMatchBanner] = useState<{ partner: DiscoverProfile; chatId: string } | null>(null);

  const districts = useMemo(
    () => (stateName ? INDIAN_STATES_DISTRICTS[stateName] || [] : []),
    [stateName]
  );

  async function fetchDiscover(override?: {
    minAge: string;
    maxAge: string;
    gender: string;
    state: string;
    district: string;
  }) {
    if (currentUser.ageGroup !== 'adult') {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const f = override || { minAge, maxAge, gender, state: stateName, district: districtName };
      const params = new URLSearchParams();
      if (f.minAge) params.set('minAge', f.minAge);
      if (f.maxAge) params.set('maxAge', f.maxAge);
      if (f.gender && f.gender !== 'All') params.set('gender', f.gender);
      if (f.state) params.set('state', f.state);
      if (f.district) params.set('district', f.district);

      const res = await apiFetch<{ profiles: DiscoverProfile[] }>(
        `/api/discover?${params.toString()}`
      );
      setProfiles(res.profiles);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not load Discover.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDiscover();
  }, [currentUser.ageGroup]);

  function handleReset() {
    setMinAge('18');
    setMaxAge('45');
    setGender('All');
    setStateName('');
    setDistrictName('');
    fetchDiscover({ minAge: '18', maxAge: '45', gender: 'All', state: '', district: '' });
  }

  async function handleLike(profile: DiscoverProfile) {
    setLikingUid(profile.uid);
    try {
      const res = await apiFetch<{ liked: boolean; matched: boolean; chatId: string | null }>(
        `/api/likes/${profile.uid}`,
        { method: 'POST' }
      );
      setProfiles((prev) =>
        prev.map((p) => (p.uid === profile.uid ? { ...p, likedByMe: true } : p))
      );
      if (res.matched && res.chatId) {
        setMatchBanner({ partner: profile, chatId: res.chatId });
      } else {
        onNotify('success', `You liked ${profile.name}.`);
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not send like.');
    } finally {
      setLikingUid(null);
    }
  }

  // Strict Minor Age-Safety Experience (<18)
  if (currentUser.ageGroup === 'minor') {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-3xl p-8 border border-rose-100 shadow-sm text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <h2 className="font-display text-2xl font-bold text-zinc-900">Teen Safe Social Space</h2>
        <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
          To keep VibeNexa safe, adult dating discovery and 1-to-1 matching are strictly limited to members aged 18 and above. You can share updates on the Teen Safe Home Feed and connect in the moderated Teen Global Room.
        </p>
        <button
          type="button"
          onClick={onGoGlobalChat}
          className="mt-6 min-h-[46px] px-6 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors"
        >
          Open Teen Global Chat
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Match Celebration Modal */}
      {matchBanner && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-7 text-center shadow-2xl border border-rose-200">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-rose-500 to-pink-600 text-white flex items-center justify-center shadow-lg shadow-rose-500/30">
              <Heart className="w-8 h-8 fill-white" />
            </div>
            <h3 className="font-display text-2xl font-bold text-zinc-900 mt-4">It's a Match!</h3>
            <p className="text-sm text-zinc-600 mt-1.5">
              You and <span className="font-semibold text-zinc-900">{matchBanner.partner.name}</span> liked each other.
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const id = matchBanner.chatId;
                  setMatchBanner(null);
                  onOpenChat(id);
                }}
                className="w-full min-h-[46px] rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 text-white font-semibold text-sm"
              >
                Send a Message
              </button>
              <button
                type="button"
                onClick={() => setMatchBanner(null)}
                className="w-full min-h-[44px] rounded-xl bg-zinc-100 text-zinc-700 font-semibold text-sm"
              >
                Keep Discovering
              </button>
            </div>
          </div>
        </div>
      )}

      {/* White Rounded 2-Column Filter Card (No Distance KM!) */}
      <section className="bg-white rounded-3xl p-5 sm:p-6 border border-rose-100 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <SlidersHorizontal className="w-4 h-4 text-rose-600" />
          <h2 className="font-display text-base font-bold text-zinc-900">Discover Filters</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="flt-min-age" className="block text-xs font-semibold text-zinc-700 mb-1">
              Minimum Age (18+)
            </label>
            <input
              id="flt-min-age"
              type="number"
              min={18}
              max={99}
              value={minAge}
              onChange={(e) => setMinAge(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-200 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-rose-500/30"
            />
          </div>

          <div>
            <label htmlFor="flt-max-age" className="block text-xs font-semibold text-zinc-700 mb-1">
              Maximum Age
            </label>
            <input
              id="flt-max-age"
              type="number"
              min={18}
              max={99}
              value={maxAge}
              onChange={(e) => setMaxAge(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-200 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-rose-500/30"
            />
          </div>

          <div className="sm:col-span-2">
            <span className="block text-xs font-semibold text-zinc-700 mb-1.5">Gender</span>
            <div className="grid grid-cols-3 gap-2">
              {(['All', 'Male', 'Female'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  className={`min-h-[44px] rounded-xl text-xs font-semibold border transition-all ${
                    gender === g
                      ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:border-rose-300'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="flt-state" className="block text-xs font-semibold text-zinc-700 mb-1">
              State / Union Territory
            </label>
            <select
              id="flt-state"
              value={stateName}
              onChange={(e) => {
                setStateName(e.target.value);
                setDistrictName('');
              }}
              className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30"
            >
              <option value="">All States & UTs</option>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="flt-district" className="block text-xs font-semibold text-zinc-700 mb-1">
              District
            </label>
            <select
              id="flt-district"
              disabled={!stateName}
              value={districtName}
              onChange={(e) => setDistrictName(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 bg-white text-sm disabled:bg-zinc-100 disabled:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
            >
              <option value="">{stateName ? 'All Districts' : 'Select State first'}</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => fetchDiscover()}
            className="flex-1 min-h-[46px] rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white text-sm font-semibold shadow-sm transition-all"
          >
            Apply Filters
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="min-h-[46px] px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>
      </section>

      {/* Profile Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-3xl h-96 border border-rose-100 animate-pulse" />
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 border border-rose-100 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
            <Heart className="w-6 h-6" />
          </div>
          <h3 className="font-display text-lg font-bold text-zinc-900">No matching profiles found</h3>
          <p className="text-sm text-zinc-500 mt-1.5 max-w-md mx-auto">
            VibeNexa displays genuine registered 18+ members only. Try broadening your State, District, or age filters — or invite real friends to join.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {profiles.map((profile) => (
            <div
              key={profile.uid}
              className="group bg-white rounded-3xl overflow-hidden border border-rose-100 shadow-sm flex flex-col"
            >
              <div className="relative aspect-[3/4] bg-gradient-to-br from-rose-500 to-pink-600 overflow-hidden">
                {profile.photoUrl ? (
                  <img
                    src={profile.photoUrl}
                    alt={`${profile.name} profile`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-white/90">
                    <span className="font-display text-6xl font-bold">
                      {profile.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-5 pt-16 text-white">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-display text-xl font-bold truncate">
                      {profile.name}, <span className="tabular-nums">{profile.age}</span>
                    </h3>
                    {profile.isVerified && <VerifiedBadge size={18} />}
                  </div>
                  <p className="mt-1 text-xs text-white/85 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {profile.district}, {profile.state}
                    </span>
                  </p>
                  {profile.isOnline && (
                    <p className="mt-1.5 text-xs font-medium text-emerald-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      Online now
                    </p>
                  )}
                </div>
              </div>

              <div className="p-4 flex items-center gap-2.5 bg-white">
                <button
                  type="button"
                  onClick={() => onViewProfile(profile.uid)}
                  className="flex-1 min-h-[44px] rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <User className="w-4 h-4" />
                  View Profile
                </button>
                <button
                  type="button"
                  disabled={profile.likedByMe || likingUid === profile.uid}
                  onClick={() => handleLike(profile)}
                  className={`flex-1 min-h-[44px] rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all ${
                    profile.likedByMe
                      ? 'bg-rose-50 text-rose-600 border border-rose-200'
                      : 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white shadow-sm'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${profile.likedByMe ? 'fill-rose-600' : ''}`} />
                  {profile.likedByMe ? 'Liked' : likingUid === profile.uid ? 'Sending...' : 'Like'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
