import * as fs from 'fs/promises';
import * as path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { extractMetadata } from './metadata.js';

export interface ExtractedContent {
  /** true if the page/component fetches data dynamically */
  isDynamic: boolean;
  /** extracted text blocks in document order */
  blocks: ContentBlock[];
  /** page title from export const metadata or route path fallback */
  title: string | null;
  /** page description from export const metadata */
  description: string | null;
  /** generateMetadata() was detected — description unavailable statically */
  hasDynamicMetadata: boolean;
}

export interface ContentBlock {
  type: 'heading' | 'paragraph' | 'listitem' | 'text';
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

// Hooks that are known to be non-data-fetching
const SAFE_HOOKS = new Set([
  'useState', 'useCallback', 'useMemo', 'useRef',
  'useContext', 'useId', 'useReducer', 'useEffect',
  'useLayoutEffect', 'useInsertionEffect', 'useTransition',
  'useDeferredValue', 'useImperativeHandle', 'useDebugValue',
  'useFormStatus', 'useFormState', 'useOptimistic',
]);

// JSX element names that are navigation chrome → content skipped
const NAV_ELEMENTS = new Set(['nav', 'footer', 'aside', 'header']);

// JSX element names → markdown heading level
const HEADING_ELEMENTS: Record<string, 1 | 2 | 3 | 4 | 5 | 6> = {
  h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6,
};

// Prop names that signal textual content
const CONTENT_PROPS = new Set([
  'title', 'description', 'body', 'content',
  'text', 'label', 'heading', 'caption', 'summary',
]);

export async function extractContent(filePath: string): Promise<ExtractedContent> {
  const src = await fs.readFile(filePath, 'utf-8');

  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(src, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'decorators-legacy'],
      errorRecovery: true,
    });
  } catch {
    // Unrecoverable parse error — return empty
    return empty();
  }

  const result: ExtractedContent = {
    isDynamic: false,
    blocks: [],
    title: null,
    description: null,
    hasDynamicMetadata: false,
  };

  let navDepth = 0;

  traverse(ast, {
    // ── Dynamic detection ────────────────────────────────────────

    // 1. async default export function → primary App Router signal
    ExportDefaultDeclaration(nodePath) {
      const decl = nodePath.node.declaration;
      if (
        (t.isFunctionDeclaration(decl) || t.isArrowFunctionExpression(decl)) &&
        decl.async
      ) {
        result.isDynamic = true;
      }
    },

    // 2. export default async arrow assigned to variable
    ExportNamedDeclaration(nodePath) {
      const decl = nodePath.node.declaration;
      if (t.isVariableDeclaration(decl)) {
        for (const declarator of decl.declarations) {
          const init = declarator.init;
          if (
            (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) &&
            init.async
          ) {
            result.isDynamic = true;
          }
        }
      }
    },

    // 3. Unknown use* hook calls
    CallExpression(nodePath) {
      const callee = nodePath.node.callee;
      if (t.isIdentifier(callee)) {
        const name = callee.name;
        if (name.startsWith('use') && name.length > 3 && !SAFE_HOOKS.has(name)) {
          result.isDynamic = true;
        }
        // fetch() at any scope
        if (name === 'fetch') {
          result.isDynamic = true;
        }
      }
    },

    // ── JSX content extraction ───────────────────────────────────

    // Track nav-chrome nesting at JSXElement level so navDepth is still > 0
    // when JSXText children are visited. JSXOpeningElement.exit fires before
    // children are traversed, so it can't be used for this counter.
    JSXElement: {
      enter(nodePath) {
        const name = getElementName(nodePath.node.openingElement.name);
        if (NAV_ELEMENTS.has(name)) navDepth++;
      },
      exit(nodePath) {
        const name = getElementName(nodePath.node.openingElement.name);
        if (NAV_ELEMENTS.has(name)) navDepth--;
      },
    },

    // Extract content-prop string literals (e.g. title="…") from JSX attributes
    JSXOpeningElement(nodePath) {
      if (navDepth > 0) return;
      const name = getElementName(nodePath.node.name);
      for (const attr of nodePath.node.attributes) {
        if (!t.isJSXAttribute(attr)) continue;
        const attrName = t.isJSXIdentifier(attr.name) ? attr.name.name : null;
        if (!attrName || !CONTENT_PROPS.has(attrName)) continue;
        const val = attr.value;
        if (t.isStringLiteral(val) && val.value.trim()) {
          const level = HEADING_ELEMENTS[name];
          result.blocks.push({
            type: level ? 'heading' : 'text',
            level,
            text: val.value.trim(),
          });
        }
      }
    },

    JSXText(nodePath) {
      if (navDepth > 0) return;
      const text = nodePath.node.value.trim();
      if (!text) return;

      // parentPath is the containing JSXElement (e.g. <h1>, <li>, <p>)
      const parentEl = nodePath.parentPath;
      if (!t.isJSXElement(parentEl?.node)) {
        result.blocks.push({ type: 'text', text });
        return;
      }
      const elName = getElementName((parentEl.node as t.JSXElement).openingElement.name);
      const headingLevel = HEADING_ELEMENTS[elName];

      if (headingLevel) {
        result.blocks.push({ type: 'heading', level: headingLevel, text });
      } else if (elName === 'li') {
        result.blocks.push({ type: 'listitem', text });
      } else {
        result.blocks.push({ type: 'paragraph', text });
      }
    },
  });

  const meta = extractMetadata(ast);
  result.title = meta.title;
  result.description = meta.description;
  result.hasDynamicMetadata = meta.hasDynamicMetadata;

  return result;
}

function getElementName(name: t.JSXOpeningElement['name']): string {
  if (t.isJSXIdentifier(name)) return name.name;
  if (t.isJSXMemberExpression(name)) return getElementName(name.object);
  return '';
}

function empty(): ExtractedContent {
  return {
    isDynamic: false,
    blocks: [],
    title: null,
    description: null,
    hasDynamicMetadata: false,
  };
}
