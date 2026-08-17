import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAINLIFT_MCP_INSTRUCTIONS } from '../instructions/brainlift';

// Derive the directory from a string (import.meta.url), not `new URL`, so the
// Cloudflare Worker global types (which shadow `URL`) don't break the fs overload.
const here = dirname(fileURLToPath(import.meta.url));

describe('expert tool wiring', () => {
  it('adds expert authoring guidance to shared Brainlift instructions', () => {
    expect(BRAINLIFT_MCP_INSTRUCTIONS).toContain('Experts for NEW Brainlifts');
    expect(BRAINLIFT_MCP_INSTRUCTIONS).toContain("Include an '## Experts' section");
    expect(BRAINLIFT_MCP_INSTRUCTIONS).toContain("'name', 'who', and 'why'");
  });

  it('registers expert tools in the main MCP entrypoint', () => {
    const source = readFileSync(join(here, '../index.ts'), 'utf8');

    expect(source).toContain("import { registerListExperts } from './tools/list-experts';");
    expect(source).toContain("import { registerCreateExpert } from './tools/create-expert';");
    expect(source).toContain("import { registerDeleteExpert } from './tools/delete-expert';");
    expect(source).toContain('registerListExperts(this.server, this.env, this.props);');
    expect(source).toContain('registerCreateExpert(this.server, this.env, this.props);');
    expect(source).toContain('registerDeleteExpert(this.server, this.env, this.props);');
  });

  it('registers expert tools in the student MCP entrypoint and keeps shared instructions', () => {
    const source = readFileSync(join(here, '../index.student.ts'), 'utf8');

    expect(source).toContain("import { registerListExperts } from './tools/list-experts';");
    expect(source).toContain("import { registerCreateExpert } from './tools/create-expert';");
    expect(source).toContain("import { registerDeleteExpert } from './tools/delete-expert';");
    expect(source).toContain('registerListExperts(this.server, this.env, this.props);');
    expect(source).toContain('registerCreateExpert(this.server, this.env, this.props);');
    expect(source).toContain('registerDeleteExpert(this.server, this.env, this.props);');
    expect(source).toContain('const STUDENT_MCP_INSTRUCTIONS = `${BRAINLIFT_MCP_INSTRUCTIONS}\\n\\n${STUDENT_SPRINT_APPENDIX}`;');
  });
});
