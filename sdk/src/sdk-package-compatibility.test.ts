import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import {
  BUNDLED_CORE_CJS_PATH,
  BUNDLED_GSD_AGENTS_DIR,
  BUNDLED_GSD_TEMPLATES_DIR,
  BUNDLED_GSD_TOOLS_PATH,
  loadLegacyCoreConfig,
  probeLegacySdkAsset,
  resolveBundledAgentsDir,
  resolveBundledTemplatesDir,
  resolveGsdToolsPath,
  resolveLegacyInstallDir,
  resolveLegacyTemplatesDir,
  resolveLegacyWorkflowsDir,
  runLegacyGsdTools,
} from './sdk-package-compatibility.js';
import { GSDError } from './errors.js';

describe('SDK Package Seam Module', () => {
  const projectDir = '/work/project';
  const homeDir = '/users/tester';
  let tmpDir: string | null = null;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sdk-package-seam-'));
  });

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  async function createScript(name: string, code: string): Promise<string> {
    const dir = tmpDir!;
    const scriptPath = join(dir, name);
    await writeFile(scriptPath, code, { mode: 0o755 });
    return scriptPath;
  }

  it('resolves legacy install-relative directories through one seam', () => {
    expect(resolveLegacyInstallDir(homeDir)).toBe(join(homeDir, '.claude', 'get-shit-done'));
    expect(resolveLegacyTemplatesDir(homeDir)).toBe(join(homeDir, '.claude', 'get-shit-done', 'templates'));
    expect(resolveLegacyWorkflowsDir(homeDir)).toBe(join(homeDir, '.claude', 'get-shit-done', 'workflows'));
    expect(resolveBundledTemplatesDir()).toBe(BUNDLED_GSD_TEMPLATES_DIR);
    expect(resolveBundledAgentsDir()).toBe(BUNDLED_GSD_AGENTS_DIR);
  });

  it('probes legacy gsd-tools locations in bundled -> project -> home order', () => {
    const resolution = probeLegacySdkAsset('gsd-tools', projectDir, {
      homeDir,
      existsSync: path => path === join(projectDir, '.claude', 'get-shit-done', 'bin', 'gsd-tools.cjs'),
    });

    expect(resolution.probes).toEqual([
      BUNDLED_GSD_TOOLS_PATH,
      join(projectDir, '.claude', 'get-shit-done', 'bin', 'gsd-tools.cjs'),
      join(homeDir, '.claude', 'get-shit-done', 'bin', 'gsd-tools.cjs'),
    ]);
    expect(resolution.path).toBe(join(projectDir, '.claude', 'get-shit-done', 'bin', 'gsd-tools.cjs'));
    expect(resolution.fallbackPath).toBe(join(homeDir, '.claude', 'get-shit-done', 'bin', 'gsd-tools.cjs'));
  });

  it('returns concrete fallback gsd-tools path when no legacy probe exists', () => {
    const path = resolveGsdToolsPath(projectDir, {
      homeDir,
      existsSync: () => false,
    });

    expect(path).toBe(join(homeDir, '.claude', 'get-shit-done', 'bin', 'gsd-tools.cjs'));
  });

  it('loads legacy core.cjs through one compatibility adapter', () => {
    const loadConfig = vi.fn((cwd: string) => ({ cwd, source: 'legacy-core' }));
    const requireFn = vi.fn(() => ({ loadConfig }));
    const createRequire = vi.fn(() => requireFn as unknown as NodeJS.Require);

    const result = loadLegacyCoreConfig(projectDir, {
      homeDir,
      existsSync: path => path === BUNDLED_CORE_CJS_PATH,
      createRequire,
    });

    expect(createRequire).toHaveBeenCalledOnce();
    expect(requireFn).toHaveBeenCalledWith(BUNDLED_CORE_CJS_PATH);
    expect(loadConfig).toHaveBeenCalledWith(projectDir);
    expect(result).toEqual({ cwd: projectDir, source: 'legacy-core' });
  });

  it('reports checked core.cjs probes when legacy asset missing', () => {
    expect(() => loadLegacyCoreConfig(projectDir, {
      homeDir,
      existsSync: () => false,
    })).toThrow(GSDError);

    try {
      loadLegacyCoreConfig(projectDir, {
        homeDir,
        existsSync: () => false,
      });
      expect.fail('expected GSDError');
    } catch (error) {
      expect(error).toBeInstanceOf(GSDError);
      const message = (error as Error).message;
      expect(message).toContain('state load: get-shit-done/bin/lib/core.cjs not found.');
      expect(message).toContain('Checked:');
      expect(message).toContain(BUNDLED_CORE_CJS_PATH);
      expect(message).toContain(join(projectDir, '.claude', 'get-shit-done', 'bin', 'lib', 'core.cjs'));
      expect(message).toContain(join(homeDir, '.claude', 'get-shit-done', 'bin', 'lib', 'core.cjs'));
    }
  });

  it('runs legacy gsd-tools and returns policy-shaped JSON', async () => {
    const script = await createScript('json.cjs', `process.stdout.write(JSON.stringify({ argv: process.argv.slice(2) }));`);

    const result = await runLegacyGsdTools({
      projectDir: tmpDir!,
      gsdToolsPath: script,
      command: 'state',
      args: ['load'],
      workstream: 'feature-a',
      mode: 'json',
    });

    expect(result).toEqual({
      ok: true,
      mode: 'json',
      data: { argv: ['state', 'load', '--ws', 'feature-a'] },
      stderr: '',
    });
  });

  it('splits dotted legacy commands on the first dot only', async () => {
    const script = await createScript('dotted.cjs', `process.stdout.write(JSON.stringify({ argv: process.argv.slice(2) }));`);

    const result = await runLegacyGsdTools({
      projectDir: tmpDir!,
      gsdToolsPath: script,
      command: 'check.decision-coverage.plan',
      mode: 'json',
    });

    expect(result).toEqual({
      ok: true,
      mode: 'json',
      data: { argv: ['check', 'decision-coverage.plan'] },
      stderr: '',
    });
  });

  it('parses @file JSON output from legacy gsd-tools', async () => {
    const planningDir = join(tmpDir!, '.planning');
    await mkdir(planningDir, { recursive: true });
    await writeFile(join(planningDir, 'out.json'), JSON.stringify({ from: 'file' }));
    const script = await createScript('file.cjs', `process.stdout.write('@file:.planning/out.json');`);

    const result = await runLegacyGsdTools({
      projectDir: tmpDir!,
      gsdToolsPath: script,
      command: 'state.load',
      mode: 'json',
    });

    expect(result).toEqual({ ok: true, mode: 'json', data: { from: 'file' }, stderr: '' });
  });

  it('rejects @file JSON output paths that escape the project', async () => {
    const project = join(tmpDir!, 'project');
    await mkdir(project, { recursive: true });
    await writeFile(join(tmpDir!, 'outside.json'), JSON.stringify({ outside: true }));
    const script = await createScript('escape-file.cjs', `process.stdout.write('@file:../outside.json');`);

    const result = await runLegacyGsdTools({
      projectDir: project,
      gsdToolsPath: script,
      command: 'state.load',
      mode: 'json',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('parse_failed');
      expect(result.message).toContain('@file path escapes project directory');
      expect(result.exitCode).toBe(0);
    }
  });

  it('classifies auto output as text when legacy output is not JSON', async () => {
    const script = await createScript('text.cjs', `process.stdout.write('plain output');`);

    const result = await runLegacyGsdTools({
      projectDir: tmpDir!,
      gsdToolsPath: script,
      command: 'graphify',
      mode: 'auto',
    });

    expect(result).toEqual({ ok: true, mode: 'text', text: 'plain output', stderr: '' });
  });

  it('classifies missing legacy gsd-tools assets', async () => {
    const result = await runLegacyGsdTools({
      projectDir,
      command: 'state',
      args: ['load'],
      deps: {
        homeDir,
        existsSync: () => false,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('missing_asset');
      expect(result.message).toContain(BUNDLED_GSD_TOOLS_PATH);
      expect(result.message).toContain(join(homeDir, '.claude', 'get-shit-done', 'bin', 'gsd-tools.cjs'));
    }
  });

  it('classifies nonzero exits from legacy gsd-tools', async () => {
    const script = await createScript('fail.cjs', `process.stderr.write('bad command'); process.exit(7);`);

    const result = await runLegacyGsdTools({
      projectDir: tmpDir!,
      gsdToolsPath: script,
      command: 'state',
      args: ['load'],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('nonzero_exit');
      expect(result.exitCode).toBe(7);
      expect(result.stderr).toBe('bad command');
    }
  });

  it('classifies spawn failures from legacy gsd-tools', async () => {
    const script = await createScript('spawn.cjs', `process.stdout.write(JSON.stringify({ ok: true }));`);

    const result = await runLegacyGsdTools({
      projectDir: join(tmpDir!, 'missing-cwd'),
      gsdToolsPath: script,
      command: 'state',
      args: ['load'],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('spawn_failed');
      expect(result.exitCode).toBeNull();
    }
  });

  it('classifies JSON parse failures from legacy gsd-tools', async () => {
    const script = await createScript('invalid-json.cjs', `process.stdout.write('{not json');`);

    const result = await runLegacyGsdTools({
      projectDir: tmpDir!,
      gsdToolsPath: script,
      command: 'state',
      args: ['load'],
      mode: 'json',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('parse_failed');
      expect(result.exitCode).toBe(0);
    }
  });

  it('classifies legacy gsd-tools timeouts', async () => {
    const script = await createScript('timeout.cjs', `setTimeout(() => process.stdout.write('late'), 200);`);

    const result = await runLegacyGsdTools({
      projectDir: tmpDir!,
      gsdToolsPath: script,
      command: 'state',
      args: ['load'],
      timeoutMs: 20,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('timeout');
      expect(result.exitCode).toBeNull();
    }
  });
});
