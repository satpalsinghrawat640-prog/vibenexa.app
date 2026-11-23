import React, { useMemo, useState } from 'react';
import {
  Eye,
  EyeOff,
  Camera,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  KeyRound,
  Heart,
  Check,
} from 'lucide-react';
import { AuthUser, Gender, PartnerPreference } from '../types/vibenexa';
import { INDIAN_STATES, INDIAN_STATES_DISTRICTS } from '../data/indianLocations';
import { ApiError, apiFetch, setAuthToken, uploadCompressedMedia } from '../lib/api';
import {
  syncFirebaseEmailLogin,
  syncFirebaseEmailSignup,
  triggerFirebasePasswordReset,
} from '../firebase';
import { VibeNexaLogo } from './BrandLogo';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

interface AuthScreenProps {
  onAuthSuccess: (token: string, user: AuthUser) => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export function AuthScreen({ onAuthSuccess, onNotify }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup1' | 'signup2' | 'forgot' | 'adminClaim'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Login fields
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Admin first-run claim fields (only opened if authorized Super Admin has not set a password yet)
  const [claimPassword, setClaimPassword] = useState('');
  const [claimConfirm, setClaimConfirm] = useState('');

  // Signup Step 1
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');

  // Signup Step 2
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [stateName, setStateName] = useState('');
  const [districtName, setDistrictName] = useState('');
  const [bio, setBio] = useState('');
  const [gender, setGender] = useState<Gender>('Male');
  const [partnerPreference, setPartnerPreference] = useState<PartnerPreference>('Everyone');

  // Forgot Password
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotResult, setForgotResult] = useState<{ mode: string; message: string; email?: string } | null>(null);
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');

  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear - 13; y >= 1935; y -= 1) arr.push(y);
    return arr;
  }, [currentYear]);

  // Dynamically compute valid days in selected month & year
  const daysInMonth = useMemo(() => {
    const m = Number(dobMonth);
    const y = Number(dobYear) || 2000;
    if (!m) return 31;
    return new Date(y, m, 0).getDate();
  }, [dobMonth, dobYear]);

  const districts = useMemo(
    () => (stateName ? INDIAN_STATES_DISTRICTS[stateName] || [] : []),
    [stateName]
  );

  const computedAge = useMemo(() => {
    const d = Number(dobDay);
    const m = Number(dobMonth);
    const y = Number(dobYear);
    if (!d || !m || !y) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    const now = new Date();
    if (dt > now) return null;
    let age = now.getUTCFullYear() - y;
    const md = now.getUTCMonth() + 1 - m;
    if (md < 0 || (md === 0 && now.getUTCDate() < d)) age -= 1;
    return age;
  }, [dobDay, dobMonth, dobYear]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: { identifier, password },
      });
      setAuthToken(res.token);
      if (res.user.email) {
        syncFirebaseEmailLogin(res.user.email, password);
      }
      onAuthSuccess(res.token, res.user);
    } catch (err) {
      if (err instanceof ApiError && err.data?.requiresAdminClaim) {
        setMode('adminClaim');
        setError('');
      } else {
        setError(err instanceof Error ? err.message : 'Login failed.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleAdminClaim(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (claimPassword.length < 8) {
      setError('Admin password must be at least 8 characters long.');
      return;
    }
    if (claimPassword !== claimConfirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/admin-claim', {
        method: 'POST',
        body: { identifier, newPassword: claimPassword, confirmPassword: claimConfirm },
      });
      setAuthToken(res.token);
      onNotify('success', 'Authorized Super Admin password securely configured.');
      onAuthSuccess(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not initialize password.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignupStep1(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username.trim())) {
      setError('Username must be 3–30 characters using only letters, numbers, or underscores.');
      return;
    }
    if (name.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (signupPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (signupPassword !== confirmPassword) {
      setError('Confirm Password does not match.');
      return;
    }

    setLoading(true);
    try {
      await apiFetch('/api/auth/check-availability', {
        method: 'POST',
        body: {
          username: username.trim(),
          email: email.trim() || undefined,
          mobile: mobile.trim() || undefined,
        },
      });
      setMode('signup2');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setError('');
    try {
      const url = await uploadCompressedMedia(file, 'public', 640);
      setPhotoUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!dobDay || !dobMonth || !dobYear || computedAge === null) {
      setError('Please select a valid Date of Birth.');
      return;
    }
    if (!stateName || !districtName) {
      setError('Please select both your Indian State and District.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/signup', {
        method: 'POST',
        body: {
          username: username.trim(),
          name: name.trim(),
          password: signupPassword,
          confirmPassword,
          email: email.trim() || undefined,
          mobile: mobile.trim() || undefined,
          photoUrl,
          dobDay: Number(dobDay),
          dobMonth: Number(dobMonth),
          dobYear: Number(dobYear),
          state: stateName,
          district: districtName,
          bio: bio.trim(),
          gender,
          partnerPreference,
        },
      });
      setAuthToken(res.token);
      if (email.trim()) {
        syncFirebaseEmailSignup(email.trim(), signupPassword);
      }
      onNotify('success', 'Welcome to VibeNexa! Your account is ready.');
      onAuthSuccess(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ mode: string; message: string; email?: string }>(
        '/api/auth/forgot-password',
        { method: 'POST', body: { identifier: forgotIdentifier } }
      );
      if (res.mode === 'email' && res.email) {
        const fbRes = await triggerFirebasePasswordReset(res.email);
        setForgotResult({
          ...res,
          message: fbRes.sent
            ? `Password reset email sent to ${res.email} via Firebase Authentication. Check your inbox and spam folder.`
            : `${res.message} (${fbRes.message || 'If your email was created outside Firebase Auth, request an Admin reset code via Support.'})`,
        });
      } else {
        setForgotResult(res);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process recovery request.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResetWithCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>('/api/auth/reset-password-with-code', {
        method: 'POST',
        body: {
          identifier: forgotIdentifier,
          resetCode,
          newPassword: resetNewPassword,
        },
      });
      onNotify('success', res.message);
      setMode('login');
      setIdentifier(forgotIdentifier);
      setResetCode('');
      setResetNewPassword('');
      setForgotResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired reset code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FFF9FA] flex flex-col lg:grid lg:grid-cols-12">
      {/* Editorial Brand Showcase (Desktop Left Split) */}
      <div className="relative hidden lg:flex lg:col-span-6 xl:col-span-7 overflow-hidden bg-rose-950">
        <img
          src="/src/assets/images/vibenexa_rose_silk_hero_1795350140897.jpg"
          alt="VibeNexa crimson and rose silk backdrop"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-85"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-rose-950/45 to-black/30" />
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 text-white w-full">
          <div className="flex items-center gap-3.5">
            <VibeNexaLogo size={46} />
            <div>
              <span className="font-display text-2xl font-bold tracking-tight block leading-none">
                VibeNexa
              </span>
              <span className="text-xs text-rose-200 font-medium tracking-wide">
                Find Your Partner
              </span>
            </div>
          </div>

          <div className="max-w-xl">
            <h1 className="font-display text-4xl xl:text-5xl font-bold leading-[1.1] tracking-tight">
              Real connections across India, built with safety first.
            </h1>
            <p className="mt-5 text-base text-rose-100/90 leading-relaxed max-w-lg">
              Discover genuine profiles by State and District, chat in real time, verify your profile, and connect in a respectful, age-safe community.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-6 border-t border-white/15 pt-6 text-sm text-rose-100/85">
              <div>
                <p className="font-display font-semibold text-white">Verified Trust</p>
                <p className="text-xs text-rose-200/80 mt-1">Privacy-first profile checks</p>
              </div>
              <div>
                <p className="font-display font-semibold text-white">18+ Age Safety</p>
                <p className="text-xs text-rose-200/80 mt-1">Strict adult & teen separation</p>
              </div>
              <div>
                <p className="font-display font-semibold text-white">All 36 States & UTs</p>
                <p className="text-xs text-rose-200/80 mt-1">District-level discovery</p>
              </div>
            </div>
          </div>

          <p className="text-xs text-rose-200/70">
            VibeNexa · Find Your Partner · Firebase Project vibenexa-in
          </p>
        </div>
      </div>

      {/* Right / Mobile Fullscreen Auth Form */}
      <div className="flex-1 lg:col-span-6 xl:col-span-5 flex flex-col justify-center px-5 py-8 sm:px-10 lg:px-12 overflow-y-auto">
        <div className="w-full max-w-md mx-auto">
          {/* Mobile Brand Header */}
          <div className="flex items-center gap-3 mb-7 lg:hidden">
            <VibeNexaLogo size={42} />
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900 leading-none">
                VibeNexa
              </h1>
              <p className="text-xs font-medium text-rose-600 mt-0.5">Find Your Partner</p>
            </div>
          </div>

          {/* LOGIN VIEW */}
          {mode === 'login' && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-rose-100">
              <h2 className="font-display text-2xl font-bold text-zinc-900">Welcome back</h2>
              <p className="text-sm text-zinc-500 mt-1">
                Sign in with your username, email, or mobile number.
              </p>

              {error && (
                <div className="mt-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="login-id" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    Username, Email or Mobile Number
                  </label>
                  <input
                    id="login-id"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. aarav_k, name@email.com, or +91 9876543210"
                    className="w-full min-h-[46px] px-4 rounded-xl border border-zinc-200 bg-zinc-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="login-pass" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="login-pass"
                      type={showPass ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full min-h-[46px] pl-4 pr-12 rounded-xl border border-zinc-200 bg-zinc-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                      className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-zinc-400 hover:text-zinc-700"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setForgotResult(null);
                      setForgotIdentifier(identifier);
                      setMode('forgot');
                    }}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700 py-1"
                  >
                    Forgot Password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white font-semibold text-sm shadow-md shadow-rose-500/20 active:scale-[0.99] transition-all disabled:opacity-60"
                >
                  {loading ? 'Signing in...' : 'Login'}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-zinc-100 text-center">
                <p className="text-sm text-zinc-600">
                  New to VibeNexa?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setMode('signup1');
                    }}
                    className="font-semibold text-rose-600 hover:text-rose-700"
                  >
                    Create New Account
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* ONE-TIME SUPER ADMIN PASSWORD CLAIM (Only shown if authorized Admin has no password hash yet) */}
          {mode === 'adminClaim' && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-rose-100">
              <div className="flex items-center gap-2 text-rose-600 mb-2">
                <ShieldCheck className="w-5 h-5" />
                <span className="text-xs font-semibold">First-Run Security Setup</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-zinc-900">Set Account Password</h2>
              <p className="text-sm text-zinc-600 mt-1">
                Initialize a strong password for this authorized account. It will be hashed with scrypt and locked permanently after setup.
              </p>

              {error && (
                <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleAdminClaim} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    New Password (min 8 characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={claimPassword}
                    onChange={(e) => setClaimPassword(e.target.value)}
                    className="w-full min-h-[46px] px-4 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={claimConfirm}
                    onChange={(e) => setClaimConfirm(e.target.value)}
                    className="w-full min-h-[46px] px-4 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[48px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-colors disabled:opacity-60"
                >
                  {loading ? 'Securing account...' : 'Save Password & Sign In'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setMode('login');
                  }}
                  className="w-full min-h-[44px] rounded-xl text-sm font-medium text-zinc-600 hover:bg-zinc-100"
                >
                  Back to Login
                </button>
              </form>
            </div>
          )}

          {/* SIGNUP STEP 1 — BASIC REGISTRATION */}
          {mode === 'signup1' && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-rose-100">
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setMode('login');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 min-h-[40px]"
                >
                  <ArrowLeft className="w-4 h-4" /> Login
                </button>
                <span className="text-xs font-medium text-rose-600 tabular-nums">Step 1 of 2</span>
              </div>

              <h2 className="font-display text-2xl font-bold text-zinc-900">Create Account</h2>
              <p className="text-sm text-zinc-500 mt-1">
                No OTP required. Email and mobile number are optional.
              </p>

              {error && (
                <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSignupStep1} className="mt-5 space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Username <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="letters, numbers, underscore"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-200 bg-zinc-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Full Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your display name"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-200 bg-zinc-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Password <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="Min 8 chars"
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-200 bg-zinc-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Confirm Password <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-200 bg-zinc-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-100">
                  <p className="text-xs text-zinc-500 mb-2.5">Optional recovery & login identifiers</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Email Address (Optional)
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-200 bg-zinc-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Mobile Number (Optional)
                      </label>
                      <input
                        type="tel"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        placeholder="+91 9876543210"
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-200 bg-zinc-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[48px] mt-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-md shadow-rose-500/20 disabled:opacity-60"
                >
                  {loading ? 'Checking...' : 'Continue to Profile'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* SIGNUP STEP 2 — COMPLETE YOUR PROFILE */}
          {mode === 'signup2' && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-rose-100">
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setMode('signup1');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 min-h-[40px]"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <span className="text-xs font-medium text-rose-600 tabular-nums">Step 2 of 2</span>
              </div>

              <h2 className="font-display text-2xl font-bold text-zinc-900">Complete Your Profile</h2>
              <p className="text-sm text-zinc-500 mt-1">
                Tell us a bit about yourself to personalize your VibeNexa experience.
              </p>

              {error && (
                <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateAccount} className="mt-5 space-y-4">
                {/* Profile Photo */}
                <div className="flex items-center gap-4">
                  <div className="relative w-20 h-20 rounded-full bg-rose-100 border-2 border-rose-200 overflow-hidden flex items-center justify-center shrink-0">
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt="Profile preview"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Heart className="w-7 h-7 text-rose-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold cursor-pointer transition-colors">
                      <Camera className="w-4 h-4" />
                      {uploadingPhoto ? 'Uploading...' : photoUrl ? 'Change Photo' : 'Upload Profile Photo'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                    </label>
                    <p className="text-xs text-zinc-500 mt-1">Compressed automatically · Max 2MB</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                  />
                </div>

                {/* Date of Birth: Day / Month / Year */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-zinc-700">
                      Date of Birth <span className="text-rose-600">*</span>
                    </label>
                    {computedAge !== null && (
                      <span className="text-xs font-medium text-zinc-500 tabular-nums">
                        Age {computedAge} · {computedAge >= 18 ? 'Adult (18+)' : 'Teen Safe Mode (<18)'}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      required
                      aria-label="Birth Day"
                      value={dobDay}
                      onChange={(e) => setDobDay(e.target.value)}
                      className="min-h-[44px] px-2.5 rounded-xl border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                    >
                      <option value="">Day</option>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <select
                      required
                      aria-label="Birth Month"
                      value={dobMonth}
                      onChange={(e) => {
                        setDobMonth(e.target.value);
                        const nextMax = new Date(Number(dobYear) || 2000, Number(e.target.value), 0).getDate();
                        if (Number(dobDay) > nextMax) setDobDay('');
                      }}
                      className="min-h-[44px] px-2.5 rounded-xl border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                    >
                      <option value="">Month</option>
                      {MONTHS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <select
                      required
                      aria-label="Birth Year"
                      value={dobYear}
                      onChange={(e) => setDobYear(e.target.value)}
                      className="min-h-[44px] px-2.5 rounded-xl border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                    >
                      <option value="">Year</option>
                      {years.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  {computedAge !== null && computedAge < 18 && (
                    <p className="mt-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                      Users under 18 automatically receive VibeNexa Teen Safe Social Mode with strict separation from adult dating and matching.
                    </p>
                  )}
                </div>

                {/* Indian State & District (No City or Area) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Indian State / UT <span className="text-rose-600">*</span>
                    </label>
                    <select
                      required
                      value={stateName}
                      onChange={(e) => {
                        setStateName(e.target.value);
                        setDistrictName('');
                      }}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                    >
                      <option value="">Select State / UT</option>
                      {INDIAN_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      District <span className="text-rose-600">*</span>
                    </label>
                    <select
                      required
                      disabled={!stateName}
                      value={districtName}
                      onChange={(e) => setDistrictName(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 bg-white text-sm disabled:bg-zinc-100 disabled:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                    >
                      <option value="">{stateName ? 'Select District' : 'Choose State first'}</option>
                      {districts.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Gender</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Male', 'Female', 'Prefer not to say'] as Gender[]).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGender(g)}
                        className={`min-h-[44px] px-2 rounded-xl text-xs font-semibold border transition-all ${
                          gender === g
                            ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                            : 'bg-white text-zinc-700 border-zinc-200 hover:border-rose-300'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Partner Preference */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    Partner Gender Preference
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Male', 'Female', 'Everyone'] as PartnerPreference[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPartnerPreference(p)}
                        className={`min-h-[44px] px-2 rounded-xl text-xs font-semibold border transition-all ${
                          partnerPreference === p
                            ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                            : 'bg-white text-zinc-700 border-zinc-200 hover:border-rose-300'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bio */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Bio</label>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Share your interests, values, or what you're looking for..."
                    className="w-full p-3.5 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || uploadingPhoto}
                  className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-md shadow-rose-500/20 disabled:opacity-60"
                >
                  <Check className="w-4 h-4" />
                  {loading ? 'Creating Account...' : 'Create Account'}
                </button>
              </form>
            </div>
          )}

          {/* FORGOT PASSWORD */}
          {mode === 'forgot' && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-rose-100">
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setMode('login');
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 min-h-[40px] mb-2"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Login
              </button>

              <div className="flex items-center gap-2 text-rose-600 mb-1">
                <KeyRound className="w-5 h-5" />
                <span className="text-xs font-semibold">Secure Password Recovery</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-zinc-900">Forgot Password</h2>
              <p className="text-sm text-zinc-500 mt-1">
                Email accounts receive a secure reset link. Mobile-only accounts create a support-verified one-time reset request. Existing passwords are never stored or revealed.
              </p>

              {error && (
                <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleForgotSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    Registered Email, Mobile Number, or Username
                  </label>
                  <input
                    type="text"
                    required
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    placeholder="Enter your account identifier"
                    className="w-full min-h-[46px] px-4 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[46px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-colors disabled:opacity-60"
                >
                  {loading ? 'Submitting...' : 'Request Password Reset'}
                </button>
              </form>

              {forgotResult && (
                <div className="mt-5 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-sm text-rose-900">
                  {forgotResult.message}
                </div>
              )}

              {/* One-Time Reset Code Redemption (for Mobile-only accounts after Admin issues a code) */}
              <div className="mt-6 pt-5 border-t border-zinc-100">
                <p className="text-xs font-semibold text-zinc-800 mb-2">
                  Have an Admin-issued one-time reset code?
                </p>
                <form onSubmit={handleResetWithCode} className="space-y-3">
                  <input
                    type="text"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    placeholder="Reset code (e.g. VN-A1B2C3)"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-200 text-sm font-mono uppercase"
                  />
                  <input
                    type="password"
                    minLength={8}
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="New password (min 8 chars)"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-200 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={loading || !resetCode || resetNewPassword.length < 8}
                    className="w-full min-h-[44px] rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-sm disabled:opacity-50"
                  >
                    Set New Password
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
