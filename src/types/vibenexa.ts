export type UserRole = 'USER' | 'SUPER_ADMIN';
export type AgeGroup = 'adult' | 'minor';
export type Gender = 'Male' | 'Female' | 'Prefer not to say';
export type PartnerPreference = 'Male' | 'Female' | 'Everyone';

export interface NotificationPrefs {
  newMatch: boolean;
  newMessage: boolean;
  newLike: boolean;
  adminAnnouncement: boolean;
}

export interface PlanFeatures {
  verifiedBadge: boolean;
  unlimitedGlobalChat: boolean;
  mediaSharing: boolean;
  chatWallpaper: boolean;
  profileCustomization: boolean;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  tagline: string;
  priceInr: number;
  durationDays: number;
  features: PlanFeatures;
  isActive: boolean;
}

export interface UpiPaymentOption {
  id: string;
  productId: string; // matches plan.id or 'mute_appeal'
  productName: string;
  productType: 'subscription' | 'mute_appeal';
  priceInr: number;
  upiId: string;
  qrImageUrl: string;
  instructions: string;
  isActive: boolean;
}

export interface PublicProfile {
  uid: string;
  username: string;
  name: string;
  age: number;
  ageGroup: AgeGroup;
  gender: Gender;
  partnerPreference: PartnerPreference;
  state: string;
  district: string;
  bio: string;
  photoUrl: string;
  profileColor: string;
  isVerified: boolean;
  isOnline?: boolean;
  createdAt: string;
}

export interface AuthUser extends PublicProfile {
  email?: string;
  mobile?: string;
  dob: string;
  role: UserRole;
  isMuted: boolean;
  muteReason?: string;
  isSuspended: boolean;
  isDeleted: boolean;
  deletionScheduledAt?: string;
  notificationPrefs: NotificationPrefs;
  activeSubscription?: {
    id: string;
    planId: string;
    planName: string;
    status: 'active' | 'expired' | 'revoked';
    startedAt: string;
    expiresAt: string;
    features: PlanFeatures;
  } | null;
  chatWallpapers?: Record<string, string>; // chatId -> image data/url (local to user)
}

export interface PostComment {
  id: string;
  authorUid: string;
  authorName: string;
  authorUsername: string;
  authorPhotoUrl: string;
  authorVerified: boolean;
  text: string;
  createdAt: string;
}

export interface FeedPost {
  id: string;
  authorUid: string;
  authorName: string;
  authorUsername: string;
  authorPhotoUrl: string;
  authorVerified: boolean;
  ageGroup: AgeGroup;
  caption: string;
  imageUrl?: string;
  likedByMe: boolean;
  likesCount: number;
  comments: PostComment[];
  createdAt: string;
}

export interface MatchSummary {
  id: string;
  chatId: string;
  matchedAt: string;
  partner: PublicProfile;
  lastMessageText?: string;
  lastMessageAt?: string;
  unreadCount?: number;
}

export interface DirectMessageItem {
  id: string;
  chatId: string;
  senderUid: string;
  recipientUid: string;
  text: string;
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
  } | null;
  status: 'sent' | 'delivered' | 'seen';
  createdAt: string;
}

export interface GlobalChatMessage {
  id: string;
  room: AgeGroup;
  senderUid: string;
  senderName: string;
  senderUsername: string;
  senderPhotoUrl: string;
  senderVerified: boolean;
  text: string;
  mediaUrl?: string;
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
  } | null;
  reactions: Record<string, string[]>; // emoji -> array of uids
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: 'match' | 'message' | 'like' | 'announcement' | 'system';
  title: string;
  body: string;
  isRead: boolean;
  relatedId?: string;
  createdAt: string;
}

export interface PaymentRequestItem {
  id: string;
  userId: string;
  username?: string;
  userName?: string;
  productId: string;
  productName: string;
  productType: 'subscription' | 'mute_appeal';
  amount: number;
  transactionRef: string;
  screenshotUrl?: string;
  status: 'pending' | 'approved' | 'rejected' | 'refunded';
  adminNote?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface MuteAppealItem {
  id: string;
  userId: string;
  username?: string;
  userName?: string;
  reason: string;
  paymentRequestId?: string;
  transactionRef?: string;
  screenshotUrl?: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  refundStatus: 'none' | 'refunded' | 'non_refundable';
  adminNote?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface VerificationRequestItem {
  id: string;
  userId: string;
  username?: string;
  userName?: string;
  userPhotoUrl?: string;
  challengeCode: string;
  note: string;
  proofMediaUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SafetyReportItem {
  id: string;
  reporterUid: string;
  reporterUsername?: string;
  targetUid: string;
  targetUsername?: string;
  targetName?: string;
  category: string;
  details: string;
  screenshotUrl?: string;
  status: 'pending' | 'under_review' | 'resolved' | 'rejected';
  adminNote?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SupportTicketItem {
  id: string;
  userId: string;
  username?: string;
  category: string;
  subject: string;
  message: string;
  status: 'pending' | 'under_review' | 'resolved' | 'rejected';
  adminReply?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PasswordRecoveryItem {
  id: string;
  userId: string;
  username: string;
  mobile: string;
  status: 'pending' | 'reset_issued' | 'completed' | 'rejected';
  issuedTokenPreview?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AdminLogItem {
  id: string;
  adminUid: string;
  action: string;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface AppSettingsConfig {
  freeGlobalDailyLimit: number;
  muteAppealPrice: number;
  profileColorFreeForAll: boolean;
  plans: SubscriptionPlan[];
  paymentOptions: UpiPaymentOption[];
  updatedAt: string;
}

export interface AdminDashboardStats {
  totalUsers: number;
  activeUsers: number;
  onlineUsers: number;
  premiumUsers: number;
  newRegistrations24h: number;
  matches: number;
  pendingPayments: number;
  pendingAppeals: number;
  pendingReports: number;
  pendingVerifications: number;
  pendingPasswordRecoveries: number;
  pendingSupportTickets: number;
}

export const PROFILE_COLORS = [
  { id: 'rose', label: 'Vibe Rose', hex: '#E11D48', soft: '#FFF1F2', gradient: 'from-rose-600 to-pink-500' },
  { id: 'crimson', label: 'Ruby Red', hex: '#BE123C', soft: '#FFE4E6', gradient: 'from-red-700 to-rose-500' },
  { id: 'blush', label: 'Pink Blush', hex: '#DB2777', soft: '#FDF2F8', gradient: 'from-pink-600 to-rose-400' },
  { id: 'coral', label: 'Warm Coral', hex: '#EA580C', soft: '#FFF7ED', gradient: 'from-rose-500 to-orange-500' },
  { id: 'berry', label: 'Velvet Berry', hex: '#9D174D', soft: '#FDF2F8', gradient: 'from-pink-800 to-rose-600' },
  { id: 'wine', label: 'Midnight Wine', hex: '#881337', soft: '#FFF1F2', gradient: 'from-rose-900 to-red-700' },
];

export const REPORT_CATEGORIES = [
  'Fake Profile',
  'Spam',
  'Harassment',
  'Inappropriate Content',
  'Fake Photo / Identity',
  'Unwanted Messages',
  'Fraud / Scam',
  'Other',
];

export const SUPPORT_CATEGORIES = [
  'Payment Issues',
  'Account Issues',
  'Profile Issues',
  'Subscription Issues',
  'Technical Issues',
  'Appeal Status',
  'Contact Support',
];
