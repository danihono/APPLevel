import assert from 'node:assert/strict';
import test from 'node:test';

import {
  candidatesForFace,
  consistentEnrollment,
  FACE_DESCRIPTOR_LENGTH,
  FACE_HIGH_CONFIDENCE_MAX_DISTANCE,
  FACE_HIGH_CONFIDENCE_THRESHOLD,
  FACE_MATCH_MAX_DISTANCE,
  FACE_MATCH_THRESHOLD,
  faceDistance,
  isAdultByBirthDate,
  isValidDescriptor,
  similarityFromDistance,
  suggestFaceMatches,
} from '../functions/src/services/faceMatching.ts';

// Vetor de 128 numeros deslocado `offset` (distancia euclidiana exata) a partir da base.
const base = Array.from({ length: FACE_DESCRIPTOR_LENGTH }, (_, i) => Math.sin(i) * 0.1);
const shifted = (offset: number, axis = 0) => base.map((value, i) => (i === axis ? value + offset : value));

test('distancia euclidiana e conversao para % de semelhanca', () => {
  assert.equal(faceDistance(base, base), 0);
  assert.ok(Math.abs(faceDistance(base, shifted(0.3)) - 0.3) < 1e-9);
  assert.equal(faceDistance([1, 2], [1]), Number.POSITIVE_INFINITY);
  assert.equal(similarityFromDistance(0), 100);
  assert.equal(similarityFromDistance(0.45), 55);
  assert.equal(similarityFromDistance(1.4), 0);
  assert.equal(FACE_MATCH_THRESHOLD, similarityFromDistance(FACE_MATCH_MAX_DISTANCE));
  assert.ok(FACE_HIGH_CONFIDENCE_THRESHOLD > FACE_MATCH_THRESHOLD);
});

test('vetor valido: 128 numeros finitos', () => {
  assert.equal(isValidDescriptor(base), true);
  assert.equal(isValidDescriptor(base.slice(1)), false);
  assert.equal(isValidDescriptor([...base.slice(1), Number.NaN]), false);
});

test('candidatos: so quem esta dentro do limiar, usando a amostra mais proxima do aluno', () => {
  const enrolled = [
    { userId: 'ana', descriptors: [shifted(0.9, 1), shifted(0.2)] },
    { userId: 'bia', descriptors: [shifted(FACE_MATCH_MAX_DISTANCE + 0.05, 2)] },
  ];
  const candidates = candidatesForFace(base, enrolled);
  assert.deepEqual(candidates, [{ userId: 'ana', similarity: 80 }]);
});

test('cadastro: descarta quadros que nao batem com o primeiro', () => {
  const frames = [base, shifted(0.3), shifted(0.4, 3), shifted(0.9, 5)];
  assert.equal(consistentEnrollment(frames).length, 3);
  assert.deepEqual(consistentEnrollment([]), []);
});

test('sugestao: melhor candidato acima do limiar; desconhecido fica sem sugestao', () => {
  const result = suggestFaceMatches([
    [{ userId: 'bia', similarity: 90 }, { userId: 'ana', similarity: FACE_MATCH_THRESHOLD + 1 }],
    [],
    [{ userId: 'ana', similarity: FACE_HIGH_CONFIDENCE_THRESHOLD - 1 }],
  ]);

  assert.equal(result[0].best?.userId, 'bia');
  assert.equal(result[0].best?.confidence, 'high');
  assert.equal(result[1].best, null);
  assert.equal(result[2].best?.userId, 'ana');
  assert.equal(result[2].best?.confidence, 'medium');
});

test('sugestao 1-para-1: o mesmo aluno nunca e sugerido para dois rostos', () => {
  const result = suggestFaceMatches([
    [{ userId: 'ana', similarity: 70 }],
    [{ userId: 'ana', similarity: 85 }],
  ]);

  // O rosto mais parecido fica com a Ana; o outro vira "nao reconhecido" com ela de alternativa.
  assert.equal(result[1].best?.userId, 'ana');
  assert.equal(result[0].best, null);
  assert.deepEqual(result[0].alternatives.map((candidate) => candidate.userId), ['ana']);
});

test('sugestao: candidato abaixo do limiar minimo e descartado', () => {
  const [face] = suggestFaceMatches([[{ userId: 'ana', similarity: FACE_MATCH_THRESHOLD - 0.5 }]]);
  assert.equal(face.best, null);
  assert.deepEqual(face.alternatives, []);
});

test('sugestao: limiar alto define a confianca', () => {
  const [high, medium] = suggestFaceMatches([
    [{ userId: 'ana', similarity: similarityFromDistance(FACE_HIGH_CONFIDENCE_MAX_DISTANCE) }],
    [{ userId: 'bia', similarity: FACE_HIGH_CONFIDENCE_THRESHOLD - 0.1 }],
  ]);
  assert.equal(high.best?.confidence, 'high');
  assert.equal(medium.best?.confidence, 'medium');
});

test('maioridade: idade exata no dia, nao pelo ano', () => {
  const now = new Date('2026-11-16T12:00:00Z');
  assert.equal(isAdultByBirthDate('2008-11-16', now), true);
  assert.equal(isAdultByBirthDate('2008-11-17', now), false);
  assert.equal(isAdultByBirthDate('1990-01-01', now), true);
  assert.equal(isAdultByBirthDate('', now), false);
  assert.equal(isAdultByBirthDate(undefined, now), false);
  assert.equal(isAdultByBirthDate('2008-02-31', now), false);
});
