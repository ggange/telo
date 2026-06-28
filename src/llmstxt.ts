export interface LlmsTxtEntry {
  /** display title — falls back to urlToTitle(url) at call site */
  title: string;
  /** root-relative path to the generated .md file, e.g. /about.md */
  mdUrl: string;
  description: string | null;
  hasDynamicMetadata: boolean;
}

/**
 * Renders a valid llms.txt index.
 *
 * Format per llmstxt.org spec:
 *   # Site Name
 *
 *   - [Page Title](/page.md): description
 *
 * Links are root-relative (/about.md) — unambiguous regardless of CDN path
 * or how the agent resolved the llms.txt URL.
 *
 * Pages with generateMetadata() get "dynamic — see generateMetadata()" as
 * the description so agents know the omission is intentional, not a bug.
 */
export function renderLlmsTxt(siteName: string, entries: LlmsTxtEntry[]): string {
  const lines: string[] = [`# ${siteName}`, ''];

  for (const entry of entries) {
    const desc = entry.hasDynamicMetadata
      ? 'dynamic — see generateMetadata()'
      : (entry.description ?? '');

    lines.push(
      `- [${entry.title}](${entry.mdUrl})${desc ? ': ' + desc : ''}`
    );
  }

  return lines.join('\n') + '\n';
}

/** Derives a human-readable title from a URL path when no metadata is available. */
export function urlToTitle(url: string): string {
  if (url === '/') return 'Home';
  const last = url.split('/').filter(Boolean).pop() ?? 'Page';
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, ' ');
}
