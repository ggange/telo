import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { ParseResult } from '@babel/parser';

export interface PageMetadata {
  title: string | null;
  description: string | null;
  /** generateMetadata() was detected — description unavailable statically */
  hasDynamicMetadata: boolean;
}

export function extractMetadata(ast: ParseResult<t.File>): PageMetadata {
  const meta: PageMetadata = {
    title: null,
    description: null,
    hasDynamicMetadata: false,
  };

  traverse(ast, {
    // export const metadata = { title: '...', description: '...' }
    VariableDeclarator(nodePath) {
      if (!t.isIdentifier(nodePath.node.id, { name: 'metadata' })) return;
      const init = nodePath.node.init;
      if (!t.isObjectExpression(init)) return;

      for (const prop of init.properties) {
        if (!t.isObjectProperty(prop)) continue;
        const key = t.isIdentifier(prop.key) ? prop.key.name : null;
        const val = t.isStringLiteral(prop.value) ? prop.value.value : null;
        if (!val) continue;
        if (key === 'title') meta.title = val;
        if (key === 'description') meta.description = val;
      }
    },

    // export async function generateMetadata({ params }) { ... }
    ExportNamedDeclaration(nodePath) {
      const decl = nodePath.node.declaration;
      if (
        t.isFunctionDeclaration(decl) &&
        decl.id?.name === 'generateMetadata'
      ) {
        meta.hasDynamicMetadata = true;
      }
    },
  });

  return meta;
}
