// Comparacao de biometria facial. Modulo PURO (sem Firebase) para poder ser testado isolado.
//
// Os vetores ("embeddings") sao gerados no aparelho pelo modelo `faceres` da biblioteca Human;
// aqui so comparamos numeros. Trocar de motor (ex.: AWS Rekognition) significa trocar este
// arquivo e o `services/faceEngine.ts` do frontend, e invalidar os cadastros antigos via
// FACE_MODEL_VERSION.

export const FACE_MODEL_VERSION = 'human-faceres-v1';
export const FACE_EMBEDDING_LENGTH = 1024;
export const FACE_MAX_ENROLLMENT_SAMPLES = 3;
export const FACE_MAX_FACES_PER_PHOTO = 80;

// Similaridade 0..1. Abaixo do limiar minimo o rosto fica "nao reconhecido"; a partir do limiar
// alto a sugestao ja vem marcada para o professor. No teste inicial, pessoas DIFERENTES chegaram
// a 0.54 e a mesma pessoa ficou em 0.75+; os valores abaixo deixam folga, mas sao um ponto de
// partida — calibrar com fotos reais de aula (a tela do professor mostra a % de cada sugestao).
export const FACE_MATCH_THRESHOLD = 0.58;
export const FACE_HIGH_CONFIDENCE_THRESHOLD = 0.68;

const MAX_ALTERNATIVES = 2;

export type FaceConfidence = 'high' | 'medium';

export interface EnrolledFace {
  userId: string;
  embeddings: number[][];
}

export interface FaceCandidate {
  userId: string;
  similarity: number;
}

export interface FaceSuggestion {
  faceIndex: number;
  best: (FaceCandidate & { confidence: FaceConfidence }) | null;
  alternatives: FaceCandidate[];
}

export function isValidEmbedding(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length === FACE_EMBEDDING_LENGTH
    && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

// Mesma formula de `human.match.similarity` (distancia euclidiana normalizada para 0.2..0.8),
// para que os limiares documentados pela biblioteca continuem valendo no servidor.
export function faceSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < a.length; index += 1) {
    const diff = a[index] - b[index];
    sum += diff * diff;
  }

  if (sum === 0) {
    return 1;
  }

  const distance = Math.sqrt(25 * sum) / 100;
  const normalized = (1 - distance - 0.2) / 0.6;
  return Math.round(100 * Math.max(0, Math.min(1, normalized))) / 100;
}

// Um usuario pode ter ate 3 amostras; vale a que mais se parece com o rosto da foto.
function bestSimilarity(face: number[], enrolled: EnrolledFace): number {
  let best = 0;
  for (const sample of enrolled.embeddings) {
    const similarity = faceSimilarity(face, sample);
    if (similarity > best) {
      best = similarity;
    }
  }
  return best;
}

// As selfies do cadastro precisam ser da mesma pessoa. Devolve a menor similaridade entre elas.
export function minPairwiseSimilarity(embeddings: number[][]): number {
  let lowest = 1;
  for (let i = 0; i < embeddings.length; i += 1) {
    for (let j = i + 1; j < embeddings.length; j += 1) {
      lowest = Math.min(lowest, faceSimilarity(embeddings[i], embeddings[j]));
    }
  }
  return lowest;
}

// Atribuicao 1-para-1: cada rosto recebe no maximo um aluno e cada aluno aparece em no maximo
// um rosto. Gulosa por similaridade decrescente — o par mais parecido e resolvido primeiro.
export function suggestFaceMatches(
  faces: number[][],
  enrolled: EnrolledFace[],
  options?: { threshold?: number; highThreshold?: number },
): FaceSuggestion[] {
  const threshold = options?.threshold ?? FACE_MATCH_THRESHOLD;
  const highThreshold = options?.highThreshold ?? FACE_HIGH_CONFIDENCE_THRESHOLD;

  const candidatesByFace: FaceCandidate[][] = faces.map((face) => enrolled
    .map((entry) => ({ userId: entry.userId, similarity: bestSimilarity(face, entry) }))
    .filter((candidate) => candidate.similarity >= threshold)
    .sort((left, right) => right.similarity - left.similarity || left.userId.localeCompare(right.userId)));

  const pairs = candidatesByFace
    .flatMap((candidates, faceIndex) => candidates.map((candidate) => ({ faceIndex, ...candidate })))
    .sort((left, right) => right.similarity - left.similarity
      || left.faceIndex - right.faceIndex
      || left.userId.localeCompare(right.userId));

  const bestByFace = new Map<number, FaceCandidate>();
  const takenUsers = new Set<string>();
  for (const pair of pairs) {
    if (bestByFace.has(pair.faceIndex) || takenUsers.has(pair.userId)) {
      continue;
    }
    bestByFace.set(pair.faceIndex, { userId: pair.userId, similarity: pair.similarity });
    takenUsers.add(pair.userId);
  }

  return faces.map((_, faceIndex) => {
    const best = bestByFace.get(faceIndex) ?? null;
    return {
      faceIndex,
      best: best
        ? { ...best, confidence: best.similarity >= highThreshold ? 'high' as const : 'medium' as const }
        : null,
      alternatives: candidatesByFace[faceIndex]
        .filter((candidate) => candidate.userId !== best?.userId)
        .slice(0, MAX_ALTERNATIVES),
    };
  });
}

// Idade exata (nao so pelo ano): biometria so e aceita de quem ja completou 18 anos.
export function isAdultByBirthDate(birthDate: string | null | undefined, now: Date = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((birthDate ?? '').trim());
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return false;
  }

  let age = now.getUTCFullYear() - year;
  const beforeBirthday = now.getUTCMonth() + 1 < month
    || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
  if (beforeBirthday) {
    age -= 1;
  }

  return age >= 18;
}
