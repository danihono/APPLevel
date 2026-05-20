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
import { cacheAvatar, compressAvatarImage } from '../avatarCache';

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

function sanitizeStorageFileName(fileName: string) {
  return fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'arquivo';
}

function assertLearningAssetType(file: File) {
  const mimeType = file.type || '';
  if (mimeType.startsWith('video/') || mimeType.startsWith('image/') || mimeType === 'application/pdf') {
    return mimeType;
  }

  throw new Error('Envie apenas video, PDF ou imagem para o modulo.');
}

function assertVideoAssetType(file: File) {
  const mimeType = file.type || '';
  if (mimeType.startsWith('video/')) {
    return mimeType;
  }

  throw new Error('Envie apenas arquivos de video.');
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
  // Comprime no cliente: uma foto de celular tem alguns MB, mas o avatar e
  // exibido pequeno. Isso reduz drasticamente o tempo de download.
  const compressed = await compressAvatarImage(file);
  const body: Blob = compressed?.blob ?? file;
  const contentType = compressed?.contentType ?? file.type ?? 'image/jpeg';
  const extension = compressed ? 'jpg' : (file.name.split('.').pop()?.toLowerCase() || 'jpg');

  const storageRef = ref(firebaseStorage, `users/${userId}/profile-${Date.now()}.${extension}`);
  await uploadBytes(storageRef, body, {
    contentType,
    // O nome do arquivo tem um timestamp unico, entao o conteudo nunca muda:
    // o navegador pode cachear "para sempre" e a foto abre instantaneamente.
    cacheControl: 'public, max-age=31536000, immutable',
  });

  const url = await getDownloadURL(storageRef);
  // Ja temos a versao comprimida em maos — guarda no cache local para a foto
  // aparecer de primeira na proxima abertura do app.
  if (compressed) {
    cacheAvatar(url, compressed.dataUrl);
  }
  return url;
}

export async function uploadLearningLessonAsset(
  academyId: string | undefined,
  lessonId: string,
  file: File,
) {
  const mimeType = assertLearningAssetType(file);
  const academySegment = academyId?.trim() || 'shared';
  const safeFileName = sanitizeStorageFileName(file.name);
  const storageRef = ref(firebaseStorage, `academies/${academySegment}/learning/lessons/${lessonId}/${Date.now()}-${safeFileName}`);

  await uploadBytes(storageRef, file, {
    contentType: mimeType,
  });

  return {
    downloadURL: await getDownloadURL(storageRef),
    storagePath: storageRef.fullPath,
    mimeType,
    fileName: file.name,
  };
}

export async function uploadFightVideoSubmissionAsset(userId: string, file: File) {
  const mimeType = assertVideoAssetType(file);
  const safeFileName = sanitizeStorageFileName(file.name);
  const storageRef = ref(firebaseStorage, `users/${userId}/fight-videos/${Date.now()}-${safeFileName}`);

  await uploadBytes(storageRef, file, {
    contentType: mimeType,
  });

  return {
    downloadURL: await getDownloadURL(storageRef),
    storagePath: storageRef.fullPath,
    mimeType,
    fileName: file.name,
  };
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
