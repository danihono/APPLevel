import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FACE_EMBEDDING_LENGTH,
  faceSimilarity,
  isAdultByBirthDate,
  isValidEmbedding,
  minPairwiseSimilarity,
  suggestFaceMatches,
} from '../functions/src/services/faceMatching.ts';

// Vetor "de uma pessoa": base diferente por semente, com um ruido pequeno opcional.
function embedding(seed: number, noise = 0): number[] {
  return Array.from({ length: FACE_EMBEDDING_LENGTH }, (_, index) => (
    ((index * 7 + seed * 13) % 17) / 4 + (index % 2 === 0 ? noise : -noise)
  ));
}

test('similaridade: identico = 1, mesma pessoa com ruido fica alta, pessoas diferentes ficam baixas', () => {
  assert.equal(faceSimilarity(embedding(1), embedding(1)), 1);
  assert.ok(faceSimilarity(embedding(1), embedding(1, 0.05)) > 0.9);
  assert.ok(faceSimilarity(embedding(1), embedding(2)) < 0.3);
  assert.equal(faceSimilarity([1, 2], [1]), 0);
});

test('embedding precisa ter o tamanho do modelo e so numeros finitos', () => {
  assert.equal(isValidEmbedding(embedding(1)), true);
  assert.equal(isValidEmbedding(embedding(1).slice(1)), false);
  assert.equal(isValidEmbedding([...embedding(1).slice(1), Number.NaN]), false);
  assert.equal(isValidEmbedding('rosto'), false);
});

test('sugestao: reconhece cadastrados, ignora desconhecidos e usa a melhor amostra do aluno', () => {
  const enrolled = [
    { userId: 'ana', embeddings: [embedding(5), embedding(1)] },
    { userId: 'bia', embeddings: [embedding(2)] },
  ];
  const result = suggestFaceMatches([embedding(2, 0.005), embedding(9), embedding(1, 0.005)], enrolled);

  assert.equal(result[0].best?.userId, 'bia');
  assert.equal(result[0].best?.confidence, 'high');
  assert.equal(result[1].best, null);
  assert.equal(result[2].best?.userId, 'ana');
});

test('sugestao 1-para-1: o mesmo aluno nunca e sugerido para dois rostos', () => {
  const enrolled = [{ userId: 'ana', embeddings: [embedding(1)] }];
  const result = suggestFaceMatches([embedding(1, 0.25), embedding(1, 0.19)], enrolled);

  // O rosto mais parecido fica com a Ana; o outro vira "nao reconhecido" com ela de alternativa.
  assert.equal(result[1].best?.userId, 'ana');
  assert.equal(result[0].best, null);
  assert.deepEqual(result[0].alternatives.map((candidate) => candidate.userId), ['ana']);
});

test('sugestao: confianca media abaixo do limiar alto', () => {
  const enrolled = [{ userId: 'ana', embeddings: [embedding(1)] }];
  const [face] = suggestFaceMatches([embedding(1, 0.27)], enrolled);
  assert.equal(face.best?.confidence, 'medium');
});

test('selfies do cadastro: menor similaridade entre os pares', () => {
  assert.equal(minPairwiseSimilarity([embedding(1)]), 1);
  assert.ok(minPairwiseSimilarity([embedding(1), embedding(1, 0.05), embedding(2)]) < 0.3);
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
