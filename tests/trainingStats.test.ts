import assert from 'node:assert/strict';
import test from 'node:test';
import {
  academyDayOffset,
  academyHour,
  computeWeekTrainings,
  computeWeeklyStreak,
  isClassLive,
  nextClassForStudent,
  weekStartKey,
} from '../trainingStats.ts';

const TZ = 'America/Sao_Paulo';
// Terca, 6 de outubro de 2026, 15:00 em Sao Paulo (18:00 UTC).
const now = new Date('2026-10-06T18:00:00Z');
const at = (iso: string) => new Date(iso);
const presence = (classId: string, classStartAt?: string, extra: Record<string, unknown> = {}) => ({
  classId,
  ...(classStartAt ? { classStartAt: at(classStartAt) } : {}),
  ...extra,
});

test('weekStartKey vai de segunda a domingo', () => {
  assert.equal(weekStartKey('2026-10-05'), '2026-10-05'); // segunda
  assert.equal(weekStartKey('2026-10-06'), '2026-10-05');
  assert.equal(weekStartKey('2026-10-11'), '2026-10-05'); // domingo
  assert.equal(weekStartKey('2026-10-12'), '2026-10-12');
  assert.equal(weekStartKey('2026-03-01'), '2026-02-23'); // virada de mes
});

test('treinos da semana: so os que contam, no fuso da academia', () => {
  const records = [
    presence('a', '2026-10-05T22:00:00Z'), // seg 19h SP
    presence('b', '2026-10-06T10:00:00Z'), // ter 7h SP
    presence('c', '2026-10-06T12:00:00Z', { countsAsAttendance: false }),
    presence('d', '2026-10-05T02:00:00Z'), // dom 4/10 23h SP: semana anterior
    presence('e', '2026-09-30T22:00:00Z'),
  ];
  assert.equal(computeWeekTrainings(records, null, TZ, now), 2);
  // Em Tokyo, 2026-10-05T02:00Z ja e segunda (05/10 11h).
  assert.equal(computeWeekTrainings(records, null, 'Asia/Tokyo', now), 3);
});

test('treinos da semana: usa o horario da aula (Map ou lista) quando a presenca nao tem snapshot', () => {
  const records = [
    { classId: 'x', checkedInAt: at('2026-10-06T12:00:00Z') }, // lancada hoje, aula da semana passada
    { classId: 'y', checkedInAt: at('2026-09-20T12:00:00Z') }, // aula sumiu: cai no checkedInAt
  ];
  const classes = [{ id: 'x', scheduledStart: at('2026-10-02T22:00:00Z') }];
  assert.equal(computeWeekTrainings(records, classes, TZ, now), 0);
  assert.equal(computeWeekTrainings(records, new Map([['x', at('2026-10-05T22:00:00Z')]]), TZ, now), 1);
  assert.equal(computeWeekTrainings(records, null, TZ, now), 1);
  assert.equal(computeWeekTrainings([], null, TZ, now), 0);
});

test('semanas seguidas: termina na semana atual ou na anterior', () => {
  const thisWeek = presence('1', '2026-10-05T22:00:00Z');
  const lastWeek = presence('2', '2026-09-30T22:00:00Z');
  const twoWeeksAgo = presence('3', '2026-09-21T22:00:00Z');
  const fourWeeksAgo = presence('4', '2026-09-08T22:00:00Z');

  assert.equal(computeWeeklyStreak([thisWeek, lastWeek, twoWeeksAgo, fourWeeksAgo], null, TZ, now), 3);
  // Semana atual sem treino ainda nao quebra.
  assert.equal(computeWeeklyStreak([lastWeek, twoWeeksAgo], null, TZ, now), 2);
  // Buraco de uma semana zera.
  assert.equal(computeWeeklyStreak([twoWeeksAgo, fourWeeksAgo], null, TZ, now), 0);
  // So a semana atual.
  assert.equal(computeWeeklyStreak([thisWeek], null, TZ, now), 1);
  // Presenca que nao conta nao sustenta a sequencia.
  assert.equal(computeWeeklyStreak([presence('5', '2026-10-05T22:00:00Z', { countsAsAttendance: false }), twoWeeksAgo], null, TZ, now), 0);
  assert.equal(computeWeeklyStreak([], null, TZ, now), 0);
});

const lesson = (id: string, start: string, end: string | null, status = 'scheduled', description?: string) => ({
  id,
  status,
  description,
  scheduledStart: at(start),
  ...(end ? { scheduledEnd: at(end) } : {}),
});

test('proxima aula: hoje ainda nao terminada, ativa primeiro, ignora cancelada/finalizada', () => {
  const classes = [
    lesson('manha', '2026-10-06T10:00:00Z', '2026-10-06T11:00:00Z'), // ja terminou
    lesson('noite', '2026-10-06T22:00:00Z', '2026-10-06T23:00:00Z'),
    lesson('tarde', '2026-10-06T19:00:00Z', '2026-10-06T20:00:00Z'),
    lesson('cancelada', '2026-10-06T18:30:00Z', '2026-10-06T19:30:00Z', 'cancelled'),
    lesson('finalizada', '2026-10-06T17:00:00Z', '2026-10-06T19:00:00Z', 'finished'),
  ];
  assert.equal(nextClassForStudent(classes, now, TZ)?.id, 'tarde');
  const withActive = [...classes, lesson('ativa', '2026-10-06T17:30:00Z', '2026-10-06T18:30:00Z', 'active')];
  assert.equal(nextClassForStudent(withActive, now, TZ)?.id, 'ativa');
});

test('proxima aula: sem aula hoje cai na proxima futura; nada futuro = null', () => {
  const classes = [
    lesson('quinta', '2026-10-08T22:00:00Z', null),
    lesson('amanha', '2026-10-07T10:00:00Z', null),
    lesson('ontem', '2026-10-05T22:00:00Z', null),
  ];
  assert.equal(nextClassForStudent(classes, now, TZ)?.id, 'amanha');
  assert.equal(nextClassForStudent([lesson('ontem', '2026-10-05T22:00:00Z', null)], now, TZ), null);
  // Ativa esquecida aberta desde ontem nao vira "agora".
  assert.equal(nextClassForStudent([lesson('velha', '2026-10-05T22:00:00Z', '2026-10-05T23:00:00Z', 'active')], now, TZ), null);
  // Ativa de hoje que passou do horario continua (o professor ainda nao finalizou).
  assert.equal(nextClassForStudent([lesson('atrasada', '2026-10-06T15:00:00Z', '2026-10-06T16:00:00Z', 'active')], now, TZ)?.id, 'atrasada');
});

test('proxima aula: turma infantil so para aluno kids; filtro customizado', () => {
  const classes = [
    lesson('kids', '2026-10-06T19:00:00Z', null, 'scheduled', 'kids-01'),
    lesson('adulto', '2026-10-06T22:00:00Z', null, 'scheduled', 'adulto'),
  ];
  assert.equal(nextClassForStudent(classes, now, TZ)?.id, 'adulto');
  assert.equal(nextClassForStudent(classes, now, TZ, 'kids-02')?.id, 'kids');
  assert.equal(nextClassForStudent(classes, now, TZ, null, (description) => description !== 'adulto')?.id, 'kids');
});

test('aula ao vivo, deslocamento de dias e hora no fuso da academia', () => {
  assert.equal(isClassLive(lesson('x', '2026-10-06T17:30:00Z', '2026-10-06T18:30:00Z'), now), true);
  assert.equal(isClassLive(lesson('y', '2026-10-06T19:00:00Z', null), now), false);
  assert.equal(isClassLive(lesson('z', '2026-10-06T19:00:00Z', null, 'active'), now), true);
  assert.equal(academyDayOffset(at('2026-10-07T02:00:00Z'), now, TZ), 0); // 23h de terca em SP
  assert.equal(academyDayOffset(at('2026-10-07T10:00:00Z'), now, TZ), 1);
  assert.equal(academyDayOffset(at('2026-10-04T10:00:00Z'), now, TZ), -2);
  assert.equal(academyHour(at('2026-10-06T22:00:00Z'), TZ), 19);
  assert.equal(academyHour(at('2026-10-06T03:00:00Z'), TZ), 0);
  assert.equal(academyHour(at('2026-10-06T22:00:00Z'), 'fuso-invalido'), 19);
});
