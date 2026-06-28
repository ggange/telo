import { describe, test, expect } from 'vitest';
import { renderLlmsTxt, urlToTitle } from '../llmstxt.js';

describe('renderLlmsTxt', () => {
  test('renders site name as h1 and entries as list items', () => {
    const out = renderLlmsTxt('mysite', [
      { title: 'Home', mdUrl: '/index.md', description: 'Welcome', hasDynamicMetadata: false },
      { title: 'About', mdUrl: '/about.md', description: null, hasDynamicMetadata: false },
    ]);
    expect(out).toBe('# mysite\n\n- [Home](/index.md): Welcome\n- [About](/about.md)\n');
  });

  test('uses dynamic placeholder when hasDynamicMetadata is true', () => {
    const out = renderLlmsTxt('mysite', [
      { title: 'Product', mdUrl: '/product.md', description: null, hasDynamicMetadata: true },
    ]);
    expect(out).toContain('dynamic — see generateMetadata()');
  });

  test('dynamic placeholder takes precedence over null description', () => {
    const out = renderLlmsTxt('mysite', [
      { title: 'Blog', mdUrl: '/blog.md', description: 'Static', hasDynamicMetadata: true },
    ]);
    expect(out).toContain('dynamic — see generateMetadata()');
    expect(out).not.toContain('Static');
  });

  test('omits colon when no description and not dynamic', () => {
    const out = renderLlmsTxt('s', [
      { title: 'Bare', mdUrl: '/bare.md', description: null, hasDynamicMetadata: false },
    ]);
    expect(out).toBe('# s\n\n- [Bare](/bare.md)\n');
  });

  test('uses root-relative URLs', () => {
    const out = renderLlmsTxt('s', [
      { title: 'Page', mdUrl: '/nested/page.md', description: null, hasDynamicMetadata: false },
    ]);
    expect(out).toContain('(/nested/page.md)');
  });
});

describe('urlToTitle', () => {
  test('root path returns Home', () => {
    expect(urlToTitle('/')).toBe('Home');
  });

  test('single segment is capitalized', () => {
    expect(urlToTitle('/about')).toBe('About');
  });

  test('nested path uses last segment', () => {
    expect(urlToTitle('/blog/my-post')).toBe('My post');
  });

  test('hyphens become spaces', () => {
    expect(urlToTitle('/get-started')).toBe('Get started');
  });
});
