import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import test from 'node:test';

// Hook do React depois de um `return` antecipado muda a quantidade de hooks entre um render e
// outro, e o React derruba a tela inteira (erro #310). Foi o que deixou o app branco no iPhone
// para quem ja estava logado. Este teste le o codigo de todos os componentes e hooks e falha se
// encontrar `useAlgo(...)` depois de um `return` no corpo da funcao.

const require = createRequire(import.meta.url);
const ts = require('typescript') as typeof import('typescript');

const ROOT = join(import.meta.dirname, '..');
const SKIP = new Set(['node_modules', 'functions', 'dist', 'dist-demo', 'ios', 'android', 'tests', '.git', 'public']);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(tsx|ts)$/.test(name) && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

type Node = import('typescript').Node;

const isFunctionLike = (node: Node) =>
  ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node);

function isHookCall(node: Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return /^use[A-Z]/.test(callee.text);
  return ts.isPropertyAccessExpression(callee) && /^use[A-Z]/.test(callee.name.text) && callee.expression.getText() === 'React';
}

function containsReturn(statement: Node): boolean {
  let found = false;
  const walk = (node: Node) => {
    if (found || isFunctionLike(node) || ts.isClassLike(node)) return;
    if (ts.isReturnStatement(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, walk);
  };
  walk(statement);
  return found;
}

function hookCalls(statement: Node): Node[] {
  const calls: Node[] = [];
  const walk = (node: Node) => {
    if (isFunctionLike(node) && node !== statement) return;
    if (isHookCall(node)) calls.push(node);
    ts.forEachChild(node, walk);
  };
  walk(statement);
  return calls;
}

test('nenhum hook do React depois de um return antecipado', () => {
  const problems: string[] = [];
  for (const file of sourceFiles(ROOT)) {
    const text = readFileSync(file, 'utf8');
    const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
    const visit = (node: Node) => {
      if (isFunctionLike(node)) {
        const fn = node as import('typescript').FunctionLikeDeclarationBase;
        let name = fn.name ? fn.name.getText() : '';
        if (!name && node.parent && ts.isVariableDeclaration(node.parent)) name = node.parent.name.getText();
        if (fn.body && ts.isBlock(fn.body) && /^[A-Z]|^use[A-Z]/.test(name)) {
          let returnLine = 0;
          for (const statement of fn.body.statements) {
            if (returnLine) {
              for (const call of hookCalls(statement)) {
                const line = source.getLineAndCharacterOfPosition(call.getStart()).line + 1;
                problems.push(`${relative(ROOT, file)}:${line} ${name} chama um hook depois do return da linha ${returnLine}`);
              }
            }
            if (!returnLine && containsReturn(statement)) {
              returnLine = source.getLineAndCharacterOfPosition(statement.getStart()).line + 1;
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(problems, []);
});
