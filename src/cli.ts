import * as path from 'path';
import * as fs from 'fs/promises';
import { detectRoutes } from './router.js';
import { extractContent } from './visitor.js';
import { renderLlmsTxt, urlToTitle, type LlmsTxtEntry } from './llmstxt.js';

const args = process.argv.slice(2);
const projectRoot = process.cwd();

const flags = {
  out: 'public',
  skipDynamic: false,
  help: false,
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out' && args[i + 1]) flags.out = args[++i];
  else if (args[i] === '--skip-dynamic') flags.skipDynamic = true;
  else if (args[i] === '--help' || args[i] === '-h') flags.help = true;
}

if (flags.help) {
  console.log(`
agentify — generate AI-readable markdown from your Next.js source

Usage: npx agentify [options]

Options:
  --out <dir>       Output directory (default: public)
  --skip-dynamic    Omit dynamic content placeholders
  --help            Show this help
`);
  process.exit(0);
}

async function run() {
  const { routes, skipped, router } = await detectRoutes(projectRoot);

  if (router === 'none') {
    console.error('agentify: no Next.js project found (missing app/ or pages/ directory)');
    process.exit(1);
  }

  if (skipped.length > 0) {
    for (const f of skipped) {
      console.warn(`agentify: skipped dynamic route: ${path.relative(projectRoot, f)}`);
    }
  }

  if (routes.length === 0) {
    console.error('agentify: no static routes found — nothing to generate');
    process.exit(1);
  }

  const outDir = path.resolve(projectRoot, flags.out);
  await fs.mkdir(outDir, { recursive: true });

  // Process all routes in parallel
  const results = await Promise.all(
    routes.map(async (route) => {
      const content = await extractContent(route.filePath);
      return { route, content };
    })
  );

  // Write .md files
  const llmsTxtEntries: LlmsTxtEntry[] = [];

  for (const { route, content } of results) {
    const mdFilename = route.url === '/' ? 'index.md' : `${route.url.slice(1)}.md`;
    const mdPath = path.join(outDir, mdFilename);
    await fs.mkdir(path.dirname(mdPath), { recursive: true });

    const md = renderMarkdown(content, route.url, flags.skipDynamic);
    await fs.writeFile(mdPath, md, 'utf-8');

    llmsTxtEntries.push({
      title: content.title ?? urlToTitle(route.url),
      mdUrl: `/${mdFilename}`,
      description: content.description,
      hasDynamicMetadata: content.hasDynamicMetadata,
    });
  }

  // Write llms.txt
  const llmsTxt = renderLlmsTxt(path.basename(projectRoot), llmsTxtEntries);
  await fs.writeFile(path.join(outDir, 'llms.txt'), llmsTxt, 'utf-8');

  console.log(
    `agentify: generated ${results.length} pages + llms.txt → ${path.relative(projectRoot, outDir)}/`
  );
}

function renderMarkdown(
  content: Awaited<ReturnType<typeof extractContent>>,
  url: string,
  skipDynamic: boolean
): string {
  const lines: string[] = [];

  if (content.title) lines.push(`# ${content.title}`, '');
  if (content.description) lines.push(content.description, '');

  if (content.isDynamic && !skipDynamic) {
    lines.push(`<!-- dynamic content — available at runtime via ${url} -->`);
  }

  for (const block of content.blocks) {
    if (block.type === 'heading' && block.level) {
      lines.push('#'.repeat(block.level) + ' ' + block.text, '');
    } else if (block.type === 'listitem') {
      lines.push('- ' + block.text);
    } else {
      lines.push(block.text, '');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

run().catch((err) => {
  console.error('agentify:', err.message);
  process.exit(1);
});
