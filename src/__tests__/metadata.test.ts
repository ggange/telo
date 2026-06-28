import { describe, test, expect } from 'vitest';
import { parse } from '@babel/parser';
import { extractMetadata } from '../metadata.js';

function parseSource(src: string) {
  return parse(src, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx', 'decorators-legacy'],
    errorRecovery: true,
  });
}

describe('extractMetadata', () => {
  test('extracts title and description from export const metadata', () => {
    const ast = parseSource(`
      export const metadata = {
        title: 'About Us',
        description: 'Learn about our company',
      };
    `);
    const meta = extractMetadata(ast);
    expect(meta.title).toBe('About Us');
    expect(meta.description).toBe('Learn about our company');
    expect(meta.hasDynamicMetadata).toBe(false);
  });

  test('detects generateMetadata function and sets hasDynamicMetadata', () => {
    const ast = parseSource(`
      export async function generateMetadata({ params }: Props) {
        return { title: params.slug };
      }
      export default function Page() { return <div /> }
    `);
    const meta = extractMetadata(ast);
    expect(meta.hasDynamicMetadata).toBe(true);
    expect(meta.title).toBeNull();
    expect(meta.description).toBeNull();
  });

  test('returns nulls when no metadata present', () => {
    const ast = parseSource(`
      export default function Page() {
        return <div>Hello</div>;
      }
    `);
    const meta = extractMetadata(ast);
    expect(meta.title).toBeNull();
    expect(meta.description).toBeNull();
    expect(meta.hasDynamicMetadata).toBe(false);
  });

  test('ignores non-string metadata values', () => {
    const ast = parseSource(`
      const computed = 'Title';
      export const metadata = {
        title: computed,
        description: 'Static desc',
      };
    `);
    const meta = extractMetadata(ast);
    expect(meta.title).toBeNull();
    expect(meta.description).toBe('Static desc');
  });
});
