// AWS Rekognition FALSO, so para o emulador local (FUNCTIONS_EMULATOR + FACE_AWS_FAKE=1 em
// functions/.env.local). Nunca roda em producao: lib/rekognition.ts so o usa nessas condicoes.
//
// Serve para testar o fluxo inteiro (cadastro, foto da turma, recortes, revogacao) sem chaves da
// AWS. A "identidade" de um rosto e a cor media do centro da imagem; a foto da turma tem fundo
// cinza e cada "rosto" e uma regiao colorida. Nao reconhece rostos de verdade.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

type Rgb = [number, number, number];
interface FakeState {
  faces: Record<string, { color: Rgb; userId?: string }>;
  users: Record<string, true>;
}

// Os emuladores rodam cada function em um processo: o estado fica num arquivo.
const STATE_FILE = join(tmpdir(), 'applevel-fake-rekognition.json');
const SAME_PERSON_DISTANCE = 40;

function load(): FakeState {
  if (!existsSync(STATE_FILE)) return { faces: {}, users: {} };
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as FakeState;
}

function save(state: FakeState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state));
}

function awsError(name: string): Error {
  return Object.assign(new Error(name), { name });
}

const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const similarity = (a: Rgb, b: Rgb) => Math.max(0, Math.round((100 - distance(a, b) / 8) * 10) / 10);
const isGray = ([r, g, b]: Rgb) => Math.max(r, g, b) - Math.min(r, g, b) < 8;

async function centerColor(bytes: Uint8Array): Promise<Rgb> {
  const image = sharp(Buffer.from(bytes));
  const meta = await image.metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const { data } = await image
    .extract({ left: Math.floor(w * 0.3), top: Math.floor(h * 0.3), width: Math.max(1, Math.floor(w * 0.4)), height: Math.max(1, Math.floor(h * 0.4)) })
    .resize(1, 1)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
}

// "Rostos" da foto da turma: regioes nao cinzas, encontradas numa grade de 64 colunas.
async function findColoredRegions(bytes: Uint8Array): Promise<Array<{ Left: number; Top: number; Width: number; Height: number }>> {
  const cols = 64;
  const image = sharp(Buffer.from(bytes));
  const meta = await image.metadata();
  const rows = Math.max(1, Math.round(cols * (meta.height ?? 1) / (meta.width ?? 1)));
  const { data } = await image.resize(cols, rows, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const seen = new Uint8Array(cols * rows);
  const colored = (i: number) => !isGray([data[i * 3], data[i * 3 + 1], data[i * 3 + 2]]);
  const boxes = [];
  for (let start = 0; start < cols * rows; start += 1) {
    if (seen[start] || !colored(start)) continue;
    let minX = cols; let minY = rows; let maxX = 0; let maxY = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % cols; const y = Math.floor(i / cols);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (!seen[ni] && colored(ni)) { seen[ni] = 1; stack.push(ni); }
      }
    }
    if (maxX - minX >= 1 && maxY - minY >= 1) {
      boxes.push({ Left: minX / cols, Top: minY / rows, Width: (maxX - minX + 1) / cols, Height: (maxY - minY + 1) / rows });
    }
  }
  return boxes;
}

let counter = 0;

export function createFakeRekognitionClient() {
  return {
    async send(command: { constructor: { name: string }; input: Record<string, any> }) {
      const input = command.input;
      const state = load();
      switch (command.constructor.name) {
        case 'DescribeCollectionCommand':
        case 'CreateCollectionCommand':
          return {};
        case 'IndexFacesCommand': {
          const color = await centerColor(input.Image.Bytes);
          if (isGray(color)) return { FaceRecords: [], UnindexedFaces: [{ Reasons: ['LOW_CONFIDENCE'] }] };
          counter += 1;
          const faceId = `fake-${Date.now()}-${counter}`;
          state.faces[faceId] = { color };
          save(state);
          return { FaceRecords: [{ Face: { FaceId: faceId } }] };
        }
        case 'SearchUsersCommand': {
          const face = state.faces[input.FaceId];
          const matches = Object.values(state.faces)
            .filter((other) => other.userId && face && distance(other.color, face.color) <= SAME_PERSON_DISTANCE)
            .map((other) => ({ Similarity: similarity(other.color, face.color), User: { UserId: other.userId } }));
          return { UserMatches: matches };
        }
        case 'CreateUserCommand':
          if (state.users[input.UserId]) throw awsError('ConflictException');
          state.users[input.UserId] = true;
          save(state);
          return {};
        case 'AssociateFacesCommand': {
          const reference = Object.values(state.faces).find((face) => face.userId === input.UserId);
          const associated = [];
          const failed = [];
          for (const faceId of input.FaceIds as string[]) {
            const face = state.faces[faceId];
            if (!face) { failed.push({ FaceId: faceId, Reasons: ['FACE_NOT_FOUND'] }); continue; }
            if (reference && distance(reference.color, face.color) > SAME_PERSON_DISTANCE) {
              failed.push({ FaceId: faceId, Reasons: ['LOW_MATCH_CONFIDENCE'] });
              continue;
            }
            face.userId = input.UserId;
            associated.push({ FaceId: faceId });
          }
          save(state);
          return { AssociatedFaces: associated, UnsuccessfulFaceAssociations: failed };
        }
        case 'ListFacesCommand':
          return { Faces: Object.entries(state.faces).filter(([, face]) => face.userId === input.UserId).map(([FaceId]) => ({ FaceId })) };
        case 'DeleteUserCommand':
          if (!state.users[input.UserId]) throw awsError('ResourceNotFoundException');
          delete state.users[input.UserId];
          for (const face of Object.values(state.faces)) if (face.userId === input.UserId) delete face.userId;
          save(state);
          return {};
        case 'DeleteFacesCommand':
          for (const faceId of input.FaceIds as string[]) delete state.faces[faceId];
          save(state);
          return {};
        case 'DetectFacesCommand':
          return { FaceDetails: (await findColoredRegions(input.Image.Bytes)).map((BoundingBox) => ({ Confidence: 99.9, BoundingBox })) };
        case 'SearchUsersByImageCommand': {
          const color = await centerColor(input.Image.Bytes);
          if (isGray(color)) throw awsError('InvalidParameterException');
          const best = new Map<string, number>();
          for (const face of Object.values(state.faces)) {
            if (!face.userId) continue;
            const value = similarity(face.color, color);
            if (value >= (input.UserMatchThreshold ?? 80)) best.set(face.userId, Math.max(best.get(face.userId) ?? 0, value));
          }
          return { UserMatches: [...best].map(([UserId, Similarity]) => ({ Similarity, User: { UserId } })).sort((a, b) => b.Similarity - a.Similarity) };
        }
        default:
          throw new Error(`Comando sem simulacao: ${command.constructor.name}`);
      }
    },
  };
}
