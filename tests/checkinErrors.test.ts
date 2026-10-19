import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCheckinError } from '../checkinErrors.ts';

function backendError(message: string, backendCode: string, shown = message) {
  return Object.assign(new Error(shown), { backendCode, backendMessage: message });
}

test('QR expirado vira "expired"', () => {
  assert.equal(classifyCheckinError(backendError('QR Code expirado.', 'functions/failed-precondition')).kind, 'expired');
});

test('QR invalido (QR que ja girou) vira "expired" mesmo com a mensagem generica de permissao na tela', () => {
  const info = classifyCheckinError(backendError('QR Code invalido.', 'functions/permission-denied', 'Sua sessão não tem permissão para acessar este recurso.'));
  assert.equal(info.kind, 'expired');
  assert.equal(info.detail, 'Sua sessão não tem permissão para acessar este recurso.');
});

test('aula de outra academia ou inexistente vira "wrong-class"', () => {
  assert.equal(classifyCheckinError(backendError('Aula nao encontrada.', 'functions/not-found')).kind, 'wrong-class');
  assert.equal(classifyCheckinError(backendError('Aula fora da sua academia.', 'functions/permission-denied')).kind, 'wrong-class');
});

test('QR ainda nao gerado vira "closed"; aula que nao aceita mais check-in vira "ended"', () => {
  assert.equal(classifyCheckinError(backendError('QR Code indisponivel para esta aula.', 'functions/failed-precondition')).kind, 'closed');
  assert.equal(classifyCheckinError(backendError('A aula precisa estar ativa para registrar presenca.', 'functions/failed-precondition')).kind, 'ended');
});

test('presenca duplicada vira "already" pelo codigo ou pelo texto', () => {
  assert.equal(classifyCheckinError(backendError('Presenca ja registrada para este atleta nesta aula.', 'functions/already-exists')).kind, 'already');
  assert.equal(classifyCheckinError(new Error('Presença já registrada para este atleta nesta aula.')).kind, 'already');
});

test('resto cai no generico, com o texto para "Detalhes"', () => {
  const info = classifyCheckinError(new Error('O servidor não respondeu agora.'));
  assert.equal(info.kind, 'generic');
  assert.equal(info.detail, 'O servidor não respondeu agora.');
  assert.equal(classifyCheckinError(null).kind, 'generic');
});
