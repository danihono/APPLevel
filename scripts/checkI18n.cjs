#!/usr/bin/env node
/*
 * Confere o catalogo de traducoes (i18n/messages):
 *  - toda chamada t('...') / tKey('...') com texto literal precisa ter traducao en + es;
 *  - chaves duplicadas entre arquivos do catalogo;
 *  - t() chamado fora de funcao (constante de modulo congela o idioma do carregamento);
 *  - chaves do catalogo que nao sao mais usadas (apenas aviso).
 *
 * Uso: npm run i18n:check
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const messagesDir = path.join(root, 'i18n', 'messages');
const ignoredDirs = new Set(['node_modules', 'functions', 'dist', 'ios', 'public', '.git', 'i18n', 'tests', 'scripts']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) walk(path.join(dir, entry.name), files);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function parse(file) {
  const text = fs.readFileSync(file, 'utf8');
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function propName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  return null;
}

const catalog = new Map();
const problems = [];

for (const file of fs.readdirSync(messagesDir)) {
  if (!file.endsWith('.ts') || file === 'index.ts' || file === 'types.ts') continue;
  const source = parse(path.join(messagesDir, file));
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const prop of node.initializer.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = propName(prop.name);
        if (key === null) continue;
        const langs = new Set();
        if (ts.isObjectLiteralExpression(prop.initializer)) {
          for (const inner of prop.initializer.properties) {
            if (ts.isPropertyAssignment(inner)) {
              const lang = propName(inner.name);
              const value = inner.initializer;
              if (lang && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) && value.text.trim()) {
                langs.add(lang);
              }
            }
          }
        }
        if (catalog.has(key)) problems.push(`Chave duplicada (${file} e ${catalog.get(key).file}): ${JSON.stringify(key)}`);
        for (const lang of ['en', 'es']) {
          if (!langs.has(lang)) problems.push(`Sem traducao "${lang}" em ${file}: ${JSON.stringify(key)}`);
        }
        catalog.set(key, { file, used: false });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const missing = new Map();

function insideFunction(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isFunctionLike(p)) return true;
  }
  return false;
}
const dynamic = [];

for (const file of walk(root)) {
  const source = parse(file);
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && callee.text === 't' && !insideFunction(node)) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        problems.push(`t() fora de funcao (use tKey e traduza no render) em ${path.relative(root, file)}:${line + 1}`);
      }
      const isT = (ts.isIdentifier(callee) && (callee.text === 't' || callee.text === 'tKey'))
        || (ts.isPropertyAccessExpression(callee) && callee.name.text === 't' && ts.isIdentifier(callee.expression) && callee.expression.text === 'i18n');
      if (isT && node.arguments.length > 0) {
        const arg = node.arguments[0];
        const rel = path.relative(root, file);
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
          const entry = catalog.get(arg.text);
          if (entry) {
            entry.used = true;
          } else if (!missing.has(arg.text)) {
            missing.set(arg.text, `${rel}:${line + 1}`);
          }
        } else {
          dynamic.push(`${rel}:${line + 1}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

for (const [key, where] of missing) problems.push(`Sem traducao no catalogo (${where}): ${JSON.stringify(key)}`);

const unused = [...catalog.entries()].filter(([, entry]) => !entry.used).map(([key, entry]) => `${entry.file}: ${JSON.stringify(key)}`);
const verbose = process.argv.includes('--verbose');

if (unused.length) {
  console.warn(`Aviso: ${unused.length} chave(s) do catalogo sem uso literal (podem ser usadas de forma dinamica).`);
  if (verbose) unused.forEach((line) => console.warn(`  ${line}`));
}
if (dynamic.length && verbose) {
  console.warn(`Aviso: ${dynamic.length} chamada(s) t() com argumento nao literal:`);
  dynamic.forEach((line) => console.warn(`  ${line}`));
}

if (problems.length) {
  problems.forEach((line) => console.error(line));
  console.error(`\n${problems.length} problema(s) de traducao.`);
  process.exit(1);
}

console.log(`i18n ok: ${catalog.size} textos traduzidos para en/es.`);
