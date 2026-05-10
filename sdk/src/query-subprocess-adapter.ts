import { timeoutMessage } from './query-failure-classification.js';
import type { QueryToolsErrorFactory } from './query-tools-error-factory.js';
import { runLegacyGsdTools, type LegacyGsdToolsResult } from './sdk-package-compatibility.js';

export interface QuerySubprocessAdapterDeps extends QueryToolsErrorFactory {
  projectDir: string;
  gsdToolsPath: string;
  timeoutMs: number;
  workstream?: string;
}

export class QuerySubprocessAdapter {
  constructor(private readonly deps: QuerySubprocessAdapterDeps) {}

  async execJson(command: string, args: string[]): Promise<unknown> {
    const result = await runLegacyGsdTools({
      projectDir: this.deps.projectDir,
      gsdToolsPath: this.deps.gsdToolsPath,
      timeoutMs: this.deps.timeoutMs,
      workstream: this.deps.workstream,
      command,
      args,
      mode: 'json',
    });
    if (result.ok && result.mode === 'json') return result.data;
    throw this.processLegacyFailure(command, args, result);
  }

  async execRaw(command: string, args: string[]): Promise<string> {
    const result = await runLegacyGsdTools({
      projectDir: this.deps.projectDir,
      gsdToolsPath: this.deps.gsdToolsPath,
      timeoutMs: this.deps.timeoutMs,
      workstream: this.deps.workstream,
      command,
      args: [...args, '--raw'],
      mode: 'text',
    });
    if (result.ok && result.mode === 'text') return result.text;
    throw this.processLegacyFailure(command, args, result);
  }

  private processLegacyFailure(
    command: string,
    args: string[],
    result: LegacyGsdToolsResult,
  ) {
    if (result.ok) {
      return this.deps.createFailureError(`Unexpected gsd-tools output mode for "${command}"`, command, args, 0, result.stderr);
    }

    if (result.reason === 'timeout') {
      return this.deps.createTimeoutError(
        timeoutMessage(command, args, this.deps.timeoutMs),
        command,
        args,
        result.stderr,
        this.deps.timeoutMs,
      );
    }

    return this.deps.createFailureError(
      result.stderr ? `${result.message}\n${result.stderr}` : result.message,
      command,
      args,
      result.exitCode,
      result.stderr,
    );
  }
}
