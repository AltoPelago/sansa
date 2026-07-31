import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMutationPlan, planMutation, validateMutationPlanTarget } from '../src/index.js';

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
  const skuOrigin = binding({ address: '$.inventory.sku.@.origin', name: 'origin', value: 'catalog', representationKind: 'string' });
  skuOrigin.id = 'sku-origin';
  const skuAttributes = binding({ address: '$.inventory.sku.@', representationKind: 'attributeSpace', children: [skuOrigin] });
  skuAttributes.id = 'sku-attributes';
  skuOrigin.parent = skuAttributes;
  sku.attributeSpace = skuAttributes;
  skuAttributes.parent = sku;
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
  assert.equal(applied.operationResults[0].targetAddress, '$.inventory.sku');
  assert.equal(applied.operationResults[0].previousAddress, '$.inventory.sku');
  assert.equal(applied.operationResults[0].affectedAddress, '$.inventory.sku');
  assert.equal(applied.operationResults[0].resultingAddress, '$.inventory.sku');
});

test('plans create against an existing exact parent without upserting', () => {
  const namespace = sampleNamespace();
  const plan = planOk({ op: 'create', parent: '$.inventory', name: 'status', value: 'active' }, namespace);
  const applied = applyMutationPlan(plan, namespace);

  assert.equal(applied.ok, true, JSON.stringify(applied.errors ?? []));
  assert.deepEqual(namespace.root.children[0].children.map((child) => child.name), ['sku', 'name', 'status']);
  assert.equal(applied.operationResults[0].parentAddress, '$.inventory');
  assert.equal(applied.operationResults[0].affectedAddress, '$.inventory.status');
  assert.equal(applied.operationResults[0].resultingAddress, '$.inventory.status');

  const existing = planMutation({ op: 'create', parent: '$.inventory', name: 'sku', value: 'C-300' }, namespace);
  assert.equal(existing.ok, false);
  assert.equal(existing.errors[0].code, 'SANSA_MUTATE_TARGET_EXISTS');
});

test('rejects create against non-container parents', () => {
  const namespace = sampleNamespace();
  const result = planMutation({ op: 'create', parent: '$.inventory.sku', name: 'status', value: 'active' }, namespace);

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_PARENT_NOT_CONTAINER');
  assert.equal(result.errors[0].operationIndex, 0);
});

test('allows create against exposed attribute spaces', () => {
  const namespace = sampleNamespace();
  const plan = planOk({ op: 'create', parent: '$.inventory.sku.@', name: 'status', datatype: 'sansa', value: '$.inventory.*' }, namespace);
  const applied = applyMutationPlan(plan, namespace);

  assert.equal(plan.operations[0].datatype, 'sansa');
  assert.equal(applied.ok, true, JSON.stringify(applied.errors ?? []));
  assert.deepEqual(namespace.root.children[0].children[0].attributeSpace.children.map((child) => child.name), ['origin', 'status']);
  assert.equal(namespace.root.children[0].children[0].attributeSpace.children[1].value, '$.inventory.*');
  assert.equal(applied.operationResults[0].parentAddress, '$.inventory.sku.@');
  assert.equal(applied.operationResults[0].resultingAddress, '$.inventory.sku.@.status');
});

test('rejects invalid mutation datatype hints', () => {
  const namespace = sampleNamespace();
  const result = planMutation({ op: 'replace', target: '$.inventory.sku', datatype: '', value: 'x' }, namespace);

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_INVALID_DATATYPE');
});

test('validates mutation plans against built-in target surfaces', () => {
  const namespace = sampleNamespace();
  const compatible = planOk({ op: 'replace', target: '$.inventory.sku', value: 'B-200' }, namespace);
  assert.equal(validateMutationPlanTarget(compatible, 'aeon').ok, true);
  assert.equal(validateMutationPlanTarget(compatible, 'json').ok, true);

  const aeonInvalidDatatype = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'textProbe',
    datatype: 'string<null>',
    value: '',
  }, namespace);
  const aeonResult = validateMutationPlanTarget(aeonInvalidDatatype, 'aeon');
  assert.equal(aeonResult.ok, false);
  assert.equal(aeonResult.errors[0].phase, 'target');
  assert.equal(aeonResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(aeonResult.errors[0].targetFormat, 'aeon');

  const aeonMalformedDatatype = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'malformedDatatypeProbe',
    datatype: 'list<',
    value: [],
  }, namespace);
  const aeonMalformedDatatypeResult = validateMutationPlanTarget(aeonMalformedDatatype, 'aeon');
  assert.equal(aeonMalformedDatatypeResult.ok, false);
  assert.equal(aeonMalformedDatatypeResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(aeonMalformedDatatypeResult.errors[0].targetFormat, 'aeon');
  assert.equal(aeonMalformedDatatypeResult.errors[0].datatype, 'list<');

  const aeonInvalidValue = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'badToggle',
    datatype: 'toggle',
    value: 'maybe',
  }, namespace);
  const aeonValueResult = validateMutationPlanTarget(aeonInvalidValue, 'aeon');
  assert.equal(aeonValueResult.ok, false);
  assert.equal(aeonValueResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.equal(aeonValueResult.errors[0].targetFormat, 'aeon');
  assert.equal(aeonValueResult.errors[0].valuePath, 'operations[0].value');

  const aeonInvalidDatatypeKind = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'badToggleString',
    datatype: 'toggle',
    kind: 'string',
    value: 'maybe',
  }, namespace);
  const aeonKindResult = validateMutationPlanTarget(aeonInvalidDatatypeKind, 'aeon');
  assert.equal(aeonKindResult.ok, false);
  assert.equal(aeonKindResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.equal(aeonKindResult.errors[0].targetFormat, 'aeon');
  assert.equal(aeonKindResult.errors[0].datatype, 'toggle');
  assert.equal(aeonKindResult.errors[0].valuePath, 'operations[0].value');

  const aeonInvalidTemporal = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'badDate',
    datatype: 'date',
    kind: 'date',
    value: '2025-02-29',
  }, namespace);
  const aeonTemporalResult = validateMutationPlanTarget(aeonInvalidTemporal, 'aeon');
  assert.equal(aeonTemporalResult.ok, false);
  assert.equal(aeonTemporalResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.equal(aeonTemporalResult.errors[0].targetFormat, 'aeon');
  assert.equal(aeonTemporalResult.errors[0].valuePath, 'operations[0].value');

  const aeonNestedEmptyKey = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'badNestedEmptyKey',
    datatype: 'object',
    value: { settings: { '': 'active' } },
  }, namespace);
  const aeonNestedEmptyKeyResult = validateMutationPlanTarget(aeonNestedEmptyKey, 'aeon');
  assert.equal(aeonNestedEmptyKeyResult.ok, false);
  assert.equal(aeonNestedEmptyKeyResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.equal(aeonNestedEmptyKeyResult.errors[0].targetFormat, 'aeon');
  assert.equal(aeonNestedEmptyKeyResult.errors[0].valuePath, 'operations[0].value.settings[""]');

  const aeonInvalidNodeTag = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'badNodeTag',
    datatype: 'node',
    kind: 'node',
    value: { tag: 'bad-tag', children: [] },
  }, namespace);
  const aeonInvalidNodeTagResult = validateMutationPlanTarget(aeonInvalidNodeTag, 'aeon');
  assert.equal(aeonInvalidNodeTagResult.ok, false);
  assert.equal(aeonInvalidNodeTagResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.equal(aeonInvalidNodeTagResult.errors[0].targetFormat, 'aeon');
  assert.equal(aeonInvalidNodeTagResult.errors[0].valuePath, 'operations[0].value.tag');

  const aeonSansaSelector = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'selectorProbe',
    datatype: 'sansa',
    kind: 'sansa',
    value: '$.inventory.items.*.sku',
  }, namespace);
  const aeonSansaSelectorResult = validateMutationPlanTarget(aeonSansaSelector, 'aeon');
  assert.equal(aeonSansaSelectorResult.ok, true, JSON.stringify(aeonSansaSelectorResult.errors ?? []));

  const aeonInvalidSansaLiteral = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'badSansa',
    datatype: 'sansa',
    kind: 'sansa',
    value: '$.inventory..sku',
  }, namespace);
  const aeonInvalidSansaLiteralResult = validateMutationPlanTarget(aeonInvalidSansaLiteral, 'aeon');
  assert.equal(aeonInvalidSansaLiteralResult.ok, false);
  assert.equal(aeonInvalidSansaLiteralResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.equal(aeonInvalidSansaLiteralResult.errors[0].targetFormat, 'aeon');
  assert.equal(aeonInvalidSansaLiteralResult.errors[0].valuePath, 'operations[0].value');

  const aeonInvalidReferenceTarget = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'badReference',
    kind: 'cloneReference',
    value: 'target.*',
  }, namespace);
  const aeonInvalidReferenceTargetResult = validateMutationPlanTarget(aeonInvalidReferenceTarget, 'aeon');
  assert.equal(aeonInvalidReferenceTargetResult.ok, false);
  assert.equal(aeonInvalidReferenceTargetResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.equal(aeonInvalidReferenceTargetResult.errors[0].targetFormat, 'aeon');
  assert.equal(aeonInvalidReferenceTargetResult.errors[0].valuePath, 'operations[0].value');

  const aeonQuotedReferenceTarget = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'quotedReference',
    kind: 'cloneReference',
    value: '["target.key"]',
  }, namespace);
  const aeonQuotedReferenceTargetResult = validateMutationPlanTarget(aeonQuotedReferenceTarget, 'aeon');
  assert.equal(aeonQuotedReferenceTargetResult.ok, true, JSON.stringify(aeonQuotedReferenceTargetResult.errors ?? []));

  const aeonNodeCustomProfile = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'nodeCustomProfile',
    datatype: 'node<html>',
    kind: 'node',
    value: { tag: 'html', children: [] },
  }, namespace);
  const aeonNodeCustomProfileResult = validateMutationPlanTarget(aeonNodeCustomProfile, 'aeon');
  assert.equal(aeonNodeCustomProfileResult.ok, true, JSON.stringify(aeonNodeCustomProfileResult.errors ?? []));

  const aeonNodeReservedChildClaim = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'nodeReservedChildClaim',
    datatype: 'node<string>',
    kind: 'node',
    value: { tag: 'title', children: ['hello'] },
  }, namespace);
  const aeonNodeReservedChildClaimResult = validateMutationPlanTarget(aeonNodeReservedChildClaim, 'aeon');
  assert.equal(aeonNodeReservedChildClaimResult.ok, false);
  assert.equal(aeonNodeReservedChildClaimResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(aeonNodeReservedChildClaimResult.errors[0].targetFormat, 'aeon');
  assert.equal(aeonNodeReservedChildClaimResult.errors[0].datatype, 'node<string>');

  const jsonAttribute = planOk({
    op: 'create',
    parent: '$.inventory.sku.@',
    name: 'selector',
    datatype: 'sansa',
    value: '$.inventory.*',
  }, namespace);
  const jsonResult = validateMutationPlanTarget(jsonAttribute, 'json');
  assert.equal(jsonResult.ok, false);
  assert.equal(jsonResult.errors[0].phase, 'target');
  assert.equal(jsonResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_FEATURE');
  assert.equal(jsonResult.errors[0].targetFormat, 'json');

  const jsonInvalidValue = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'badNumber',
    value: Number.NaN,
  }, namespace);
  const jsonValueResult = validateMutationPlanTarget(jsonInvalidValue, 'json');
  assert.equal(jsonValueResult.ok, false);
  assert.equal(jsonValueResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.equal(jsonValueResult.errors[0].targetFormat, 'json');
  assert.equal(jsonValueResult.errors[0].valuePath, 'value');

  const jsonNestedInvalidValue = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'badJsonNestedNumber',
    datatype: 'object',
    value: { settings: { count: Number.NaN } },
  }, namespace);
  const jsonNestedValueResult = validateMutationPlanTarget(jsonNestedInvalidValue, 'json');
  assert.equal(jsonNestedValueResult.ok, false);
  assert.equal(jsonNestedValueResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.equal(jsonNestedValueResult.errors[0].targetFormat, 'json');
  assert.equal(jsonNestedValueResult.errors[0].valuePath, 'value.settings.count');

  const jsonNestedNodeValue = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'jsonNestedNode',
    datatype: 'object',
    value: { badge: { tag: 'badge', children: ['new'] } },
  }, namespace);
  const jsonNestedNodeResult = validateMutationPlanTarget(jsonNestedNodeValue, 'json');
  assert.equal(jsonNestedNodeResult.ok, false);
  assert.equal(jsonNestedNodeResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.equal(jsonNestedNodeResult.errors[0].targetFormat, 'json');
  assert.equal(jsonNestedNodeResult.errors[0].valuePath, 'value.badge');

  const aeonRadixRepresentable = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'radixProbe',
    datatype: 'radix[2]',
    kind: 'radix',
    value: '1A',
  }, namespace);
  const aeonRadixRepresentableResult = validateMutationPlanTarget(aeonRadixRepresentable, 'aeon');
  assert.equal(aeonRadixRepresentableResult.ok, true, JSON.stringify(aeonRadixRepresentableResult.errors ?? []));

  const aeonInvalidRadixPayload = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'badRadix',
    kind: 'radix',
    value: '1__0',
  }, namespace);
  const aeonInvalidRadixPayloadResult = validateMutationPlanTarget(aeonInvalidRadixPayload, 'aeon');
  assert.equal(aeonInvalidRadixPayloadResult.ok, false);
  assert.equal(aeonInvalidRadixPayloadResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.equal(aeonInvalidRadixPayloadResult.errors[0].targetFormat, 'aeon');
  assert.equal(aeonInvalidRadixPayloadResult.errors[0].valuePath, 'operations[0].value');

  const aeonInvalidRadixDatatype = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'badRadixDatatype',
    datatype: 'radix[03]',
    kind: 'radix',
    value: '101',
  }, namespace);
  const aeonInvalidRadixDatatypeResult = validateMutationPlanTarget(aeonInvalidRadixDatatype, 'aeon');
  assert.equal(aeonInvalidRadixDatatypeResult.ok, false);
  assert.equal(aeonInvalidRadixDatatypeResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(aeonInvalidRadixDatatypeResult.errors[0].targetFormat, 'aeon');
  assert.equal(aeonInvalidRadixDatatypeResult.errors[0].datatype, 'radix[03]');

  const aeonUnsupportedRadixAlias = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'badRadixAlias',
    datatype: 'radix16',
    kind: 'radix',
    value: '10',
  }, namespace);
  const aeonUnsupportedRadixAliasResult = validateMutationPlanTarget(aeonUnsupportedRadixAlias, 'aeon');
  assert.equal(aeonUnsupportedRadixAliasResult.ok, false);
  assert.equal(aeonUnsupportedRadixAliasResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(aeonUnsupportedRadixAliasResult.errors[0].targetFormat, 'aeon');
  assert.equal(aeonUnsupportedRadixAliasResult.errors[0].datatype, 'radix16');

  const aeonInvalidEncodingPayload = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'badEncoding',
    kind: 'encoding',
    value: 'abc+/==',
  }, namespace);
  const aeonInvalidEncodingPayloadResult = validateMutationPlanTarget(aeonInvalidEncodingPayload, 'aeon');
  assert.equal(aeonInvalidEncodingPayloadResult.ok, false);
  assert.equal(aeonInvalidEncodingPayloadResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.equal(aeonInvalidEncodingPayloadResult.errors[0].targetFormat, 'aeon');
  assert.equal(aeonInvalidEncodingPayloadResult.errors[0].valuePath, 'operations[0].value');

  const aeonQuotedSeparatorPayload = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'quotedSeparator',
    datatype: 'sep[|]',
    kind: 'separator',
    value: '"hello world"|"this, [is] fine"',
  }, namespace);
  const aeonQuotedSeparatorPayloadResult = validateMutationPlanTarget(aeonQuotedSeparatorPayload, 'aeon');
  assert.equal(aeonQuotedSeparatorPayloadResult.ok, true, JSON.stringify(aeonQuotedSeparatorPayloadResult.errors ?? []));

  const aeonInvalidSeparatorPayload = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'badSeparator',
    kind: 'separator',
    value: 'root/main',
  }, namespace);
  const aeonInvalidSeparatorPayloadResult = validateMutationPlanTarget(aeonInvalidSeparatorPayload, 'aeon');
  assert.equal(aeonInvalidSeparatorPayloadResult.ok, false);
  assert.equal(aeonInvalidSeparatorPayloadResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.equal(aeonInvalidSeparatorPayloadResult.errors[0].targetFormat, 'aeon');
  assert.equal(aeonInvalidSeparatorPayloadResult.errors[0].valuePath, 'operations[0].value');

  const aeonInvalidSeparatorDatatype = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'badSeparatorDatatype',
    datatype: 'sep[","]',
    kind: 'separator',
    value: '"hello, world"',
  }, namespace);
  const aeonInvalidSeparatorDatatypeResult = validateMutationPlanTarget(aeonInvalidSeparatorDatatype, 'aeon');
  assert.equal(aeonInvalidSeparatorDatatypeResult.ok, false);
  assert.equal(aeonInvalidSeparatorDatatypeResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(aeonInvalidSeparatorDatatypeResult.errors[0].targetFormat, 'aeon');
  assert.equal(aeonInvalidSeparatorDatatypeResult.errors[0].datatype, 'sep[","]');

  const aeonInvalidKadotMetadata = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'badKadot',
    datatype: 'kadot[.]',
    kind: 'separator',
    value: '1.2.3',
  }, namespace);
  const aeonInvalidKadotMetadataResult = validateMutationPlanTarget(aeonInvalidKadotMetadata, 'aeon');
  assert.equal(aeonInvalidKadotMetadataResult.ok, false);
  assert.equal(aeonInvalidKadotMetadataResult.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(aeonInvalidKadotMetadataResult.errors[0].targetFormat, 'aeon');
  assert.equal(aeonInvalidKadotMetadataResult.errors[0].datatype, 'kadot[.]');
});

test('validates mutation plans against custom target surfaces', () => {
  const namespace = sampleNamespace();
  const plan = planOk({ op: 'replace', target: '$.inventory.sku', value: 'B-200' }, namespace);

  const result = validateMutationPlanTarget(plan, {
    id: 'custom.readonly',
    validateOperation(operation) {
      if (operation.op === 'replace') {
        return {
          ok: false,
          code: 'SANSA_MUTATE_TARGET_UNSUPPORTED_OPERATION',
          message: 'Custom target is read-only',
        };
      }
      return true;
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].phase, 'target');
  assert.equal(result.errors[0].operationIndex, 0);
  assert.equal(result.errors[0].targetFormat, 'custom.readonly');
  assert.equal(result.errors[0].message, 'Custom target is read-only');
});

test('preserves representation kind hints separately from datatype hints', () => {
  const namespace = sampleNamespace();
  const createPlan = planOk({
    op: 'create',
    parent: '$.inventory',
    name: 'color',
    datatype: 'brandColor',
    kind: 'hex',
    value: 'ff00aa',
  }, namespace);

  assert.equal(createPlan.operations[0].datatype, 'brandColor');
  assert.equal(createPlan.operations[0].kind, 'hex');

  const replacePlan = planOk({
    op: 'replace',
    target: '$.inventory.sku',
    datatype: 'sansa',
    kind: 'sansa',
    value: '$.inventory.*',
  }, namespace);

  assert.equal(replacePlan.operations[0].datatype, 'sansa');
  assert.equal(replacePlan.operations[0].kind, 'sansa');

  const insertPlan = planOk({
    op: 'insert',
    container: '$.items',
    placement: 'last',
    datatype: 'brandColor',
    kind: 'hex',
    value: '00ff00',
  }, namespace);

  assert.equal(insertPlan.operations[0].datatype, 'brandColor');
  assert.equal(insertPlan.operations[0].kind, 'hex');

  const invalid = planMutation({ op: 'replace', target: '$.inventory.sku', kind: '', value: 'x' }, namespace);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors[0].code, 'SANSA_MUTATE_INVALID_KIND');
});

test('passes planned operations with datatype and kind hints to mutation hooks', () => {
  const namespace = sampleNamespace();
  const seen = [];
  const originalCreate = namespace.mutate.create;
  const originalReplace = namespace.mutate.replace;
  const originalInsert = namespace.mutate.insert;
  namespace.mutate.create = (parent, name, value, operation) => {
    seen.push({ op: operation.op, datatype: operation.datatype, kind: operation.kind });
    return originalCreate(parent, name, value, operation);
  };
  namespace.mutate.replace = (target, value, operation) => {
    seen.push({ op: operation.op, datatype: operation.datatype, kind: operation.kind });
    return originalReplace(target, value, operation);
  };
  namespace.mutate.insert = (container, placement, value, operation) => {
    seen.push({ op: operation.op, datatype: operation.datatype, kind: operation.kind });
    return originalInsert(container, placement, value, operation);
  };

  const plan = planOk({
    operations: [
      {
        op: 'create',
        parent: '$.inventory',
        name: 'color',
        datatype: 'brandColor',
        kind: 'hex',
        value: 'ff00aa',
      },
      {
        op: 'replace',
        target: '$.inventory.sku',
        datatype: 'sansa',
        kind: 'sansa',
        value: '$.inventory.*',
      },
      {
        op: 'insert',
        container: '$.items',
        placement: 'last',
        datatype: 'version',
        kind: 'sep',
        value: '0.11.0',
      },
    ],
  }, namespace);
  const applied = applyMutationPlan(plan, namespace);

  assert.equal(applied.ok, true, JSON.stringify(applied.errors ?? []));
  assert.deepEqual(seen, [
    { op: 'create', datatype: 'brandColor', kind: 'hex' },
    { op: 'replace', datatype: 'sansa', kind: 'sansa' },
    { op: 'insert', datatype: 'version', kind: 'sep' },
  ]);
});

test('requires exact mutation targets and forbids root removal', () => {
  const namespace = sampleNamespace();

  const expanded = planMutation({ op: 'replace', target: '$.inventory.*', value: 'x' }, namespace);
  assert.equal(expanded.ok, false);
  assert.equal(expanded.errors[0].code, 'SANSA_MUTATE_NON_EXACT_TARGET');

  const missing = planMutation({ op: 'replace', target: '$.inventory.missing', value: 'x' }, namespace);
  assert.equal(missing.ok, false);
  assert.equal(missing.errors[0].code, 'SANSA_MUTATE_TARGET_MISS');

  const rootRemove = planMutation({ op: 'remove', target: '$' }, namespace);
  assert.equal(rootRemove.ok, false);
  assert.equal(rootRemove.errors[0].code, 'SANSA_MUTATE_ROOT_REMOVE_FORBIDDEN');
});

test('reports unsupported operation and placement diagnostics', () => {
  const namespace = sampleNamespace();

  const unsupportedOperation = planMutation({ op: 'rename', target: '$.inventory.sku', name: 'code' }, namespace);
  assert.equal(unsupportedOperation.ok, false);
  assert.equal(unsupportedOperation.errors[0].code, 'SANSA_MUTATE_UNSUPPORTED_OPERATION');

  const unsupportedPlacement = planMutation({ op: 'insert', container: '$.items', placement: 'middle', value: 'x' }, namespace);
  assert.equal(unsupportedPlacement.ok, false);
  assert.equal(unsupportedPlacement.errors[0].code, 'SANSA_MUTATE_UNSUPPORTED_PLACEMENT');
});

test('rejects ordered mutations against non-ordered containers', () => {
  const namespace = sampleNamespace();

  const scalarInsert = planMutation({ op: 'insert', container: '$.inventory.sku', placement: 'last', value: 'x' }, namespace);
  assert.equal(scalarInsert.ok, false);
  assert.equal(scalarInsert.errors[0].code, 'SANSA_MUTATE_CONTAINER_NOT_ORDERED');

  const objectInsert = planMutation({ op: 'insert', container: '$.inventory', placement: 'last', value: 'x' }, namespace);
  assert.equal(objectInsert.ok, false);
  assert.equal(objectInsert.errors[0].code, 'SANSA_MUTATE_CONTAINER_NOT_ORDERED');
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

test('fails closed when mutation planning budgets are exceeded', () => {
  const namespace = sampleNamespace();
  const operations = [
    { op: 'replace', target: '$.inventory.sku', value: 'B-200' },
    { op: 'replace', target: '$.inventory.name', value: 'Bracket' },
  ];

  const operationBudget = planMutation(operations, namespace, { budget: { maxOperations: 1 } });
  assert.equal(operationBudget.ok, false);
  assert.equal(operationBudget.errors[0].code, 'SANSA_MUTATE_BUDGET_EXCEEDED');
  assert.equal(operationBudget.errors[0].phase, 'plan');
  assert.equal(operationBudget.errors[0].budget, 'maxOperations');
  assert.equal(operationBudget.errors[0].limit, 1);
  assert.equal(operationBudget.errors[0].observed, 2);

  const preconditionBudget = planMutation({
    operations: [operations[0]],
    preconditions: [
      { expression: '$.inventory.sku == "A-100"' },
      { expression: '$.inventory.name == "Adapter"' },
    ],
  }, namespace, { budget: { maxPreconditions: 1 } });
  assert.equal(preconditionBudget.ok, false);
  assert.equal(preconditionBudget.errors[0].code, 'SANSA_MUTATE_BUDGET_EXCEEDED');
  assert.equal(preconditionBudget.errors[0].budget, 'maxPreconditions');
});

test('fails closed when mutation value budgets are exceeded', () => {
  const namespace = sampleNamespace();

  const nodeBudget = planMutation([
    { op: 'replace', target: '$.inventory.sku', value: { text: 'A-101' } },
    { op: 'insert', container: '$.items', placement: 'last', value: ['x', 'y'] },
  ], namespace, { budget: { maxValueNodes: 4 } });
  assert.equal(nodeBudget.ok, false);
  assert.equal(nodeBudget.errors[0].code, 'SANSA_MUTATE_BUDGET_EXCEEDED');
  assert.equal(nodeBudget.errors[0].phase, 'plan');
  assert.equal(nodeBudget.errors[0].budget, 'maxValueNodes');
  assert.equal(nodeBudget.errors[0].limit, 4);
  assert.equal(nodeBudget.errors[0].observed, 5);

  const depthBudget = planMutation({
    op: 'create',
    parent: '$.inventory',
    name: 'nested',
    value: { outer: { inner: 'value' } },
  }, namespace, { budget: { maxValueDepth: 2 } });
  assert.equal(depthBudget.ok, false);
  assert.equal(depthBudget.errors[0].code, 'SANSA_MUTATE_BUDGET_EXCEEDED');
  assert.equal(depthBudget.errors[0].budget, 'maxValueDepth');
  assert.equal(depthBudget.errors[0].observed, 3);

  const stringBudget = planMutation({
    op: 'replace',
    target: '$.inventory.sku',
    value: 'ABCDEFGHIJ',
  }, namespace, { budget: { maxStringLength: 4 } });
  assert.equal(stringBudget.ok, false);
  assert.equal(stringBudget.errors[0].code, 'SANSA_MUTATE_BUDGET_EXCEEDED');
  assert.equal(stringBudget.errors[0].budget, 'maxStringLength');
  assert.equal(stringBudget.errors[0].observed, 10);
});

test('preserves mutation target portability warnings on the plan', () => {
  const namespace = sampleNamespace();
  const items = namespace.root.children[1];
  const large = binding({ address: '$.items[1000000]', value: 'large', representationKind: 'string' });
  large.id = 'large';
  large.index = 1_000_000;
  large.parent = items;
  items.children.push(large);

  const result = planMutation({ op: 'replace', target: '$.items[1000000]', value: 'updated' }, namespace, {
    parse: { maxPositionIndex: 1_000_000 },
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.deepEqual(result.plan.portabilityWarnings.map((warning) => warning.code), ['SANSA_NON_PORTABLE_POSITION_INDEX']);
  assert.deepEqual(result.plan.operations[0].target.portabilityWarnings.map((warning) => warning.code), ['SANSA_NON_PORTABLE_POSITION_INDEX']);
});

test('evaluates structured preconditions before producing mutation plans', () => {
  const namespace = sampleNamespace();
  const plan = planOk({
    operations: [
      { op: 'replace', target: '$.inventory.sku', value: 'B-200', provenance: { row: 7 } },
    ],
    preconditions: [
      { expression: '$.inventory.sku == "A-100"' },
      { target: '$.inventory.sku', expression: '. == "A-100"' },
    ],
    provenance: { query: 'manual-review' },
  }, namespace);

  assert.deepEqual(plan.preconditions.map((precondition) => precondition.canonical), [
    '$.inventory.sku == "A-100"',
    '. == "A-100"',
  ]);
  assert.equal(plan.preconditions[1].target.canonicalAddress, '$.inventory.sku');
  assert.deepEqual(plan.sourceProvenance, { query: 'manual-review' });
  assert.deepEqual(plan.operations[0].provenance, { row: 7 });
});

test('fails closed when a structured precondition evaluates false', () => {
  const namespace = sampleNamespace();
  const result = planMutation({
    operations: [
      { op: 'replace', target: '$.inventory.sku', value: 'B-200' },
    ],
    preconditions: [
      { expression: '$.inventory.sku == "C-300"' },
    ],
  }, namespace);

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_PRECONDITION_FAILED');
  assert.equal(result.errors[0].preconditionIndex, 0);
  assert.equal(namespace.root.children[0].children[0].value, 'A-100');
});

test('rejects non-boolean precondition expressions', () => {
  const namespace = sampleNamespace();
  const result = planMutation({
    operations: [
      { op: 'replace', target: '$.inventory.sku', value: 'B-200' },
    ],
    preconditions: [
      { expression: '$.inventory.sku' },
    ],
  }, namespace);

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_PRECONDITION_EVALUATION_FAILED');
  assert.equal(result.errors[0].cause.code, 'SANSA_QUERY_EVALUATE_EXPECTED_BOOLEAN');
});

test('rechecks preserved preconditions before apply hooks run', () => {
  const namespace = sampleNamespace();
  const plan = planOk({
    operations: [
      { op: 'replace', target: '$.inventory.sku', value: 'B-200' },
    ],
    preconditions: [
      { expression: '$.inventory.name == "Adapter"' },
    ],
  }, namespace);
  const inventory = namespace.root.children[0];
  const sku = inventory.children[0];
  const name = inventory.children[1];
  name.value = 'Bracket';

  const applied = applyMutationPlan(plan, namespace);
  assert.equal(applied.ok, false);
  assert.equal(applied.errors[0].code, 'SANSA_MUTATE_PRECONDITION_FAILED');
  assert.equal(applied.errors[0].preconditionIndex, 0);
  assert.equal(sku.value, 'A-100');
});

test('fails closed when mutation apply budgets are exceeded', () => {
  const namespace = sampleNamespace();
  const inventory = namespace.root.children[0];
  const sku = inventory.children[0];
  const name = inventory.children[1];
  const plan = planOk([
    { op: 'replace', target: '$.inventory.sku', value: 'B-200' },
    { op: 'replace', target: '$.inventory.name', value: 'Bracket' },
  ], namespace);

  const applied = applyMutationPlan(plan, namespace, { budget: { maxOperations: 1 } });
  assert.equal(applied.ok, false);
  assert.equal(applied.errors[0].code, 'SANSA_MUTATE_BUDGET_EXCEEDED');
  assert.equal(applied.errors[0].phase, 'apply');
  assert.equal(applied.errors[0].budget, 'maxOperations');
  assert.equal(sku.value, 'A-100');
  assert.equal(name.value, 'Adapter');
});

test('fails closed when mutation apply value budgets are exceeded', () => {
  const namespace = sampleNamespace();
  const sku = namespace.root.children[0].children[0];
  const plan = planOk({ op: 'replace', target: '$.inventory.sku', value: 'ABCDEFGHIJ' }, namespace);

  const applied = applyMutationPlan(plan, namespace, { budget: { maxStringLength: 4 } });

  assert.equal(applied.ok, false);
  assert.equal(applied.errors[0].code, 'SANSA_MUTATE_BUDGET_EXCEEDED');
  assert.equal(applied.errors[0].phase, 'apply');
  assert.equal(applied.errors[0].budget, 'maxStringLength');
  assert.equal(applied.errors[0].limit, 4);
  assert.equal(applied.errors[0].observed, 10);
  assert.equal(sku.value, 'A-100');
});

test('plans ordered insert and same-container move without prescribing storage representation', () => {
  const namespace = sampleNamespace();
  const insertPlan = planOk({ op: 'insert', container: '$.items', placement: { kind: 'before', anchor: '$.items[1]' }, value: 'middle' }, namespace);
  const insert = applyMutationPlan(insertPlan, namespace);
  assert.equal(insert.ok, true, JSON.stringify(insert.errors ?? []));
  assert.deepEqual(namespace.root.children[1].children.map((child) => child.value), ['first', 'middle', 'second']);
  assert.equal(insert.operationResults[0].containerAddress, '$.items');
  assert.equal(insert.operationResults[0].anchorAddress, '$.items[1]');
  assert.equal(insert.operationResults[0].affectedAddress, '$.items[new]');
  assert.equal(insert.operationResults[0].resultingAddress, '$.items[new]');

  const movePlan = planOk({ op: 'move', source: '$.items[0]', container: '$.items', placement: 'last' }, namespace);
  const move = applyMutationPlan(movePlan, namespace);
  assert.equal(move.ok, true, JSON.stringify(move.errors ?? []));
  assert.deepEqual(namespace.root.children[1].children.map((child) => child.value), ['middle', 'second', 'first']);
  assert.equal(move.operationResults[0].sourceAddress, '$.items[0]');
  assert.equal(move.operationResults[0].containerAddress, '$.items');
  assert.equal(move.operationResults[0].previousAddress, '$.items[0]');
  assert.equal(move.operationResults[0].affectedAddress, '$.items[0]');
  assert.equal(move.operationResults[0].resultingAddress, '$.items[0]');
});

test('reports remove as an affected binding without an implicit resulting address', () => {
  const namespace = sampleNamespace();
  const plan = planOk({ op: 'remove', target: '$.inventory.name' }, namespace);
  const applied = applyMutationPlan(plan, namespace);

  assert.equal(applied.ok, true, JSON.stringify(applied.errors ?? []));
  assert.equal(applied.operationResults[0].targetAddress, '$.inventory.name');
  assert.equal(applied.operationResults[0].previousAddress, '$.inventory.name');
  assert.equal(applied.operationResults[0].affectedAddress, '$.inventory.name');
  assert.equal(applied.operationResults[0].resultingAddress, undefined);
});

test('rejects cross-container move in the conservative core', () => {
  const namespace = sampleNamespace();
  const result = planMutation({ op: 'move', source: '$.items[0]', container: '$.archive', placement: 'last' }, namespace);

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_INVALID_MOVE_CONTAINER');
});

test('rejects invalid ordered mutation anchors', () => {
  const namespace = sampleNamespace();

  const wrongContainer = planMutation({
    op: 'insert',
    container: '$.archive',
    placement: { kind: 'before', anchor: '$.items[0]' },
    value: 'x',
  }, namespace);
  assert.equal(wrongContainer.ok, false);
  assert.equal(wrongContainer.errors[0].code, 'SANSA_MUTATE_INVALID_ANCHOR');

  const selfAnchor = planMutation({
    op: 'move',
    source: '$.items[0]',
    container: '$.items',
    placement: { kind: 'before', anchor: '$.items[0]' },
  }, namespace);
  assert.equal(selfAnchor.ok, false);
  assert.equal(selfAnchor.errors[0].code, 'SANSA_MUTATE_INVALID_MOVE_ANCHOR');
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

test('keeps mutation plans as in-process execution artifacts', () => {
  const namespace = sampleNamespace();
  const sku = namespace.root.children[0].children[0];
  const plan = planOk({ op: 'replace', target: '$.inventory.sku', value: 'B-200' }, namespace);

  assert.throws(() => JSON.stringify(plan), /circular structure/);

  const clonedPlan = structuredClone(plan);
  const applied = applyMutationPlan(clonedPlan, namespace);
  assert.equal(applied.ok, false);
  assert.equal(applied.errors[0].code, 'SANSA_MUTATE_STALE_TARGET');
  assert.match(applied.errors[0].message, /identity changed/);
  assert.equal(sku.value, 'A-100');
});

test('rejects apply when ordered mutation anchors drift after planning', () => {
  const insertNamespace = sampleNamespace();
  const insertPlan = planOk({
    op: 'insert',
    container: '$.items',
    placement: { kind: 'before', anchor: '$.items[1]' },
    value: 'middle',
  }, insertNamespace);
  const insertItems = insertNamespace.root.children[1];
  const insertReplacement = binding({ address: '$.items[1]', value: 'replacement', representationKind: 'string' });
  insertReplacement.id = 'replacement';
  insertReplacement.parent = insertItems;
  insertItems.children[1] = insertReplacement;

  const inserted = applyMutationPlan(insertPlan, insertNamespace);
  assert.equal(inserted.ok, false);
  assert.equal(inserted.errors[0].code, 'SANSA_MUTATE_STALE_TARGET');
  assert.deepEqual(insertItems.children.map((child) => child.value), ['first', 'replacement']);

  const moveNamespace = sampleNamespace();
  const movePlan = planOk({
    op: 'move',
    source: '$.items[0]',
    container: '$.items',
    placement: { kind: 'after', anchor: '$.items[1]' },
  }, moveNamespace);
  const moveItems = moveNamespace.root.children[1];
  const moveReplacement = binding({ address: '$.items[1]', value: 'replacement', representationKind: 'string' });
  moveReplacement.id = 'replacement';
  moveReplacement.parent = moveItems;
  moveItems.children[1] = moveReplacement;

  const moved = applyMutationPlan(movePlan, moveNamespace);
  assert.equal(moved.ok, false);
  assert.equal(moved.errors[0].code, 'SANSA_MUTATE_STALE_TARGET');
  assert.deepEqual(moveItems.children.map((child) => child.value), ['first', 'replacement']);
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

test('honors explicit false mutation adapter capability flags', () => {
  const namespace = sampleNamespace();
  const plan = planOk({ op: 'replace', target: '$.inventory.sku', value: 'B-200' }, namespace);
  const adapter = {
    ...namespace.mutate,
    supportsReplace: false,
  };

  const applied = applyMutationPlan(plan, { ...namespace, mutate: adapter });
  assert.equal(applied.ok, false);
  assert.equal(applied.errors[0].code, 'SANSA_MUTATE_UNSUPPORTED_ADAPTER_OPERATION');
  assert.equal(namespace.root.children[0].children[0].value, 'A-100');
});

test('reports hook failure without reporting full plan success', () => {
  const namespace = sampleNamespace();
  const plan = planOk([
    { op: 'replace', target: '$.inventory.sku', value: 'B-200' },
    { op: 'replace', target: '$.inventory.name', value: 'Bracket' },
  ], namespace);
  const originalReplace = namespace.mutate.replace;
  namespace.mutate.replace = (target, value, operation) => {
    if (target.name === 'name') return { ok: false, message: 'host rejected name update' };
    return originalReplace(target, value, operation);
  };

  const applied = applyMutationPlan(plan, namespace);
  assert.equal(applied.ok, false);
  assert.equal(applied.errors[0].code, 'SANSA_MUTATE_APPLY_FAILED');
  assert.equal(applied.errors[0].operationIndex, 1);
  assert.equal(applied.operationResults.length, 1);
  assert.equal(applied.operationResults[0].status, 'applied');
  assert.equal(namespace.root.children[0].children[0].value, 'B-200');
  assert.equal(namespace.root.children[0].children[1].value, 'Adapter');
});

test('reports thrown mutation hook failures without applying the operation', () => {
  const namespace = sampleNamespace();
  const sku = namespace.root.children[0].children[0];
  const plan = planOk({ op: 'replace', target: '$.inventory.sku', value: 'B-200' }, namespace);
  namespace.mutate.replace = () => {
    throw new Error('host mutation hook exploded');
  };

  const applied = applyMutationPlan(plan, namespace);
  assert.equal(applied.ok, false);
  assert.equal(applied.errors[0].code, 'SANSA_MUTATE_APPLY_FAILED');
  assert.equal(applied.errors[0].operationIndex, 0);
  assert.match(applied.errors[0].message, /host mutation hook exploded/);
  assert.deepEqual(applied.operationResults, []);
  assert.equal(sku.value, 'A-100');
});

test('can require an atomic mutation adapter before apply', () => {
  const namespace = sampleNamespace();
  const plan = planOk({ op: 'replace', target: '$.inventory.sku', value: 'B-200' }, namespace);
  const nonAtomic = {
    ...namespace,
    mutate: {
      ...namespace.mutate,
      supportsAtomicApply: false,
    },
  };

  const applied = applyMutationPlan(plan, nonAtomic, { requireAtomic: true });
  assert.equal(applied.ok, false);
  assert.equal(applied.errors[0].code, 'SANSA_MUTATE_ATOMIC_APPLY_UNAVAILABLE');
});
