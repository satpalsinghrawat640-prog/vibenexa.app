# VibeNexa Firestore Security Specification (Phase 0 TDD)

## 1. Core Data Invariants

1. **Default Deny**: All unmatched Firestore paths are denied read and write (`allow read, write: if false;`).
2. **PII Isolation**: `/users/{userId}` holds private PII (`email`, `mobile`) and privileged flags (`role`, `isVerified`, `isMuted`, `isSuspended`, `subscriptionPlanId`). Only the owning user or verified `SUPER_ADMIN` can read `/users/{userId}`. Normal users can NEVER grant themselves `SUPER_ADMIN`, `isVerified: true`, `isMuted: false`, `isSuspended: false`, or modify `subscriptionPlanId`.
3. **Age Separation**: Adult (`ageGroup == 'adult'`) and minor (`ageGroup == 'minor'`) records are strictly separated across `profiles`, `posts`, `global_messages`, `likes`, `matches`, and `chats`.
4. **Private Chat Confidentiality**: `/chats/{chatId}` and `/chats/{chatId}/messages/{messageId}` are readable and writable ONLY by the two matched adult participants (`userA` or `userB`).
5. **Payment & Subscription Integrity**: Users can create `payment_requests` strictly with `status == 'pending'`. Only verified `SUPER_ADMIN` can transition payment status to `approved`/`rejected`/`refunded` or mutate `/subscriptions/{subscriptionId}`.
6. **Verification & Moderation Integrity**: Users can create `verification_requests` only with `status == 'pending'`. Only verified `SUPER_ADMIN` can approve/reject verification or write `/muted_users`, `/admin_logs`, or `/app_settings`.
7. **Audit Log Immutability**: `/admin_logs/{logId}` is append-only by verified `SUPER_ADMIN` and never editable or deletable by anyone.

## 2. The "Dirty Dozen" Adversarial Payloads

| # | Attack Vector | Collection | Malicious Payload / Operation | Expected Result |
|---|---|---|---|---|
| 1 | Self-Admin Escalation | `/users/{uid}` | `{ "role": "SUPER_ADMIN" }` on create/update | `PERMISSION_DENIED` |
| 2 | Self-Verification Spoof | `/profiles/{uid}` | `{ "isVerified": true }` update by owner | `PERMISSION_DENIED` |
| 3 | Self-Payment Approval | `/payment_requests/{id}` | `{ "status": "approved" }` on create or update by payer | `PERMISSION_DENIED` |
| 4 | Self-Subscription Forgery | `/subscriptions/{id}` | Create `{ "planId": "gold", "status": "active" }` as normal user | `PERMISSION_DENIED` |
| 5 | Self-Unmute Bypass | `/muted_users/{uid}` | Delete own mute record | `PERMISSION_DENIED` |
| 6 | PII Scraping | `/users/{otherUid}` | `get` or `list` another user's private document | `PERMISSION_DENIED` |
| 7 | Private Chat Snooping | `/chats/{chatId}/messages/{mId}` | `get` or `list` by third-party signed-in user | `PERMISSION_DENIED` |
| 8 | Shadow Field Injection | `/profiles/{uid}` | Update with `{ "bio": "Hi", "ghostAdmin": true }` | `PERMISSION_DENIED` |
| 9 | Path ID Poisoning | `/posts/{1500_char_id}` | Create post with >128-char or non-alphanumeric document ID | `PERMISSION_DENIED` |
| 10 | Email Spoofing Admin | `/admin_logs/{id}` | Request with matching admin email but `email_verified == false` | `PERMISSION_DENIED` |
| 11 | Client Timestamp Forgery | `/reports/{id}` | Create report with backdated `createdAt` != `request.time` | `PERMISSION_DENIED` |
| 12 | Identity Spoofing | `/posts/{id}` | Create post with `authorUid` set to another user's UID | `PERMISSION_DENIED` |
