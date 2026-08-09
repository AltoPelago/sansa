import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateQuery, traverseGraph, traverseGraphSequence } from '../src/index.js';

function binding(address, { name, value, children = [], semanticType = children.length > 0 ? 'object' : undefined } = {}) {
  return { address, name, value, children, semanticType };
}

const engineering = binding('$.departments.engineering', {
  name: 'engineering',
  children: [
    binding('$.departments.engineering.label', { name: 'label', value: 'Engineering' }),
    binding('$.departments.engineering.region', { name: 'region', value: 'APAC' }),
    binding('$.departments.engineering.headcount', { name: 'headcount', value: 24 }),
  ],
});
const finance = binding('$.departments.finance', {
  name: 'finance',
  children: [
    binding('$.departments.finance.label', { name: 'label', value: 'Finance' }),
    binding('$.departments.finance.region', { name: 'region', value: 'EMEA' }),
    binding('$.departments.finance.headcount', { name: 'headcount', value: 12 }),
  ],
});
const aliceDepartment = binding('$.employees.alice.department', {
  name: 'department',
  value: { type: 'PointerReference', target: '$.departments.engineering' },
});
const bobDepartment = binding('$.employees.bob.department', {
  name: 'department',
  value: { type: 'StringLiteral', value: '$.departments.engineering' },
});
const alice = binding('$.employees.alice', {
  name: 'alice',
  children: [aliceDepartment, binding('$.employees.alice.inDirectory', { name: 'inDirectory', value: true })],
});
const bob = binding('$.employees.bob', {
  name: 'bob',
  children: [bobDepartment, binding('$.employees.bob.inDirectory', { name: 'inDirectory', value: false })],
});
const employees = binding('$.employees', { name: 'employees', children: [alice, bob] });
const departments = binding('$.departments', { name: 'departments', children: [engineering, finance] });
const root = binding('$', { children: [employees, departments] });

const namespace = {
  root,
  children: (entry) => entry.children,
  value: (entry) => entry.value,
  bindingHandle: (entry) => entry.address,
};

const declaration = {
  id: 'employee-department',
  direction: 'directed',
  schemaVersions: ['employee.v1'],
  namespaceTransition: 'same-namespace',
  referenceForm: 'absolute-address-reference',
  sourceSemanticTypes: ['object'],
  targetSemanticTypes: ['object'],
  edgeAddress: '?.department',
  edgeCardinality: 'zero-or-one',
  missingEdge: 'error',
  danglingTarget: 'error',
};

test('traverses declared one-hop directed relationships with path provenance', () => {
  const authorized = [];
  const result = traverseGraph([alice, bob], namespace, [declaration], {
    budget: budget(),
    schemaVersion: 'employee.v1',
    authorizeStep(step) {
      authorized.push([step.start.address, step.edge.address, step.end.address]);
      return true;
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.bindings.map((entry) => entry.address), ['$.departments.engineering']);
  assert.deepEqual(result.paths.map((path) => [path.startAddress, path.edgeAddress, path.endAddress]), [
    ['$.employees.alice', '$.employees.alice.department', '$.departments.engineering'],
    ['$.employees.bob', '$.employees.bob.department', '$.departments.engineering'],
  ]);
  assert.deepEqual(authorized, [
    ['$.employees.alice', '$.employees.alice.department', '$.departments.engineering'],
    ['$.employees.bob', '$.employees.bob.department', '$.departments.engineering'],
  ]);
});

test('composes Query to Graph to Query and Transform without losing path provenance', () => {
  const selected = evaluateQuery([
    'from $.employees.*',
    'where .inDirectory == true',
    'select .',
  ].join('\n'), namespace);
  assert.equal(selected.ok, true, JSON.stringify(selected.errors ?? []));
  assert.deepEqual(selected.results.map((result) => result.binding.address), ['$.employees.alice']);

  const traversed = traverseGraph(selected.results.map((result) => result.binding), namespace, [declaration], {
    budget: budget(),
    schemaVersion: 'employee.v1',
    authorizeStep: () => true,
  });
  assert.equal(traversed.ok, true, JSON.stringify(traversed.errors ?? []));

  const shaped = traversed.bindings.flatMap((end) => {
    const queried = evaluateQuery([
      'from ?',
      'where .region == "APAC"',
      'select { name = .label headcount = .headcount }',
    ].join('\n'), namespace, {
      resolve: { contextualRoot: end },
      budget: { maxFromBindings: 1, maxWhereCandidates: 1, maxResultRecords: 1 },
    });
    assert.equal(queried.ok, true, JSON.stringify(queried.errors ?? []));
    const paths = traversed.paths.filter((path) => path.endAddress === end.address);
    return queried.results.map((result) => ({ value: result.value, paths }));
  });

  assert.deepEqual(shaped.map((record) => record.value), [{
    type: 'object',
    value: { name: 'Engineering', headcount: 24 },
  }]);
  assert.deepEqual(shaped[0].paths.map((path) => [path.startAddress, path.edgeAddress, path.endAddress]), [[
    '$.employees.alice',
    '$.employees.alice.department',
    '$.departments.engineering',
  ]]);
});

test('handles missing and dangling edges only as explicitly declared', () => {
  const noEdge = binding('$.employees.carol', { name: 'carol', semanticType: 'object' });
  const omitted = traverseGraph([noEdge], namespace, [{ ...declaration, missingEdge: 'omit' }], {
    budget: budget(),
    schemaVersion: 'employee.v1',
  });
  assert.equal(omitted.ok, true);
  assert.deepEqual(omitted.bindings, []);

  const missing = traverseGraph([noEdge], namespace, [declaration], graphOptions());
  assert.equal(missing.ok, false);
  assert.equal(missing.errors[0].code, 'SANSA_GRAPH_EDGE_MISSING');

  const danglingEdge = binding('$.employees.dana.department', {
    name: 'department',
    value: { type: 'PointerReference', target: '$.departments.missing' },
  });
  const dana = binding('$.employees.dana', { name: 'dana', children: [danglingEdge] });
  const dangling = traverseGraph([dana], namespace, [declaration], graphOptions());
  assert.equal(dangling.ok, false);
  assert.equal(dangling.errors[0].code, 'SANSA_GRAPH_DANGLING_TARGET');
  const danglingOmitted = traverseGraph([dana], namespace, [{ ...declaration, danglingTarget: 'omit' }], graphOptions());
  assert.equal(danglingOmitted.ok, true);
  assert.deepEqual(danglingOmitted.paths, []);
});

test('fails the whole traversal when any step is unauthorized', () => {
  const result = traverseGraph([alice], namespace, [declaration], {
    budget: budget(),
    schemaVersion: 'employee.v1',
    authorizeStep: () => false,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.bindings, []);
  assert.deepEqual(result.paths, []);
  assert.equal(result.errors[0].code, 'SANSA_GRAPH_STEP_UNAUTHORIZED');
});

test('enforces explicit start, edge, node, and result budgets without partial output', () => {
  for (const [field, value] of [
    ['maxStartBindings', 1],
    ['maxVisitedEdges', 1],
    ['maxResults', 1],
  ]) {
    const result = traverseGraph([alice, bob], namespace, [declaration], {
      budget: { ...budget(), [field]: value },
      schemaVersion: 'employee.v1',
    });
    assert.equal(result.ok, false, field);
    assert.equal(result.errors[0].code, 'SANSA_GRAPH_BUDGET_EXCEEDED', field);
    assert.deepEqual(result.bindings, [], field);
  }
  const nodeLimit = traverseGraph([alice], namespace, [declaration], {
    budget: { ...budget(), maxVisitedNodes: 0 },
    schemaVersion: 'employee.v1',
  });
  assert.equal(nodeLimit.ok, false);
  assert.equal(nodeLimit.errors[0].budget, 'maxVisitedNodes');
  assert.deepEqual(nodeLimit.paths, []);
});

test('one-hop self edges terminate without recursive cycle expansion', () => {
  const selfEdge = binding('$.departments.engineering.parent', {
    name: 'parent',
    value: { type: 'PointerReference', target: '$.departments.engineering' },
  });
  engineering.children.push(selfEdge);
  const result = traverseGraph([engineering], namespace, [{
    ...declaration,
    id: 'department-parent',
    edgeAddress: '?.parent',
    missingEdge: 'error',
    danglingTarget: 'error',
  }], graphOptions());
  engineering.children.pop();

  assert.equal(result.ok, true);
  assert.equal(result.paths.length, 1);
  assert.equal(result.paths[0].startAddress, result.paths[0].endAddress);
});

test('rejects malformed declarations and ambiguous exact targets', () => {
  const malformed = traverseGraph([alice], namespace, [{ ...declaration, edgeAddress: '$.absolute' }], graphOptions());
  assert.equal(malformed.ok, false);
  assert.equal(malformed.errors[0].code, 'SANSA_GRAPH_INVALID_DECLARATION');

  const duplicate = binding('$.departments.engineering', { name: 'engineering', semanticType: 'object' });
  const ambiguousNamespace = {
    ...namespace,
    root: binding('$', {
      children: [employees, binding('$.departments', { name: 'departments', children: [engineering, duplicate] })],
    }),
  };
  const ambiguous = traverseGraph([alice], ambiguousNamespace, [declaration], graphOptions());
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.errors[0].code, 'SANSA_RESOLVE_EXACT_MULTIPLICITY_VIOLATION');
});

test('enforces declaration schema, semantic types, namespace policy, and edge cardinality', () => {
  const schema = traverseGraph([alice], namespace, [declaration], {
    ...graphOptions(),
    schemaVersion: 'employee.v2',
  });
  assert.equal(schema.ok, false);
  assert.equal(schema.errors[0].code, 'SANSA_GRAPH_SCHEMA_VERSION_UNSUPPORTED');

  const sourceType = traverseGraph([alice], namespace, [{ ...declaration, sourceSemanticTypes: ['person'] }], graphOptions());
  assert.equal(sourceType.ok, false);
  assert.equal(sourceType.errors[0].code, 'SANSA_GRAPH_SOURCE_TYPE_MISMATCH');

  const targetType = traverseGraph([alice], namespace, [{ ...declaration, targetSemanticTypes: ['department'] }], graphOptions());
  assert.equal(targetType.ok, false);
  assert.equal(targetType.errors[0].code, 'SANSA_GRAPH_TARGET_TYPE_MISMATCH');

  const twoEdges = binding('$.employees.multi.departments', {
    name: 'departments',
    children: [
      binding('$.employees.multi.departments[0]', { value: '$.departments.engineering' }),
      binding('$.employees.multi.departments[1]', { value: '$.departments.finance' }),
    ],
  });
  const multi = binding('$.employees.multi', { name: 'multi', children: [twoEdges] });
  const cardinality = traverseGraph([multi], namespace, [{
    ...declaration,
    edgeAddress: '?.departments.*',
    edgeCardinality: 'zero-or-one',
  }], graphOptions());
  assert.equal(cardinality.ok, false);
  assert.equal(cardinality.errors[0].code, 'SANSA_GRAPH_EDGE_CARDINALITY_MISMATCH');
  assert.equal(cardinality.errors[0].observed, 2);

  for (const invalid of [
    { ...declaration, namespaceTransition: 'cross-namespace' },
    { ...declaration, direction: 'inverse' },
    { ...declaration, referenceForm: 'relative-address-reference' },
    { ...declaration, schemaVersions: [] },
  ]) {
    const result = traverseGraph([alice], namespace, [invalid], graphOptions());
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, 'SANSA_GRAPH_INVALID_DECLARATION');
  }
  const missingVersion = traverseGraph([alice], namespace, [declaration], { budget: budget() });
  assert.equal(missingVersion.ok, false);
  assert.equal(missingVersion.errors[0].code, 'SANSA_GRAPH_INVALID_INPUT');
});

test('traverses an explicit multi-hop declaration sequence with complete provenance', () => {
  const social = socialGraph();
  const authorized = [];
  const result = traverseGraphSequence(
    [social.alice],
    social.namespace,
    [[social.declaration], [social.declaration]],
    {
      budget: { ...budget(), maxDepth: 2 },
      schemaVersion: 'social.v1',
      cyclePolicy: 'error',
      authorizeStep: (step) => {
        authorized.push([step.start.address, step.end.address]);
        return true;
      },
    },
  );

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.deepEqual(result.bindings.map((entry) => entry.address), ['$.people.carol']);
  assert.deepEqual(result.paths.map((path) => path.steps.map((step) => [
    step.declarationId,
    step.startAddress,
    step.edgeAddress,
    step.endAddress,
  ])), [[
    ['friend', '$.people.alice', '$.people.alice.friend', '$.people.bob'],
    ['friend', '$.people.bob', '$.people.bob.friend', '$.people.carol'],
  ]]);
  assert.deepEqual(result.metrics, { visitedNodes: 2, visitedEdges: 2 });
  assert.deepEqual(authorized, [
    ['$.people.alice', '$.people.bob'],
    ['$.people.bob', '$.people.carol'],
  ]);
});

test('multi-hop traversal enforces cycle policy and aggregate budgets without partial output', () => {
  const social = socialGraph();
  const hops = [[social.declaration], [social.declaration], [social.declaration]];

  const omitted = traverseGraphSequence([social.alice], social.namespace, hops, {
    budget: { ...budget(), maxDepth: 3 },
    schemaVersion: 'social.v1',
    cyclePolicy: 'omit',
  });
  assert.equal(omitted.ok, true);
  assert.deepEqual(omitted.bindings, []);
  assert.deepEqual(omitted.paths, []);
  assert.deepEqual(omitted.metrics, { visitedNodes: 2, visitedEdges: 3 });

  const cycle = traverseGraphSequence([social.alice], social.namespace, hops, {
    budget: { ...budget(), maxDepth: 3 },
    schemaVersion: 'social.v1',
    cyclePolicy: 'error',
  });
  assert.equal(cycle.ok, false);
  assert.equal(cycle.errors[0].code, 'SANSA_GRAPH_CYCLE_DETECTED');
  assert.deepEqual(cycle.paths, []);

  for (const [field, limit] of [['maxDepth', 1], ['maxVisitedNodes', 1], ['maxVisitedEdges', 1]]) {
    const constrained = traverseGraphSequence(
      [social.alice],
      social.namespace,
      [[social.declaration], [social.declaration]],
      {
        budget: { ...budget(), maxDepth: 2, [field]: limit },
        schemaVersion: 'social.v1',
        cyclePolicy: 'error',
      },
    );
    assert.equal(constrained.ok, false, field);
    assert.equal(constrained.errors[0].code, 'SANSA_GRAPH_BUDGET_EXCEEDED', field);
    assert.equal(constrained.errors[0].budget, field);
    assert.deepEqual(constrained.paths, []);
  }

  const resultBudget = traverseGraphSequence(
    [social.alice, social.bob],
    social.namespace,
    [[social.declaration]],
    {
      budget: { ...budget(), maxDepth: 1, maxResults: 1 },
      schemaVersion: 'social.v1',
      cyclePolicy: 'error',
    },
  );
  assert.equal(resultBudget.ok, false);
  assert.equal(resultBudget.errors[0].budget, 'maxResults');
  assert.deepEqual(resultBudget.paths, []);

  let decisions = 0;
  const denied = traverseGraphSequence(
    [social.alice],
    social.namespace,
    [[social.declaration], [social.declaration]],
    {
      budget: { ...budget(), maxDepth: 2 },
      schemaVersion: 'social.v1',
      cyclePolicy: 'error',
      authorizeStep: () => {
        decisions += 1;
        return decisions === 1;
      },
    },
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.errors[0].code, 'SANSA_GRAPH_STEP_UNAUTHORIZED');
  assert.deepEqual(denied.bindings, []);
  assert.deepEqual(denied.paths, []);
});

function budget() {
  return {
    maxDepth: 4,
    maxStartBindings: 10,
    maxVisitedNodes: 10,
    maxVisitedEdges: 10,
    maxResults: 10,
  };
}

function graphOptions() {
  return { budget: budget(), schemaVersion: 'employee.v1' };
}

function socialGraph() {
  const aliceFriend = binding('$.people.alice.friend', { name: 'friend', value: '$.people.bob' });
  const bobFriend = binding('$.people.bob.friend', { name: 'friend', value: '$.people.carol' });
  const carolFriend = binding('$.people.carol.friend', { name: 'friend', value: '$.people.alice' });
  const alice = binding('$.people.alice', { name: 'alice', children: [aliceFriend] });
  const bob = binding('$.people.bob', { name: 'bob', children: [bobFriend] });
  const carol = binding('$.people.carol', { name: 'carol', children: [carolFriend] });
  const people = binding('$.people', { name: 'people', children: [alice, bob, carol] });
  const graphRoot = binding('$', { children: [people] });
  return {
    alice,
    bob,
    namespace: {
      root: graphRoot,
      children: (entry) => entry.children,
      value: (entry) => entry.value,
      semanticType: (entry) => entry.semanticType,
      bindingHandle: (entry) => entry.address,
    },
    declaration: {
      id: 'friend',
      direction: 'directed',
      schemaVersions: ['social.v1'],
      namespaceTransition: 'same-namespace',
      referenceForm: 'absolute-address-reference',
      sourceSemanticTypes: ['object'],
      targetSemanticTypes: ['object'],
      edgeAddress: '?.friend',
      edgeCardinality: 'exactly-one',
      missingEdge: 'error',
      danglingTarget: 'error',
    },
  };
}
