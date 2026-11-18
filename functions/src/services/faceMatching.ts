// Regras de sugestao da chamada por foto. Modulo PURO (sem Firebase nem AWS), testado isolado.
//
// O reconhecimento em si e feito pelo AWS Rekognition (services/faceRecognition.ts): para cada
// rosto da foto ele devolve candidatos { userId, similarity 0..100 }. Aqui decidimos o que vira
// sugestao, com que confianca, e garantimos que um aluno nao aparece em dois rostos.

export const FACE_MODEL_VERSION = 'aws-rekognition-v1';

// Cadastro: quadros capturados pelo video guiado (o app manda 5; aceitamos de 3 a 6).
export const FACE_MIN_ENROLLMENT_SAMPLES = 3;
export const FACE_MAX_ENROLLMENT_SAMPLES = 6;
// Teto de rostos analisados por foto da turma (custo e tempo).
export const FACE_MAX_FACES_PER_PHOTO = 60;

// Similaridade do Rekognition (0..100). Abaixo do minimo o rosto fica "nao reconhecido"; a partir
// do alto a sugestao ja vem marcada para o professor. Ponto de partida — calibrar no teste real
// (a tela do professor mostra a % de cada sugestao).
export const FACE_SEARCH_THRESHOLD = 80;
export const FACE_MATCH_THRESHOLD = 85;
export const FACE_HIGH_CONFIDENCE_THRESHOLD = 95;

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
