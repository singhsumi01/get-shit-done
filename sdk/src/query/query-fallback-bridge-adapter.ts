import { runLegacyGsdTools } from '../sdk-package-compatibility.js';

export interface FallbackBridgeRunInput {
  projectDir: string;
  gsdToolsPath: string;
  normCmd: string;
  normArgs: string[];
  ws?: string;
}

export interface FallbackBridgeOutput {
  mode: 'json' | 'text';
  output: unknown;
  stderr: string;
}

export async function runFallbackBridge(input: FallbackBridgeRunInput): Promise<FallbackBridgeOutput> {
  const result = await runLegacyGsdTools({
    projectDir: input.projectDir,
    gsdToolsPath: input.gsdToolsPath,
    command: input.normCmd,
    args: input.normArgs,
    workstream: input.ws,
    mode: 'auto',
  });

  if (!result.ok) {
    throw new Error(result.stderr.trim() ? `${result.message}\n${result.stderr.trimEnd()}` : result.message);
  }

  return result.mode === 'json'
    ? { mode: 'json', output: result.data, stderr: result.stderr }
    : { mode: 'text', output: result.text, stderr: result.stderr };
}
