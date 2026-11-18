// Testes do reconhecimento com o MODELO DE VERDADE (dlib via face-api) e fotos reais de exemplo
// que vem no pacote @vladmandic/face-api. Rode com: npm --prefix functions test
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');
const { describeEnrollment, detectFacesInPhoto, FaceEnrollError } = require('../lib/services/faceRecognition');
const { candidatesForFace, suggestFaceMatches, FACE_HIGH_CONFIDENCE_THRESHOLD } = require('../lib/services/faceMatching');

const samples = path.join(path.dirname(require.resolve('@vladmandic/face-api/package.json')), 'demo');
const sample = (n) => path.join(samples, `sample${n}.jpg`);

// Recorte de um rosto (caixa em fracao) como se fosse um quadro do video do cadastro.
async function frameOf(file, box, { brightness = 1, scale = 1, flip = false } = {}) {
  const meta = await sharp(file).metadata();
  const w = box.width * meta.width, h = box.height * meta.height;
  const side = Math.max(w, h) * 2.4 * scale;
  const cx = (box.left + box.width / 2) * meta.width, cy = (box.top + box.height / 2) * meta.height;
  const left = Math.max(0, Math.round(cx - side / 2)), top = Math.max(0, Math.round(cy - side / 2));
  let img = sharp(file)
    .extract({ left, top, width: Math.min(meta.width - left, Math.round(side)), height: Math.min(meta.height - top, Math.round(side)) })
    .resize(600, 600, { fit: 'fill' })
    .modulate({ brightness });
  if (flip) img = img.flop();
  return img.jpeg({ quality: 90 }).toBuffer();
}

let groupFaces; // rostos da sample3 (3 pessoas)
test.before(async () => {
  groupFaces = await detectFacesInPhoto(await sharp(sample(3)).toBuffer());
});

test('foto de grupo: acha as 3 pessoas da foto, em ordem da esquerda para a direita', () => {
  assert.equal(groupFaces.length, 3);
  assert.ok(groupFaces[0].box.left < groupFaces[1].box.left && groupFaces[1].box.left < groupFaces[2].box.left);
  for (const face of groupFaces) assert.equal(face.descriptor.length, 128);
});

test('cadastro ok: 3 quadros da mesma pessoa com variacoes de luz, distancia e lado', async () => {
  const box = groupFaces[1].box;
  const frames = await Promise.all([
    frameOf(sample(3), box),
    frameOf(sample(3), box, { brightness: 0.8, scale: 1.2 }),
    frameOf(sample(3), box, { flip: true, brightness: 1.1 }),
  ]);
  const descriptors = await describeEnrollment(frames);
  assert.equal(descriptors.length, 3);
});

test('cadastro: quadros de pessoas diferentes -> not_same_person', async () => {
  const frames = await Promise.all([0, 1, 2].map((i) => frameOf(sample(3), groupFaces[i].box)));
  await assert.rejects(describeEnrollment(frames), (e) => e instanceof FaceEnrollError && e.code === 'not_same_person');
});

test('cadastro: imagem sem rosto -> no_face', async () => {
  const gray = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#808080' } }).jpeg().toBuffer();
  await assert.rejects(describeEnrollment([gray, gray, gray]), (e) => e.code === 'no_face');
});

test('cadastro: mais de uma pessoa no quadro -> multiple_faces', async () => {
  const group = await sharp(sample(3)).resize(1000).jpeg().toBuffer();
  await assert.rejects(describeEnrollment([group, group, group]), (e) => e.code === 'multiple_faces');
});

test('cadastro: arquivo que nao e imagem -> invalid_image', async () => {
  await assert.rejects(describeEnrollment([Buffer.from('nao e imagem'), Buffer.alloc(10), Buffer.alloc(10)]), (e) => e.code === 'invalid_image');
});

test('chamada: reconhece quem foi cadastrado e deixa o resto como nao reconhecido', async () => {
  const enrolled = [];
  for (const [index, userId] of [[0, 'ana'], [2, 'bia']]) {
    const box = groupFaces[index].box;
    const frames = await Promise.all([
      frameOf(sample(3), box), frameOf(sample(3), box, { brightness: 0.85 }), frameOf(sample(3), box, { flip: true }),
    ]);
    enrolled.push({ userId, descriptors: await describeEnrollment(frames) });
  }

  // Foto da turma menor (rostos menores, como de mais longe).
  const photo = await sharp(sample(3)).resize(1200).jpeg({ quality: 85 }).toBuffer();
  const faces = await detectFacesInPhoto(photo);
  const result = suggestFaceMatches(faces.map((face) => candidatesForFace(face.descriptor, enrolled)));
  assert.equal(result.length, 3);
  assert.equal(result[0].best?.userId, 'ana');
  assert.equal(result[1].best, null, 'pessoa nao cadastrada nao recebe sugestao');
  assert.equal(result[2].best?.userId, 'bia');
  assert.ok(result[0].best.similarity >= FACE_HIGH_CONFIDENCE_THRESHOLD, `confianca alta (${result[0].best.similarity})`);

  // Outras fotos, com outras pessoas: ninguem pode ser confundido com Ana ou Bia.
  for (const n of [1, 2, 4, 5, 6]) {
    const others = await detectFacesInPhoto(await sharp(sample(n)).toBuffer());
    const wrong = others.map((face) => candidatesForFace(face.descriptor, enrolled)).flat();
    assert.deepEqual(wrong, [], `sample${n} nao deveria sugerir ninguem: ${JSON.stringify(wrong)}`);
  }
});
