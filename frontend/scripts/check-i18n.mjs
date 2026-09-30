#!/usr/bin/env node
/**
 * Proves every text on screen is translated.
 *  1. Finds English text not wrapped for translation: JSX text, text-like JSX attributes (placeholder, title,
 *     aria-label…), text-like object properties (label, title, description…) and toast/confirm messages.
 *  2. Collects every string passed to t(), translate() or msg() and checks that messages/fr.json and
 *     messages/rw.json translate each one (and keep the same {placeholders}).
 * Usage: node scripts/check-i18n.mjs [--keys]   (--keys prints the collected strings as JSON)
 * A line ending in `// i18n-ignore` is skipped (brand names, sample values); a file containing
 * `// i18n-ignore-file` is not scanned for text (its strings are already in the target language or are code).
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIRS = ['app', 'components', 'hooks', 'lib'];
const TEXT_ATTRS = new Set([
  'placeholder', 'title', 'label', 'aria-label', 'alt', 'description', 'subtitle', 'content', 'hint', 'message',
  'text', 'emptyText', 'emptyTitle', 'confirmLabel', 'cancelLabel', 'actionLabel', 'heading', 'caption', 'tooltip',
  'helper', 'help', 'aria-description', 'aria-roledescription', 'empty', 'noun', 'suffix', 'prefix', 'unit',
]);
const TEXT_PROPS = new Set([
  'label', 'title', 'description', 'placeholder', 'message', 'header', 'hint', 'subtitle', 'text', 'emptyText',
  'tooltip', 'helper', 'caption', 'confirmLabel', 'noun', 'body', 'short', 'long', 'singular', 'plural',
]);
const WRAPPERS = new Set(['t', 'tRich', 'translate', 'msg', 'plural']);
/** translateIn(locale, 'text'): the text is the second argument. */
const WRAPPERS_2ND = new Set(['translateIn']);
/** Object properties that hold code values (ids, routes, CSS classes), never text. */
const CODE_PROPS = new Set([
  'key', 'value', 'id', 'href', 'className', 'cls', 'tone', 'color', 'variant', 'type', 'status', 'role', 'icon',
  'queryKey', 'path', 'route', 'field', 'name', 'accessor', 'dataKey', 'format', 'mode', 'size', 'align', 'side',
  'fill', 'stroke', 'method', 'sort', 'order', 'orderBy', 'focus', 'tab', 'code', 'section', 'widget', 'kind',
  'timeZone', 'hour', 'minute', 'day', 'month', 'year', 'weekday', 'style', 'currency', 'unit', 'autoComplete', 'group',
]);
/** JSX attributes that hold code values, never text. */
const CODE_ATTRS = new Set([
  'className', 'indicatorClassName', 'controlClassName', 'href', 'src', 'id', 'htmlFor', 'type', 'variant', 'size',
  'name', 'key', 'side', 'align', 'role', 'autoComplete', 'inputMode', 'method', 'target', 'rel', 'as', 'tone',
  'orientation', 'mode', 'sizes', 'fill', 'stroke', 'd', 'viewBox', 'xmlns', 'transform', 'value', 'defaultValue',
  'accept', 'pattern', 'form', 'lang', 'dir', 'status', 'icon', 'color', 'list', 'dataKey', 'layout', 'position',
  'strokeLinecap', 'strokeLinejoin', 'fontFamily', 'textAnchor', 'dominantBaseline', 'preload', 'poster', 'media',
]);
/** A capitalised word ("Present"), or several words with a space ("no status yet") that are not CSS classes. */
const isCss = (s) => {
  const tokens = s.trim().split(/\s+/);
  return tokens.every((w) => /^[a-z0-9:/[\]().%!#_&>*=\'"-]+$/.test(w)) && tokens.some((w) => /[-:\d[\]/]/.test(w));
};
const looksLikeText = (s) => (/^[A-Z][a-z]{2,}/.test(s) || /[A-Za-z]{2,}(\s+[A-Za-z]+)+/.test(s)) && !isCss(s);
const TOASTS = new Set(['success', 'error', 'info', 'warning', 'message', 'loading']);

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx?)$/.test(e.name) && !e.name.endsWith('.d.ts')) files.push(p);
  }
};
DIRS.forEach((d) => walk(path.join(ROOT, d)));

const hasWords = (s) => /[A-Za-z]{2,}/.test(s);
const keys = new Map(); // text -> first location
const problems = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const skipFile = /\/\/ i18n-ignore-file/.test(src);
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = src.split('\n');
  const where = (node) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return { loc: `${path.relative(ROOT, file)}:${line + 1}`, ignored: /i18n-ignore/.test(lines[line] ?? '') };
  };
  const flag = (node, text, why) => {
    if (skipFile) return;
    const w = where(node);
    if (!w.ignored && hasWords(text) && !isCss(text)) problems.push(`${w.loc}  [${why}]  ${JSON.stringify(text.trim())}`);
  };
  const literal = (n) =>
    n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined;
  /** String literals reachable through ?: and ?? (e.g. t(ok ? 'Saved' : 'Failed')). */
  const branches = (n) => {
    if (!n) return [];
    if (ts.isParenthesizedExpression(n)) return branches(n.expression);
    if (ts.isConditionalExpression(n)) return [...branches(n.whenTrue), ...branches(n.whenFalse)];
    if (ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || n.operatorToken.kind === ts.SyntaxKind.BarBarToken))
      return [...branches(n.left), ...branches(n.right)];
    const s = literal(n);
    return s === undefined ? [] : [{ node: n, text: s }];
  };
  const isWrapped = (n) => {
    // Inside t()/translate()/msg() at any depth of ?:, ??, parentheses.
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isCallExpression(p)) {
        const callee = p.expression;
        const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
        const within = (a) => a && a.pos <= n.pos && n.end <= a.end;
        if (name === 'plural') return within(p.arguments[1]) || within(p.arguments[2]);
        if (WRAPPERS_2ND.has(name)) return within(p.arguments[1]);
        return WRAPPERS.has(name) && within(p.arguments[0]);
      }
      if (!(ts.isConditionalExpression(p) || ts.isParenthesizedExpression(p) || ts.isBinaryExpression(p))) return false;
    }
    return false;
  };

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
      if (WRAPPERS_2ND.has(name))
        branches(node.arguments[1]).forEach(({ text }) => keys.has(text) || keys.set(text, where(node).loc));
      if (name === 'plural')
        node.arguments.slice(1, 3).forEach((a) => branches(a).forEach(({ text }) => keys.has(text) || keys.set(text, where(node).loc)));
      if (WRAPPERS.has(name) && node.arguments[0]) {
        const arg = node.arguments[0];
        const found = branches(arg);
        if (found.length) found.forEach(({ text }) => keys.has(text) || keys.set(text, where(node).loc));
        else if (ts.isTemplateExpression(arg)) flag(arg, arg.getText(sf), `${name}() with a template; use {params}`);
      }
      const isToast = ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'toast' && TOASTS.has(name);
      if (isToast || (ts.isIdentifier(callee) && ['toast', 'confirm', 'alert'].includes(callee.text))) {
        for (const b of branches(node.arguments[0])) if (!isWrapped(b.node)) flag(b.node, b.text, 'toast');
        if (node.arguments[0] && ts.isTemplateExpression(node.arguments[0])) flag(node, node.arguments[0].getText(sf), 'toast template');
        const opts = node.arguments[1];
        if (opts && ts.isObjectLiteralExpression(opts))
          for (const p of opts.properties)
            if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'description')
              for (const b of branches(p.initializer)) if (!isWrapped(b.node)) flag(b.node, b.text, 'toast description');
      }
    }
    if (ts.isJsxText(node)) {
      const text = node.getText(sf);
      if (hasWords(text)) flag(node, text, 'jsx text');
    }
    if (ts.isJsxAttribute(node) && node.initializer) {
      const attr = node.name.getText(sf);
      if (TEXT_ATTRS.has(attr)) {
        const init = node.initializer;
        if (ts.isStringLiteral(init)) flag(init, init.text, `attr ${attr}`);
        else if (ts.isJsxExpression(init) && init.expression) {
          for (const b of branches(init.expression)) if (!isWrapped(b.node)) flag(b.node, b.text, `attr ${attr}`);
          if (ts.isTemplateExpression(init.expression)) flag(init, init.expression.getText(sf), `attr ${attr} template`);
        }
      }
    }
    // {'Some text'} or {cond ? 'A' : 'B'} as a child
    if (ts.isJsxExpression(node) && node.expression && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)))
      for (const b of branches(node.expression)) if (!isWrapped(b.node)) flag(b.node, b.text, 'jsx child');
    if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
      const prop = node.name.text;
      if (TEXT_PROPS.has(prop)) for (const b of branches(node.initializer)) if (!isWrapped(b.node)) flag(b.node, b.text, `prop ${prop}`);
    }
    // Any other string that reads like English (label maps, variables, return values).
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && looksLikeText(node.text) && !isWrapped(node) && !technical(node))
      flag(node, node.text, 'string');
    if (ts.isTemplateExpression(node) && !isWrapped(node) && !technical(node)) {
      const text = node.head.text + node.templateSpans.map((s) => ' ' + s.literal.text).join('');
      if (looksLikeText(text.trim())) flag(node, node.getText(sf), 'template');
    }
    // Hard-coded English formats for dates and numbers.
    if (ts.isStringLiteral(node) && /^en-[A-Z]{2}$/.test(node.text)) flag(node, `locale ${node.text}`, 'locale');
    ts.forEachChild(node, visit);
  };
  /** Positions where a string is code, not text shown to people. */
  const technical = (n) => {
    const p = n.parent;
    if (!p) return true;
    if (ts.isExpressionStatement(p) || ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) || ts.isExternalModuleReference?.(p)) return true;
    if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration?.(p)) && p.name === n) return true;
    if (ts.isElementAccessExpression(p) || ts.isCaseClause(p)) return true;
    if (ts.isBinaryExpression(p) && /\.displayName$/.test(p.left.getText(sf))) return true;
    if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind)) return true;
    if (ts.isJsxAttribute(p) && CODE_ATTRS.has(p.name.getText(sf))) return true;
    if (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent) && CODE_ATTRS.has(p.parent.name.getText(sf))) return true;
    if (ts.isPropertyAssignment(p) && CODE_PROPS.has(p.name.getText(sf).replace(/['"]/g, ''))) return true;
    if (ts.isCallExpression(p)) {
      const c = p.expression;
      const callee = c.getText(sf);
      if (/^(console\.|api\.|sp\.|params\.|searchParams\.|p\.set|list\.set|router\.|require|document\.|localStorage|sessionStorage|new URL|setFilter|set\b|setValue|register|watch|useQuery|cn|clsx|z\.|queryClient|\w+\.(includes|startsWith|endsWith|split|join|replace|get|set|has|getAll|append|delete|toLowerCase|toUpperCase|localeCompare|padStart|padEnd|setAttribute|getAttribute|addEventListener|removeEventListener|querySelector))/.test(callee)) return true;
      if (/^(use[A-Z]\w*|invalidate\w*|setQueryData|getQueryData|fetch|raw|call|parse|download|openPdf|Error|Symbol)$/.test(callee)) return true;
    }
    if (ts.isNewExpression(p) && /^(Intl\.|Date|RegExp|URL|URLSearchParams|Map|Set|Error)/.test(p.expression.getText(sf))) return true;
    return false;
  };
  visit(sf);
}

if (process.argv.includes('--keys')) {
  fs.writeSync(1, JSON.stringify(process.argv.includes("--where") ? [...keys] : [...keys.keys()], null, 1) + "\n");
  process.exit(0);
}

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
for (const loc of ['fr', 'rw']) {
  const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages', `${loc}.json`), 'utf8'));
  for (const [text, at] of keys) {
    const tr = dict[text];
    if (tr === undefined || tr === '') problems.push(`${at}  [missing ${loc}]  ${JSON.stringify(text)}`);
    else if (placeholders(tr) !== placeholders(text)) problems.push(`${at}  [${loc} placeholders differ]  ${JSON.stringify(text)}`);
  }
  const unused = Object.keys(dict).filter((k) => !keys.has(k));
  if (unused.length) console.warn(`${loc}.json: ${unused.length} unused entries (e.g. ${JSON.stringify(unused.slice(0, 3))})`);
}

if (problems.length) {
  fs.writeSync(2, `${problems.join('\n')}\n\n✗ ${problems.length} problems (${keys.size} strings marked for translation)\n`);
  process.exitCode = 1;
} else console.log(`✓ All ${keys.size} strings are translated into French and Kinyarwanda.`);
