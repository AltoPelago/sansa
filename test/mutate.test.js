import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMutationPlan, planMutation } from '../src/index.js';

function binding({ address, name, value, representationKind = 'object', children = [] }) {
  return {
    address,
    ...(name === undefined ? {} : { name }),
    ...(value === undefined ? {} : { value }),
    representationKind,
    children,
  };
}

function namespaceWithMutations(root) {
  return {
    root,
    children: (entry) => entry.children,
    parent: (entry) => entry.parent,
    bindingHandle: (entry) => entry.id ?? entry.address,
    observedState: (entry) => entry.revision,
    mutate: {
      supportsAtomicApply: true,
      sameBinding: (left, right) => left === right,
      create(parent, name, value) {
        const child = binding({
          address: `${parent.address}.${name}`,
          name,
          value,
          representationKind: typeof value,
        });
        child.parent = parent;
        child.id = child.address;
        parent.children.push(child);
        return { binding: child, resultingAddress: child.address };
      },
      replace(target, value) {
        target.value = value;
        target.revision = (target.revision ?? 0) + 1;
        return { binding: target, resultingAddress: target.address };
      },
      remove(target) {
        const parent = target.parent;
        parent.children = parent.children.filter((child) => child !== target);
        return { binding: target };
      },
      insert(container, placement, value) {
        const child = binding({
          address: `${container.address}[new]`,
          value,
          representationKind: typeof value,
        });
        child.parent = container;
        child.id = child.address;
        const index = placement.kind === 'first'
          ? 0
          : placement.kind === 'last'
            ? container.children.length
            : container.children.indexOf(placement.anchor.binding) + (placement.kind === 'after' ? 1 : 0);
        container.children.splice(index, 0, child);
        return { binding: child, resultingAddress: child.address };
      },
      move(source, container, placement) {
        container.children = container.children.filter((child) => child !== source);
        const index = placement.kind === 'first'
          ? 0
          : placement.kind === 'last'
            ? container.children.length
            : container.children.indexOf(placement.anchor.binding) + (placement.kind === 'after' ? 1 : 0);
        container.children.splice(index, 0, source);
        return { binding: source, resultingAddress: source.address };
      },
    },
  };
}

function sampleNamespace() {
  const sku = binding({ address: '$.inventory.sku', name: 'sku', value: 'A-100', representationKind: 'string' });
  sku.id = 'sku';
  sku.revision = 0;
  const name = binding({ address: '$.inventory.name', name: 'name', value: 'Adapter', representationKind: 'string' });
  name.id = 'name';
  name.revision = 0;
  const inventory = binding({ address: '$.inventory', name: 'inventory', children: [sku, name] });
  inventory.id = 'inventory';
  sku.parent = inventory;
  name.parent = inventory;

  const first = binding({ address: '$.items[0]', value: 'first', representationKind: 'string' });
  const second = binding({ address: '$.items[1]', value: 'second', representationKind: 'string' });
  first.id = 'first';
  second.id = 'second';
  const items = binding({ address: '$.items', name: 'items', representationKind: 'list', children: [first, second] });
  items.id = 'items';
  first.parent = items;
  second.parent = items;

  const archive = binding({ address: '$.archive', name: 'archive', representationKind: 'list', children: [] });
  archive.id = 'archive';

  const root = binding({ address: '$', children: [inventory, items, archive] });
  root.id = '$';
  inventory.parent = root;
  items.parent = root;
  archive.parent = root;
  return namespaceWithMutations(root);
}

function planOk(input, namespace) {
  const result = planMutation(input, namespace);
  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  return result.plan;
}

test('plans and applies exact replace operations through host mutation hooks', () => {
  const namespace = sampleNamespace();
  const plan = planOk({ op: 'replace', target: '$.inventory.sku', value: 'B-200' }, namespace);

  assert.equal(plan.operations[0].op, 'replace');
  assert.equal(plan.operations[0].target.canonicalAddress, '$.inventory.sku');

  const applied = applyMutationPlan(plan, namespace, { requireAtomic: true });
  assert.equal(applied.ok, true, JSON.stringify(applied.errors ?? []));
  assert.equal(plan.operations[0].target.binding.value, 'B-200');
  assert.equal(applied.operationResults[0].previousAddress, '$.inventory.sku');
});

test('plans create against an existing exact parent without upserting', () => {
  const namespace = sampleNamespace();
  const plan = planOk({ op: 'create', parent: '$.inventory', name: 'status', value: 'active' }, namespace);
  const applied = applyMutationPlan(plan, namespace);

  assert.equal(applied.ok, true, JSON.stringify(applied.errors ?? []));
  assert.deepEqual(namespace.root.children[0].children.map((child) => child.name), ['sku', 'name', 'status']);

  const existing = planMutation({ op: 'create', parent: '$.inventory', name: 'sku', value: 'C-300' }, namespace);
  assert.equal(existing.ok, false);
  assert.equal(existing.errors[0].code, 'SANSA_MUTATE_TARGET_EXISTS');
});

test('requires exact mutation targets and forbids root removal', () => {
  const namespace = sampleNamespace();

  const expanded = planMutation({ op: 'replace', target: '$.inventory.*', value: 'x' }, namespace);
  assert.equal(expanded.ok, false);
  assert.equal(expanded.errors[0].code, 'SANSA_MUTATE_NON_EXACT_TARGET');

  const rootRemove = planMutation({ op: 'remove', target: '$' }, namespace);
  assert.equal(rootRemove.ok, false);
  assert.equal(rootRemove.errors[0].code, 'SANSA_MUTATE_ROOT_REMOVE_FORBIDDEN');
});

test('rejects repeated destructive operations for the same binding', () => {
  const namespace = sampleNamespace();
  const result = planMutation([
    { op: 'replace', target: '$.inventory.sku', value: 'B-200' },
    { op: 'remove', target: '$.inventory.sku' },
  ], namespace);

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_DUPLICATE_TARGET');
  assert.equal(result.errors[0].operationIndex, 1);
});

test('plans ordered insert and same-container move without prescribing storage representation', () => {
  const namespace = sampleNamespace();
  const insertPlan = planOk({ op: 'insert', container: '$.items', placement: { kind: 'before', anchor: '$.items[1]' }, value: 'middle' }, namespace);
  const insert = applyMutationPlan(insertPlan, namespace);
  assert.equal(insert.ok, true, JSON.stringify(insert.errors ?? []));
  assert.deepEqual(namespace.root.children[1].children.map((child) => child.value), ['first', 'middle', 'second']);

  const movePlan = planOk({ op: 'move', source: '$.items[0]', container: '$.items', placement: 'last' }, namespace);
  const move = applyMutationPlan(movePlan, namespace);
  assert.equal(move.ok, true, JSON.stringify(move.errors ?? []));
  assert.deepEqual(namespace.root.children[1].children.map((child) => child.value), ['middle', 'second', 'first']);
});

test('rejects cross-container move in the conservative core', () => {
  const namespace = sampleNamespace();
  const result = planMutation({ op: 'move', source: '$.items[0]', container: '$.archive', placement: 'last' }, namespace);

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_INVALID_MOVE_CONTAINER');
});

test('rejects apply when the resolved binding identity drifted after planning', () => {
  const namespace = sampleNamespace();
  const plan = planOk({ op: 'remove', target: '$.items[1]' }, namespace);
  const items = namespace.root.children[1];
  const replacement = binding({ address: '$.items[1]', value: 'replacement', representationKind: 'string' });
  replacement.id = 'replacement';
  replacement.parent = items;
  items.children[1] = replacement;

  const applied = applyMutationPlan(plan, namespace);
  assert.equal(applied.ok, false);
  assert.equal(applied.errors[0].code, 'SANSA_MUTATE_STALE_TARGET');
});

test('does not apply without explicit mutation adapter support', () => {
  const namespace = sampleNamespace();
  const plan = planOk({ op: 'replace', target: '$.inventory.sku', value: 'B-200' }, namespace);
  const readOnly = {
    root: namespace.root,
    children: namespace.children,
    parent: namespace.parent,
  };

  const applied = applyMutationPlan(plan, readOnly);
  assert.equal(applied.ok, false);
  assert.equal(applied.errors[0].code, 'SANSA_MUTATE_UNSUPPORTED_ADAPTER_OPERATION');
});
