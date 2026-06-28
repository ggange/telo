import * as fs from 'fs/promises';
import * as path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import fg from 'fast-glob';

export interface PropHint {
  type: 'prop';
  elementName: string;
  propName: string;
  line: number;
}

export interface LiteralHint {
  type: 'literal';
  parentElement: string;
  preview: string;
  line: number;
}

export type AnnotationHint = PropHint | LiteralHint;

export interface FileAnnotations {
  filePath: string;
  hints: AnnotationHint[];
}

const CONTENT_PROPS = new Set([
  'title', 'description', 'body', 'content',
  'text', 'label', 'heading', 'caption', 'summary',
]);

export async function scanForAnnotations(projectRoot: string): Promise<FileAnnotations[]> {
  const files = await fg('**/*.{tsx,ts,jsx,js}', {
    cwd: projectRoot,
    absolute: true,
    ignore: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/*.test.*',
      '**/*.spec.*',
    ],
  });

  const results: FileAnnotations[] = [];

  for (const filePath of files) {
    let src: string;
    try {
      src = await fs.readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    let ast: ReturnType<typeof parse>;
    try {
      ast = parse(src, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx', 'decorators-legacy'],
        errorRecovery: true,
      });
    } catch {
      continue;
    }

    const hints: AnnotationHint[] = [];

    traverse(ast, {
      JSXOpeningElement(nodePath) {
        const elementName = getElementName(nodePath.node.name);
        for (const attr of nodePath.node.attributes) {
          if (!t.isJSXAttribute(attr)) continue;
          const propName = t.isJSXIdentifier(attr.name) ? attr.name.name : null;
          if (!propName || !CONTENT_PROPS.has(propName)) continue;
          if (!t.isStringLiteral(attr.value) || !attr.value.value.trim()) continue;
          hints.push({
            type: 'prop',
            elementName,
            propName,
            line: attr.loc?.start.line ?? 0,
          });
        }
      },

      JSXText(nodePath) {
        const text = nodePath.node.value.trim();
        if (text.length <= 20) return;
        const parentEl = nodePath.parentPath;
        if (!t.isJSXElement(parentEl?.node)) return;
        const parentElement = getElementName((parentEl.node as t.JSXElement).openingElement.name);
        hints.push({
          type: 'literal',
          parentElement,
          preview: text.slice(0, 60),
          line: nodePath.node.loc?.start.line ?? 0,
        });
      },
    });

    if (hints.length > 0) {
      results.push({
        filePath: path.relative(projectRoot, filePath),
        hints,
      });
    }
  }

  return results;
}

export function renderAnnotationGuide(files: FileAnnotations[]): string {
  const lines: string[] = [
    '# AI Content Annotation Guide',
    '',
    '> Run with your AI coding assistant: "Follow this guide and add `<AIContent>` from `@pkg/react` to each component listed."',
    '',
  ];

  if (files.length === 0) {
    lines.push('> No annotation candidates found.');
    return lines.join('\n') + '\n';
  }

  for (const file of files) {
    lines.push(`## ${file.filePath}`, '');
    for (const hint of file.hints) {
      if (hint.type === 'prop') {
        lines.push(
          `- Wrap prop \`${hint.propName}\` on \`<${hint.elementName}>\` (line ${hint.line}): ` +
          `\`<AIContent label="${hint.propName}">{${hint.propName}}</AIContent>\``
        );
      } else {
        const ellipsis = hint.preview.length === 60 ? '...' : '';
        lines.push(
          `- Wrap literal "${hint.preview}${ellipsis}" (line ${hint.line}): ` +
          `\`<AIContent>${hint.preview}${ellipsis}</AIContent>\``
        );
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function getElementName(name: t.JSXOpeningElement['name']): string {
  if (t.isJSXIdentifier(name)) return name.name;
  if (t.isJSXMemberExpression(name)) return getElementName(name.object);
  return '';
}
