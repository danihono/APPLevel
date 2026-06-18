import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';

const app = getApps()[0] ?? initializeApp();

const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

const auth = getAuth(app);
const messaging = getMessaging(app);
const storage = getStorage(app);

export { app, auth, db, messaging, storage };
