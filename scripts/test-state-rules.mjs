import assert from 'node:assert/strict';
import { mergeWorkflowState, reconcileNewIds } from '../public/state-rules.js';

assert.equal(mergeWorkflowState('applied', 'planned'), 'applied');
assert.equal(mergeWorkflowState('planned', 'applied'), 'applied');
assert.equal(mergeWorkflowState('', 'planned'), 'planned');
assert.equal(mergeWorkflowState('planned', ''), 'planned');
assert.equal(['planned', 'applied'].reduce((current, incoming) => mergeWorkflowState(current, incoming), ''), 'applied');

const reconciled = reconcileNewIds(new Set(['fresh', 'reviewed', 'gone']), new Set(['reviewed']), new Set(['fresh', 'reviewed']));
assert.deepEqual([...reconciled], ['fresh']);

console.log('state rules tests passed');
