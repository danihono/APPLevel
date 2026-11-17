// Regras da biometria facial compartilhadas pelas telas. O backend repete as mesmas checagens
// (functions/src/modules/faceBiometrics.ts) — aqui elas so decidem o que mostrar.
import { tKey } from './i18n';
import type { FaceEngineErrorCode } from './services/faceEngine';

// Versao do termo de consentimento. Mudou o texto do termo? Suba aqui E em FACE_CONSENT_VERSION
// no backend: o aceite fica registrado por versao.
export const FACE_CONSENT_VERSION = '2026-11-v1';

// Marca gravada na presenca (campo `sourceDevice`) quando ela nasce de uma sugestao por foto.
export const FACE_ATTENDANCE_SOURCE = 'face_photo';

// Idade exata no dia (nao so pelo ano): biometria so para quem ja completou 18 anos.
export function isAdultByBirthDate(birthDate: string | null | undefined, now: Date = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((birthDate ?? '').trim());
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) {
    age -= 1;
  }
  return age >= 18;
}

// Paragrafos do termo, na ordem em que aparecem. Traduzidos no render com t().
export const FACE_CONSENT_PARAGRAPHS = [
  tKey('O que é: o app analisa fotos do seu rosto e guarda um código numérico (biometria facial) que permite reconhecer você em fotos da turma.'),
  tKey('Para que serve: somente para sugerir ao professor quem está presente na aula. A presença só é registrada depois que o professor confirma.'),
  tKey('O que fica guardado: apenas o código numérico. As fotos do cadastro e as fotos das aulas não são armazenadas nem enviadas ao servidor.'),
  tKey('Quem acessa: o código fica protegido no servidor do LEVEL. Nem professores nem outros alunos conseguem ver ou baixar a sua biometria, e ela não é compartilhada com terceiros.'),
  tKey('É opcional: você pode recusar e continuar usando o app normalmente, com QR Code ou chamada manual.'),
  tKey('Você pode desistir quando quiser: em Perfil → Biometria facial, toque em "Remover minha biometria" e o código é apagado na hora. Ele também é apagado se você excluir a conta.'),
  tKey('A biometria facial é um dado pessoal sensível (LGPD, art. 11) e é tratada com base no seu consentimento. Disponível apenas para maiores de 18 anos.'),
] as const;

export const FACE_ENGINE_ERROR_TEXT: Record<FaceEngineErrorCode, string> = {
  no_face: tKey('Não encontramos um rosto nesta foto. Tente de novo com boa luz, olhando para a câmera.'),
  multiple_faces: tKey('Apareceu mais de uma pessoa na foto. Tire a foto sozinho(a).'),
  face_too_small: tKey('Seu rosto ficou muito pequeno. Aproxime o celular e tente de novo.'),
  invalid_image: tKey('Não foi possível abrir esta imagem. Tente outra foto.'),
  engine_unavailable: tKey('Não foi possível iniciar o reconhecimento facial neste aparelho. Verifique a conexão e tente de novo.'),
};
