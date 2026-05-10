import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GSDError, ErrorClassification } from './errors.js';

export type LegacySdkAsset = 'gsd-tools' | 'core-cjs';

export interface LegacySdkAssetResolution {
  asset: LegacySdkAsset;
  path: string | null;
  fallbackPath: string;
  probes: string[];
}

interface LegacySdkCompatibilityDeps {
  existsSync?: (path: string) => boolean;
  homeDir?: string;
  createRequire?: typeof createRequire;
}

export type LegacyGsdToolsFailureReason =
  | 'missing_asset'
  | 'spawn_failed'
  | 'timeout'
  | 'nonzero_exit'
  | 'parse_failed';

export type LegacyGsdToolsResult =
  | { ok: true; mode: 'json'; data: unknown; stderr: string }
  | { ok: true; mode: 'text'; text: string; stderr: string }
  | {
      ok: false;
      reason: LegacyGsdToolsFailureReason;
      message: string;
      stderr: string;
      exitCode: number | null;
    };

export interface LegacyGsdToolsRunInput {
  projectDir: string;
  command: string;
  args?: string[];
  workstream?: string;
  mode?: 'json' | 'text' | 'auto';
  timeoutMs?: number;
  gsdToolsPath?: string;
  deps?: LegacySdkCompatibilityDeps;
}

export const BUNDLED_GSD_TOOLS_PATH = fileURLToPath(
  new URL('../../get-shit-done/bin/gsd-tools.cjs', import.meta.url),
);

export const BUNDLED_CORE_CJS_PATH = fileURLToPath(
  new URL('../../get-shit-done/bin/lib/core.cjs', import.meta.url),
);

export const BUNDLED_GSD_TEMPLATES_DIR = fileURLToPath(
  new URL('../../get-shit-done/templates', import.meta.url),
);

export const BUNDLED_GSD_AGENTS_DIR = fileURLToPath(
  new URL('../../agents', import.meta.url),
);

const LEGACY_ASSET_SUBPATH: Record<LegacySdkAsset, string> = {
  'gsd-tools': 'gsd-tools.cjs',
  'core-cjs': join('lib', 'core.cjs'),
};

const BUNDLED_LEGACY_ASSET_PATH: Record<LegacySdkAsset, string> = {
  'gsd-tools': BUNDLED_GSD_TOOLS_PATH,
  'core-cjs': BUNDLED_CORE_CJS_PATH,
};

export function resolveLegacyInstallDir(homeDir: string = homedir()): string {
  return join(homeDir, '.claude', 'get-shit-done');
}

export function resolveLegacyTemplatesDir(homeDir: string = homedir()): string {
  return join(resolveLegacyInstallDir(homeDir), 'templates');
}

export function resolveLegacyWorkflowsDir(homeDir: string = homedir()): string {
  return join(resolveLegacyInstallDir(homeDir), 'workflows');
}

export function resolveLegacySkillsDir(homeDir: string = homedir()): string {
  return join(resolveLegacyInstallDir(homeDir), 'skills');
}

export function resolveBundledTemplatesDir(): string {
  return BUNDLED_GSD_TEMPLATES_DIR;
}

export function resolveBundledAgentsDir(): string {
  return BUNDLED_GSD_AGENTS_DIR;
}

function legacyAssetProbes(asset: LegacySdkAsset, projectDir: string, homeDir: string): string[] {
  const suffix = LEGACY_ASSET_SUBPATH[asset];
  return [
    BUNDLED_LEGACY_ASSET_PATH[asset],
    join(projectDir, '.claude', 'get-shit-done', 'bin', suffix),
    join(homeDir, '.claude', 'get-shit-done', 'bin', suffix),
  ];
}

export function probeLegacySdkAsset(
  asset: LegacySdkAsset,
  projectDir: string,
  deps: LegacySdkCompatibilityDeps = {},
): LegacySdkAssetResolution {
  const pathExists = deps.existsSync ?? existsSync;
  const probes = legacyAssetProbes(asset, projectDir, deps.homeDir ?? homedir());
  return {
    asset,
    path: probes.find(candidate => pathExists(candidate)) ?? null,
    fallbackPath: probes[probes.length - 1]!,
    probes,
  };
}

/**
 * Resolve the legacy `gsd-tools.cjs` executable path through the SDK Package Seam Module.
 *
 * Preserves historical behavior: if no probe exists, return the final fallback path so
 * downstream subprocess errors still show a concrete location.
 */
export function resolveGsdToolsPath(projectDir: string, deps: LegacySdkCompatibilityDeps = {}): string {
  const resolution = probeLegacySdkAsset('gsd-tools', projectDir, deps);
  return resolution.path ?? resolution.fallbackPath;
}

function missingLegacyGsdToolsResult(resolution: LegacySdkAssetResolution): LegacyGsdToolsResult {
  return {
    ok: false,
    reason: 'missing_asset',
    message: [
      'get-shit-done/bin/gsd-tools.cjs not found.',
      `Checked: ${resolution.probes.join(', ')}`,
      'Install GSD (e.g. npm i -g get-shit-done-cc) or clone with get-shit-done next to the SDK.',
    ].join(' '),
    stderr: '',
    exitCode: null,
  };
}

function cjsCommandArgs(command: string, args: string[], workstream?: string): string[] {
  const commandArgs = command.includes('.') ? command.split('.') : command.trim().split(/\s+/).filter(Boolean);
  const wsArgs = workstream ? ['--ws', workstream] : [];
  return [...commandArgs, ...args, ...wsArgs];
}

async function parseLegacyJsonOutput(raw: string, projectDir: string): Promise<unknown> {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  let jsonStr = trimmed;
  if (jsonStr.startsWith('@file:')) {
    const filePath = jsonStr.slice(6).trim();
    const resolvedPath = isAbsolute(filePath) ? filePath : resolve(projectDir, filePath);
    jsonStr = await readFile(resolvedPath, 'utf-8');
  }
  return JSON.parse(jsonStr);
}

async function projectLegacyOutput(
  stdout: string,
  stderr: string,
  projectDir: string,
  mode: 'json' | 'text' | 'auto',
): Promise<LegacyGsdToolsResult> {
  if (mode === 'text') {
    return { ok: true, mode: 'text', text: stdout.trim(), stderr };
  }

  if (mode === 'json') {
    try {
      return { ok: true, mode: 'json', data: await parseLegacyJsonOutput(stdout, projectDir), stderr };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        reason: 'parse_failed',
        message: `Failed to parse gsd-tools JSON output: ${reason}\nRaw output: ${stdout.slice(0, 500)}`,
        stderr,
        exitCode: 0,
      };
    }
  }

  if (stdout.trim() === '') {
    return { ok: true, mode: 'text', text: stdout, stderr };
  }

  try {
    return { ok: true, mode: 'json', data: await parseLegacyJsonOutput(stdout, projectDir), stderr };
  } catch {
    return { ok: true, mode: 'text', text: stdout, stderr };
  }
}

/**
 * Run legacy `gsd-tools.cjs` through the SDK Package Seam Module.
 *
 * Callers receive a policy-shaped result and retain ownership of domain-specific
 * fallback contracts, such as non-blocking verification skips.
 */
export async function runLegacyGsdTools(input: LegacyGsdToolsRunInput): Promise<LegacyGsdToolsResult> {
  const args = input.args ?? [];
  const mode = input.mode ?? 'json';
  const timeoutMs = input.timeoutMs ?? 30_000;
  const resolution = input.gsdToolsPath
    ? null
    : probeLegacySdkAsset('gsd-tools', input.projectDir, input.deps);
  const gsdToolsPath = input.gsdToolsPath ?? resolution?.path ?? null;

  if (!gsdToolsPath) {
    return missingLegacyGsdToolsResult(resolution!);
  }

  const fullArgs = [gsdToolsPath, ...cjsCommandArgs(input.command, args, input.workstream)];

  return new Promise<LegacyGsdToolsResult>((resolveResult) => {
    const child = execFile(
      process.execPath,
      fullArgs,
      {
        cwd: input.projectDir,
        maxBuffer: 10 * 1024 * 1024,
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        env: { ...process.env },
      },
      async (error, stdout, stderr) => {
        const stdoutText = stdout?.toString() ?? '';
        const stderrText = stderr?.toString() ?? '';

        if (error) {
          const err = error as Error & { code?: unknown; status?: number | null; signal?: NodeJS.Signals | null; killed?: boolean };
          if (err.killed || err.signal === 'SIGKILL' || err.code === 'ETIMEDOUT') {
            resolveResult({
              ok: false,
              reason: 'timeout',
              message: `gsd-tools timed out after ${timeoutMs}ms: ${input.command} ${args.join(' ')}`.trim(),
              stderr: stderrText,
              exitCode: null,
            });
            return;
          }

          resolveResult({
            ok: false,
            reason: 'nonzero_exit',
            message: `gsd-tools exited with code ${err.code ?? err.status ?? 'unknown'}: ${input.command} ${args.join(' ')}`.trim(),
            stderr: stderrText,
            exitCode: typeof err.code === 'number' ? err.code : err.status ?? 1,
          });
          return;
        }

        resolveResult(await projectLegacyOutput(stdoutText, stderrText, input.projectDir, mode));
      },
    );

    child.on('error', (err) => {
      resolveResult({
        ok: false,
        reason: 'spawn_failed',
        message: `Failed to execute gsd-tools: ${err.message}`,
        stderr: '',
        exitCode: null,
      });
    });
  });
}

function missingLegacyCoreMessage(resolution: LegacySdkAssetResolution): string {
  return [
    'state load: get-shit-done/bin/lib/core.cjs not found.',
    `Checked: ${resolution.probes.join(', ')}`,
    'Install GSD (e.g. npm i -g get-shit-done-cc) or clone with get-shit-done next to the SDK.',
  ].join(' ');
}

/**
 * Load `loadConfig(cwd)` from the legacy CJS install through one compatibility seam.
 */
export function loadLegacyCoreConfig(projectDir: string, deps: LegacySdkCompatibilityDeps = {}): Record<string, unknown> {
  const resolution = probeLegacySdkAsset('core-cjs', projectDir, deps);
  if (!resolution.path) {
    throw new GSDError(
      missingLegacyCoreMessage(resolution),
      ErrorClassification.Blocked,
    );
  }

  const req = (deps.createRequire ?? createRequire)(import.meta.url);
  const mod = req(resolution.path) as Partial<{ loadConfig: (cwd: string) => Record<string, unknown> }>;
  if (typeof mod.loadConfig !== 'function') {
    throw new GSDError(
      `state load: invalid core.cjs at ${resolution.path} (missing loadConfig(cwd)).`,
      ErrorClassification.Blocked,
    );
  }
  return mod.loadConfig(projectDir);
}
