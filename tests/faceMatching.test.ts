import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FACE_HIGH_CONFIDENCE_THRESHOLD,
  FACE_MATCH_THRESHOLD,
  isAdultByBirthDate,
  suggestFaceMatches,
} from '../functions/src/services/faceMatching.ts';

test('sugestao: melhor candidato acima do limiar; desconhecido fica sem sugestao', () => {
  const result = suggestFaceMatches([
    [{ userId: 'bia', similarity: 99.1 }, { userId: 'ana', similarity: 86 }],
    [],
    [{ userId: 'ana', similarity: 91 }],
  ]);

  assert.equal(result[0].best?.userId, 'bia');
  assert.equal(result[0].best?.confidence, 'high');
  assert.equal(result[1].best, null);
  assert.equal(result[2].best?.userId, 'ana');
  assert.equal(result[2].best?.confidence, 'medium');
});

test('sugestao 1-para-1: o mesmo aluno nunca e sugerido para dois rostos', () => {
  const result = suggestFaceMatches([
    [{ userId: 'ana', similarity: 88 }],
    [{ userId: 'ana', similarity: 97 }],
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
    [{ userId: 'ana', similarity: FACE_HIGH_CONFIDENCE_THRESHOLD }],
    [{ userId: 'bia', similarity: FACE_HIGH_CONFIDENCE_THRESHOLD - 0.1 }],
  ]);
  assert.equal(high.best?.confidence, 'high');
  assert.equal(medium.best?.confidence, 'medium');
});

test('sugestao: candidato repetido no mesmo rosto conta uma vez, com a maior similaridade', () => {
  const [face] = suggestFaceMatches([[
    { userId: 'ana', similarity: 90 },
    { userId: 'ana', similarity: 96 },
    { userId: 'bia', similarity: 89 },
  ]]);
  assert.equal(face.best?.userId, 'ana');
  assert.equal(face.best?.similarity, 96);
  assert.deepEqual(face.alternatives.map((candidate) => candidate.userId), ['bia']);
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
