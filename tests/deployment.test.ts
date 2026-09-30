import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const railway = JSON.parse(readFileSync(new URL('../railway.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('Railway deployment configuration', () => {
  it('builds without reinstalling dependencies over Railpack cache mounts', () => {
    expect(railway.build.buildCommand).toBe('npm run build');
    expect(pkg.scripts.build).toBe('vite build');
  });
  it('starts the production backend rather than a static preview server', () => {
    expect(railway.deploy.startCommand).toBe('NODE_ENV=production npm start');
    expect(pkg.scripts.start).toBe('node server/index.mjs');
    expect(railway.deploy.healthcheckPath).toBe('/healthz');
  });
});
