# VibeNexa — Find Your Partner

Android-first social and dating platform built with React 19, TypeScript, Tailwind CSS v4, Express, WebSockets (`ws`), and Firebase (`vibenexa-in`).

## Features

- **Authentication**: Username, Email, or Mobile Number + Password login (`scrypt` hashing, no Google Sign-In, no OTP), 2-step registration with all 36 Indian States/UTs & Districts, strict Gregorian DOB validation, and Forgot Password (Firebase email reset + Admin one-time reset code queue for mobile-only users).
- **Mandatory 18+ Age Safety**: Strict backend-enforced separation between eligible adults (18+) and Teen Safe Social Mode (<18).
- **Social & Discovery**: Genuine Home Feed, 2-column Discover filter card (Age, Gender, State, District), Likes & Matches, and customizable Profile Colors.
- **Real-Time Messaging**: Age-segregated Global Chat (15 msgs / rolling 24h free quota enforced on backend, reactions, replies, mute enforcement) and 1-to-1 Personal Chat (typing indicator, Sent/Delivered/Seen status, Premium personal-only Chat Wallpaper).
- **Verification, Premium & Safety**: Privacy-preserving Profile Verification (blue tick), 3 Admin-configurable subscription tiers, Manual UPI payment & QR configuration, ₹19 Mute Appeal with refund tracking, free Help & Support, and free Report Center.
- **Private In-App Super Admin Panel**: Accessible inside Settings strictly for the authorized `SUPER_ADMIN` identity, with live stats, moderation, payment/verification queues, plan/UPI/QR management, push announcements, and immutable audit logs.

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

App runs on `http://localhost:3000`.

### Environment Variables

Configure `.env` (never commit `.env` to Git):

- `ADMIN_INITIAL_PASSWORD` (optional): Sets the initial Super Admin password. If omitted, the authorized Super Admin can claim a password once on first sign-in.

## Security Rules

- `firestore.rules`: Hardened Firestore security rules validated with `@firebase/eslint-plugin-security-rules`.
- `storage.rules`: Hardened Storage rules ready if Firebase Storage is enabled in the future.
- `firebase-blueprint.json`: Complete collection schema reference.

## Android Packaging (₹0 Wrapper Cost)

- **PWA**: Open the deployed HTTPS URL in Chrome on Android and tap **Add to Home Screen**.
- **Google Play (TWA / AAB)**: Wrap the deployed URL using Google's free **Bubblewrap CLI** (`npx @bubblewrap/cli init --manifest=https://<your-domain>/manifest.webmanifest`).
