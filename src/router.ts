import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';

export type Router = 'app' | 'pages' | 'none';

export interface Route {
  filePath: string;
  url: string;
  isDynamic: boolean;
}

const PAGE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

// Segments matching [param] or [...slug] or [[...slug]]
const DYNAMIC_SEGMENT = /\[.*?\]/;

export function detectRouter(projectRoot: string): Router {
  if (fs.existsSync(path.join(projectRoot, 'app'))) return 'app';
  if (fs.existsSync(path.join(projectRoot, 'pages'))) return 'pages';
  return 'none';
}

export async function detectRoutes(projectRoot: string): Promise<{
  routes: Route[];
  skipped: string[];
  router: Router;
}> {
  const router = detectRouter(projectRoot);
  if (router === 'none') {
    return { routes: [], skipped: [], router };
  }

  return router === 'app'
    ? detectAppRouterRoutes(projectRoot)
    : detectPagesRouterRoutes(projectRoot);
}

async function detectAppRouterRoutes(projectRoot: string): Promise<{
  routes: Route[];
  skipped: string[];
  router: Router;
}> {
  const appDir = path.join(projectRoot, 'app');
  const pattern = `${appDir}/**/page.{tsx,ts,jsx,js}`;
  const files = await fg(pattern, { onlyFiles: true });

  const routes: Route[] = [];
  const skipped: string[] = [];

  for (const filePath of files) {
    const relative = path.relative(appDir, filePath);
    const segments = path.dirname(relative).split(path.sep);

    const urlSegments: string[] = [];
    let isDynamic = false;

    for (const seg of segments) {
      if (seg === '.') continue;
      // Route groups like (marketing) → drop from URL
      if (seg.startsWith('(') && seg.endsWith(')')) continue;
      // Parallel route slots like @slot → skip entire route
      if (seg.startsWith('@')) { isDynamic = true; break; }
      // Dynamic segments [param] [...slug] [[...slug]]
      if (DYNAMIC_SEGMENT.test(seg)) { isDynamic = true; break; }
      urlSegments.push(seg);
    }

    const url = '/' + urlSegments.join('/');

    if (isDynamic) {
      skipped.push(filePath);
    } else {
      routes.push({ filePath, url: url === '/' ? '/' : url, isDynamic: false });
    }
  }

  return { routes, skipped, router: 'app' };
}

async function detectPagesRouterRoutes(projectRoot: string): Promise<{
  routes: Route[];
  skipped: string[];
  router: Router;
}> {
  const pagesDir = path.join(projectRoot, 'pages');
  const extensions = PAGE_EXTENSIONS.map(e => e.slice(1)).join(',');
  const pattern = `${pagesDir}/**/*.{${extensions}}`;
  const files = await fg(pattern, { onlyFiles: true });

  const routes: Route[] = [];
  const skipped: string[] = [];

  // Excluded filenames (without extension)
  const EXCLUDED = new Set(['_app', '_document', '_error']);

  for (const filePath of files) {
    const relative = path.relative(pagesDir, filePath);
    const { dir, name } = path.parse(relative);

    // Skip _app, _document, _error, and api/ directory
    if (EXCLUDED.has(name)) continue;
    if (dir === 'api' || dir.startsWith('api/') || dir.startsWith('api\\')) continue;

    // Dynamic segments
    if (DYNAMIC_SEGMENT.test(relative)) {
      skipped.push(filePath);
      continue;
    }

    const segments = dir ? dir.split(path.sep) : [];
    const urlParts = [...segments, name === 'index' ? '' : name].filter(Boolean);
    const url = '/' + urlParts.join('/');

    routes.push({ filePath, url, isDynamic: false });
  }

  return { routes, skipped, router: 'pages' };
}
