import fs from 'fs';
import path from 'path';
import {
  AdminLogItem,
  AgeGroup,
  AppSettingsConfig,
  Gender,
  MuteAppealItem,
  NotificationItem,
  NotificationPrefs,
  PartnerPreference,
  PasswordRecoveryItem,
  PaymentRequestItem,
  PublicProfile,
  SafetyReportItem,
  SupportTicketItem,
  UserRole,
  VerificationRequestItem,
} from '../src/types/vibenexa.ts';
import {
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_MOBILE,
  SUPER_ADMIN_UID,
  SUPER_ADMIN_USERNAME,
  hashPassword,
} from './security.ts';

export interface StoredUser {
  uid: string;
  username: string;
  name: string;
  email?: string;
  mobile?: string;
  passwordHash: string; // Empty string ONLY if Super Admin has not claimed initial password yet
  dob: string;
  age: number;
  ageGroup: AgeGroup;
  gender: Gender;
  partnerPreference: PartnerPreference;
  state: string;
  district: string;
  bio: string;
  photoUrl: string;
  profileColor: string;
  role: UserRole;
  isVerified: boolean;
  isMuted: boolean;
  muteReason?: string;
  isSuspended: boolean;
  suspendReason?: string;
  isDeleted: boolean;
  deletionScheduledAt?: string;
  notificationPrefs: NotificationPrefs;
  chatWallpapers: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface StoredSession {
  tokenHash: string;
  uid: string;
  createdAt: string;
  lastActiveAt: string;
}

export interface StoredPost {
  id: string;
  authorUid: string;
  ageGroup: AgeGroup;
  caption: string;
  imageUrl?: string;
  likedBy: string[];
  comments: {
    id: string;
    authorUid: string;
    text: string;
    createdAt: string;
  }[];
  createdAt: string;
}

export interface StoredLike {
  id: string;
  fromUid: string;
  toUid: string;
  createdAt: string;
}

export interface StoredMatch {
  id: string;
  userA: string;
  userB: string;
  chatId: string;
  createdAt: string;
}

export interface StoredChat {
  id: string;
  userA: string;
  userB: string;
  lastMessageText?: string;
  lastMessageAt?: string;
  createdAt: string;
}

export interface StoredDirectMessage {
  id: string;
  chatId: string;
  senderUid: string;
  recipientUid: string;
  text: string;
  replyToId?: string;
  status: 'sent' | 'delivered' | 'seen';
  createdAt: string;
}

export interface StoredGlobalMessage {
  id: string;
  room: AgeGroup;
  senderUid: string;
  text: string;
  mediaUrl?: string;
  replyToId?: string;
  reactions: Record<string, string[]>;
  createdAt: string;
}

export interface StoredSubscription {
  id: string;
  userId: string;
  planId: string;
  planName: string;
  status: 'active' | 'expired' | 'revoked';
  startedAt: string;
  expiresAt: string;
}

export interface StoredBlock {
  id: string;
  blockerUid: string;
  blockedUid: string;
  createdAt: string;
}

export interface StoredMedia {
  id: string;
  ownerUid: string;
  filename: string;
  mimeType: string;
  visibility: 'public' | 'private';
  createdAt: string;
}

export interface StoredPasswordResetToken {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

export interface DatabaseSchema {
  users: StoredUser[];
  sessions: StoredSession[];
  posts: StoredPost[];
  likes: StoredLike[];
  matches: StoredMatch[];
  chats: StoredChat[];
  messages: StoredDirectMessage[];
  globalMessages: StoredGlobalMessage[];
  globalQuotaEvents: { uid: string; ts: number }[];
  notifications: NotificationItem[];
  subscriptions: StoredSubscription[];
  paymentRequests: PaymentRequestItem[];
  appeals: MuteAppealItem[];
  reports: SafetyReportItem[];
  verificationRequests: VerificationRequestItem[];
  supportTickets: SupportTicketItem[];
  blockedUsers: StoredBlock[];
  adminLogs: AdminLogItem[];
  passwordRecoveries: PasswordRecoveryItem[];
  passwordResetTokens: StoredPasswordResetToken[];
  media: StoredMedia[];
  appSettings: AppSettingsConfig;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
export const MEDIA_DIR = path.resolve(DATA_DIR, 'media');
const DB_FILE = path.resolve(DATA_DIR, 'vibenexa-db.json');

function createDefaultAppSettings(): AppSettingsConfig {
  const now = new Date().toISOString();
  return {
    freeGlobalDailyLimit: 15,
    muteAppealPrice: 19,
    profileColorFreeForAll: true,
    plans: [
      {
        id: 'tier_1',
        name: 'Vibe Plus',
        tagline: 'Verified trust badge & elevated visibility (Admin configurable)',
        priceInr: 149,
        durationDays: 30,
        features: {
          verifiedBadge: true,
          unlimitedGlobalChat: true,
          mediaSharing: false,
          chatWallpaper: false,
          profileCustomization: true,
        },
        isActive: true,
      },
      {
        id: 'tier_2',
        name: 'Vibe Gold',
        tagline: 'Unlimited Global Chat, verified tick & custom chat wallpaper',
        priceInr: 299,
        durationDays: 30,
        features: {
          verifiedBadge: true,
          unlimitedGlobalChat: true,
          mediaSharing: true,
          chatWallpaper: true,
          profileCustomization: true,
        },
        isActive: true,
      },
      {
        id: 'tier_3',
        name: 'Vibe Royal',
        tagline: 'All premium privileges for 90 days with priority support',
        priceInr: 699,
        durationDays: 90,
        features: {
          verifiedBadge: true,
          unlimitedGlobalChat: true,
          mediaSharing: true,
          chatWallpaper: true,
          profileCustomization: true,
        },
        isActive: true,
      },
    ],
    paymentOptions: [
      {
        id: 'upi_tier_1',
        productId: 'tier_1',
        productName: 'Vibe Plus (30 Days)',
        productType: 'subscription',
        priceInr: 149,
        upiId: 'configure-upi@vibenexa',
        qrImageUrl: '',
        instructions: 'Pay via any UPI app (GPay, PhonePe, Paytm), copy the 12-digit UTR/Transaction ID, and submit below for Admin verification.',
        isActive: true,
      },
      {
        id: 'upi_tier_2',
        productId: 'tier_2',
        productName: 'Vibe Gold (30 Days)',
        productType: 'subscription',
        priceInr: 299,
        upiId: 'configure-upi@vibenexa',
        qrImageUrl: '',
        instructions: 'Pay via any UPI app, copy the 12-digit UTR reference, and submit below. Subscription activates only after manual verification.',
        isActive: true,
      },
      {
        id: 'upi_tier_3',
        productId: 'tier_3',
        productName: 'Vibe Royal (90 Days)',
        productType: 'subscription',
        priceInr: 699,
        upiId: 'configure-upi@vibenexa',
        qrImageUrl: '',
        instructions: 'Pay via any UPI app and provide your UTR reference ID. Activation occurs after Admin confirms receipt.',
        isActive: true,
      },
      {
        id: 'upi_mute_appeal',
        productId: 'mute_appeal',
        productName: 'Mute Review Appeal (₹19)',
        productType: 'mute_appeal',
        priceInr: 19,
        upiId: 'configure-upi@vibenexa',
        qrImageUrl: '',
        instructions: 'Pay ₹19 for priority moderation review. Refunded if the mute was mistaken or no violation is found; non-refundable if violation is confirmed.',
        isActive: true,
      },
    ],
    updatedAt: now,
  };
}

function createInitialSuperAdmin(): StoredUser {
  const now = new Date().toISOString();
  const envPass = process.env.ADMIN_INITIAL_PASSWORD?.trim();
  return {
    uid: SUPER_ADMIN_UID,
    username: SUPER_ADMIN_USERNAME,
    name: 'Satpal Singh Rawat',
    email: SUPER_ADMIN_EMAIL,
    mobile: SUPER_ADMIN_MOBILE,
    passwordHash: envPass ? hashPassword(envPass) : '',
    dob: '1998-01-01',
    age: 28,
    ageGroup: 'adult',
    gender: 'Male',
    partnerPreference: 'Everyone',
    state: 'Rajasthan',
    district: 'Jaipur',
    bio: 'VibeNexa Platform Administrator',
    photoUrl: '',
    profileColor: 'rose',
    role: 'SUPER_ADMIN',
    isVerified: true,
    isMuted: false,
    isSuspended: false,
    isDeleted: false,
    notificationPrefs: {
      newMatch: true,
      newMessage: true,
      newLike: true,
      adminAnnouncement: true,
    },
    chatWallpapers: {},
    createdAt: now,
    updatedAt: now,
  };
}

function createEmptyDb(): DatabaseSchema {
  return {
    users: [createInitialSuperAdmin()],
    sessions: [],
    posts: [],
    likes: [],
    matches: [],
    chats: [],
    messages: [],
    globalMessages: [],
    globalQuotaEvents: [],
    notifications: [],
    subscriptions: [],
    paymentRequests: [],
    appeals: [],
    reports: [],
    verificationRequests: [],
    supportTickets: [],
    blockedUsers: [],
    adminLogs: [],
    passwordRecoveries: [],
    passwordResetTokens: [],
    media: [],
    appSettings: createDefaultAppSettings(),
  };
}

class VibeNexaStore {
  public db: DatabaseSchema;

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.db = JSON.parse(raw) as DatabaseSchema;
        this.ensureIntegrity();
      } catch {
        this.db = createEmptyDb();
        this.save();
      }
    } else {
      this.db = createEmptyDb();
      this.save();
    }
  }

  private ensureIntegrity() {
    const defaults = createEmptyDb();
    this.db.users = Array.isArray(this.db.users) ? this.db.users : defaults.users;
    this.db.sessions = Array.isArray(this.db.sessions) ? this.db.sessions : [];
    this.db.posts = Array.isArray(this.db.posts) ? this.db.posts : [];
    this.db.likes = Array.isArray(this.db.likes) ? this.db.likes : [];
    this.db.matches = Array.isArray(this.db.matches) ? this.db.matches : [];
    this.db.chats = Array.isArray(this.db.chats) ? this.db.chats : [];
    this.db.messages = Array.isArray(this.db.messages) ? this.db.messages : [];
    this.db.globalMessages = Array.isArray(this.db.globalMessages) ? this.db.globalMessages : [];
    this.db.globalQuotaEvents = Array.isArray(this.db.globalQuotaEvents) ? this.db.globalQuotaEvents : [];
    this.db.notifications = Array.isArray(this.db.notifications) ? this.db.notifications : [];
    this.db.subscriptions = Array.isArray(this.db.subscriptions) ? this.db.subscriptions : [];
    this.db.paymentRequests = Array.isArray(this.db.paymentRequests) ? this.db.paymentRequests : [];
    this.db.appeals = Array.isArray(this.db.appeals) ? this.db.appeals : [];
    this.db.reports = Array.isArray(this.db.reports) ? this.db.reports : [];
    this.db.verificationRequests = Array.isArray(this.db.verificationRequests) ? this.db.verificationRequests : [];
    this.db.supportTickets = Array.isArray(this.db.supportTickets) ? this.db.supportTickets : [];
    this.db.blockedUsers = Array.isArray(this.db.blockedUsers) ? this.db.blockedUsers : [];
    this.db.adminLogs = Array.isArray(this.db.adminLogs) ? this.db.adminLogs : [];
    this.db.passwordRecoveries = Array.isArray(this.db.passwordRecoveries) ? this.db.passwordRecoveries : [];
    this.db.passwordResetTokens = Array.isArray(this.db.passwordResetTokens) ? this.db.passwordResetTokens : [];
    this.db.media = Array.isArray(this.db.media) ? this.db.media : [];
    this.db.appSettings = this.db.appSettings || defaults.appSettings;

    // Ensure the single authorized Super Admin account always exists with both identifiers linked
    let admin = this.db.users.find((u) => u.uid === SUPER_ADMIN_UID);
    if (!admin) {
      admin = createInitialSuperAdmin();
      this.db.users.unshift(admin);
    } else {
      admin.email = SUPER_ADMIN_EMAIL;
      admin.mobile = SUPER_ADMIN_MOBILE;
      admin.role = 'SUPER_ADMIN';
      const envPass = process.env.ADMIN_INITIAL_PASSWORD?.trim();
      if (envPass) {
        admin.passwordHash = hashPassword(envPass);
      }
    }
    this.save();
  }

  public save() {
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2), 'utf8');
    fs.renameSync(tmp, DB_FILE);
  }

  public getActiveSubscription(userId: string) {
    const now = Date.now();
    const active = this.db.subscriptions
      .filter((s) => s.userId === userId && s.status === 'active')
      .sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime())[0];
    if (!active) return null;
    if (new Date(active.expiresAt).getTime() <= now) {
      active.status = 'expired';
      this.save();
      return null;
    }
    const plan = this.db.appSettings.plans.find((p) => p.id === active.planId);
    return {
      ...active,
      features: plan?.features || {
        verifiedBadge: true,
        unlimitedGlobalChat: true,
        mediaSharing: false,
        chatWallpaper: false,
        profileCustomization: true,
      },
    };
  }

  public toPublicProfile(user: StoredUser, onlineSet: Set<string>): PublicProfile {
    const activeSub = this.getActiveSubscription(user.uid);
    const verifiedViaSub = Boolean(activeSub && activeSub.features.verifiedBadge);
    return {
      uid: user.uid,
      username: user.username,
      name: user.name,
      age: user.age,
      ageGroup: user.ageGroup,
      gender: user.gender,
      partnerPreference: user.partnerPreference,
      state: user.state,
      district: user.district,
      bio: user.bio,
      photoUrl: user.photoUrl,
      profileColor: user.profileColor || 'rose',
      isVerified: Boolean(user.isVerified || verifiedViaSub),
      isOnline: onlineSet.has(user.uid),
      createdAt: user.createdAt,
    };
  }

  public isBlockedBetween(uidA: string, uidB: string): boolean {
    return this.db.blockedUsers.some(
      (b) =>
        (b.blockerUid === uidA && b.blockedUid === uidB) ||
        (b.blockerUid === uidB && b.blockedUid === uidA)
    );
  }

  public logAdminAction(adminUid: string, action: string, targetId: string, details: string) {
    const log: AdminLogItem = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      adminUid,
      action,
      targetId,
      details,
      createdAt: new Date().toISOString(),
    };
    this.db.adminLogs.unshift(log);
    if (this.db.adminLogs.length > 1000) {
      this.db.adminLogs = this.db.adminLogs.slice(0, 1000);
    }
    this.save();
  }
}

export const store = new VibeNexaStore();
