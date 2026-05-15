'use strict';

/**
 * Tests for scripts/lint-shared-module-handsync.cjs — Phase 6 of #3524 (#3575).
 *
 * Three cases:
 *   1. No new drift pair: lint exits 0 on the current repo tree (all 14 cooperating
 *      siblings are on the allowlist; 8 migrateMeBacklog pairs do not fail).
 *   2. Intentional new drift: synthesize a temp fixture tree with an unlisted
 *      foo-test.cjs / foo-test.ts pair, assert exit 1 with informative error output.
 *   3. Allowlist entry honored: same pair as case 2, but with a cooperatingSiblings
 *      allowlist entry present, assert exit 0.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const LINT_SCRIPT = path.join(__dirname, '..', 'scripts', 'lint-shared-module-handsync.cjs');
const ALLOWLIST_PATH = path.join(__dirname, '..', 'scripts', 'shared-module-handsync-allowlist.json');
const REPO_ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// Helper: run the lint script with optional overrides
// ---------------------------------------------------------------------------
function runLint(extraArgs = []) {
  return spawnSync(process.execPath, [LINT_SCRIPT, ...extraArgs], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
}

// ---------------------------------------------------------------------------
// Helper: create an isolated fixture tree for testing
//
// Layout:
//   <tmpDir>/
//     get-shit-done/bin/lib/<cjsName>.cjs
//     sdk/src/query/<tsName>.ts    (if tsInQuery === true)
//     sdk/src/<tsName>.ts          (if tsInQuery === false)
//     scripts/shared-module-handsync-allowlist.json  (custom allowlist)
// ---------------------------------------------------------------------------
function createFixture({ cjsName, tsName, tsInQuery = true, allowlistExtra = {} }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-lint-handsync-'));

  // Create directory structure
  const cjsDir = path.join(tmpDir, 'get-shit-done', 'bin', 'lib');
  fs.mkdirSync(cjsDir, { recursive: true });

  const tsDir = tsInQuery
    ? path.join(tmpDir, 'sdk', 'src', 'query')
    : path.join(tmpDir, 'sdk', 'src');
  fs.mkdirSync(tsDir, { recursive: true });

  // Also create the scripts dir for the allowlist
  const scriptsDir = path.join(tmpDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });

  // Write the pair files
  fs.writeFileSync(path.join(cjsDir, `${cjsName}.cjs`), `'use strict';\n// fixture cjs\n`);
  fs.writeFileSync(path.join(tsDir, `${tsName}.ts`), `// fixture ts\nexport {};\n`);

  // Write the allowlist (start from the real one, then merge fixture additions)
  const realAllowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  const fixtureAllowlist = {
    cooperatingSiblings: [
      ...(realAllowlist.cooperatingSiblings || []),
      ...(allowlistExtra.cooperatingSiblings || []),
    ],
    migrateMeBacklog: [
      ...(realAllowlist.migrateMeBacklog || []),
      ...(allowlistExtra.migrateMeBacklog || []),
    ],
  };
  fs.writeFileSync(
    path.join(scriptsDir, 'shared-module-handsync-allowlist.json'),
    JSON.stringify(fixtureAllowlist, null, 2)
  );

  return tmpDir;
}

function cleanupFixture(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Case 1: No new drift pair — exits 0 on current repo tree
// ---------------------------------------------------------------------------
describe('lint-shared-module-handsync: current repo tree', () => {
  test('exits 0 with the real allowlist and current repo tree', () => {
    const result = runLint();
    assert.strictEqual(
      result.status,
      0,
      `Expected exit 0 on current repo, got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
  });

  test('prints ok message on success', () => {
    const result = runLint();
    assert.ok(
      result.stdout.includes('ok lint-shared-module-handsync'),
      `Expected "ok lint-shared-module-handsync" in stdout:\n${result.stdout}`
    );
  });

  test('no unauthorized pairs reported in current tree', () => {
    const result = runLint();
    assert.ok(
      !result.stderr.includes('ERROR lint-shared-module-handsync'),
      `Unexpected ERROR in stderr:\n${result.stderr}`
    );
  });

  test('script has no syntax errors', () => {
    const result = spawnSync(process.execPath, ['--check', LINT_SCRIPT], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, `Syntax error in lint script:\n${result.stderr}`);
  });
});

// ---------------------------------------------------------------------------
// Case 2: Intentional new drift — exits 1 with informative error
// ---------------------------------------------------------------------------
describe('lint-shared-module-handsync: intentional new drift pair', () => {
  test('exits 1 when an unlisted cjs/ts pair exists', () => {
    const tmpDir = createFixture({ cjsName: 'foo-test', tsName: 'foo-test', tsInQuery: true });
    try {
      const result = runLint(['--root', tmpDir]);
      assert.strictEqual(
        result.status,
        1,
        `Expected exit 1 for unlisted pair, got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
      );
    } finally {
      cleanupFixture(tmpDir);
    }
  });

  test('error output names the unauthorized pair files', () => {
    const tmpDir = createFixture({ cjsName: 'foo-test', tsName: 'foo-test', tsInQuery: true });
    try {
      const result = runLint(['--root', tmpDir]);
      assert.ok(
        result.stderr.includes('foo-test'),
        `Expected "foo-test" in error output:\n${result.stderr}`
      );
      assert.ok(
        result.stderr.includes('ERROR lint-shared-module-handsync'),
        `Expected ERROR prefix in stderr:\n${result.stderr}`
      );
    } finally {
      cleanupFixture(tmpDir);
    }
  });

  test('error output explains remediation options', () => {
    const tmpDir = createFixture({ cjsName: 'foo-test', tsName: 'foo-test', tsInQuery: true });
    try {
      const result = runLint(['--root', tmpDir]);
      // Should explain both paths: migrate or add to allowlist
      assert.ok(
        result.stderr.includes('Shared Module') || result.stderr.includes('allowlist'),
        `Expected remediation guidance in error output:\n${result.stderr}`
      );
    } finally {
      cleanupFixture(tmpDir);
    }
  });

  test('exits 1 for unlisted pair in sdk/src/<name>.ts (non-query) position', () => {
    const tmpDir = createFixture({ cjsName: 'bar-test', tsName: 'bar-test', tsInQuery: false });
    try {
      const result = runLint(['--root', tmpDir]);
      assert.strictEqual(
        result.status,
        1,
        `Expected exit 1 for unlisted top-level pair, got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
      );
    } finally {
      cleanupFixture(tmpDir);
    }
  });
});

// ---------------------------------------------------------------------------
// Case 3: Allowlist entry honored — exits 0 when pair IS on cooperatingSiblings
// ---------------------------------------------------------------------------
describe('lint-shared-module-handsync: allowlist entry honored', () => {
  test('exits 0 when pair is in cooperatingSiblings allowlist', () => {
    const cjsName = 'baz-cooperating';
    const tsName = 'baz-cooperating';
    const tmpDir = createFixture({
      cjsName,
      tsName,
      tsInQuery: true,
      allowlistExtra: {
        cooperatingSiblings: [
          {
            cjs: `get-shit-done/bin/lib/${cjsName}.cjs`,
            ts: `sdk/src/query/${tsName}.ts`,
            classification: 'cooperating-sibling',
            justification: 'Test fixture: synthetic cooperating sibling for lint test.',
          },
        ],
      },
    });
    try {
      const result = runLint(['--root', tmpDir]);
      assert.strictEqual(
        result.status,
        0,
        `Expected exit 0 for allowlisted pair, got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
      );
    } finally {
      cleanupFixture(tmpDir);
    }
  });

  test('exits 0 (no error) when pair is in migrateMeBacklog allowlist', () => {
    const cjsName = 'qux-backlog';
    const tsName = 'qux-backlog';
    const tmpDir = createFixture({
      cjsName,
      tsName,
      tsInQuery: true,
      allowlistExtra: {
        migrateMeBacklog: [
          {
            cjs: `get-shit-done/bin/lib/${cjsName}.cjs`,
            ts: `sdk/src/query/${tsName}.ts`,
            classification: 'drift-anti-pattern',
            justification: 'Test fixture: synthetic backlog pair for lint test.',
            trackedIn: 'test only',
          },
        ],
      },
    });
    try {
      const result = runLint(['--root', tmpDir]);
      assert.strictEqual(
        result.status,
        0,
        `Expected exit 0 for backlog pair (warn, not fail), got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
      );
    } finally {
      cleanupFixture(tmpDir);
    }
  });

  test('generated .cjs files are excluded from pair detection', () => {
    // A .generated.cjs file should never be flagged even without an allowlist entry
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-lint-gen-'));
    try {
      const cjsDir = path.join(tmpDir, 'get-shit-done', 'bin', 'lib');
      fs.mkdirSync(cjsDir, { recursive: true });
      const tsDir = path.join(tmpDir, 'sdk', 'src', 'query');
      fs.mkdirSync(tsDir, { recursive: true });
      const scriptsDir = path.join(tmpDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });

      // Write a .generated.cjs + matching TS — should NOT trigger lint error
      fs.writeFileSync(path.join(cjsDir, 'my-module.generated.cjs'), `'use strict';\n`);
      fs.writeFileSync(path.join(tsDir, 'my-module.ts'), `export {};\n`);

      // Empty allowlist (no entries for the generated file)
      fs.writeFileSync(
        path.join(scriptsDir, 'shared-module-handsync-allowlist.json'),
        JSON.stringify({ cooperatingSiblings: [], migrateMeBacklog: [] }, null, 2)
      );

      const result = runLint(['--root', tmpDir]);
      assert.strictEqual(
        result.status,
        0,
        `Expected exit 0 — generated files must be excluded:\n${result.stderr}`
      );
    } finally {
      cleanupFixture(tmpDir);
    }
  });
});
