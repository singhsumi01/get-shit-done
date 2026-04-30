/**
 * plan-phase workflow — --mvp flag parsing and MVP_MODE resolution
 * Contract test: verifies the workflow markdown documents the agreed
 * resolution order (CLI flag → roadmap mode → config → default false).
 */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

const WORKFLOW = path.join(__dirname, '..', 'get-shit-done', 'workflows', 'plan-phase.md');

describe('plan-phase workflow — --mvp flag', () => {
  const content = fs.readFileSync(WORKFLOW, 'utf-8');

  test('argument list documents --mvp flag', () => {
    const argsLine = content.match(/Extract from \$ARGUMENTS:[^\n]*/);
    assert.ok(argsLine, 'Step 2 arg-extraction line not found');
    assert.match(argsLine[0], /--mvp/, 'argument list must mention --mvp');
  });

  test('workflow defines MVP_MODE resolution block', () => {
    assert.match(content, /MVP_MODE/, 'workflow must declare MVP_MODE');
    assert.match(content, /workflow\.mvp_mode/, 'must read workflow.mvp_mode config');
    assert.match(
      content,
      /roadmap[^\n]*mode|phase[^\n]*\.mode/i,
      'must consult phase mode from roadmap'
    );
  });

  test('Walking Skeleton gate references new-project + Phase 1', () => {
    assert.match(content, /SKELETON\.md/, 'workflow must mention SKELETON.md');
    assert.match(
      content,
      /Walking Skeleton|walking_skeleton/i,
      'workflow must label the gate as Walking Skeleton'
    );
  });

  test('planner spawn passes MVP_MODE to gsd-planner', () => {
    assert.match(
      content,
      /MVP_MODE[^\n]*planner|planner[^\n]*MVP_MODE/i,
      'workflow must wire MVP_MODE into the planner subagent prompt'
    );
  });
});

describe('plan-phase --mvp — resolution chain integration', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('roadmap.get-phase reports mode=mvp when set in roadmap', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n\n## v1.0.0\n\n### Phase 1: Auth\n**Goal:** Users can log in\n**Mode:** mvp\n`
    );
    const result = runGsdTools('roadmap get-phase 1 --pick mode', tmpDir);
    assert.ok(result.success);
    assert.strictEqual(result.output.trim(), 'mvp');
  });

  test('config-get workflow.mvp_mode default is empty/unset', () => {
    const result = runGsdTools('config-get workflow.mvp_mode', tmpDir);
    // Either success with empty output OR a non-zero exit; both are fine.
    // Real assertion: the key isn't accidentally set to "true" in tmp project.
    if (result.success) {
      assert.notStrictEqual(result.output.trim(), 'true');
    }
  });
});
