// Testes do modulo de reconhecimento com a AWS simulada (aws-sdk-client-mock).
// Rode com: npm --prefix functions test
const assert = require('node:assert/strict');
const test = require('node:test');
const sharp = require('sharp');
const { mockClient } = require('aws-sdk-client-mock');
const {
  RekognitionClient, IndexFacesCommand, SearchUsersCommand, CreateUserCommand, AssociateFacesCommand,
  DeleteFacesCommand, DeleteUserCommand, ListFacesCommand, DescribeCollectionCommand, CreateCollectionCommand,
  DetectFacesCommand, SearchUsersByImageCommand,
} = require('@aws-sdk/client-rekognition');
const { enrollUserFaces, searchFacesInPhoto, deleteUserFaces, FaceEnrollError } = require('../lib/services/faceRecognition');

const rek = mockClient(RekognitionClient);
const client = new RekognitionClient({ region: 'us-east-1', credentials: { accessKeyId: 'x', secretAccessKey: 'y' } });
const jpeg = (w = 400, h = 400) => sharp({ create: { width: w, height: h, channels: 3, background: '#887766' } }).jpeg().toBuffer();
const notFound = () => Object.assign(new Error('nf'), { name: 'ResourceNotFoundException' });

test.beforeEach(() => {
  rek.reset();
  rek.on(DescribeCollectionCommand).resolves({});
  rek.on(ListFacesCommand).resolves({ Faces: [] });
  rek.on(DeleteUserCommand).resolves({});
  rek.on(DeleteFacesCommand).resolves({});
  rek.on(CreateUserCommand).resolves({});
  rek.on(SearchUsersCommand).resolves({ UserMatches: [] });
});

function indexSequence(results) {
  let call = 0;
  rek.on(IndexFacesCommand).callsFake(() => results[call++]);
}

test('cadastro ok: indexa, confere identidade, cria usuario e associa os rostos', async () => {
  indexSequence([1, 2, 3, 4, 5].map((n) => ({ FaceRecords: [{ Face: { FaceId: `f${n}` } }] })));
  rek.on(AssociateFacesCommand).callsFake((input) => ({ AssociatedFaces: input.FaceIds.map((FaceId) => ({ FaceId })) }));
  const images = await Promise.all([1, 2, 3, 4, 5].map(() => jpeg()));
  const result = await enrollUserFaces(client, 'col', 'uid1', images);
  assert.deepEqual(result.faceIds, ['f1', 'f2', 'f3', 'f4', 'f5']);
  const index = rek.commandCalls(IndexFacesCommand)[0].args[0].input;
  assert.equal(index.MaxFaces, 1);
  assert.equal(index.QualityFilter, 'HIGH');
  assert.equal(index.ExternalImageId, 'uid1');
  assert.equal(rek.commandCalls(CreateUserCommand)[0].args[0].input.UserId, 'uid1');
  // Primeiro rosto vira referencia; os outros so entram se baterem com ela.
  const assoc = rek.commandCalls(AssociateFacesCommand).map((c) => c.args[0].input);
  assert.deepEqual(assoc[0].FaceIds, ['f1']);
  assert.deepEqual(assoc[1].FaceIds, ['f2', 'f3', 'f4', 'f5']);
  assert.equal(assoc[1].UserMatchThreshold, 80);
  assert.equal(rek.commandCalls(DeleteFacesCommand).length, 0);
});

test('cadastro: quadros ruins demais -> erro de qualidade e nada fica na AWS', async () => {
  indexSequence([
    { FaceRecords: [{ Face: { FaceId: 'f1' } }] },
    { FaceRecords: [], UnindexedFaces: [{ Reasons: ['LOW_SHARPNESS'] }] },
    { FaceRecords: [], UnindexedFaces: [{ Reasons: ['LOW_BRIGHTNESS'] }] },
    { FaceRecords: [{ Face: { FaceId: 'f4' } }] },
  ]);
  const images = await Promise.all([1, 2, 3, 4].map(() => jpeg()));
  await assert.rejects(enrollUserFaces(client, 'col', 'uid1', images), (e) => e instanceof FaceEnrollError && e.code === 'low_quality');
  const deleted = rek.commandCalls(DeleteFacesCommand).flatMap((c) => c.args[0].input.FaceIds);
  assert.deepEqual(deleted.sort(), ['f1', 'f4']);
  assert.equal(rek.commandCalls(CreateUserCommand).length, 0);
});

test('cadastro: outra pessoa no quadro descarta o quadro', async () => {
  indexSequence([
    { FaceRecords: [{ Face: { FaceId: 'f1' } }], UnindexedFaces: [{ Reasons: ['EXCEEDS_MAX_FACES'] }] },
    { FaceRecords: [{ Face: { FaceId: 'f2' } }], UnindexedFaces: [{ Reasons: ['EXCEEDS_MAX_FACES'] }] },
    { FaceRecords: [{ Face: { FaceId: 'f3' } }] },
  ]);
  const images = await Promise.all([1, 2, 3].map(() => jpeg()));
  await assert.rejects(enrollUserFaces(client, 'col', 'uid1', images), (e) => e.code === 'multiple_faces');
});

test('cadastro: rostos de pessoas diferentes -> not_same_person e desfaz tudo', async () => {
  indexSequence([1, 2, 3, 4].map((n) => ({ FaceRecords: [{ Face: { FaceId: `f${n}` } }] })));
  rek.on(AssociateFacesCommand)
    .resolvesOnce({ AssociatedFaces: [{ FaceId: 'f1' }] })
    .resolvesOnce({ AssociatedFaces: [{ FaceId: 'f2' }], UnsuccessfulFaceAssociations: [{ FaceId: 'f3', Reasons: ['LOW_MATCH_CONFIDENCE'] }, { FaceId: 'f4', Reasons: ['LOW_MATCH_CONFIDENCE'] }] });
  const images = await Promise.all([1, 2, 3, 4].map(() => jpeg()));
  await assert.rejects(enrollUserFaces(client, 'col', 'uid1', images), (e) => e.code === 'not_same_person');
  assert.equal(rek.commandCalls(DeleteUserCommand).length, 1);
  const deleted = rek.commandCalls(DeleteFacesCommand).flatMap((c) => c.args[0].input.FaceIds);
  assert.deepEqual(deleted.sort(), ['f1', 'f2', 'f3', 'f4']);
});

test('cadastro: rosto que ja e de outro aluno e recusado', async () => {
  indexSequence([1, 2, 3].map((n) => ({ FaceRecords: [{ Face: { FaceId: `f${n}` } }] })));
  rek.on(SearchUsersCommand).resolves({ UserMatches: [{ Similarity: 99, User: { UserId: 'outro' } }] });
  const images = await Promise.all([1, 2, 3].map(() => jpeg()));
  await assert.rejects(enrollUserFaces(client, 'col', 'uid1', images), (e) => e.code === 'already_enrolled_other');
  assert.equal(rek.commandCalls(CreateUserCommand).length, 0);
});

test('cadastro: arquivo que nao e imagem -> invalid_image', async () => {
  await assert.rejects(enrollUserFaces(client, 'col', 'uid1', [Buffer.from('nao e imagem'), Buffer.alloc(10), Buffer.alloc(10)]), (e) => e.code === 'invalid_image');
});

test('cadastro: colecao inexistente e criada', async () => {
  rek.on(DescribeCollectionCommand).rejects(notFound());
  rek.on(CreateCollectionCommand).resolves({});
  indexSequence([1, 2, 3].map((n) => ({ FaceRecords: [{ Face: { FaceId: `f${n}` } }] })));
  rek.on(AssociateFacesCommand).callsFake((input) => ({ AssociatedFaces: input.FaceIds.map((FaceId) => ({ FaceId })) }));
  const images = await Promise.all([1, 2, 3].map(() => jpeg()));
  await enrollUserFaces(client, 'col-nova', 'uid1', images);
  assert.equal(rek.commandCalls(CreateCollectionCommand)[0].args[0].input.CollectionId, 'col-nova');
});

test('revogacao: apaga usuario e todos os rostos, mesmo os que so a AWS conhece', async () => {
  rek.on(ListFacesCommand).resolves({ Faces: [{ FaceId: 'aws1' }, { FaceId: 'f1' }] });
  await deleteUserFaces(client, 'col', 'uid1', ['f1', 'f2']);
  assert.equal(rek.commandCalls(DeleteUserCommand)[0].args[0].input.UserId, 'uid1');
  assert.deepEqual(rek.commandCalls(DeleteFacesCommand)[0].args[0].input.FaceIds.sort(), ['aws1', 'f1', 'f2']);
});

test('revogacao: idempotente quando nada existe na AWS', async () => {
  rek.on(ListFacesCommand).rejects(notFound());
  rek.on(DeleteUserCommand).rejects(notFound());
  await deleteUserFaces(client, 'col', 'uid1', []);
});

test('foto da turma: acha rostos, ignora deteccao fraca/minuscula e busca cada rosto recortado', async () => {
  rek.on(DescribeCollectionCommand).resolves({});
  rek.on(DetectFacesCommand).resolves({ FaceDetails: [
    { Confidence: 99, BoundingBox: { Left: 0.6, Top: 0.2, Width: 0.1, Height: 0.15 } },
    { Confidence: 99, BoundingBox: { Left: 0.1, Top: 0.2, Width: 0.1, Height: 0.15 } },
    { Confidence: 50, BoundingBox: { Left: 0.3, Top: 0.2, Width: 0.1, Height: 0.15 } },
    { Confidence: 99, BoundingBox: { Left: 0.8, Top: 0.2, Width: 0.005, Height: 0.005 } },
  ] });
  let call = 0;
  rek.on(SearchUsersByImageCommand).callsFake(() => {
    call += 1;
    if (call === 1) return { UserMatches: [{ Similarity: 98.76, User: { UserId: 'ana' } }] };
    throw Object.assign(new Error('no face'), { name: 'InvalidParameterException' });
  });
  const faces = await searchFacesInPhoto(client, 'col', await jpeg(2000, 1200));
  assert.equal(faces.length, 2);
  assert.ok(faces[0].box.left < faces[1].box.left, 'ordem da esquerda para a direita');
  const searches = rek.commandCalls(SearchUsersByImageCommand).map((c) => c.args[0].input);
  assert.equal(searches.length, 2);
  assert.equal(searches[0].UserMatchThreshold, 80);
  assert.equal(searches[0].QualityFilter, 'NONE');
  const meta = await sharp(searches[0].Image.Bytes).metadata();
  assert.ok(meta.width >= 240 && meta.height >= 240, 'recorte ampliado');
  const all = faces.flatMap((f) => f.candidates);
  assert.deepEqual(all, [{ userId: 'ana', similarity: 98.8 }]);
});

test('foto da turma: erro da AWS que nao e "sem rosto" sobe para quem chamou', async () => {
  rek.on(DetectFacesCommand).resolves({ FaceDetails: [{ Confidence: 99, BoundingBox: { Left: 0.1, Top: 0.1, Width: 0.2, Height: 0.2 } }] });
  rek.on(SearchUsersByImageCommand).rejects(Object.assign(new Error('denied'), { name: 'AccessDeniedException' }));
  await assert.rejects(searchFacesInPhoto(client, 'col', await jpeg(1000, 800)), (e) => e.name === 'AccessDeniedException');
});
