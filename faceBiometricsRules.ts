// Regras da biometria facial compartilhadas pelas telas. O backend repete as mesmas checagens
// (functions/src/modules/faceBiometrics.ts) — aqui elas so decidem o que mostrar.
import { tKey } from './i18n';
import type { FaceEngineErrorCode } from './services/faceEngine';

// Versao do termo de consentimento. Mudou o texto do termo? Suba aqui E em FACE_CONSENT_VERSION
// no backend: o aceite fica registrado por versao. A v3 processa as imagens so no servidor do
// LEVEL (modelo proprio), sem servico de terceiros.
export const FACE_CONSENT_VERSION = '2026-11-v3';

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
  tKey('O que é: no cadastro, a câmera grava alguns segundos do seu rosto e gera um modelo numérico dele (biometria facial). Com ele, o app reconhece você nas fotos da turma.'),
  tKey('Para que serve: somente para sugerir ao professor quem está presente na aula. A presença só é registrada depois que o professor confirma.'),
  tKey('Quem processa: as imagens do cadastro e as fotos das aulas são analisadas apenas no servidor do LEVEL, no Brasil, para gerar e comparar o modelo do rosto. Nenhuma outra empresa recebe essas imagens.'),
  tKey('O que fica guardado: nenhuma foto. Fica apenas o modelo numérico do seu rosto, protegido no servidor do LEVEL e ligado à sua conta. Professores e outros alunos não conseguem vê-lo ou baixá-lo, e ele não é usado para nenhuma outra finalidade.'),
  tKey('É opcional: você pode recusar e continuar usando o app normalmente, com QR Code ou chamada manual.'),
  tKey('Você pode desistir quando quiser: em Perfil → Biometria facial, toque em "Remover minha biometria" e o modelo é apagado na hora. Ele também é apagado se você excluir a conta.'),
  tKey('A biometria facial é um dado pessoal sensível (LGPD, art. 11) e é tratada com base no seu consentimento. Disponível apenas para maiores de 18 anos.'),
] as const;

export const FACE_ENGINE_ERROR_TEXT: Record<FaceEngineErrorCode, string> = {
  invalid_image: tKey('Não foi possível abrir esta imagem. Tente outra foto.'),
  engine_unavailable: tKey('Não foi possível iniciar a câmera do cadastro neste aparelho. Verifique a conexão e tente de novo.'),
};
