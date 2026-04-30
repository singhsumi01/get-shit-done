/**
 * gsd-planner agent — MVP-mode branch contract
 * Verifies the agent definition contains the MVP-mode planning section,
 * conditional reference loading, and Walking Skeleton handling.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const AGENT = path.join(__dirname, '..', 'agents', 'gsd-planner.md');
const REF_MVP = path.join(__dirname, '..', 'get-shit-done', 'references', 'planner-mvp-mode.md');
const REF_SKEL = path.join(__dirname, '..', 'get-shit-done', 'references', 'skeleton-template.md');

describe('gsd-planner — MVP-mode branch', () => {
  const content = fs.readFileSync(AGENT, 'utf-8');

  test('agent defines an MVP Mode Detection section', () => {
    assert.match(content, /MVP\s*Mode|MVP_MODE/i, 'must reference MVP mode');
    assert.match(content, /vertical[\s-]?slice/i, 'must use vertical-slice terminology');
  });

  test('agent describes Walking Skeleton handling', () => {
    assert.match(content, /Walking\s*Skeleton/i, 'must mention Walking Skeleton');
    assert.match(content, /SKELETON\.md/, 'must mention SKELETON.md output');
  });

  test('agent references planner-mvp-mode.md conditionally', () => {
    assert.match(
      content,
      /references\/planner-mvp-mode\.md/,
      'must reference the MVP-mode rules file'
    );
  });

  test('referenced files exist on disk', () => {
    assert.ok(fs.existsSync(REF_MVP), `${REF_MVP} must exist`);
    assert.ok(fs.existsSync(REF_SKEL), `${REF_SKEL} must exist`);
  });

  test('agent does not introduce horizontal/MVP mixing language', () => {
    // Q1: all-or-nothing per phase. Reject phrasing that would imply mixing.
    assert.doesNotMatch(
      content,
      /mix[a-z\s]*horizontal[a-z\s]*MVP|MVP[a-z\s]*and[a-z\s]*horizontal[a-z\s]*tasks/i,
      'agent must enforce all-or-nothing per phase'
    );
  });
});
