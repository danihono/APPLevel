import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveCommitment,
  resolveMonthlyCommitment,
  summarizeMonthlyAttendance,
  summarizeMonthlyAttendanceByUser,
} from '../commitmentScale.ts';

const timestamp = (iso: string) => ({ toDate: () => new Date(iso) });

// Presenca no dia informado de setembro/2026, as 19h de Sao Paulo (22:00Z).
const onDay = (day: number, extra: Record<string, unknown> = {}) => ({
  classStartAt: timestamp(`2026-09-${String(day).padStart(2, '0')}T22:00:00Z`),
  ...extra,
});

// "Hoje" = 30/09/2026: a janela de 30 dias e setembro inteiro (01/09 esta 29 dias atras).
const REFERENCE = new Date('2026-09-30T12:00:00Z');

// Presenca `daysAgo` dias antes de REFERENCE, as 19h de Sao Paulo.
const ago = (daysAgo: number, extra: Record<string, unknown> = {}) => onDay(30 - daysAgo, extra);

const adult = (classes: number, weeksWithClasses = 0) =>
  resolveCommitment({ classes, weeksWithClasses, track: 'Adulto' });

const kids = (classes: number) => resolveCommitment({ classes, track: 'Kids' });

test('tabela do adulto: faixa vermelha ponto a ponto', () => {
  assert.deepEqual([adult(0).score, adult(0).level], [0, 'vermelho']);
  assert.deepEqual([adult(1).score, adult(1).level], [1, 'vermelho']);
  assert.deepEqual([adult(2).score, adult(2).level], [2, 'vermelho']);
  assert.deepEqual([adult(3).score, adult(3).level], [3, 'vermelho']);
});

test('adulto com 4 aulas: a distribuicao no mes muda a nota', () => {
  assert.equal(adult(4, 4).score, 10);
  assert.equal(adult(4, 3).score, 8);
  assert.equal(adult(4, 2).score, 5);
  assert.equal(adult(4, 1).score, 3);
  assert.equal(adult(4, 0).score, 3);
  assert.equal(adult(4, 4).level, 'vermelho');
});

test('a regra de semanas vale so para adulto com exatamente 4 aulas', () => {
  assert.equal(adult(3, 3).score, 3);
  assert.equal(adult(5, 1).score, 30);
  assert.equal(resolveCommitment({ classes: 4, weeksWithClasses: 1, track: 'Kids' }).score, 50);
  assert.equal(resolveCommitment({ classes: 4, weeksWithClasses: 4, track: 'Kids' }).score, 50);
});

test('tabela do adulto: laranja, amarelo e verde nas fronteiras', () => {
  const expected: Array<[number[], number, string]> = [
    [[5, 6, 7, 8], 30, 'laranja'],
    [[9, 10, 11, 12], 50, 'laranja'],
    [[13, 14, 15, 16], 60, 'amarelo'],
    [[17, 18, 19, 20], 80, 'verde'],
    [[21, 22, 23], 90, 'verde'],
    [[24, 25, 40], 100, 'verde'],
  ];

  expected.forEach(([values, score, level]) => {
    values.forEach((classes) => {
      assert.deepEqual([adult(classes).score, adult(classes).level], [score, level], `${classes} aulas`);
    });
  });
});

test('tabela kids: cada linha', () => {
  assert.deepEqual([kids(0).score, kids(0).level], [0, 'vermelho']);
  assert.deepEqual([kids(1).score, kids(1).level], [5, 'vermelho']);
  assert.deepEqual([kids(2).score, kids(2).level], [25, 'laranja']);
  assert.deepEqual([kids(3).score, kids(3).level], [35, 'laranja']);
  assert.deepEqual([kids(4).score, kids(4).level], [50, 'amarelo']);
  assert.deepEqual([kids(5).score, kids(5).level], [70, 'amarelo']);
  assert.deepEqual([kids(6).score, kids(6).level], [80, 'amarelo']);
  assert.deepEqual([kids(7).score, kids(7).level], [90, 'verde']);
  assert.deepEqual([kids(8).score, kids(8).level], [100, 'verde']);
  assert.deepEqual([kids(12).score, kids(12).level], [100, 'verde']);
});

test('a cor vem da tabela, nao de um limiar sobre a nota', () => {
  // Os mesmos 80 pontos: verde no adulto, amarelo no kids. Se alguem trocar as tabelas por
  // faixas de score, este teste cai.
  assert.equal(adult(17).score, 80);
  assert.equal(adult(17).level, 'verde');
  assert.equal(kids(6).score, 80);
  assert.equal(kids(6).level, 'amarelo');
});

test('rotulos das cores saem como o cliente pediu', () => {
  assert.equal(adult(0).label, 'Baixa frequência');
  assert.equal(adult(6).label, 'Média frequência');
  assert.equal(adult(14).label, 'Boa frequência');
  assert.equal(adult(24).label, 'Excelente frequência');
});

test('semanas sao blocos de 7 dias contados de hoje para tras (0-6, 7-13, 14-20, 21-29)', () => {
  const espalhado = summarizeMonthlyAttendance({
    attendances: [ago(0), ago(7), ago(14), ago(21)],
    now: REFERENCE,
  });
  assert.deepEqual([espalhado.classes, espalhado.weeksWithClasses], [4, 4]);

  const mesmaSemana = summarizeMonthlyAttendance({
    attendances: [ago(0), ago(1), ago(2), ago(6)],
    now: REFERENCE,
  });
  assert.deepEqual([mesmaSemana.classes, mesmaSemana.weeksWithClasses], [4, 1]);

  // Fronteiras 6/7, 13/14, 20/21 e o 29o dia ainda no quarto bloco.
  assert.equal(summarizeMonthlyAttendance({ attendances: [ago(6), ago(7)], now: REFERENCE }).weeksWithClasses, 2);
  assert.equal(summarizeMonthlyAttendance({ attendances: [ago(13), ago(14)], now: REFERENCE }).weeksWithClasses, 2);
  assert.equal(summarizeMonthlyAttendance({ attendances: [ago(20), ago(21)], now: REFERENCE }).weeksWithClasses, 2);
  assert.equal(summarizeMonthlyAttendance({ attendances: [ago(21), ago(29)], now: REFERENCE }).weeksWithClasses, 1);
});

test('duas aulas no mesmo dia contam duas, mas uma semana so', () => {
  const summary = summarizeMonthlyAttendance({
    attendances: [onDay(9), { classStartAt: timestamp('2026-09-09T23:30:00Z') }],
    now: REFERENCE,
  });
  assert.deepEqual([summary.classes, summary.weeksWithClasses], [2, 1]);
});

test('aula que nao vira presenca ainda conta como treino', () => {
  // Faixa azul que foi na LEVEL Iniciante, ou 3a aula do mesmo dia: treinou. Conta para o
  // comprometimento e fica de fora do que soma para a graduacao.
  const summary = summarizeMonthlyAttendance({
    attendances: [onDay(5), onDay(6, { countsAsAttendance: false })],
    now: REFERENCE,
  });
  assert.deepEqual(
    [summary.classes, summary.countedClasses, summary.weeksWithClasses],
    [2, 1, 1],
  );
});

test('a nota sai da participacao, nao da presenca computada', () => {
  // Quatro treinos, um deles na aula iniciante: nota de 4 aulas em 4 semanas (10), nao de 3 (3).
  const commitment = resolveMonthlyCommitment({
    attendances: [onDay(3), onDay(10), onDay(17), onDay(25, { countsAsAttendance: false })],
    track: 'Adulto',
    now: REFERENCE,
  });
  assert.deepEqual(
    [commitment.classes, commitment.countedClasses, commitment.weeksWithClasses, commitment.score],
    [4, 3, 4, 10],
  );
});

test('countedClasses nunca passa de classes', () => {
  const commitment = resolveCommitment({ classes: 3, countedClasses: 9, track: 'Adulto' });
  assert.equal(commitment.countedClasses, 3);

  // Sem informar, assume que tudo conta.
  assert.equal(resolveCommitment({ classes: 5, track: 'Adulto' }).countedClasses, 5);
});

test('ignora o que esta fora da janela de 30 dias, data futura e registro sem data', () => {
  const summary = summarizeMonthlyAttendance({
    attendances: [
      onDay(1),
      // 30 dias antes de hoje: acabou de sair da janela.
      { classStartAt: timestamp('2026-08-31T22:00:00Z') },
      { classStartAt: timestamp('2026-10-01T22:00:00Z') },
      {},
    ],
    now: REFERENCE,
  });
  assert.deepEqual([summary.classes, summary.weeksWithClasses], [1, 1]);
});

test('vale a data da aula, nao a do lancamento', () => {
  // Aula de agosto lancada pelo professor em setembro: vale o dia da aula, fora da janela.
  const atrasada = summarizeMonthlyAttendance({
    attendances: [{ classId: 'c1', checkedInAt: timestamp('2026-09-15T22:00:00Z') }],
    classStartById: new Map([['c1', timestamp('2026-08-15T22:00:00Z')]]),
    now: REFERENCE,
  });
  assert.equal(atrasada.classes, 0);

  // Aula apagada e sem snapshot de horario: o lancamento e o unico fallback.
  const semAula = summarizeMonthlyAttendance({
    attendances: [{ classId: 'c2', checkedInAt: timestamp('2026-09-15T22:00:00Z') }],
    classStartById: new Map(),
    now: REFERENCE,
  });
  assert.equal(semAula.classes, 1);

  // classStartAt da propria presenca ganha do mapa de aulas (aluno de outra unidade).
  const denormalizado = summarizeMonthlyAttendance({
    attendances: [{ classId: 'c3', classStartAt: timestamp('2026-08-04T22:00:00Z'), checkedInAt: timestamp('2026-09-20T22:00:00Z') }],
    classStartById: new Map(),
    now: REFERENCE,
  });
  assert.equal(denormalizado.classes, 0);
});

test('dia sai no fuso da academia, nao no do aparelho', () => {
  // 01/10 as 02:00Z ainda e 30/09 as 23:00 em Sao Paulo: e hoje, nao amanha.
  const viradaDoDia = [{ classStartAt: timestamp('2026-10-01T02:00:00Z') }];
  assert.equal(summarizeMonthlyAttendance({ attendances: viradaDoDia, now: REFERENCE }).classes, 1);
  // Em UTC a mesma aula ja e 01/10, data futura.
  assert.equal(summarizeMonthlyAttendance({ attendances: viradaDoDia, now: REFERENCE, timeZone: 'UTC' }).classes, 0);

  // Fuso invalido cai no padrao em vez de explodir.
  assert.equal(summarizeMonthlyAttendance({ attendances: viradaDoDia, now: REFERENCE, timeZone: 'Campinas' }).classes, 1);
});

test('virada do mes nao zera a barra', () => {
  // 17 treinos em setembro (dias 2 a 18): 80, verde.
  const setembro = Array.from({ length: 17 }, (_, index) => onDay(index + 2));
  const at = (iso: string) => resolveMonthlyCommitment({ attendances: setembro, track: 'Adulto', now: new Date(iso) });

  assert.deepEqual([at('2026-09-30T12:00:00Z').classes, at('2026-09-30T12:00:00Z').score], [17, 80]);
  // 1o de outubro comeca com a mesma nota com que setembro terminou.
  assert.deepEqual([at('2026-10-01T12:00:00Z').classes, at('2026-10-01T12:00:00Z').score, at('2026-10-01T12:00:00Z').level], [17, 80, 'verde']);
  // No dia seguinte a aula de 02/09 completa 30 dias e sai da conta: cai aos poucos, nao de uma vez.
  assert.deepEqual([at('2026-10-02T12:00:00Z').classes, at('2026-10-02T12:00:00Z').score], [16, 60]);
});

test('mapa por aluno filtra a unidade e separa as contagens', () => {
  const byUser = summarizeMonthlyAttendanceByUser({
    attendances: [
      { userId: 'ana', academyId: 'cambui', ...onDay(3) },
      { userId: 'ana', academyId: 'cambui', ...onDay(10) },
      { userId: 'ana', academyId: 'centro', ...onDay(11) },
      { userId: 'bob', academyId: 'cambui', ...onDay(4) },
      { userId: 'bob', academyId: 'cambui', ...onDay(5, { countsAsAttendance: false }) },
    ],
    academyId: 'cambui',
    now: REFERENCE,
  });

  assert.equal(byUser.get('ana')?.classes, 2);
  assert.equal(byUser.get('ana')?.weeksWithClasses, 2);
  // Bob treinou duas vezes; uma nao virou presenca.
  assert.deepEqual([byUser.get('bob')?.classes, byUser.get('bob')?.countedClasses], [2, 1]);
  assert.equal(byUser.get('sem-presenca'), undefined);

  // Sem academyId, a rede inteira soma.
  const rede = summarizeMonthlyAttendanceByUser({
    attendances: [
      { userId: 'ana', academyId: 'cambui', ...onDay(3) },
      { userId: 'ana', academyId: 'centro', ...onDay(11) },
    ],
    now: REFERENCE,
  });
  assert.equal(rede.get('ana')?.classes, 2);
});

test('atalho ponta a ponta: as mesmas 4 aulas valem 10 no adulto e 50 no kids', () => {
  const attendances = [onDay(3), onDay(10), onDay(17), onDay(25)];

  const adulto = resolveMonthlyCommitment({ attendances, track: 'Adulto', now: REFERENCE });
  assert.deepEqual(
    [adulto.track, adulto.classes, adulto.weeksWithClasses, adulto.score, adulto.level],
    ['Adulto', 4, 4, 10, 'vermelho'],
  );

  const crianca = resolveMonthlyCommitment({ attendances, track: 'Kids', now: REFERENCE });
  assert.deepEqual([crianca.track, crianca.score, crianca.level], ['Kids', 50, 'amarelo']);
});
