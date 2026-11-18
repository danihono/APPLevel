// Regras de sugestao da chamada por foto. Modulo PURO (sem Firebase nem modelo), testado isolado.
//
// O reconhecimento roda no nosso servidor (services/faceRecognition.ts, modelo dlib ResNet via
// face-api): cada rosto vira um vetor de 128 numeros. Aqui comparamos vetores, decidimos o que vira
// sugestao, com que confianca, e garantimos que um aluno nao aparece em dois rostos.

export const FACE_MODEL_VERSION = 'dlib-faceapi-v1';
export const FACE_DESCRIPTOR_LENGTH = 128;

// Cadastro: quadros capturados pelo video guiado (o app manda 5; aceitamos de 3 a 6).
export const FACE_MIN_ENROLLMENT_SAMPLES = 3;
export const FACE_MAX_ENROLLMENT_SAMPLES = 6;
// Teto de rostos analisados por foto da turma (tempo de processamento).
export const FACE_MAX_FACES_PER_PHOTO = 60;

// Distancia euclidiana entre vetores do dlib: quanto MENOR, mais parecido. Medido em 20 pessoas
// (selfie x mesmo rosto pequeno/escuro): mesma pessoa ate ~0,34 (0,51 no pior caso escuro e
// borrado); pessoas diferentes nunca abaixo de ~0,49. Ponto de partida — calibrar no teste real.
export const FACE_MATCH_MAX_DISTANCE = 0.45;
export const FACE_HIGH_CONFIDENCE_MAX_DISTANCE = 0.36;
// Quadros do proprio cadastro (angulos diferentes) precisam estar a no maximo isto da referencia.
export const FACE_ENROLLMENT_MAX_DISTANCE = 0.55;
// Rosto do cadastro tao perto de outro aluno ja cadastrado: provavelmente e a mesma pessoa.
export const FACE_DUPLICATE_MAX_DISTANCE = 0.4;

// Para exibir ao professor: distancia vira "% de semelhanca" (0 → 100%; limiar 0,45 → 55%).
export function similarityFromDistance(distance: number): number {
  return Math.round(Math.max(0, Math.min(1, 1 - distance)) * 1000) / 10;
}

export const FACE_MATCH_THRESHOLD = similarityFromDistance(FACE_MATCH_MAX_DISTANCE);
export const FACE_HIGH_CONFIDENCE_THRESHOLD = similarityFromDistance(FACE_HIGH_CONFIDENCE_MAX_DISTANCE);

export function faceDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) {
    const diff = a[index] - b[index];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function isValidDescriptor(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length === FACE_DESCRIPTOR_LENGTH
    && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

export interface EnrolledFace {
  userId: string;
  descriptors: number[][];
}

// Menor distancia entre o rosto e as amostras do aluno.
export function bestDistance(descriptor: number[], enrolled: EnrolledFace): number {
  let best = Number.POSITIVE_INFINITY;
  for (const sample of enrolled.descriptors) {
    best = Math.min(best, faceDistance(descriptor, sample));
  }
  return best;
}

// Candidatos de um rosto da foto: alunos a uma distancia aceitavel, como % de semelhanca.
export function candidatesForFace(descriptor: number[], enrolled: EnrolledFace[]): FaceCandidate[] {
  return enrolled
    .map((entry) => ({ userId: entry.userId, distance: bestDistance(descriptor, entry) }))
    .filter((entry) => entry.distance <= FACE_MATCH_MAX_DISTANCE)
    .map((entry) => ({ userId: entry.userId, similarity: similarityFromDistance(entry.distance) }));
}

// Cadastro: fica so com os quadros coerentes com a referencia (o 1o quadro, de frente). Se sobrar
// menos que o minimo, os quadros nao sao da mesma pessoa.
export function consistentEnrollment(descriptors: number[][]): number[][] {
  if (!descriptors.length) {
    return [];
  }
  const reference = descriptors[0];
  return descriptors.filter((descriptor) => faceDistance(reference, descriptor) <= FACE_ENROLLMENT_MAX_DISTANCE);
}

const MAX_ALTERNATIVES = 2;

export type FaceConfidence = 'high' | 'medium';

export interface FaceCandidate {
  userId: string;
  similarity: number;
}

export interface FaceSuggestion {
  faceIndex: number;
  best: (FaceCandidate & { confidence: FaceConfidence }) | null;
  alternatives: FaceCandidate[];
}

// Atribuicao 1-para-1: cada rosto recebe no maximo um aluno e cada aluno aparece em no maximo
// um rosto. Gulosa por similaridade decrescente — o par mais parecido e resolvido primeiro.
// `candidatesByFace[i]` sao os candidatos do rosto i (ja filtrados pelos alunos elegiveis).
export function suggestFaceMatches(
  candidatesByFace: FaceCandidate[][],
  options?: { threshold?: number; highThreshold?: number },
): FaceSuggestion[] {
  const threshold = options?.threshold ?? FACE_MATCH_THRESHOLD;
  const highThreshold = options?.highThreshold ?? FACE_HIGH_CONFIDENCE_THRESHOLD;

  // Mesmo aluno repetido no mesmo rosto (nao deveria acontecer): fica a maior similaridade.
  const sorted = candidatesByFace.map((candidates) => {
    const bestByUser = new Map<string, number>();
    for (const candidate of candidates) {
      if (candidate.similarity >= threshold) {
        bestByUser.set(candidate.userId, Math.max(bestByUser.get(candidate.userId) ?? 0, candidate.similarity));
      }
    }
    return [...bestByUser.entries()]
      .map(([userId, similarity]) => ({ userId, similarity }))
      .sort((left, right) => right.similarity - left.similarity || left.userId.localeCompare(right.userId));
  });

  const pairs = sorted
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

  return sorted.map((candidates, faceIndex) => {
    const best = bestByFace.get(faceIndex) ?? null;
    return {
      faceIndex,
      best: best
        ? { ...best, confidence: best.similarity >= highThreshold ? 'high' as const : 'medium' as const }
        : null,
      alternatives: candidates
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
