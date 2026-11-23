import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { INDIAN_STATES_DISTRICTS } from './src/data/indianLocations.ts';
import {
  AuthUser,
  FeedPost,
  GlobalChatMessage,
  MatchSummary,
  NotificationItem,
  AdminDashboardStats,
} from './src/types/vibenexa.ts';
import {
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_MOBILE,
  SUPER_ADMIN_UID,
  generateId,
  generateSessionToken,
  hashPassword,
  hashToken,
  isSuperAdminIdentifier,
  isValidUsername,
  normalizeEmail,
  normalizeMobile,
  normalizeUsername,
  sanitizeText,
  validateAndComputeDob,
  verifyPassword,
} from './server/security.ts';
import { MEDIA_DIR, StoredUser, store } from './server/store.ts';

interface AuthedRequest extends Request {
  user?: StoredUser;
  tokenHash?: string;
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(express.json({ limit: '4mb' }));

// Track genuine live WebSocket connections per UID
const userSockets = new Map<string, Set<WebSocket>>();

function getOnlineUidSet(): Set<string> {
  const set = new Set<string>();
  for (const [uid, sockets] of userSockets.entries()) {
    if (sockets.size > 0) set.add(uid);
  }
  return set;
}

function sendToUser(uid: string, event: string, payload: unknown) {
  const sockets = userSockets.get(uid);
  if (!sockets) return;
  const serialized = JSON.stringify({ event, payload });
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serialized);
    }
  }
}

function broadcastToAgeGroup(room: 'adult' | 'minor', event: string, payload: unknown) {
  const serialized = JSON.stringify({ event, payload });
  for (const [uid, sockets] of userSockets.entries()) {
    const user = store.db.users.find((u) => u.uid === uid && !u.isSuspended && !u.isDeleted);
    if (!user) continue;
    // Strict age-group room isolation; Super Admin can observe for moderation
    if (user.ageGroup === room || user.role === 'SUPER_ADMIN') {
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(serialized);
        }
      }
    }
  }
}

function createNotification(
  userId: string,
  type: NotificationItem['type'],
  title: string,
  body: string,
  relatedId?: string
) {
  const target = store.db.users.find((u) => u.uid === userId && !u.isDeleted);
  if (!target) return;
  if (type === 'match' && !target.notificationPrefs.newMatch) return;
  if (type === 'message' && !target.notificationPrefs.newMessage) return;
  if (type === 'like' && !target.notificationPrefs.newLike) return;
  if (type === 'announcement' && !target.notificationPrefs.adminAnnouncement) return;

  const item: NotificationItem = {
    id: generateId('ntf'),
    userId,
    type,
    title: sanitizeText(title, 120),
    body: sanitizeText(body, 400),
    isRead: false,
    relatedId,
    createdAt: new Date().toISOString(),
  };
  store.db.notifications.unshift(item);
  store.save();
  sendToUser(userId, 'notification:new', item);
}

function buildAuthUser(user: StoredUser): AuthUser {
  const online = getOnlineUidSet();
  const pub = store.toPublicProfile(user, online);
  const activeSubscription = store.getActiveSubscription(user.uid);
  return {
    ...pub,
    email: user.email,
    mobile: user.mobile,
    dob: user.dob,
    role: user.role,
    isMuted: user.isMuted,
    muteReason: user.muteReason,
    isSuspended: user.isSuspended,
    isDeleted: user.isDeleted,
    deletionScheduledAt: user.deletionScheduledAt,
    notificationPrefs: user.notificationPrefs,
    activeSubscription,
    chatWallpapers: user.chatWallpapers || {},
  };
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length >= 16 ? token : null;
}

function authenticateToken(rawToken: string): { user: StoredUser; tokenHash: string } | null {
  const tokenHash = hashToken(rawToken);
  const session = store.db.sessions.find((s) => s.tokenHash === tokenHash);
  if (!session) return null;
  const user = store.db.users.find((u) => u.uid === session.uid);
  if (!user || user.isDeleted || user.isSuspended) return null;
  session.lastActiveAt = new Date().toISOString();
  return { user, tokenHash };
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const rawToken = getBearerToken(req);
  if (!rawToken) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const authResult = authenticateToken(rawToken);
  if (!authResult) {
    res.status(401).json({ error: 'Session expired or account unavailable.' });
    return;
  }
  req.user = authResult.user;
  req.tokenHash = authResult.tokenHash;
  next();
}

function requireSuperAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.user || req.user.role !== 'SUPER_ADMIN' || req.user.uid !== SUPER_ADMIN_UID) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    next();
  });
}

function findUserByIdentifier(rawIdentifier: string): StoredUser | undefined {
  const trimmed = rawIdentifier.trim();
  if (!trimmed) return undefined;
  const email = normalizeEmail(trimmed);
  if (email) {
    return store.db.users.find((u) => u.email?.toLowerCase() === email);
  }
  const mobile = normalizeMobile(trimmed);
  if (mobile) {
    return store.db.users.find((u) => u.mobile === mobile);
  }
  const username = normalizeUsername(trimmed);
  return store.db.users.find((u) => u.username === username);
}

function getGlobalQuotaStatus(user: StoredUser) {
  const activeSub = store.getActiveSubscription(user.uid);
  const unlimited = Boolean(
    user.role === 'SUPER_ADMIN' || (activeSub && activeSub.features.unlimitedGlobalChat)
  );
  const limit = store.db.appSettings.freeGlobalDailyLimit || 15;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  // Prune old events
  const userEvents = store.db.globalQuotaEvents.filter((e) => e.uid === user.uid && e.ts > cutoff);
  const used = userEvents.length;
  const remaining = unlimited ? null : Math.max(0, limit - used);
  const oldestTs = userEvents.length > 0 ? Math.min(...userEvents.map((e) => e.ts)) : null;
  const resetsAt = oldestTs ? new Date(oldestTs + 24 * 60 * 60 * 1000).toISOString() : null;
  return { unlimited, limit, used, remaining, resetsAt };
}

// ============================================================================
// WEBSOCKET REAL-TIME SERVER
// ============================================================================
wss.on('connection', (ws) => {
  let authedUid: string | null = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.event === 'auth' && typeof msg.token === 'string') {
        const result = authenticateToken(msg.token);
        if (!result) {
          ws.send(JSON.stringify({ event: 'auth:error', payload: { error: 'Invalid session' } }));
          ws.close();
          return;
        }
        authedUid = result.user.uid;
        if (!userSockets.has(authedUid)) {
          userSockets.set(authedUid, new Set());
        }
        userSockets.get(authedUid)!.add(ws);
        ws.send(JSON.stringify({ event: 'auth:ok', payload: { uid: authedUid } }));

        // Mark pending sent messages addressed to this user as 'delivered'
        let changed = false;
        for (const dm of store.db.messages) {
          if (dm.recipientUid === authedUid && dm.status === 'sent') {
            dm.status = 'delivered';
            changed = true;
            sendToUser(dm.senderUid, 'dm:status', {
              chatId: dm.chatId,
              messageIds: [dm.id],
              status: 'delivered',
            });
          }
        }
        if (changed) store.save();
        return;
      }

      if (!authedUid) return;

      // Typing indicator for 1-to-1 Personal Chat
      if (msg.event === 'dm:typing' && msg.payload && typeof msg.payload.chatId === 'string') {
        const chat = store.db.chats.find(
          (c) => c.id === msg.payload.chatId && (c.userA === authedUid || c.userB === authedUid)
        );
        if (!chat) return;
        const recipientUid = chat.userA === authedUid ? chat.userB : chat.userA;
        if (store.isBlockedBetween(authedUid, recipientUid)) return;
        sendToUser(recipientUid, 'dm:typing', {
          chatId: chat.id,
          fromUid: authedUid,
          isTyping: Boolean(msg.payload.isTyping),
        });
      }
    } catch {
      // Ignore malformed WS frames
    }
  });

  ws.on('close', () => {
    if (authedUid && userSockets.has(authedUid)) {
      userSockets.get(authedUid)!.delete(ws);
      if (userSockets.get(authedUid)!.size === 0) {
        userSockets.delete(authedUid);
      }
    }
  });
});

// ============================================================================
// AUTHENTICATION & REGISTRATION ROUTES
// ============================================================================

app.post('/api/auth/check-availability', (req, res) => {
  const username = req.body.username ? normalizeUsername(String(req.body.username)) : '';
  const email = normalizeEmail(req.body.email);
  const mobile = normalizeMobile(req.body.mobile);

  if (username) {
    if (!isValidUsername(username)) {
      res.status(400).json({ error: 'Username must be 3–30 characters using letters, numbers, or underscores.' });
      return;
    }
    if (store.db.users.some((u) => u.username === username)) {
      res.status(409).json({ error: 'This username is already taken.' });
      return;
    }
  }
  if (req.body.email && String(req.body.email).trim() !== '') {
    if (!email) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (store.db.users.some((u) => u.email?.toLowerCase() === email)) {
      res.status(409).json({ error: 'This email address is already registered.' });
      return;
    }
  }
  if (req.body.mobile && String(req.body.mobile).trim() !== '') {
    if (!mobile) {
      res.status(400).json({ error: 'Please enter a valid 10-digit Indian mobile number (or with +91).' });
      return;
    }
    if (store.db.users.some((u) => u.mobile === mobile)) {
      res.status(409).json({ error: 'This mobile number is already registered.' });
      return;
    }
  }
  res.json({ available: true });
});

app.post('/api/auth/signup', (req, res) => {
  const username = normalizeUsername(String(req.body.username || ''));
  const name = sanitizeText(req.body.name, 80);
  const password = String(req.body.password || '');
  const confirmPassword = String(req.body.confirmPassword || '');
  const rawEmail = req.body.email ? String(req.body.email).trim() : '';
  const rawMobile = req.body.mobile ? String(req.body.mobile).trim() : '';
  const day = Number(req.body.dobDay);
  const month = Number(req.body.dobMonth);
  const year = Number(req.body.dobYear);
  const state = sanitizeText(req.body.state, 80);
  const district = sanitizeText(req.body.district, 80);
  const bio = sanitizeText(req.body.bio, 500);
  const gender = req.body.gender as StoredUser['gender'];
  const partnerPreference = req.body.partnerPreference as StoredUser['partnerPreference'];
  const photoUrl = sanitizeText(req.body.photoUrl, 500);

  if (!isValidUsername(username)) {
    res.status(400).json({ error: 'Username must be 3–30 characters (letters, numbers, underscores).' });
    return;
  }
  if (!name || name.length < 2) {
    res.status(400).json({ error: 'Please enter your name (at least 2 characters).' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({ error: 'Passwords do not match.' });
    return;
  }
  if (store.db.users.some((u) => u.username === username)) {
    res.status(409).json({ error: 'Username is already registered.' });
    return;
  }

  let email: string | undefined;
  if (rawEmail) {
    email = normalizeEmail(rawEmail);
    if (!email) {
      res.status(400).json({ error: 'Invalid email address format.' });
      return;
    }
    if (store.db.users.some((u) => u.email?.toLowerCase() === email)) {
      res.status(409).json({ error: 'Email address is already registered.' });
      return;
    }
  }

  let mobile: string | undefined;
  if (rawMobile) {
    mobile = normalizeMobile(rawMobile);
    if (!mobile) {
      res.status(400).json({ error: 'Invalid mobile number format.' });
      return;
    }
    if (store.db.users.some((u) => u.mobile === mobile)) {
      res.status(409).json({ error: 'Mobile number is already registered.' });
      return;
    }
  }

  const dobResult = validateAndComputeDob(day, month, year);
  if (!dobResult.valid) {
    res.status(400).json({ error: dobResult.error });
    return;
  }

  const validDistricts = INDIAN_STATES_DISTRICTS[state];
  if (!validDistricts) {
    res.status(400).json({ error: 'Please select a valid Indian State or Union Territory.' });
    return;
  }
  if (!validDistricts.includes(district)) {
    res.status(400).json({ error: 'Please select a valid District for the selected State.' });
    return;
  }

  if (!['Male', 'Female', 'Prefer not to say'].includes(gender)) {
    res.status(400).json({ error: 'Please select a valid Gender option.' });
    return;
  }
  if (!['Male', 'Female', 'Everyone'].includes(partnerPreference)) {
    res.status(400).json({ error: 'Please select a valid Partner Gender Preference.' });
    return;
  }

  const now = new Date().toISOString();
  const uid = generateId('usr');
  const newUser: StoredUser = {
    uid,
    username,
    name,
    email,
    mobile,
    passwordHash: hashPassword(password),
    dob: dobResult.dob,
    age: dobResult.age,
    ageGroup: dobResult.ageGroup,
    gender,
    partnerPreference,
    state,
    district,
    bio,
    photoUrl: photoUrl.startsWith('/api/media/') ? photoUrl : '',
    profileColor: 'rose',
    role: 'USER', // Strictly USER; never self-assigned SUPER_ADMIN
    isVerified: false,
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

  store.db.users.push(newUser);
  const { rawToken, tokenHash } = generateSessionToken();
  store.db.sessions.push({
    tokenHash,
    uid,
    createdAt: now,
    lastActiveAt: now,
  });
  store.save();

  res.status(201).json({
    token: rawToken,
    user: buildAuthUser(newUser),
  });
});

app.post('/api/auth/login', (req, res) => {
  const identifier = String(req.body.identifier || '').trim();
  const password = String(req.body.password || '');

  if (!identifier || !password) {
    res.status(400).json({ error: 'Please enter your username, email, or mobile number and password.' });
    return;
  }

  const user = findUserByIdentifier(identifier);
  if (!user) {
    res.status(401).json({ error: 'Invalid login credentials.' });
    return;
  }

  if (user.isDeleted) {
    res.status(403).json({ error: 'This account has been deactivated and scheduled for deletion.' });
    return;
  }

  if (user.isSuspended) {
    res.status(403).json({
      error: `This account is currently suspended.${user.suspendReason ? ` Reason: ${user.suspendReason}` : ''}`,
    });
    return;
  }

  // One-time Super Admin first-run activation check (never hardcoded passwords!)
  if (user.uid === SUPER_ADMIN_UID && !user.passwordHash) {
    res.status(428).json({
      requiresAdminClaim: true,
      error: 'Super Admin password has not been initialized yet. Set your password to claim this authorized account.',
    });
    return;
  }

  if (!verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'Invalid login credentials.' });
    return;
  }

  const now = new Date().toISOString();
  const { rawToken, tokenHash } = generateSessionToken();
  store.db.sessions.push({
    tokenHash,
    uid: user.uid,
    createdAt: now,
    lastActiveAt: now,
  });
  store.save();

  res.json({
    token: rawToken,
    user: buildAuthUser(user),
  });
});

/**
 * Atomic one-time Super Admin password claim route.
 * Only works for the authorized Super Admin identifiers when no password hash is configured yet.
 * Permanently locks itself once claimed or whenever ADMIN_INITIAL_PASSWORD is set.
 */
app.post('/api/auth/admin-claim', (req, res) => {
  const identifier = String(req.body.identifier || '').trim();
  const newPassword = String(req.body.newPassword || '');
  const confirmPassword = String(req.body.confirmPassword || '');

  if (!isSuperAdminIdentifier(identifier)) {
    res.status(403).json({ error: 'Unauthorized identifier.' });
    return;
  }
  const admin = store.db.users.find((u) => u.uid === SUPER_ADMIN_UID);
  if (!admin || admin.passwordHash) {
    res.status(409).json({ error: 'Super Admin account is already configured. Please log in with your password.' });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'Admin password must be at least 8 characters long.' });
    return;
  }
  if (newPassword !== confirmPassword) {
    res.status(400).json({ error: 'Passwords do not match.' });
    return;
  }

  admin.passwordHash = hashPassword(newPassword);
  admin.updatedAt = new Date().toISOString();
  const { rawToken, tokenHash } = generateSessionToken();
  const now = new Date().toISOString();
  store.db.sessions.push({ tokenHash, uid: admin.uid, createdAt: now, lastActiveAt: now });
  store.logAdminAction(admin.uid, 'ADMIN_PASSWORD_CLAIMED', admin.uid, 'Initial Super Admin password securely hashed and locked.');
  store.save();

  res.json({
    token: rawToken,
    user: buildAuthUser(admin),
  });
});

app.post('/api/auth/logout', requireAuth, (req: AuthedRequest, res) => {
  if (req.tokenHash) {
    store.db.sessions = store.db.sessions.filter((s) => s.tokenHash !== req.tokenHash);
    store.save();
  }
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
  res.json({
    user: buildAuthUser(req.user!),
    globalQuota: getGlobalQuotaStatus(req.user!),
  });
});

app.post('/api/auth/forgot-password', (req, res) => {
  const identifier = String(req.body.identifier || '').trim();
  if (!identifier) {
    res.status(400).json({ error: 'Enter your registered email, mobile number, or username.' });
    return;
  }
  const user = findUserByIdentifier(identifier);
  if (!user || user.isDeleted) {
    // Avoid exposing non-existence while giving helpful guidance
    res.json({
      mode: 'generic',
      message: 'If an account matches this identifier, recovery instructions have been initiated.',
    });
    return;
  }

  if (user.email) {
    // Email-registered user: Firebase Email Reset supported + secure single-use reset token
    res.json({
      mode: 'email',
      email: user.email,
      message: `A secure password reset link can be sent to ${user.email} via Firebase Authentication.`,
    });
    return;
  }

  if (user.mobile) {
    const existingPending = store.db.passwordRecoveries.find(
      (r) => r.userId === user.uid && r.status === 'pending'
    );
    if (!existingPending) {
      store.db.passwordRecoveries.unshift({
        id: generateId('pwr'),
        userId: user.uid,
        username: user.username,
        mobile: user.mobile,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      store.save();
    }
    res.json({
      mode: 'mobile_admin_review',
      message: 'A secure password recovery request has been submitted for authorized support review. An administrator will issue a one-time reset code (existing passwords are never stored or revealed).',
    });
    return;
  }

  res.json({
    mode: 'username_only',
    message: 'This account has no email or mobile linked. Please contact Help & Support with account ownership details to request a secure reset.',
  });
});

app.post('/api/auth/reset-password-with-code', (req, res) => {
  const identifier = String(req.body.identifier || '').trim();
  const resetCode = String(req.body.resetCode || '').trim().toUpperCase();
  const newPassword = String(req.body.newPassword || '');

  if (!identifier || !resetCode || newPassword.length < 8) {
    res.status(400).json({ error: 'Provide your identifier, reset code, and a new password (min 8 characters).' });
    return;
  }
  const user = findUserByIdentifier(identifier);
  if (!user) {
    res.status(400).json({ error: 'Invalid recovery details.' });
    return;
  }
  const codeHash = hashToken(resetCode);
  const tokenRec = store.db.passwordResetTokens.find(
    (t) =>
      t.userId === user.uid &&
      t.codeHash === codeHash &&
      !t.used &&
      new Date(t.expiresAt).getTime() > Date.now()
  );
  if (!tokenRec) {
    res.status(400).json({ error: 'Invalid or expired reset code.' });
    return;
  }

  tokenRec.used = true;
  user.passwordHash = hashPassword(newPassword);
  user.updatedAt = new Date().toISOString();
  // Revoke existing sessions on password reset
  store.db.sessions = store.db.sessions.filter((s) => s.uid !== user.uid);
  const recovery = store.db.passwordRecoveries.find((r) => r.userId === user.uid && r.status === 'reset_issued');
  if (recovery) {
    recovery.status = 'completed';
    recovery.updatedAt = new Date().toISOString();
  }
  store.save();
  res.json({ ok: true, message: 'Password updated securely. You can now log in with your new password.' });
});

// ============================================================================
// FREE ₹0 MEDIA UPLOAD & ACCESS-CONTROLLED SERVING
// ============================================================================
const ALLOWED_MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function verifyImageMagicBytes(buf: Buffer, mime: string): boolean {
  if (buf.length < 12) return false;
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (mime === 'image/webp') {
    return buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

app.post('/api/media/upload', (req: AuthedRequest, res) => {
  // Allow authenticated users OR signup profile photo upload (public only during signup)
  const rawToken = getBearerToken(req);
  const authed = rawToken ? authenticateToken(rawToken) : null;
  const visibility = req.body.visibility === 'private' ? 'private' : 'public';

  if (visibility === 'private' && !authed) {
    res.status(401).json({ error: 'Sign in required for private media uploads.' });
    return;
  }

  const dataUrl = String(req.body.dataUrl || '');
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    res.status(400).json({ error: 'Only JPEG, PNG, or WebP images are supported.' });
    return;
  }

  const mimeType = match[1];
  const ext = ALLOWED_MIME_EXT[mimeType];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 2 * 1024 * 1024) {
    res.status(413).json({ error: 'Image exceeds free-tier 2MB limit. Please select a smaller image.' });
    return;
  }
  if (!verifyImageMagicBytes(buffer, mimeType)) {
    res.status(400).json({ error: 'File contents do not match a valid image format.' });
    return;
  }

  const id = generateId('med');
  const filename = `${id}${ext}`;
  const resolvedPath = path.resolve(MEDIA_DIR, filename);
  if (!resolvedPath.startsWith(MEDIA_DIR + path.sep)) {
    res.status(400).json({ error: 'Invalid path.' });
    return;
  }

  fs.writeFileSync(resolvedPath, buffer);
  store.db.media.push({
    id,
    ownerUid: authed?.user.uid || 'signup_pending',
    filename,
    mimeType,
    visibility,
    createdAt: new Date().toISOString(),
  });
  store.save();

  res.status(201).json({
    id,
    url: `/api/media/${id}`,
    visibility,
  });
});

app.get('/api/media/:id', (req, res) => {
  const id = sanitizeText(req.params.id, 64);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    res.status(400).json({ error: 'Invalid media ID.' });
    return;
  }
  const media = store.db.media.find((m) => m.id === id);
  if (!media) {
    res.status(404).json({ error: 'Media not found.' });
    return;
  }

  if (media.visibility === 'private') {
    const rawToken = getBearerToken(req);
    const authed = rawToken ? authenticateToken(rawToken) : null;
    if (
      !authed ||
      (authed.user.uid !== media.ownerUid && authed.user.role !== 'SUPER_ADMIN')
    ) {
      res.status(403).json({ error: 'Private document access denied.' });
      return;
    }
  }

  const resolvedPath = path.resolve(MEDIA_DIR, media.filename);
  if (!resolvedPath.startsWith(MEDIA_DIR + path.sep) || !fs.existsSync(resolvedPath)) {
    res.status(404).json({ error: 'Media file missing.' });
    return;
  }

  res.setHeader('Content-Type', media.mimeType);
  res.setHeader('Cache-Control', media.visibility === 'private' ? 'private, no-store' : 'public, max-age=86400');
  res.sendFile(resolvedPath);
});

// ============================================================================
// USER PROFILE & SETTINGS ROUTES
// ============================================================================
app.put('/api/profile', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const name = sanitizeText(req.body.name, 80);
  const bio = sanitizeText(req.body.bio, 500);
  const state = sanitizeText(req.body.state, 80);
  const district = sanitizeText(req.body.district, 80);
  const photoUrl = req.body.photoUrl !== undefined ? sanitizeText(req.body.photoUrl, 500) : user.photoUrl;
  const gender = req.body.gender as StoredUser['gender'] | undefined;
  const partnerPreference = req.body.partnerPreference as StoredUser['partnerPreference'] | undefined;

  if (name && name.length >= 2) user.name = name;
  user.bio = bio;

  if (state && district) {
    const validDistricts = INDIAN_STATES_DISTRICTS[state];
    if (!validDistricts || !validDistricts.includes(district)) {
      res.status(400).json({ error: 'Please select a valid Indian State and District.' });
      return;
    }
    user.state = state;
    user.district = district;
  }

  if (photoUrl === '' || photoUrl.startsWith('/api/media/')) {
    user.photoUrl = photoUrl;
  }
  if (gender && ['Male', 'Female', 'Prefer not to say'].includes(gender)) {
    user.gender = gender;
  }
  if (partnerPreference && ['Male', 'Female', 'Everyone'].includes(partnerPreference)) {
    user.partnerPreference = partnerPreference;
  }
  user.updatedAt = new Date().toISOString();
  store.save();
  res.json({ user: buildAuthUser(user) });
});

app.put('/api/profile/color', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const colorId = sanitizeText(req.body.profileColor, 32);
  const allowed = ['rose', 'crimson', 'blush', 'coral', 'berry', 'wine'];
  if (!allowed.includes(colorId)) {
    res.status(400).json({ error: 'Invalid profile color selection.' });
    return;
  }
  const activeSub = store.getActiveSubscription(user.uid);
  if (
    !store.db.appSettings.profileColorFreeForAll &&
    user.role !== 'SUPER_ADMIN' &&
    !(activeSub && activeSub.features.profileCustomization)
  ) {
    res.status(403).json({ error: 'Profile color customization requires an active eligible subscription plan.' });
    return;
  }
  user.profileColor = colorId;
  user.updatedAt = new Date().toISOString();
  store.save();
  res.json({ user: buildAuthUser(user) });
});

app.put('/api/profile/notifications-prefs', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  user.notificationPrefs = {
    newMatch: Boolean(req.body.newMatch),
    newMessage: Boolean(req.body.newMessage),
    newLike: Boolean(req.body.newLike),
    adminAnnouncement: Boolean(req.body.adminAnnouncement),
  };
  user.updatedAt = new Date().toISOString();
  store.save();
  res.json({ notificationPrefs: user.notificationPrefs });
});

app.put('/api/profile/chat-wallpaper', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const chatId = sanitizeText(req.body.chatId, 64);
  const wallpaperUrl = req.body.wallpaperUrl ? sanitizeText(req.body.wallpaperUrl, 500) : '';

  const activeSub = store.getActiveSubscription(user.uid);
  const canUseWallpaper = Boolean(
    user.role === 'SUPER_ADMIN' || (activeSub && activeSub.features.chatWallpaper)
  );
  if (wallpaperUrl && !canUseWallpaper) {
    res.status(403).json({
      requiresUpgrade: true,
      error: 'Custom Chat Wallpaper is a Premium feature. Upgrade your plan to unlock personal chat themes.',
    });
    return;
  }
  if (!user.chatWallpapers) user.chatWallpapers = {};
  if (!wallpaperUrl) {
    delete user.chatWallpapers[chatId];
  } else if (wallpaperUrl.startsWith('/api/media/')) {
    user.chatWallpapers[chatId] = wallpaperUrl;
  } else {
    res.status(400).json({ error: 'Invalid wallpaper media URL.' });
    return;
  }
  user.updatedAt = new Date().toISOString();
  store.save();
  res.json({ chatWallpapers: user.chatWallpapers });
});

app.post('/api/profile/delete-account', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  if (user.uid === SUPER_ADMIN_UID) {
    res.status(400).json({ error: 'Primary Super Admin account cannot be self-deleted.' });
    return;
  }
  const now = new Date();
  user.isDeleted = true;
  user.deletionScheduledAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  user.updatedAt = now.toISOString();
  // Immediately invalidate all active sessions
  store.db.sessions = store.db.sessions.filter((s) => s.uid !== user.uid);
  store.save();
  res.json({
    ok: true,
    message:
      'Your account has been immediately disabled and scheduled for permanent deletion within 24 hours. Minimal safety and payment audit logs may be retained only as required by applicable Indian law.',
  });
});

app.get('/api/profile/:uid', requireAuth, (req: AuthedRequest, res) => {
  const viewer = req.user!;
  const targetUid = sanitizeText(req.params.uid, 64);
  const target = store.db.users.find((u) => u.uid === targetUid && !u.isDeleted);
  if (!target) {
    res.status(404).json({ error: 'Profile not found.' });
    return;
  }
  if (viewer.uid !== target.uid && viewer.role !== 'SUPER_ADMIN') {
    if (target.isSuspended) {
      res.status(404).json({ error: 'Profile unavailable.' });
      return;
    }
    if (viewer.ageGroup !== target.ageGroup) {
      res.status(403).json({ error: 'Access restricted due to age-safety separation.' });
      return;
    }
    if (store.isBlockedBetween(viewer.uid, target.uid)) {
      res.status(403).json({ error: 'Profile unavailable.' });
      return;
    }
  }

  const online = getOnlineUidSet();
  const profile = store.toPublicProfile(target, online);
  const likedByMe = store.db.likes.some((l) => l.fromUid === viewer.uid && l.toUid === target.uid);
  const match = store.db.matches.find(
    (m) =>
      (m.userA === viewer.uid && m.userB === target.uid) ||
      (m.userB === viewer.uid && m.userA === target.uid)
  );
  const posts = store.db.posts
    .filter((p) => p.authorUid === target.uid)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((p) => hydratePost(p, viewer.uid));

  res.json({
    profile,
    likedByMe,
    isMatched: Boolean(match),
    chatId: match?.chatId || null,
    posts,
  });
});

// Profile Verification
app.get('/api/profile-verification', requireAuth, (req: AuthedRequest, res) => {
  const requests = store.db.verificationRequests
    .filter((v) => v.userId === req.user!.uid)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ requests });
});

app.post('/api/profile-verification', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const pending = store.db.verificationRequests.find(
    (v) => v.userId === user.uid && v.status === 'pending'
  );
  if (pending) {
    res.status(409).json({ error: 'You already have a pending verification request under review.' });
    return;
  }
  const challengeCode = sanitizeText(req.body.challengeCode, 32) || `VN-${Math.floor(1000 + Math.random() * 9000)}`;
  const note = sanitizeText(req.body.note, 300);
  const proofMediaUrl = sanitizeText(req.body.proofMediaUrl, 500);

  if (!proofMediaUrl.startsWith('/api/media/')) {
    res.status(400).json({ error: 'Please upload a verification selfie matching the pose/code instructions.' });
    return;
  }

  const item = {
    id: generateId('ver'),
    userId: user.uid,
    username: user.username,
    userName: user.name,
    userPhotoUrl: user.photoUrl,
    challengeCode,
    note,
    proofMediaUrl,
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
  };
  store.db.verificationRequests.unshift(item);
  store.save();
  res.status(201).json({ request: item });
});

// ============================================================================
// HOME FEED ROUTES
// ============================================================================
function hydratePost(p: (typeof store.db.posts)[number], viewerUid: string): FeedPost {
  const author = store.db.users.find((u) => u.uid === p.authorUid);
  const online = getOnlineUidSet();
  const authorPub = author ? store.toPublicProfile(author, online) : null;
  return {
    id: p.id,
    authorUid: p.authorUid,
    authorName: authorPub?.name || 'VibeNexa Member',
    authorUsername: authorPub?.username || 'member',
    authorPhotoUrl: authorPub?.photoUrl || '',
    authorVerified: Boolean(authorPub?.isVerified),
    ageGroup: p.ageGroup,
    caption: p.caption,
    imageUrl: p.imageUrl,
    likedByMe: p.likedBy.includes(viewerUid),
    likesCount: p.likedBy.length,
    comments: p.comments.map((c) => {
      const ca = store.db.users.find((u) => u.uid === c.authorUid);
      const caPub = ca ? store.toPublicProfile(ca, online) : null;
      return {
        id: c.id,
        authorUid: c.authorUid,
        authorName: caPub?.name || 'Member',
        authorUsername: caPub?.username || 'member',
        authorPhotoUrl: caPub?.photoUrl || '',
        authorVerified: Boolean(caPub?.isVerified),
        text: c.text,
        createdAt: c.createdAt,
      };
    }),
    createdAt: p.createdAt,
  };
}

app.get('/api/posts', requireAuth, (req: AuthedRequest, res) => {
  const viewer = req.user!;
  const posts = store.db.posts
    .filter((p) => {
      const author = store.db.users.find((u) => u.uid === p.authorUid);
      if (!author || author.isDeleted || author.isSuspended) return false;
      if (viewer.role !== 'SUPER_ADMIN' && p.ageGroup !== viewer.ageGroup) return false;
      if (store.isBlockedBetween(viewer.uid, p.authorUid)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 60)
    .map((p) => hydratePost(p, viewer.uid));

  res.json({ posts });
});

app.post('/api/posts', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const caption = sanitizeText(req.body.caption, 1000);
  const imageUrl = req.body.imageUrl ? sanitizeText(req.body.imageUrl, 500) : '';

  if (!caption && !imageUrl) {
    res.status(400).json({ error: 'Write a caption or attach a photo to publish a post.' });
    return;
  }
  if (imageUrl && !imageUrl.startsWith('/api/media/')) {
    res.status(400).json({ error: 'Invalid post image URL.' });
    return;
  }

  const post = {
    id: generateId('pst'),
    authorUid: user.uid,
    ageGroup: user.ageGroup,
    caption,
    imageUrl: imageUrl || undefined,
    likedBy: [],
    comments: [],
    createdAt: new Date().toISOString(),
  };
  store.db.posts.unshift(post);
  store.save();
  res.status(201).json({ post: hydratePost(post, user.uid) });
});

app.post('/api/posts/:id/like', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const post = store.db.posts.find((p) => p.id === req.params.id);
  if (!post) {
    res.status(404).json({ error: 'Post not found.' });
    return;
  }
  if (user.role !== 'SUPER_ADMIN' && post.ageGroup !== user.ageGroup) {
    res.status(403).json({ error: 'Age separation restriction.' });
    return;
  }
  const idx = post.likedBy.indexOf(user.uid);
  if (idx >= 0) {
    post.likedBy.splice(idx, 1);
  } else {
    post.likedBy.push(user.uid);
    if (post.authorUid !== user.uid) {
      createNotification(
        post.authorUid,
        'like',
        'New Post Like',
        `${user.name} liked your post.`,
        post.id
      );
    }
  }
  store.save();
  res.json({ post: hydratePost(post, user.uid) });
});

app.post('/api/posts/:id/comments', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const text = sanitizeText(req.body.text, 500);
  if (!text) {
    res.status(400).json({ error: 'Comment cannot be empty.' });
    return;
  }
  const post = store.db.posts.find((p) => p.id === req.params.id);
  if (!post) {
    res.status(404).json({ error: 'Post not found.' });
    return;
  }
  if (user.role !== 'SUPER_ADMIN' && post.ageGroup !== user.ageGroup) {
    res.status(403).json({ error: 'Age separation restriction.' });
    return;
  }
  post.comments.push({
    id: generateId('cmt'),
    authorUid: user.uid,
    text,
    createdAt: new Date().toISOString(),
  });
  store.save();
  if (post.authorUid !== user.uid) {
    createNotification(
      post.authorUid,
      'system',
      'New Comment',
      `${user.name} commented on your post: "${text.slice(0, 60)}"`,
      post.id
    );
  }
  res.status(201).json({ post: hydratePost(post, user.uid) });
});

app.delete('/api/posts/:id', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const idx = store.db.posts.findIndex((p) => p.id === req.params.id);
  if (idx < 0) {
    res.status(404).json({ error: 'Post not found.' });
    return;
  }
  const post = store.db.posts[idx];
  if (post.authorUid !== user.uid && user.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'You can only delete your own posts.' });
    return;
  }
  store.db.posts.splice(idx, 1);
  store.save();
  res.json({ ok: true });
});

// ============================================================================
// DISCOVER, LIKES & MATCHES (STRICT 18+ ADULT SEPARATION)
// ============================================================================
app.get('/api/discover', requireAuth, (req: AuthedRequest, res) => {
  const viewer = req.user!;
  if (viewer.ageGroup !== 'adult') {
    res.status(403).json({
      ageRestricted: true,
      error: 'Adult dating discovery is strictly restricted to eligible users aged 18 or older.',
    });
    return;
  }

  const minAge = Math.max(18, Number(req.query.minAge) || 18);
  const maxAge = Math.min(99, Number(req.query.maxAge) || 60);
  const gender = String(req.query.gender || 'All');
  const state = String(req.query.state || '');
  const district = String(req.query.district || '');

  const online = getOnlineUidSet();
  const likedSet = new Set(
    store.db.likes.filter((l) => l.fromUid === viewer.uid).map((l) => l.toUid)
  );

  const profiles = store.db.users
    .filter((u) => {
      if (u.uid === viewer.uid) return false;
      if (u.isDeleted || u.isSuspended) return false;
      if (u.ageGroup !== 'adult' || u.age < 18) return false; // Mandatory backend age safety
      if (store.isBlockedBetween(viewer.uid, u.uid)) return false;
      if (u.age < minAge || u.age > maxAge) return false;
      if (gender !== 'All' && u.gender !== gender) return false;
      if (state && u.state !== state) return false;
      if (district && u.district !== district) return false;
      return true;
    })
    .map((u) => ({
      ...store.toPublicProfile(u, online),
      likedByMe: likedSet.has(u.uid),
    }));

  res.json({ profiles });
});

app.post('/api/likes/:targetUid', requireAuth, (req: AuthedRequest, res) => {
  const viewer = req.user!;
  const targetUid = sanitizeText(req.params.targetUid, 64);

  if (viewer.ageGroup !== 'adult') {
    res.status(403).json({ error: 'Dating likes and matching are restricted to eligible adults aged 18+.' });
    return;
  }
  if (viewer.uid === targetUid) {
    res.status(400).json({ error: 'Cannot like your own profile.' });
    return;
  }
  const target = store.db.users.find((u) => u.uid === targetUid && !u.isDeleted && !u.isSuspended);
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  if (target.ageGroup !== 'adult' || target.age < 18) {
    res.status(403).json({ error: 'Adult-minor interactions are strictly prohibited.' });
    return;
  }
  if (store.isBlockedBetween(viewer.uid, target.uid)) {
    res.status(403).json({ error: 'Action unavailable.' });
    return;
  }

  const already = store.db.likes.find((l) => l.fromUid === viewer.uid && l.toUid === target.uid);
  if (!already) {
    store.db.likes.push({
      id: generateId('lik'),
      fromUid: viewer.uid,
      toUid: target.uid,
      createdAt: new Date().toISOString(),
    });
  }

  // Check for mutual like -> Match!
  const reciprocal = store.db.likes.find((l) => l.fromUid === target.uid && l.toUid === viewer.uid);
  let matched = false;
  let chatId: string | null = null;

  if (reciprocal) {
    let existingMatch = store.db.matches.find(
      (m) =>
        (m.userA === viewer.uid && m.userB === target.uid) ||
        (m.userB === viewer.uid && m.userA === target.uid)
    );
    if (!existingMatch) {
      const now = new Date().toISOString();
      chatId = generateId('cht');
      existingMatch = {
        id: generateId('mtc'),
        userA: viewer.uid,
        userB: target.uid,
        chatId,
        createdAt: now,
      };
      store.db.matches.unshift(existingMatch);
      store.db.chats.unshift({
        id: chatId,
        userA: viewer.uid,
        userB: target.uid,
        createdAt: now,
      });
      createNotification(target.uid, 'match', "It's a Match!", `You and ${viewer.name} liked each other!`, chatId);
      createNotification(viewer.uid, 'match', "It's a Match!", `You and ${target.name} liked each other!`, chatId);
    } else {
      chatId = existingMatch.chatId;
    }
    matched = true;
  } else if (!already) {
    createNotification(target.uid, 'like', 'Someone Liked You', `${viewer.name} liked your profile.`, viewer.uid);
  }

  store.save();
  res.json({ liked: true, matched, chatId });
});

app.get('/api/likes-matches', requireAuth, (req: AuthedRequest, res) => {
  const viewer = req.user!;
  if (viewer.ageGroup !== 'adult') {
    res.status(403).json({
      ageRestricted: true,
      error: 'Likes and dating matches are strictly restricted to eligible adults aged 18+.',
    });
    return;
  }

  const online = getOnlineUidSet();
  const matches: MatchSummary[] = store.db.matches
    .filter((m) => m.userA === viewer.uid || m.userB === viewer.uid)
    .map((m) => {
      const partnerUid = m.userA === viewer.uid ? m.userB : m.userA;
      const partnerUser = store.db.users.find((u) => u.uid === partnerUid && !u.isDeleted && !u.isSuspended && u.ageGroup === 'adult');
      if (!partnerUser || store.isBlockedBetween(viewer.uid, partnerUid)) return null;
      const chat = store.db.chats.find((c) => c.id === m.chatId);
      const unreadCount = store.db.messages.filter(
        (dm) => dm.chatId === m.chatId && dm.recipientUid === viewer.uid && dm.status !== 'seen'
      ).length;
      return {
        id: m.id,
        chatId: m.chatId,
        matchedAt: m.createdAt,
        partner: store.toPublicProfile(partnerUser, online),
        lastMessageText: chat?.lastMessageText,
        lastMessageAt: chat?.lastMessageAt,
        unreadCount,
      };
    })
    .filter(Boolean) as MatchSummary[];

  const matchedUids = new Set(matches.map((m) => m.partner.uid));

  const likedMe = store.db.likes
    .filter((l) => l.toUid === viewer.uid && !matchedUids.has(l.fromUid))
    .map((l) => {
      const u = store.db.users.find((x) => x.uid === l.fromUid && !x.isDeleted && !x.isSuspended && x.ageGroup === 'adult');
      if (!u || store.isBlockedBetween(viewer.uid, u.uid)) return null;
      return { likedAt: l.createdAt, profile: store.toPublicProfile(u, online) };
    })
    .filter(Boolean);

  const iLiked = store.db.likes
    .filter((l) => l.fromUid === viewer.uid && !matchedUids.has(l.toUid))
    .map((l) => {
      const u = store.db.users.find((x) => x.uid === l.toUid && !x.isDeleted && !x.isSuspended && x.ageGroup === 'adult');
      if (!u || store.isBlockedBetween(viewer.uid, u.uid)) return null;
      return { likedAt: l.createdAt, profile: store.toPublicProfile(u, online) };
    })
    .filter(Boolean);

  res.json({ likedMe, iLiked, matches });
});

// ============================================================================
// REAL-TIME GLOBAL CHAT (AGE-SEGREGATED + ROLLING 24H BACKEND LIMIT)
// ============================================================================
function hydrateGlobalMessage(m: (typeof store.db.globalMessages)[number]): GlobalChatMessage {
  const sender = store.db.users.find((u) => u.uid === m.senderUid);
  const online = getOnlineUidSet();
  const pub = sender ? store.toPublicProfile(sender, online) : null;
  let replyTo: GlobalChatMessage['replyTo'] = null;
  if (m.replyToId) {
    const parent = store.db.globalMessages.find((x) => x.id === m.replyToId);
    if (parent) {
      const ps = store.db.users.find((u) => u.uid === parent.senderUid);
      replyTo = {
        id: parent.id,
        senderName: ps?.name || 'Member',
        text: parent.text || (parent.mediaUrl ? '[Media]' : ''),
      };
    }
  }
  return {
    id: m.id,
    room: m.room,
    senderUid: m.senderUid,
    senderName: pub?.name || 'Member',
    senderUsername: pub?.username || 'member',
    senderPhotoUrl: pub?.photoUrl || '',
    senderVerified: Boolean(pub?.isVerified),
    text: m.text,
    mediaUrl: m.mediaUrl,
    replyTo,
    reactions: m.reactions || {},
    createdAt: m.createdAt,
  };
}

app.get('/api/global-chat', requireAuth, (req: AuthedRequest, res) => {
  const viewer = req.user!;
  const room = viewer.ageGroup; // Strict backend room assignment!
  const messages = store.db.globalMessages
    .filter((m) => m.room === room && !store.isBlockedBetween(viewer.uid, m.senderUid))
    .slice(-100)
    .map(hydrateGlobalMessage);

  res.json({
    room,
    messages,
    quota: getGlobalQuotaStatus(viewer),
  });
});

app.post('/api/global-chat', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  if (user.isMuted) {
    res.status(403).json({
      muted: true,
      error: 'Your account is currently muted from Global and Personal Chat. You may submit a ₹19 Mute Appeal or contact free support.',
    });
    return;
  }

  const text = sanitizeText(req.body.text, 1000);
  const mediaUrl = req.body.mediaUrl ? sanitizeText(req.body.mediaUrl, 500) : '';
  const replyToId = req.body.replyToId ? sanitizeText(req.body.replyToId, 64) : undefined;

  if (!text && !mediaUrl) {
    res.status(400).json({ error: 'Message cannot be empty.' });
    return;
  }

  const activeSub = store.getActiveSubscription(user.uid);
  const canShareMedia = Boolean(
    user.role === 'SUPER_ADMIN' || (activeSub && activeSub.features.mediaSharing)
  );
  if (mediaUrl) {
    if (!canShareMedia) {
      res.status(403).json({
        requiresUpgrade: true,
        error: 'Media sharing in Global Chat is available on eligible Premium plans.',
      });
      return;
    }
    if (!mediaUrl.startsWith('/api/media/')) {
      res.status(400).json({ error: 'Invalid media attachment.' });
      return;
    }
  }

  // Rolling 24-hour backend rate limit for free users
  const quota = getGlobalQuotaStatus(user);
  if (!quota.unlimited && quota.remaining !== null && quota.remaining <= 0) {
    res.status(429).json({
      quotaExceeded: true,
      quota,
      error: `Free accounts are limited to ${quota.limit} Global Chat messages per rolling 24 hours. Upgrade to Premium for unlimited messaging.`,
    });
    return;
  }

  const msg = {
    id: generateId('gmsg'),
    room: user.ageGroup,
    senderUid: user.uid,
    text,
    mediaUrl: mediaUrl || undefined,
    replyToId,
    reactions: {},
    createdAt: new Date().toISOString(),
  };
  store.db.globalMessages.push(msg);
  if (store.db.globalMessages.length > 500) {
    store.db.globalMessages = store.db.globalMessages.slice(-500);
  }
  store.db.globalQuotaEvents.push({ uid: user.uid, ts: Date.now() });
  // Prune stale quota events older than 24h
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  store.db.globalQuotaEvents = store.db.globalQuotaEvents.filter((e) => e.ts > cutoff);
  store.save();

  const hydrated = hydrateGlobalMessage(msg);
  broadcastToAgeGroup(user.ageGroup, 'global:message', hydrated);

  res.status(201).json({
    message: hydrated,
    quota: getGlobalQuotaStatus(user),
  });
});

app.post('/api/global-chat/:id/react', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const emoji = sanitizeText(req.body.emoji, 8);
  const allowedEmojis = ['❤️', '😂', '🔥', '👍', '😍', '👏'];
  if (!allowedEmojis.includes(emoji)) {
    res.status(400).json({ error: 'Unsupported emoji reaction.' });
    return;
  }
  const msg = store.db.globalMessages.find((m) => m.id === req.params.id);
  if (!msg) {
    res.status(404).json({ error: 'Message not found.' });
    return;
  }
  if (user.role !== 'SUPER_ADMIN' && msg.room !== user.ageGroup) {
    res.status(403).json({ error: 'Age separation restriction.' });
    return;
  }
  if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
  const idx = msg.reactions[emoji].indexOf(user.uid);
  if (idx >= 0) {
    msg.reactions[emoji].splice(idx, 1);
    if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
  } else {
    msg.reactions[emoji].push(user.uid);
  }
  store.save();
  const hydrated = hydrateGlobalMessage(msg);
  broadcastToAgeGroup(msg.room, 'global:reaction', hydrated);
  res.json({ message: hydrated });
});

// ============================================================================
// REAL-TIME PERSONAL 1-TO-1 CHAT (ELIGIBLE MATCHED ADULTS ONLY)
// ============================================================================
app.get('/api/chats', requireAuth, (req: AuthedRequest, res) => {
  const viewer = req.user!;
  if (viewer.ageGroup !== 'adult') {
    res.status(403).json({
      ageRestricted: true,
      error: 'Personal 1-to-1 dating chat is strictly restricted to eligible adults aged 18+.',
    });
    return;
  }
  const online = getOnlineUidSet();
  const chats = store.db.chats
    .filter((c) => c.userA === viewer.uid || c.userB === viewer.uid)
    .map((c) => {
      const partnerUid = c.userA === viewer.uid ? c.userB : c.userA;
      const partner = store.db.users.find((u) => u.uid === partnerUid && !u.isDeleted && !u.isSuspended && u.ageGroup === 'adult');
      if (!partner || store.isBlockedBetween(viewer.uid, partnerUid)) return null;
      const unreadCount = store.db.messages.filter(
        (m) => m.chatId === c.id && m.recipientUid === viewer.uid && m.status !== 'seen'
      ).length;
      return {
        chatId: c.id,
        partner: store.toPublicProfile(partner, online),
        lastMessageText: c.lastMessageText || 'Say hello to your new match',
        lastMessageAt: c.lastMessageAt || c.createdAt,
        unreadCount,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b!.lastMessageAt).getTime() - new Date(a!.lastMessageAt).getTime());

  res.json({ chats });
});

app.get('/api/chats/:chatId/messages', requireAuth, (req: AuthedRequest, res) => {
  const viewer = req.user!;
  if (viewer.ageGroup !== 'adult') {
    res.status(403).json({ error: 'Personal chat is restricted to adults aged 18+.' });
    return;
  }
  const chat = store.db.chats.find(
    (c) => c.id === req.params.chatId && (c.userA === viewer.uid || c.userB === viewer.uid)
  );
  if (!chat) {
    res.status(404).json({ error: 'Chat not found or unauthorized.' });
    return;
  }
  const partnerUid = chat.userA === viewer.uid ? chat.userB : chat.userA;
  if (store.isBlockedBetween(viewer.uid, partnerUid)) {
    res.status(403).json({ error: 'This conversation is unavailable due to a block.' });
    return;
  }

  const chatMsgs = store.db.messages.filter((m) => m.chatId === chat.id);
  const messages = chatMsgs.map((m) => {
    let replyTo = null;
    if (m.replyToId) {
      const ref = chatMsgs.find((x) => x.id === m.replyToId);
      if (ref) {
        const refUser = store.db.users.find((u) => u.uid === ref.senderUid);
        replyTo = {
          id: ref.id,
          senderName: refUser?.name || 'Member',
          text: ref.text,
        };
      }
    }
    return {
      id: m.id,
      chatId: m.chatId,
      senderUid: m.senderUid,
      recipientUid: m.recipientUid,
      text: m.text,
      replyTo,
      status: m.status,
      createdAt: m.createdAt,
    };
  });

  res.json({
    chatId: chat.id,
    messages,
    wallpaperUrl: viewer.chatWallpapers?.[chat.id] || '',
  });
});

app.post('/api/chats/:chatId/messages', requireAuth, (req: AuthedRequest, res) => {
  const sender = req.user!;
  if (sender.ageGroup !== 'adult') {
    res.status(403).json({ error: 'Personal chat is restricted to adults aged 18+.' });
    return;
  }
  if (sender.isMuted) {
    res.status(403).json({
      muted: true,
      error: 'Muted accounts cannot send Personal Chat messages. Submit an appeal or contact support.',
    });
    return;
  }
  const chat = store.db.chats.find(
    (c) => c.id === req.params.chatId && (c.userA === sender.uid || c.userB === sender.uid)
  );
  if (!chat) {
    res.status(404).json({ error: 'Chat not found or unauthorized.' });
    return;
  }
  const recipientUid = chat.userA === sender.uid ? chat.userB : chat.userA;
  const recipient = store.db.users.find((u) => u.uid === recipientUid && !u.isDeleted && !u.isSuspended && u.ageGroup === 'adult');
  if (!recipient || store.isBlockedBetween(sender.uid, recipientUid)) {
    res.status(403).json({ error: 'Recipient unavailable.' });
    return;
  }

  const text = sanitizeText(req.body.text, 2000);
  const replyToId = req.body.replyToId ? sanitizeText(req.body.replyToId, 64) : undefined;
  if (!text) {
    res.status(400).json({ error: 'Message text cannot be empty.' });
    return;
  }

  const recipientOnline = getOnlineUidSet().has(recipientUid);
  const now = new Date().toISOString();
  const dm = {
    id: generateId('dm'),
    chatId: chat.id,
    senderUid: sender.uid,
    recipientUid,
    text,
    replyToId,
    status: (recipientOnline ? 'delivered' : 'sent') as 'sent' | 'delivered',
    createdAt: now,
  };
  store.db.messages.push(dm);
  chat.lastMessageText = text.slice(0, 120);
  chat.lastMessageAt = now;
  store.save();

  let replyTo = null;
  if (replyToId) {
    const ref = store.db.messages.find((x) => x.id === replyToId && x.chatId === chat.id);
    if (ref) {
      const refUser = store.db.users.find((u) => u.uid === ref.senderUid);
      replyTo = { id: ref.id, senderName: refUser?.name || 'Member', text: ref.text };
    }
  }
  const payload = { ...dm, replyTo };

  sendToUser(recipientUid, 'dm:message', payload);
  sendToUser(sender.uid, 'dm:message', payload);
  createNotification(recipientUid, 'message', `New message from ${sender.name}`, text.slice(0, 80), chat.id);

  res.status(201).json({ message: payload });
});

app.post('/api/chats/:chatId/seen', requireAuth, (req: AuthedRequest, res) => {
  const viewer = req.user!;
  const chat = store.db.chats.find(
    (c) => c.id === req.params.chatId && (c.userA === viewer.uid || c.userB === viewer.uid)
  );
  if (!chat) {
    res.status(404).json({ error: 'Chat not found.' });
    return;
  }
  const updatedIds: string[] = [];
  for (const m of store.db.messages) {
    if (m.chatId === chat.id && m.recipientUid === viewer.uid && m.status !== 'seen') {
      m.status = 'seen';
      updatedIds.push(m.id);
    }
  }
  if (updatedIds.length > 0) {
    store.save();
    const senderUid = chat.userA === viewer.uid ? chat.userB : chat.userA;
    sendToUser(senderUid, 'dm:status', {
      chatId: chat.id,
      messageIds: updatedIds,
      status: 'seen',
    });
  }
  res.json({ seenCount: updatedIds.length });
});

// ============================================================================
// SAFETY: BLOCK, REPORT CENTER, HELP & SUPPORT, MUTE APPEALS
// ============================================================================
app.post('/api/block/:targetUid', requireAuth, (req: AuthedRequest, res) => {
  const viewer = req.user!;
  const targetUid = sanitizeText(req.params.targetUid, 64);
  if (viewer.uid === targetUid) {
    res.status(400).json({ error: 'Cannot block yourself.' });
    return;
  }
  const exists = store.db.blockedUsers.some(
    (b) => b.blockerUid === viewer.uid && b.blockedUid === targetUid
  );
  if (!exists) {
    store.db.blockedUsers.unshift({
      id: generateId('blk'),
      blockerUid: viewer.uid,
      blockedUid: targetUid,
      createdAt: new Date().toISOString(),
    });
    store.save();
  }
  res.json({ blocked: true });
});

app.delete('/api/block/:targetUid', requireAuth, (req: AuthedRequest, res) => {
  const viewer = req.user!;
  const targetUid = sanitizeText(req.params.targetUid, 64);
  store.db.blockedUsers = store.db.blockedUsers.filter(
    (b) => !(b.blockerUid === viewer.uid && b.blockedUid === targetUid)
  );
  store.save();
  res.json({ blocked: false });
});

app.get('/api/blocked', requireAuth, (req: AuthedRequest, res) => {
  const online = getOnlineUidSet();
  const list = store.db.blockedUsers
    .filter((b) => b.blockerUid === req.user!.uid)
    .map((b) => {
      const target = store.db.users.find((u) => u.uid === b.blockedUid);
      return {
        id: b.id,
        blockedUid: b.blockedUid,
        createdAt: b.createdAt,
        profile: target ? store.toPublicProfile(target, online) : null,
      };
    });
  res.json({ blocked: list });
});

app.get('/api/reports', requireAuth, (req: AuthedRequest, res) => {
  const reports = store.db.reports
    .filter((r) => r.reporterUid === req.user!.uid)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ reports });
});

app.post('/api/reports', requireAuth, (req: AuthedRequest, res) => {
  const reporter = req.user!;
  const targetIdentifier = sanitizeText(req.body.targetIdentifier, 80);
  const targetUidParam = sanitizeText(req.body.targetUid, 64);
  const category = sanitizeText(req.body.category, 64);
  const details = sanitizeText(req.body.details, 1500);
  const screenshotUrl = req.body.screenshotUrl ? sanitizeText(req.body.screenshotUrl, 500) : '';

  const targetUser = targetUidParam
    ? store.db.users.find((u) => u.uid === targetUidParam)
    : findUserByIdentifier(targetIdentifier);

  if (!targetUser) {
    res.status(404).json({ error: 'Target user not found. Enter a valid username or report directly from a profile/chat.' });
    return;
  }
  if (targetUser.uid === reporter.uid) {
    res.status(400).json({ error: 'You cannot report your own account.' });
    return;
  }
  if (!category || details.length < 5) {
    res.status(400).json({ error: 'Select a report category and describe the issue (at least 5 characters).' });
    return;
  }

  const report = {
    id: generateId('rep'),
    reporterUid: reporter.uid,
    reporterUsername: reporter.username,
    targetUid: targetUser.uid,
    targetUsername: targetUser.username,
    targetName: targetUser.name,
    category,
    details,
    screenshotUrl: screenshotUrl.startsWith('/api/media/') ? screenshotUrl : undefined,
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
  };
  store.db.reports.unshift(report);
  store.save();
  res.status(201).json({ report });
});

app.get('/api/support', requireAuth, (req: AuthedRequest, res) => {
  const tickets = store.db.supportTickets
    .filter((t) => t.userId === req.user!.uid)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ tickets });
});

app.post('/api/support', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const category = sanitizeText(req.body.category, 64);
  const subject = sanitizeText(req.body.subject, 140);
  const message = sanitizeText(req.body.message, 2000);
  if (!category || subject.length < 3 || message.length < 5) {
    res.status(400).json({ error: 'Please complete the category, subject, and message fields.' });
    return;
  }
  const ticket = {
    id: generateId('tkt'),
    userId: user.uid,
    username: user.username,
    category,
    subject,
    message,
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
  };
  store.db.supportTickets.unshift(ticket);
  store.save();
  res.status(201).json({ ticket });
});

app.get('/api/appeals', requireAuth, (req: AuthedRequest, res) => {
  const appeals = store.db.appeals
    .filter((a) => a.userId === req.user!.uid)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const appealPaymentOption = store.db.appSettings.paymentOptions.find(
    (p) => p.productType === 'mute_appeal' && p.isActive
  );
  res.json({
    appeals,
    appealPrice: store.db.appSettings.muteAppealPrice || 19,
    paymentOption: appealPaymentOption || null,
  });
});

app.post('/api/appeals', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  if (!user.isMuted) {
    res.status(400).json({ error: 'Your account is not currently muted.' });
    return;
  }
  const reason = sanitizeText(req.body.reason, 1000);
  const transactionRef = sanitizeText(req.body.transactionRef, 80);
  const screenshotUrl = req.body.screenshotUrl ? sanitizeText(req.body.screenshotUrl, 500) : '';

  if (reason.length < 10) {
    res.status(400).json({ error: 'Please explain why you believe the mute should be reviewed (at least 10 characters).' });
    return;
  }
  if (transactionRef.length < 4) {
    res.status(400).json({ error: 'Please enter the UPI Transaction / UTR Reference ID for the ₹19 appeal fee.' });
    return;
  }

  const appealPrice = store.db.appSettings.muteAppealPrice || 19;
  const now = new Date().toISOString();
  const paymentReq = {
    id: generateId('pay'),
    userId: user.uid,
    username: user.username,
    userName: user.name,
    productId: 'mute_appeal',
    productName: `Mute Review Appeal (₹${appealPrice})`,
    productType: 'mute_appeal' as const,
    amount: appealPrice,
    transactionRef,
    screenshotUrl: screenshotUrl.startsWith('/api/media/') ? screenshotUrl : undefined,
    status: 'pending' as const,
    createdAt: now,
  };
  store.db.paymentRequests.unshift(paymentReq);

  const appeal = {
    id: generateId('apl'),
    userId: user.uid,
    username: user.username,
    userName: user.name,
    reason,
    paymentRequestId: paymentReq.id,
    transactionRef,
    screenshotUrl: paymentReq.screenshotUrl,
    status: 'pending' as const,
    refundStatus: 'none' as const,
    createdAt: now,
  };
  store.db.appeals.unshift(appeal);
  store.save();

  res.status(201).json({ appeal, paymentRequest: paymentReq });
});

// ============================================================================
// SUBSCRIPTIONS, MANUAL UPI PAYMENTS & NOTIFICATIONS
// ============================================================================
app.get('/api/plans', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const plans = store.db.appSettings.plans.filter((p) => p.isActive);
  const paymentOptions = store.db.appSettings.paymentOptions.filter((p) => p.isActive);
  const activeSubscription = store.getActiveSubscription(user.uid);
  const history = store.db.subscriptions
    .filter((s) => s.userId === user.uid)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  const paymentRequests = store.db.paymentRequests
    .filter((p) => p.userId === user.uid)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({
    plans,
    paymentOptions,
    activeSubscription,
    subscriptionHistory: history,
    paymentRequests,
  });
});

app.post('/api/payments', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const productId = sanitizeText(req.body.productId, 64);
  const transactionRef = sanitizeText(req.body.transactionRef, 80);
  const screenshotUrl = req.body.screenshotUrl ? sanitizeText(req.body.screenshotUrl, 500) : '';

  if (transactionRef.length < 4) {
    res.status(400).json({ error: 'Please enter a valid UPI Transaction / UTR Reference ID.' });
    return;
  }

  const paymentOption = store.db.appSettings.paymentOptions.find(
    (o) => o.productId === productId && o.isActive
  );
  if (!paymentOption) {
    res.status(404).json({ error: 'Selected payment option is unavailable.' });
    return;
  }

  const paymentReq = {
    id: generateId('pay'),
    userId: user.uid,
    username: user.username,
    userName: user.name,
    productId: paymentOption.productId,
    productName: paymentOption.productName,
    productType: paymentOption.productType,
    amount: paymentOption.priceInr,
    transactionRef,
    screenshotUrl: screenshotUrl.startsWith('/api/media/') ? screenshotUrl : undefined,
    status: 'pending' as const, // NEVER auto-approved on screenshot upload!
    createdAt: new Date().toISOString(),
  };

  store.db.paymentRequests.unshift(paymentReq);
  store.save();

  res.status(201).json({
    paymentRequest: paymentReq,
    message: 'Payment reference submitted. Subscription activates only after Admin verifies the actual UPI transaction.',
  });
});

app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
  const notifications = store.db.notifications
    .filter((n) => n.userId === req.user!.uid)
    .slice(0, 50);
  res.json({ notifications });
});

app.post('/api/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
  for (const n of store.db.notifications) {
    if (n.userId === req.user!.uid) n.isRead = true;
  }
  store.save();
  res.json({ ok: true });
});

// ============================================================================
// SUPER ADMIN PROTECTED ROUTES (/api/admin/*)
// Strictly protected on backend: verified SUPER_ADMIN UID + role ONLY
// ============================================================================
app.get('/api/admin/stats', requireSuperAdmin, (_req, res) => {
  const onlineSet = getOnlineUidSet();
  const nonDeleted = store.db.users.filter((u) => !u.isDeleted);
  const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
  const premiumUsers = nonDeleted.filter((u) => Boolean(store.getActiveSubscription(u.uid))).length;

  const stats: AdminDashboardStats = {
    totalUsers: nonDeleted.length,
    activeUsers: nonDeleted.filter((u) => !u.isSuspended).length,
    onlineUsers: onlineSet.size,
    premiumUsers,
    newRegistrations24h: nonDeleted.filter((u) => new Date(u.createdAt).getTime() > cutoff24h).length,
    matches: store.db.matches.length,
    pendingPayments: store.db.paymentRequests.filter((p) => p.status === 'pending').length,
    pendingAppeals: store.db.appeals.filter((a) => a.status === 'pending' || a.status === 'under_review').length,
    pendingReports: store.db.reports.filter((r) => r.status === 'pending' || r.status === 'under_review').length,
    pendingVerifications: store.db.verificationRequests.filter((v) => v.status === 'pending').length,
    pendingPasswordRecoveries: store.db.passwordRecoveries.filter((r) => r.status === 'pending').length,
    pendingSupportTickets: store.db.supportTickets.filter((t) => t.status === 'pending' || t.status === 'under_review').length,
  };
  res.json({ stats });
});

app.get('/api/admin/users', requireSuperAdmin, (req, res) => {
  const q = sanitizeText(req.query.q, 80).toLowerCase();
  const filter = String(req.query.filter || 'all');
  const online = getOnlineUidSet();

  const users = store.db.users
    .filter((u) => {
      if (filter === 'suspended' && !u.isSuspended) return false;
      if (filter === 'muted' && !u.isMuted) return false;
      if (filter === 'verified' && !u.isVerified) return false;
      if (filter === 'minor' && u.ageGroup !== 'minor') return false;
      if (q) {
        const hay = `${u.username} ${u.name} ${u.email || ''} ${u.mobile || ''} ${u.state} ${u.district}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .map((u) => {
      // NEVER include passwordHash in any admin response
      return {
        ...buildAuthUser(u),
        isOnline: online.has(u.uid),
        suspendReason: u.suspendReason,
      };
    });

  res.json({ users });
});

app.post('/api/admin/users/:uid/suspend', requireSuperAdmin, (req: AuthedRequest, res) => {
  const target = store.db.users.find((u) => u.uid === req.params.uid);
  if (!target || target.uid === SUPER_ADMIN_UID) {
    res.status(400).json({ error: 'Invalid target user.' });
    return;
  }
  const reason = sanitizeText(req.body.reason, 300) || 'Policy violation';
  target.isSuspended = true;
  target.suspendReason = reason;
  target.updatedAt = new Date().toISOString();
  store.db.sessions = store.db.sessions.filter((s) => s.uid !== target.uid);
  store.logAdminAction(req.user!.uid, 'SUSPEND_USER', target.uid, `Suspended @${target.username}: ${reason}`);
  res.json({ ok: true });
});

app.post('/api/admin/users/:uid/restore', requireSuperAdmin, (req: AuthedRequest, res) => {
  const target = store.db.users.find((u) => u.uid === req.params.uid);
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  target.isSuspended = false;
  target.suspendReason = undefined;
  target.updatedAt = new Date().toISOString();
  store.logAdminAction(req.user!.uid, 'RESTORE_USER', target.uid, `Restored @${target.username}`);
  createNotification(target.uid, 'system', 'Account Restored', 'Your VibeNexa account has been restored by an administrator.');
  res.json({ ok: true });
});

app.post('/api/admin/users/:uid/mute', requireSuperAdmin, (req: AuthedRequest, res) => {
  const target = store.db.users.find((u) => u.uid === req.params.uid);
  if (!target || target.uid === SUPER_ADMIN_UID) {
    res.status(400).json({ error: 'Invalid target user.' });
    return;
  }
  const reason = sanitizeText(req.body.reason, 300) || 'Chat moderation policy';
  target.isMuted = true;
  target.muteReason = reason;
  target.updatedAt = new Date().toISOString();
  store.logAdminAction(req.user!.uid, 'MUTE_USER', target.uid, `Muted @${target.username}: ${reason}`);
  createNotification(
    target.uid,
    'system',
    'Chat Restricted (Muted)',
    `Your chat access was muted (${reason}). You may submit a ₹19 appeal or contact free support if you believe this was a mistake.`
  );
  res.json({ ok: true });
});

app.post('/api/admin/users/:uid/unmute', requireSuperAdmin, (req: AuthedRequest, res) => {
  const target = store.db.users.find((u) => u.uid === req.params.uid);
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  target.isMuted = false;
  target.muteReason = undefined;
  target.updatedAt = new Date().toISOString();
  store.logAdminAction(req.user!.uid, 'UNMUTE_USER', target.uid, `Unmuted @${target.username}`);
  createNotification(target.uid, 'system', 'Chat Access Restored', 'Your account has been unmuted. Please continue following Community Guidelines.');
  res.json({ ok: true });
});

app.get('/api/admin/verifications', requireSuperAdmin, (_req, res) => {
  res.json({ requests: store.db.verificationRequests });
});

app.post('/api/admin/verifications/:id/decision', requireSuperAdmin, (req: AuthedRequest, res) => {
  const item = store.db.verificationRequests.find((v) => v.id === req.params.id);
  if (!item) {
    res.status(404).json({ error: 'Verification request not found.' });
    return;
  }
  const decision = req.body.decision === 'approved' ? 'approved' : 'rejected';
  const rejectionReason = sanitizeText(req.body.rejectionReason, 400);
  item.status = decision;
  item.rejectionReason = decision === 'rejected' ? rejectionReason : undefined;
  item.updatedAt = new Date().toISOString();

  const target = store.db.users.find((u) => u.uid === item.userId);
  if (target) {
    if (decision === 'approved') {
      target.isVerified = true;
      createNotification(target.uid, 'system', 'Profile Verified', 'Congratulations! Your VibeNexa profile now displays the blue verified badge.');
    } else {
      createNotification(
        target.uid,
        'system',
        'Verification Not Approved',
        `Your verification request was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`
      );
    }
  }
  store.logAdminAction(
    req.user!.uid,
    `VERIFICATION_${decision.toUpperCase()}`,
    item.id,
    `User ${item.userId}: ${decision}${rejectionReason ? ` (${rejectionReason})` : ''}`
  );
  res.json({ request: item });
});

app.get('/api/admin/payments', requireSuperAdmin, (_req, res) => {
  res.json({ payments: store.db.paymentRequests });
});

app.post('/api/admin/payments/:id/decision', requireSuperAdmin, (req: AuthedRequest, res) => {
  const payment = store.db.paymentRequests.find((p) => p.id === req.params.id);
  if (!payment) {
    res.status(404).json({ error: 'Payment request not found.' });
    return;
  }
  const decision = req.body.decision as 'approved' | 'rejected' | 'refunded';
  if (!['approved', 'rejected', 'refunded'].includes(decision)) {
    res.status(400).json({ error: 'Invalid payment decision.' });
    return;
  }
  const adminNote = sanitizeText(req.body.adminNote, 400);
  payment.status = decision;
  payment.adminNote = adminNote;
  payment.updatedAt = new Date().toISOString();

  if (decision === 'approved' && payment.productType === 'subscription') {
    const plan = store.db.appSettings.plans.find((p) => p.id === payment.productId);
    if (plan) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000).toISOString();
      store.db.subscriptions.unshift({
        id: generateId('sub'),
        userId: payment.userId,
        planId: plan.id,
        planName: plan.name,
        status: 'active',
        startedAt: now.toISOString(),
        expiresAt,
      });
      createNotification(
        payment.userId,
        'system',
        'Subscription Activated',
        `Your ${plan.name} plan is now active until ${new Date(expiresAt).toLocaleDateString('en-IN')}.`
      );
    }
  } else if (decision === 'rejected') {
    createNotification(
      payment.userId,
      'system',
      'Payment Verification Failed',
      `Payment ${payment.transactionRef} could not be verified.${adminNote ? ` Note: ${adminNote}` : ''}`
    );
  } else if (decision === 'refunded') {
    createNotification(
      payment.userId,
      'system',
      'Payment Refunded',
      `Your payment (${payment.transactionRef}) has been marked for refund.${adminNote ? ` Note: ${adminNote}` : ''}`
    );
  }

  store.logAdminAction(
    req.user!.uid,
    `PAYMENT_${decision.toUpperCase()}`,
    payment.id,
    `Ref ${payment.transactionRef} (₹${payment.amount}) for user ${payment.userId}: ${decision}`
  );
  res.json({ payment });
});

app.post('/api/admin/subscriptions/grant', requireSuperAdmin, (req: AuthedRequest, res) => {
  const userId = sanitizeText(req.body.userId, 64);
  const planId = sanitizeText(req.body.planId, 64);
  const target = store.db.users.find((u) => u.uid === userId);
  const plan = store.db.appSettings.plans.find((p) => p.id === planId);
  if (!target || !plan) {
    res.status(404).json({ error: 'User or subscription plan not found.' });
    return;
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000).toISOString();
  const sub = {
    id: generateId('sub'),
    userId: target.uid,
    planId: plan.id,
    planName: plan.name,
    status: 'active' as const,
    startedAt: now.toISOString(),
    expiresAt,
  };
  store.db.subscriptions.unshift(sub);
  store.logAdminAction(req.user!.uid, 'GRANT_SUBSCRIPTION', target.uid, `Granted ${plan.name} to @${target.username}`);
  createNotification(target.uid, 'system', 'Premium Activated', `${plan.name} has been activated on your account.`);
  res.status(201).json({ subscription: sub });
});

app.get('/api/admin/appeals', requireSuperAdmin, (_req, res) => {
  res.json({ appeals: store.db.appeals });
});

app.post('/api/admin/appeals/:id/decision', requireSuperAdmin, (req: AuthedRequest, res) => {
  const appeal = store.db.appeals.find((a) => a.id === req.params.id);
  if (!appeal) {
    res.status(404).json({ error: 'Appeal not found.' });
    return;
  }
  const decision = req.body.decision === 'approved' ? 'approved' : 'rejected';
  const mistakenMute = Boolean(req.body.mistakenMute);
  const adminNote = sanitizeText(req.body.adminNote, 400);

  appeal.status = decision;
  appeal.adminNote = adminNote;
  appeal.refundStatus = decision === 'approved' && mistakenMute ? 'refunded' : 'non_refundable';
  appeal.updatedAt = new Date().toISOString();

  if (decision === 'approved') {
    const user = store.db.users.find((u) => u.uid === appeal.userId);
    if (user) {
      user.isMuted = false;
      user.muteReason = undefined;
    }
    if (mistakenMute && appeal.paymentRequestId) {
      const pay = store.db.paymentRequests.find((p) => p.id === appeal.paymentRequestId);
      if (pay) {
        pay.status = 'refunded';
        pay.adminNote = 'Mistaken mute established — ₹19 appeal fee refunded.';
      }
    }
    createNotification(
      appeal.userId,
      'system',
      'Mute Appeal Approved',
      mistakenMute
        ? 'Your mute was overturned and your ₹19 appeal fee has been marked for refund.'
        : 'Your appeal has been approved and your chat access is restored.'
    );
  } else {
    createNotification(
      appeal.userId,
      'system',
      'Mute Appeal Rejected',
      `Violation confirmed; the ₹19 appeal fee is non-refundable.${adminNote ? ` Note: ${adminNote}` : ''}`
    );
  }

  store.logAdminAction(
    req.user!.uid,
    `APPEAL_${decision.toUpperCase()}`,
    appeal.id,
    `Appeal for ${appeal.userId}: ${decision}, refund=${appeal.refundStatus}`
  );
  res.json({ appeal });
});

app.get('/api/admin/reports', requireSuperAdmin, (_req, res) => {
  res.json({ reports: store.db.reports });
});

app.post('/api/admin/reports/:id/decision', requireSuperAdmin, (req: AuthedRequest, res) => {
  const report = store.db.reports.find((r) => r.id === req.params.id);
  if (!report) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }
  const status = req.body.status as 'under_review' | 'resolved' | 'rejected';
  if (!['under_review', 'resolved', 'rejected'].includes(status)) {
    res.status(400).json({ error: 'Invalid status.' });
    return;
  }
  report.status = status;
  report.adminNote = sanitizeText(req.body.adminNote, 400);
  report.updatedAt = new Date().toISOString();
  store.logAdminAction(req.user!.uid, 'REPORT_UPDATE', report.id, `Status set to ${status}: ${report.adminNote}`);
  res.json({ report });
});

/**
 * Restricted, authorized, and audit-logged safety investigation for a specific filed report.
 * Casual private chat browsing is NEVER exposed.
 */
app.post('/api/admin/reports/:id/investigate-chat', requireSuperAdmin, (req: AuthedRequest, res) => {
  const report = store.db.reports.find((r) => r.id === req.params.id);
  const justification = sanitizeText(req.body.justification, 300);
  if (!report) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }
  if (justification.length < 10) {
    res.status(400).json({ error: 'A safety investigation justification (min 10 chars) is required for audit logging.' });
    return;
  }
  const chat = store.db.chats.find(
    (c) =>
      (c.userA === report.reporterUid && c.userB === report.targetUid) ||
      (c.userB === report.reporterUid && c.userA === report.targetUid)
  );
  store.logAdminAction(
    req.user!.uid,
    'SAFETY_CHAT_INVESTIGATION',
    report.id,
    `Investigated reported chat between ${report.reporterUid} and ${report.targetUid}. Reason: ${justification}`
  );
  const recentMessages = chat
    ? store.db.messages
        .filter((m) => m.chatId === chat.id)
        .slice(-20)
        .map((m) => ({
          id: m.id,
          senderUid: m.senderUid,
          text: m.text,
          createdAt: m.createdAt,
        }))
    : [];
  res.json({ hasChat: Boolean(chat), recentMessages });
});

app.get('/api/admin/support', requireSuperAdmin, (_req, res) => {
  res.json({ tickets: store.db.supportTickets });
});

app.post('/api/admin/support/:id/decision', requireSuperAdmin, (req: AuthedRequest, res) => {
  const ticket = store.db.supportTickets.find((t) => t.id === req.params.id);
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found.' });
    return;
  }
  const status = req.body.status as 'under_review' | 'resolved' | 'rejected';
  if (!['under_review', 'resolved', 'rejected'].includes(status)) {
    res.status(400).json({ error: 'Invalid status.' });
    return;
  }
  ticket.status = status;
  ticket.adminReply = sanitizeText(req.body.adminReply, 1000);
  ticket.updatedAt = new Date().toISOString();
  store.logAdminAction(req.user!.uid, 'SUPPORT_UPDATE', ticket.id, `Ticket ${status}`);
  createNotification(
    ticket.userId,
    'system',
    `Support Ticket ${status.replace('_', ' ')}`,
    ticket.adminReply || `Your support request "${ticket.subject}" has been updated to ${status}.`
  );
  res.json({ ticket });
});

app.get('/api/admin/global-chat', requireSuperAdmin, (_req, res) => {
  const messages = store.db.globalMessages.slice(-100).map(hydrateGlobalMessage);
  res.json({ messages });
});

app.delete('/api/admin/global-chat/:id', requireSuperAdmin, (req: AuthedRequest, res) => {
  const idx = store.db.globalMessages.findIndex((m) => m.id === req.params.id);
  if (idx < 0) {
    res.status(404).json({ error: 'Global message not found.' });
    return;
  }
  const removed = store.db.globalMessages.splice(idx, 1)[0];
  store.logAdminAction(
    req.user!.uid,
    'DELETE_GLOBAL_MESSAGE',
    removed.id,
    `Deleted message from ${removed.senderUid} in ${removed.room} room`
  );
  broadcastToAgeGroup(removed.room, 'global:deleted', { id: removed.id });
  res.json({ ok: true });
});

app.get('/api/admin/blocked-users', requireSuperAdmin, (_req, res) => {
  const records = store.db.blockedUsers.map((b) => {
    const blocker = store.db.users.find((u) => u.uid === b.blockerUid);
    const blocked = store.db.users.find((u) => u.uid === b.blockedUid);
    return {
      id: b.id,
      blockerUsername: blocker?.username || b.blockerUid,
      blockedUsername: blocked?.username || b.blockedUid,
      createdAt: b.createdAt,
    };
  });
  res.json({ records });
});

app.post('/api/admin/announcements', requireSuperAdmin, (req: AuthedRequest, res) => {
  const title = sanitizeText(req.body.title, 120);
  const body = sanitizeText(req.body.body, 400);
  if (title.length < 3 || body.length < 5) {
    res.status(400).json({ error: 'Enter an announcement title and message.' });
    return;
  }
  let deliveredCount = 0;
  for (const u of store.db.users) {
    if (!u.isDeleted && !u.isSuspended && u.notificationPrefs.adminAnnouncement) {
      createNotification(u.uid, 'announcement', title, body);
      deliveredCount += 1;
    }
  }
  store.logAdminAction(req.user!.uid, 'PUSH_ANNOUNCEMENT', 'broadcast', `Sent "${title}" to ${deliveredCount} users`);
  res.json({ ok: true, deliveredCount });
});

app.get('/api/admin/settings', requireSuperAdmin, (_req, res) => {
  res.json({ settings: store.db.appSettings });
});

app.put('/api/admin/settings', requireSuperAdmin, (req: AuthedRequest, res) => {
  const next = req.body.settings;
  if (!next || !Array.isArray(next.plans) || !Array.isArray(next.paymentOptions)) {
    res.status(400).json({ error: 'Invalid settings payload.' });
    return;
  }
  store.db.appSettings = {
    freeGlobalDailyLimit: Math.max(1, Math.min(200, Number(next.freeGlobalDailyLimit) || 15)),
    muteAppealPrice: Math.max(0, Number(next.muteAppealPrice) || 19),
    profileColorFreeForAll: Boolean(next.profileColorFreeForAll),
    plans: next.plans.slice(0, 3),
    paymentOptions: next.paymentOptions,
    updatedAt: new Date().toISOString(),
  };
  store.logAdminAction(req.user!.uid, 'UPDATE_APP_SETTINGS', 'app_settings', 'Updated subscription plans, UPI/QR payment options, and limits.');
  res.json({ settings: store.db.appSettings });
});

app.get('/api/admin/password-recoveries', requireSuperAdmin, (_req, res) => {
  res.json({ recoveries: store.db.passwordRecoveries });
});

app.post('/api/admin/password-recoveries/:id/issue-code', requireSuperAdmin, (req: AuthedRequest, res) => {
  const rec = store.db.passwordRecoveries.find((r) => r.id === req.params.id);
  if (!rec) {
    res.status(404).json({ error: 'Recovery request not found.' });
    return;
  }
  const oneTimeCode = `VN-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  store.db.passwordResetTokens.unshift({
    id: generateId('rst'),
    userId: rec.userId,
    codeHash: hashToken(oneTimeCode),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    used: false,
    createdAt: new Date().toISOString(),
  });
  rec.status = 'reset_issued';
  rec.issuedTokenPreview = `${oneTimeCode.slice(0, 5)}••••`;
  rec.updatedAt = new Date().toISOString();
  store.logAdminAction(
    req.user!.uid,
    'ISSUE_PASSWORD_RESET_CODE',
    rec.userId,
    `Issued 1-hour one-time reset code for @${rec.username}`
  );
  res.json({
    recovery: rec,
    oneTimeCode,
    expiresInMinutes: 60,
  });
});

app.get('/api/admin/logs', requireSuperAdmin, (_req, res) => {
  res.json({ logs: store.db.adminLogs.slice(0, 200) });
});

// ============================================================================
// VITE DEV MIDDLEWARE / PRODUCTION STATIC SERVER (PORT 3000)
// ============================================================================
async function startServer() {
  const PORT = 3000;
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`VibeNexa server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
