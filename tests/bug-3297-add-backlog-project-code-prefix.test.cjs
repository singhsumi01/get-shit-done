// allow-test-rule: source-text-is-the-product — workflow .md files ARE what
// the runtime loads; asserting their behavioural content tests the deployed
// skill surface contract, not implementation internals.

'use strict';

// Regression tests for bug #3297.
//
// get-shit-done/workflows/add-backlog.md Step 4 constructs the phase directory
// as `.planning/phases/${NEXT}-${SLUG}` — without the project_code prefix from
// .planning/config.json.
//
// For projects with project_code "CK" the result is `.planning/phases/999.1-foo`
// instead of `.planning/phases/CK-999.1-foo`, breaking directory-name parity
// with phase.add / phase.insert which both apply the prefix.
//
// Fix (Option 1 from issue): read project_code via
//   `gsd-sdk query config-get project_code --raw`
// and prepend `${PREFIX:+${PREFIX}-}` to the directory name.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const WORKFLOW = path.join(ROOT, 'get-shit-done', 'workflows', 'add-backlog.md');

describe('#3297: add-backlog.md must apply project_code prefix to phase directory', () => {
  let src;
  test('workflow file is readable', () => {
    try {
      src = fs.readFileSync(WORKFLOW, 'utf8');
    } catch (err) {
      assert.fail(`Could not read ${WORKFLOW}: ${err.message}`);
    }
  });

  test('reads project_code from config via gsd-sdk query config-get', () => {
    if (!src) src = fs.readFileSync(WORKFLOW, 'utf8');
    assert.ok(
      src.includes('config-get') && src.includes('project_code'),
      'add-backlog.md must fetch project_code via "gsd-sdk query config-get project_code" ' +
        '(or equivalent) before constructing the phase directory path',
    );
  });

  test('applies project_code prefix using ${PREFIX:+${PREFIX}-} or equivalent guard', () => {
    if (!src) src = fs.readFileSync(WORKFLOW, 'utf8');
    // Accept any of the canonical shell prefix patterns used elsewhere in the codebase:
    //   ${PREFIX:+${PREFIX}-}   — POSIX conditional expansion (preferred)
    //   ${PREFIX}-${NEXT}       — bare concatenation when PREFIX may be empty is wrong;
    //                             only accept if there is also a guard like [ -n "$PREFIX" ]
    const hasPosixExpansion = src.includes('${PREFIX:+${PREFIX}-}') ||
      src.includes('${PREFIX:+$PREFIX-}');
    const hasGuardedConcat =
      (src.includes('[ -n') || src.includes('[[ -n')) &&
      src.includes('PREFIX') &&
      src.includes('${NEXT}');
    assert.ok(
      hasPosixExpansion || hasGuardedConcat,
      'add-backlog.md must guard the project_code prefix so that an empty ' +
        'project_code produces no prefix (use ${PREFIX:+${PREFIX}-} or an ' +
        'explicit -n guard before concatenation)',
    );
  });

  test('phase directory name uses PREFIX before NEXT in mkdir', () => {
    if (!src) src = fs.readFileSync(WORKFLOW, 'utf8');
    // The mkdir command must reference PREFIX (or DIR) before NEXT in the path.
    // Accept: ${PREFIX:+${PREFIX}-}${NEXT}  OR  ${DIR}  (a variable holding the full name)
    const mkdirLine = src.split('\n').find((l) => l.includes('mkdir') && l.includes('phases'));
    assert.ok(
      mkdirLine,
      'add-backlog.md must have a mkdir line that creates the phase directory under .planning/phases/',
    );
    const prefixBeforeNext =
      /\$\{PREFIX[^}]*\}[^$]*\$\{NEXT\}/.test(mkdirLine) ||
      /\$PREFIX[^$]*\$NEXT/.test(mkdirLine) ||
      mkdirLine.includes('${DIR}') ||
      mkdirLine.includes('$DIR');
    assert.ok(
      prefixBeforeNext,
      `mkdir line must include PREFIX (or DIR) before NEXT in the path.\nGot: ${mkdirLine}`,
    );
  });

  test('commit step references the prefixed directory variable', () => {
    if (!src) src = fs.readFileSync(WORKFLOW, 'utf8');
    const commitLine = src.split('\n').find((l) => l.includes('query commit') && l.includes('phases'));
    assert.ok(
      commitLine,
      'add-backlog.md must have a gsd-sdk query commit line that references the phase directory',
    );
    const usesPrefixOrDir =
      commitLine.includes('${DIR}') ||
      commitLine.includes('$DIR') ||
      (commitLine.includes('PREFIX') && commitLine.includes('NEXT'));
    assert.ok(
      usesPrefixOrDir,
      `commit step must reference the prefixed directory (DIR or PREFIX+NEXT).\nGot: ${commitLine}`,
    );
  });

  test('Step 6 report uses prefixed directory name', () => {
    if (!src) src = fs.readFileSync(WORKFLOW, 'utf8');
    // The report section should show the directory with prefix
    const reportIdx = src.indexOf('## Step 6') !== -1 ? src.indexOf('## Step 6') : src.indexOf('## 📋');
    assert.ok(reportIdx !== -1, 'Step 6 / report section not found in add-backlog.md');
    const reportSection = src.slice(reportIdx);
    const usesPrefixOrDir =
      reportSection.includes('${DIR}') ||
      reportSection.includes('$DIR') ||
      reportSection.includes('{DIR}') ||
      reportSection.includes('PREFIX') ||
      reportSection.includes('{prefix}') ||
      reportSection.includes('{dir}');
    assert.ok(
      usesPrefixOrDir,
      'Step 6 report section must reference the prefixed directory name (${DIR}, $DIR, {DIR}, or {dir})',
    );
  });
});
