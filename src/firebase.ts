import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firebase Firestore connectivity check failed: client is offline.');
      return false;
    }
    // Permission denied on unauthenticated boot is expected when rules are hardened; client is online.
    return true;
  }
}

/**
 * Syncs email/password users with Firebase Auth (`vibenexa-in`) when an email is provided.
 * Never fabricates fake emails for username-only accounts. Google Sign-In is completely omitted.
 */
export async function syncFirebaseEmailSignup(email: string, password: string): Promise<void> {
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch {
    // Non-blocking if email already exists in Firebase Auth or provider policy differs
  }
}

export async function syncFirebaseEmailLogin(email: string, password: string): Promise<void> {
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch {
    // Custom backend remains authoritative for username/mobile/email credentials
  }
}

export async function triggerFirebasePasswordReset(email: string): Promise<{ sent: boolean; message?: string }> {
  try {
    await sendPasswordResetEmail(auth, email);
    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      message: err instanceof Error ? err.message : 'Unable to send Firebase reset email',
    };
  }
}

export async function logoutFirebaseClient(): Promise<void> {
  try {
    if (auth.currentUser) {
      await firebaseSignOut(auth);
    }
  } catch {
    // Ignore client signout error
  }
}

export const FIREBASE_PROJECT_INFO = {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  firestoreDatabaseId: firebaseConfig.firestoreDatabaseId || '(default)',
};
