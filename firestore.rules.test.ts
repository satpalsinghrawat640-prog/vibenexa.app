/**
 * Phase 0 Payload-First Security TDD Test Suite for VibeNexa Firestore Rules.
 * Run against Firebase Emulator Suite (`@firebase/rules-unit-testing`) when testing locally.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'create' | 'update' | 'delete' | 'get' | 'list';
  actor: {
    uid: string;
    email?: string;
    email_verified?: boolean;
  };
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Self-Admin Escalation on User Creation',
    collectionPath: 'users/user_alice',
    operation: 'create',
    actor: { uid: 'user_alice', email: 'alice@example.com', email_verified: true },
    payload: {
      uid: 'user_alice',
      username: 'alice',
      role: 'SUPER_ADMIN',
      ageGroup: 'adult',
      isVerified: false,
      isMuted: false,
      isSuspended: false,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Self-Verification Spoof on Profile Update',
    collectionPath: 'profiles/user_alice',
    operation: 'update',
    actor: { uid: 'user_alice', email: 'alice@example.com', email_verified: true },
    payload: { isVerified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Self-Payment Approval Injection',
    collectionPath: 'payment_requests/pay_001',
    operation: 'create',
    actor: { uid: 'user_alice', email: 'alice@example.com', email_verified: true },
    payload: {
      id: 'pay_001',
      userId: 'user_alice',
      productId: 'tier_1',
      productType: 'subscription',
      amount: 299,
      transactionRef: 'UTR12345678',
      status: 'approved',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Self-Subscription Forgery',
    collectionPath: 'subscriptions/sub_alice',
    operation: 'create',
    actor: { uid: 'user_alice', email: 'alice@example.com', email_verified: true },
    payload: {
      id: 'sub_alice',
      userId: 'user_alice',
      planId: 'tier_3',
      status: 'active',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Self-Unmute Bypass',
    collectionPath: 'muted_users/user_alice',
    operation: 'delete',
    actor: { uid: 'user_alice', email: 'alice@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Cross-User PII Read Attempt',
    collectionPath: 'users/user_bob',
    operation: 'get',
    actor: { uid: 'user_alice', email: 'alice@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Unauthorized Third-Party Private Chat Read',
    collectionPath: 'chats/chat_bob_charlie/messages/msg_1',
    operation: 'get',
    actor: { uid: 'user_alice', email: 'alice@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Shadow Field Injection on Profile Update',
    collectionPath: 'profiles/user_alice',
    operation: 'update',
    actor: { uid: 'user_alice', email: 'alice@example.com', email_verified: true },
    payload: { bio: 'Hello', ghostFlag: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Document ID Poisoning (>128 chars)',
    collectionPath: `posts/${'a'.repeat(200)}`,
    operation: 'create',
    actor: { uid: 'user_alice', email: 'alice@example.com', email_verified: true },
    payload: { id: 'a'.repeat(200), authorUid: 'user_alice', ageGroup: 'adult', caption: 'Hi' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Unverified Email Admin Spoof',
    collectionPath: 'admin_logs/log_spoof',
    operation: 'create',
    actor: { uid: 'attacker', email: 'satpalsinghrawat640@gmail.com', email_verified: false },
    payload: { id: 'log_spoof', adminUid: 'attacker', action: 'SPOOF', targetId: 'x', details: 'spoof' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Client Timestamp Forgery on Report',
    collectionPath: 'reports/rep_forged',
    operation: 'create',
    actor: { uid: 'user_alice', email: 'alice@example.com', email_verified: true },
    payload: {
      id: 'rep_forged',
      reporterUid: 'user_alice',
      targetUid: 'user_bob',
      category: 'Spam',
      details: 'Forged time',
      status: 'pending',
      createdAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Post Author Identity Spoofing',
    collectionPath: 'posts/post_spoof',
    operation: 'create',
    actor: { uid: 'user_alice', email: 'alice@example.com', email_verified: true },
    payload: {
      id: 'post_spoof',
      authorUid: 'user_bob',
      ageGroup: 'adult',
      caption: 'Spoofed post',
      likesCount: 0,
      commentsCount: 0,
    },
    expected: 'PERMISSION_DENIED',
  },
];
