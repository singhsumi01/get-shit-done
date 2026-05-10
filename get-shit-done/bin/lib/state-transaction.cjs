'use strict';

/**
 * STATE.md Mutation Transaction Module
 *
 * Owns the transaction ordering for STATE.md mutations: acquire lock, read,
 * choose mutation surface, project frontmatter, normalize, write, release lock.
 */

function runStateMutationTransaction(options) {
  const {
    statePath,
    cwd,
    transform,
    acquireStateLock,
    releaseStateLock,
    buildStateFrontmatter,
    normalizeMd,
    atomicWriteFileSync,
    extractFrontmatter,
    stripFrontmatter,
    reconstructFrontmatter,
    fs,
    resync = true,
    preserveExistingProgress = false,
    mutationSurface = 'full',
    dryRun = false,
  } = options;

  const lockPath = acquireStateLock(statePath);
  try {
    const content = fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf-8') : '';
    const originalFm = extractFrontmatter(content);
    const preFm = !resync ? originalFm : null;
    const mutationInput = mutationSurface === 'body' ? stripFrontmatter(content) : content;
    // CJS transforms must be synchronous: transform(mutationInput) is not awaited,
    // so Promise<string> would be coerced through later string operations as "[object Promise]".
    const modified = transform(mutationInput);
    const modifiedFm = extractFrontmatter(modified);
    const existingFm = Object.keys(modifiedFm).length > 0 ? modifiedFm : originalFm;
    const body = stripFrontmatter(modified);
    const projectedFm = buildStateFrontmatter(body, cwd);

    if (projectedFm.status === 'unknown' && existingFm.status && existingFm.status !== 'unknown') {
      projectedFm.status = existingFm.status;
    }

    if (!resync && preFm && preFm.progress) {
      projectedFm.progress = preFm.progress;
    } else if (preserveExistingProgress && shouldPreserveExistingProgress(existingFm.progress, projectedFm.progress)) {
      projectedFm.progress = normalizeProgressNumbers(existingFm.progress);
    }

    const yamlStr = reconstructFrontmatter(projectedFm);
    const synced = `---\n${yamlStr}\n---\n\n${body}`;
    const normalized = normalizeMd(synced);
    if (!dryRun) {
      atomicWriteFileSync(statePath, normalized, 'utf-8');
    }
    return normalized;
  } finally {
    releaseStateLock(lockPath);
  }
}

function normalizeProgressNumbers(progress) {
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return progress;
  const normalized = {};
  for (const [key, value] of Object.entries(progress)) {
    const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    normalized[key] = typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : value;
  }
  return normalized;
}

function shouldPreserveExistingProgress(existingProgress, projectedProgress) {
  if (!existingProgress || typeof existingProgress !== 'object' || Array.isArray(existingProgress)) return false;
  const projected = projectedProgress && typeof projectedProgress === 'object' && !Array.isArray(projectedProgress)
    ? projectedProgress
    : {};
  const projectedTotalPlans = Number(projected.total_plans ? projected.total_plans : 0);
  const projectedCompletedPlans = Number(projected.completed_plans ? projected.completed_plans : 0);
  const existingTotalPlans = Number(existingProgress.total_plans || 0);
  return projectedTotalPlans === 0 && projectedCompletedPlans === 0 && existingTotalPlans > 0;
}

module.exports = {
  runStateMutationTransaction,
};
