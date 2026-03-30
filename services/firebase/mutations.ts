import {
  deleteField,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { firebaseDb, firebaseStorage } from './client';

type EditableUserProfile = {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  phone?: string;
  birthDate?: string;
  photoPath?: string;
};

function emptyToDelete(value?: string) {
  if (!value || value.trim().length === 0) {
    return deleteField();
  }

  return value.trim();
}

export async function updateUserProfile(userId: string, payload: EditableUserProfile) {
  await updateDoc(doc(firebaseDb, 'users', userId), {
    ...(payload.firstName !== undefined ? { firstName: payload.firstName.trim() } : {}),
    ...(payload.lastName !== undefined ? { lastName: payload.lastName.trim() } : {}),
    ...(payload.displayName !== undefined ? { displayName: payload.displayName.trim() } : {}),
    ...(payload.phone !== undefined ? { phone: emptyToDelete(payload.phone) } : {}),
    ...(payload.birthDate !== undefined ? { birthDate: emptyToDelete(payload.birthDate) } : {}),
    ...(payload.photoPath !== undefined ? { photoPath: emptyToDelete(payload.photoPath) } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function uploadUserPhoto(userId: string, file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const storageRef = ref(firebaseStorage, `users/${userId}/profile-${Date.now()}.${extension}`);
  await uploadBytes(storageRef, file, {
    contentType: file.type || 'image/jpeg',
  });

  return getDownloadURL(storageRef);
}

export async function updateAcademySettings(
  academyId: string,
  payload: {
    name?: string;
    timezone?: string;
    status?: 'active' | 'inactive' | 'suspended';
    classCheckinWindowMinutes?: number;
    masterBlackLimit?: number;
  },
) {
  await updateDoc(doc(firebaseDb, 'academies', academyId), {
    ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
    ...(payload.timezone !== undefined ? { timezone: payload.timezone.trim() } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(payload.classCheckinWindowMinutes !== undefined
      ? { classCheckinWindowMinutes: payload.classCheckinWindowMinutes }
      : {}),
    ...(payload.masterBlackLimit !== undefined ? { masterBlackLimit: payload.masterBlackLimit } : {}),
    updatedAt: serverTimestamp(),
  });
}
