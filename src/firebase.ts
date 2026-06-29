import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { AppState } from './types';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL */
export const auth = getAuth(app);

// Authentication Provider Setup
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

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
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Google Sign In Popup helper
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Google Sign In Error', error);
    throw error;
  }
}

// Sign out helper
export async function logoutUser() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout Error', error);
  }
}

// Save complete AppState for a user inside userStates/{userId}
export async function saveUserAppState(userId: string, state: AppState) {
  const docRef = doc(db, 'userStates', userId);
  const path = `userStates/${userId}`;
  
  try {
    const payload = {
      userId,
      selectedMonth: state.selectedMonth || '2026-06',
      transactions: JSON.stringify(state.transactions || []),
      creditCards: JSON.stringify(state.creditCards || []),
      debitCards: JSON.stringify(state.debitCards || []),
      installments: JSON.stringify(state.installments || []),
      categories: JSON.stringify(state.categories || []),
      subscriptions: JSON.stringify(state.subscriptions || []),
      deletedGeneratedIds: JSON.stringify(state.deletedGeneratedIds || []),
      initialBalancesOverrides: JSON.stringify(state.initialBalancesOverrides || {}),
      paidCardStatements: JSON.stringify(state.paidCardStatements || {}),
      updatedAt: serverTimestamp() // server-validated timestamps are required
    };
    
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Retrieve complete AppState for a user inside userStates/{userId}
export async function getUserAppState(userId: string): Promise<Partial<AppState> | null> {
  const docRef = doc(db, 'userStates', userId);
  const path = `userStates/${userId}`;
  
  try {
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      return null;
    }
    
    const data = docSnap.data();
    
    return {
      selectedMonth: data.selectedMonth || '2026-06',
      transactions: JSON.parse(data.transactions || '[]'),
      creditCards: JSON.parse(data.creditCards || '[]'),
      debitCards: JSON.parse(data.debitCards || '[]'),
      installments: JSON.parse(data.installments || '[]'),
      categories: JSON.parse(data.categories || '[]'),
      subscriptions: JSON.parse(data.subscriptions || '[]'),
      deletedGeneratedIds: JSON.parse(data.deletedGeneratedIds || '[]'),
      initialBalancesOverrides: JSON.parse(data.initialBalancesOverrides || '{}'),
      paidCardStatements: JSON.parse(data.paidCardStatements || '{}')
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}
