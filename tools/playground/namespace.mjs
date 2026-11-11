import {parseAddress, resolveAddress} from '../../src/index.js';

// UI projection only: selection stays in SANSA and topology stays in the SDK.
export function rowsFromNamespace(namespace) {
  const rows = [];
  const stack = [namespace.root];
  while (stack.length) {
    const binding = stack.pop();
    rows.push({path: binding.address, type: binding.representationKind,
      datatype: binding.semanticType ?? '', value: binding.value,
      identity: binding.identity, binding});
    if (binding.attributeSpace) stack.push(binding.attributeSpace);
    stack.push(...[...(binding.children ?? [])].reverse());
  }
  return rows;
}

export function scopedNamespace(namespace, rootPath = '$') {
  const parsed = parseAddress(rootPath.trim());
  if (!parsed.ok || !parsed.address.isExact || parsed.address.root.kind !== 'absolute') {
    throw new Error('Scope root must be an absolute structural path.');
  }
  const result = resolveAddress(parsed.address, namespace, {maxBindings: 1});
  if (!result.ok) throw new Error(result.errors[0]?.message ?? 'Cannot resolve scope root.');
  if (result.bindings.length !== 1) throw new Error('Scope root must identify one existing binding.');
  return {...namespace, root: result.bindings[0], contextualRoot: result.bindings[0]};
}

export function selectionRows(result, rows) {
  const byBinding = new Map(rows.map(row => [row.binding, row]));
  return result.bindings.map(binding => byBinding.get(binding) ?? {
    path: binding.address, type: binding.representationKind,
    datatype: binding.semanticType ?? '', value: binding.value,
    identity: binding.identity, binding,
  });
}
