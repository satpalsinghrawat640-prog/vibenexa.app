import React, { useEffect, useState } from 'react';
import { BadgeCheck, ShieldAlert, CheckCircle2, X } from 'lucide-react';
import { fetchProtectedMediaBlobUrl } from '../lib/api';

/**
 * VibeNexa Heart-based M-inspired custom brand emblem.
 * Crimson-to-rose gradient heart whose upper arches sculpt a crisp geometric "M".
 */
export function VibeNexaLogo({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="VibeNexa Logo"
    >
      <defs>
        <linearGradient id="vibenexa-heart-grad" x1="8" y1="8" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF2D55" />
          <stop offset="55%" stopColor="#E11D48" />
          <stop offset="100%" stopColor="#DB2777" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#vibenexa-heart-grad)" />
      {/* Outer sculpted heart */}
      <path
        d="M32 50.5C32 50.5 13 38.6 13 24.8C13 18.7 17.8 14 23.6 14C27.2 14 30.3 15.9 32 18.8C33.7 15.9 36.8 14 40.4 14C46.2 14 51 18.7 51 24.8C51 38.6 32 50.5 32 50.5Z"
        fill="white"
        fillOpacity="0.18"
      />
      {/* Crisp M-inspired double-arch heart monogram */}
      <path
        d="M17.5 39V24.5C17.5 20.6 20.5 17.8 24.2 17.8C26.9 17.8 29.2 19.3 30.5 21.6L32 24.2L33.5 21.6C34.8 19.3 37.1 17.8 39.8 17.8C43.5 17.8 46.5 20.6 46.5 24.5V39"
        stroke="white"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21.5 38.5L32 48.2L42.5 38.5"
        stroke="white"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Blue Verified Tick — the sole intentional use of blue in VibeNexa's red/pink design system.
 */
export function VerifiedBadge({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center shrink-0 ${className}`} title="Verified Profile">
      <BadgeCheck
        size={size}
        className="text-white fill-[#2563EB]"
        aria-label="Verified Profile"
      />
    </span>
  );
}

/**
 * Resilient Avatar with Zero-Broken-Image Policy and genuine live online status indicator.
 */
export function UserAvatar({
  photoUrl,
  name,
  size = 'md',
  isOnline = false,
  className = '',
}: {
  photoUrl?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [photoUrl]);

  const sizeClasses = {
    xs: 'w-7 h-7 text-xs',
    sm: 'w-9 h-9 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-16 h-16 text-xl',
    xl: 'w-24 h-24 text-3xl',
  }[size];

  const initials = (name || 'V')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      {photoUrl && !imgFailed ? (
        <img
          src={photoUrl}
          alt={`${name} profile photo`}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className={`${sizeClasses} rounded-full object-cover bg-rose-100 ring-2 ring-white`}
        />
      ) : (
        <div
          className={`${sizeClasses} rounded-full bg-gradient-to-br from-rose-500 to-pink-600 text-white font-display font-semibold flex items-center justify-center ring-2 ring-white select-none`}
        >
          {initials || 'V'}
        </div>
      )}
      {isOnline && (
        <span
          title="Online now"
          className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white"
        />
      )}
    </div>
  );
}

/**
 * Renders private media (verification proofs, payment screenshots) fetched via Bearer Auth.
 */
export function ProtectedImage({
  url,
  alt,
  className = '',
}: {
  url?: string;
  alt: string;
  className?: string;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let currentBlob: string | null = null;
    setFailed(false);
    setBlobUrl(null);
    if (!url) return;

    fetchProtectedMediaBlobUrl(url)
      .then((res) => {
        if (!active) {
          if (res) URL.revokeObjectURL(res);
          return;
        }
        if (res) {
          currentBlob = res;
          setBlobUrl(res);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (currentBlob) URL.revokeObjectURL(currentBlob);
    };
  }, [url]);

  if (!url) return null;
  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-rose-50 text-rose-700 text-xs p-3 rounded-xl ${className}`}>
        Private media unavailable
      </div>
    );
  }
  if (!blobUrl) {
    return <div className={`animate-pulse bg-rose-100/70 rounded-xl ${className}`} />;
  }
  return <img src={blobUrl} alt={alt} referrerPolicy="no-referrer" className={className} />;
}

export function ToastBanner({
  toast,
  onDismiss,
}: {
  toast: { type: 'success' | 'error' | 'info'; message: string } | null;
  onDismiss: () => void;
}) {
  if (!toast) return null;
  const styles =
    toast.type === 'error'
      ? 'bg-red-950 text-white border-red-800'
      : toast.type === 'success'
      ? 'bg-zinc-900 text-white border-rose-500/40'
      : 'bg-zinc-900 text-white border-zinc-700';

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-md pointer-events-auto">
      <div
        role="status"
        className={`flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-xl ${styles}`}
      >
        {toast.type === 'error' ? (
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-rose-400 shrink-0" />
        )}
        <p className="text-sm font-medium flex-1 leading-snug">{toast.message}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-100">
        <h3 className="text-lg font-display font-bold text-zinc-900">{title}</h3>
        <p className="mt-2 text-sm text-zinc-600 leading-relaxed whitespace-pre-line">{description}</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 transition-colors whitespace-nowrap"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`min-h-[44px] px-5 py-2 rounded-xl text-sm font-semibold text-white transition-colors whitespace-nowrap ${
              destructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-rose-600 hover:bg-rose-700'
            } disabled:opacity-60`}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
