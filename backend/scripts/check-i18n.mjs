#!/usr/bin/env node
/**
 * Proves every text the API sends to people is translated (error messages, notifications, reports, PDFs,
 * Excel files, emails).
 *  1. Finds English text not wrapped in t()/plural(): string and template literals that read like sentences,
 *     outside code positions (logs, Prisma queries, API docs, comparisons…).
 *  2. Collects every string passed to t(), plural(), the error helpers (badRequest…) and notFound(), and checks
 *     that src/i18n/fr.json and src/i18n/rw.json translate each one with the same {placeholders}.
 * Usage: node scripts/check-i18n.mjs [--keys]. A line ending in `// i18n-ignore` is skipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
/** Calls whose first argument is an English key. */
const WRAPPERS = new Set(['t', 'msg', 'storedText', 'badRequest', 'conflict', 'forbidden', 'unauthorized', 'notFound', 'translateStored']);
/** Object properties that hold code values, never text. */
const CODE_PROPS = new Set([
  'key', 'id', 'code', 'type', 'status', 'role', 'action', 'entity', 'path', 'method', 'format', 'orderBy', 'sort',
  'mode', 'align', 'font', 'color', 'fill', 'link', 'dedupeKey', 'purpose', 'tags', 'tag', 'operationId',
  'contentType', 'mimetype', 'filename', 'name', 'field', 'width', 'numFmt', 'timeZone', 'currency', 'level', 'grade',
  'file', 'fallback', 'group',
]);

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) files.push(p);
  }
};
walk(path.join(ROOT, 'src'));
/** Demo data: only its translation keys (seeded notifications) are collected; names and titles are data. */
const KEYS_ONLY = new Set([path.join(ROOT, 'prisma', 'seed.ts')]);
files.push(...KEYS_ONLY);

const isCss = () => false;
const looksLikeText = (s) =>
  (/^[A-Z][a-z]{2,}/.test(s) || /[A-Za-z]{2,}(\s+[A-Za-z]+)+/.test(s)) && !/^[a-z_.]+$/.test(s) && !isCss(s);
const keys = new Map();
const problems = [];

for (const file of files) {
  // OpenAPI docs are for developers.
  if (file.includes(`${path.sep}docs${path.sep}`) || file.endsWith(`utils${path.sep}router.ts`) || file.endsWith(`${path.sep}app.ts`)) continue;
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const lines = src.split('\n');
  const where = (node) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return { loc: `${path.relative(ROOT, file)}:${line + 1}`, ignored: /i18n-ignore/.test(lines[line] ?? '') };
  };
  const flag = (node, text, why) => {
    const w = where(node);
    if (!w.ignored && !KEYS_ONLY.has(file)) problems.push(`${w.loc}  [${why}]  ${JSON.stringify(text.trim().slice(0, 160))}`);
  };
  const calleeName = (c) => (ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : '');
  const literal = (n) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined);
  const branches = (n) => {
    if (!n) return [];
    if (ts.isParenthesizedExpression(n)) return branches(n.expression);
    if (ts.isConditionalExpression(n)) return [...branches(n.whenTrue), ...branches(n.whenFalse)];
    if (ts.isBinaryExpression(n) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(n.operatorToken.kind))
      return [...branches(n.left), ...branches(n.right)];
    const s = literal(n);
    return s === undefined ? [] : [{ node: n, text: s }];
  };
  const within = (a, n) => a && a.pos <= n.pos && n.end <= a.end;
  const isWrapped = (n) => {
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isCallExpression(p)) {
        const name = calleeName(p.expression);
        if (name === 'plural' || name === 'storedPlural') return within(p.arguments[1], n) || within(p.arguments[2], n);
        return WRAPPERS.has(name) && within(p.arguments[0], n);
      }
      if (!(ts.isConditionalExpression(p) || ts.isParenthesizedExpression(p) || ts.isBinaryExpression(p))) return false;
    }
    return false;
  };
  const technical = (n) => {
    // Route summaries (`r.get('/x', { summary: '…' })`) document the API for developers.
    if (ts.isPropertyAssignment(n.parent) && n.parent.name.getText(sf) === 'summary') return true;
    for (let p = n.parent, child = n; p; child = p, p = p.parent) {
      if (ts.isTaggedTemplateExpression(p)) return true; // $queryRaw`…` SQL
      if (/^\s*(SELECT|UPDATE|INSERT|DELETE)\b/.test(n.text ?? n.getText(sf).slice(1))) return true;
      if (ts.isExpressionStatement(p) && child === p.expression && ts.isStringLiteral(child)) return true;
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) || ts.isTypeNode(p)) return true;
      if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && p.name === child) return true;
      if (ts.isPropertyAssignment(p) && CODE_PROPS.has(p.name.getText(sf).replace(/['"]/g, ''))) return true;
      if (ts.isElementAccessExpression(p) || ts.isCaseClause(p)) return true;
      if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(p.operatorToken.kind)) return true;
      if (ts.isCallExpression(p) && p.expression === child) continue; // [..].join(): the string is not an argument
      if (ts.isCallExpression(p)) {
        const callee = p.expression.getText(sf);
        if (/^(logger|console|log|req\.log|res\.(setHeader|header|attachment|type)|router|r\.(get|post|put|patch|delete)|z\.|prisma|tx|Prisma|process|require|path\.|fs\.|crypto|new RegExp|app\.|audit)/.test(callee)) return true;
        if (/\.(includes|startsWith|endsWith|split|join|replace|get|set|has|localeCompare|padStart|padEnd|toLowerCase|toUpperCase|setHeader|font|fillColor|strokeColor|lineWidth|getRow|getColumn|getCell)$/.test(callee)) return true;
        if (/^(Error|Symbol|Number|String|Boolean|buildOpenApi|swaggerUi\.setup|\$queryRawUnsafe|\$executeRawUnsafe|\w+\.\$(queryRaw|executeRaw)Unsafe)$/.test(callee)) return true;
        return false;
      }
      if (ts.isNewExpression(p)) return /^(Error|RegExp|Intl\.|Date|Map|Set|URL|ApiRouter)/.test(p.expression.getText(sf));
      if (ts.isFunctionLike(p) || ts.isBlock(p) || ts.isSourceFile(p)) return false;
    }
    return false;
  };

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      const collect = (a) => branches(a).forEach(({ text }) => keys.has(text) || keys.set(text, where(node).loc));
      if (name === 'plural' || name === 'storedPlural') { collect(node.arguments[1]); collect(node.arguments[2]); }
      else if (WRAPPERS.has(name) && node.arguments[0]) {
        collect(node.arguments[0]);
        if (ts.isTemplateExpression(node.arguments[0])) flag(node, node.arguments[0].getText(sf), `${name}() with a template; use t('… {x}', { x })`);
      }
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && looksLikeText(node.text) && !isWrapped(node) && !technical(node))
      flag(node, node.text, 'string');
    if (ts.isTemplateExpression(node) && !isWrapped(node) && !technical(node)) {
      const text = node.head.text + node.templateSpans.map((s) => ' ' + s.literal.text).join('');
      if (looksLikeText(text.trim())) flag(node, node.getText(sf), 'template');
    }
    if (ts.isStringLiteral(node) && /^en-[A-Z]{2}$/.test(node.text)) flag(node, `locale ${node.text}`, 'locale');
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (process.argv.includes('--keys')) {
  fs.writeSync(1, JSON.stringify(process.argv.includes('--where') ? [...keys] : [...keys.keys()], null, 1) + '\n');
} else {
  const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const loc of ['fr', 'rw']) {
    const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', `${loc}.json`), 'utf8'));
    for (const [text, at] of keys) {
      const tr = dict[text];
      if (tr === undefined || tr === '') problems.push(`${at}  [missing ${loc}]  ${JSON.stringify(text)}`);
      else if (placeholders(tr) !== placeholders(text)) problems.push(`${at}  [${loc} placeholders differ]  ${JSON.stringify(text)}`);
    }
  }
  if (problems.length) {
    fs.writeSync(2, `${problems.join('\n')}\n\n✗ ${problems.length} problems (${keys.size} strings marked for translation)\n`);
    process.exitCode = 1;
  } else console.log(`✓ All ${keys.size} API strings are translated into French and Kinyarwanda.`);
}
