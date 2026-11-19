import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

// O app fala com o servidor pelo callableProxy, que so deixa passar as funcoes da lista
// ALLOWED_CALLABLES. Funcao chamada pelo app e fora da lista responde "not-found" (foi o que
// travou excluir curso/trilha no Learning e o "Excluir conta"). Este teste compara as duas listas.

const ROOT = join(import.meta.dirname, '..');

test('toda funcao chamada pelo app esta liberada no callableProxy', () => {
  const proxy = readFileSync(join(ROOT, 'functions/src/modules/proxy.ts'), 'utf8');
  const start = proxy.indexOf('ALLOWED_CALLABLES');
  const allowed = new Set([...proxy.slice(start, proxy.indexOf(']);', start)).matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]));

  const client = readFileSync(join(ROOT, 'services/firebase/functions.ts'), 'utf8');
  const used = new Set([...client.matchAll(/callFunction<[\s\S]*?>\(\s*'([A-Za-z]+)'/g)].map((match) => match[1]));

  assert.ok(used.size > 50, `esperava achar as chamadas do app (achou ${used.size})`);
  const missing = [...used].filter((name) => !allowed.has(name)).sort();
  assert.deepEqual(missing, []);
});
