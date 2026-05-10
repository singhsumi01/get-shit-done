import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runFallbackBridge } from './query-fallback-bridge-adapter.js';

describe('query-fallback-bridge-adapter', () => {
  let tmpDir: string;
  let fixtureDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `fallback-bridge-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fixtureDir = join(tmpDir, 'fixtures');
    await mkdir(fixtureDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns JSON output through the package seam', async () => {
    const scriptPath = join(fixtureDir, 'json.cjs');
    await writeFile(
      scriptPath,
      "process.stdout.write(JSON.stringify({ argv: process.argv.slice(2) }));",
      { mode: 0o755 },
    );

    await expect(runFallbackBridge({
      projectDir: tmpDir,
      gsdToolsPath: scriptPath,
      normCmd: 'state',
      normArgs: ['load'],
      ws: 'feature-a',
    })).resolves.toEqual({
      mode: 'json',
      output: { argv: ['state', 'load', '--ws', 'feature-a'] },
      stderr: '',
    });
  });

  it('returns text output through the package seam', async () => {
    const scriptPath = join(fixtureDir, 'text.cjs');
    await writeFile(scriptPath, "process.stdout.write('plain output');", { mode: 0o755 });

    await expect(runFallbackBridge({
      projectDir: tmpDir,
      gsdToolsPath: scriptPath,
      normCmd: 'graphify',
      normArgs: [],
    })).resolves.toEqual({
      mode: 'text',
      output: 'plain output',
      stderr: '',
    });
  });

  it('returns @file JSON output through the package seam', async () => {
    const outFile = join(tmpDir, 'out.json');
    await writeFile(outFile, JSON.stringify({ from: 'file' }));
    const scriptPath = join(fixtureDir, 'file.cjs');
    await writeFile(scriptPath, `process.stdout.write('@file:${outFile.replace(/\\/g, '\\\\')}');`, { mode: 0o755 });

    await expect(runFallbackBridge({
      projectDir: tmpDir,
      gsdToolsPath: scriptPath,
      normCmd: 'state.load',
      normArgs: [],
    })).resolves.toEqual({
      mode: 'json',
      output: { from: 'file' },
      stderr: '',
    });
  });

  it('includes stderr text when bridge subprocess fails', async () => {
    const scriptPath = join(fixtureDir, 'fail.cjs');
    await writeFile(scriptPath, "process.stderr.write('bridge boom'); process.exit(2);", { mode: 0o755 });

    await expect(runFallbackBridge({
      projectDir: tmpDir,
      gsdToolsPath: scriptPath,
      normCmd: 'state',
      normArgs: ['load'],
    })).rejects.toThrow(/bridge boom/);
  });
});
