import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseAddress, resolveAddress} from '../src/index.js';
const model = JSON.parse(readFileSync(new URL('../fixtures/property-namespace-candidate-v1.json', import.meta.url))).namespace;

export function propertyHost(input = {}) {
  const bindings = new Map(structuredClone(model.bindings).map(b => [b.id, b]));
  const calls = {};
  const count = name => { calls[name] = (calls[name] ?? 0) + 1; };
  const document = bindings.get('doc');
  document.tag = 'document';
  document.children = ['apple', 'note', 'orange'];
  for (const [index, id, tag] of [[0, 'apple', 'product'], [1, 'note', 'note'], [2, 'orange', 'product']]) {
    const node = bindings.get(id);
    Object.assign(node, {address: `$.document[${index}]`, index, tag, children: []});
  }
  const get = id => bindings.get(id);
  const parents = new Map();
  for (const b of bindings.values()) for (const id of [...(b.children ?? []), ...(b.attributeSpace ? [b.attributeSpace] : []), ...Object.values(b.localSpaces ?? {})]) parents.set(get(id), b);
  const invoke = (callback, b, fallback, at) => {
    count(callback);
    const fault = input.faults?.find(f => f.callback === callback && f.binding === b.id && (f.at === undefined || f.at === at));
    if (!fault) return fallback();
    if (fault.action === 'throw') throw fault.value;
    return fault.action === 'absent' ? undefined : fault.value;
  };
  function contains(root, binding) {
    const visited = new Set(), stack = [root];
    while (stack.length) {
      const b = stack.pop(); if (!b || visited.has(b)) continue;
      if (b === binding) return true;
      visited.add(b);
      for (const id of [...(b.children ?? []), ...(b.attributeSpace ? [b.attributeSpace] : []), ...Object.values(b.localSpaces ?? {})]) stack.push(get(id));
    }
    return false;
  }
  const properties = {
    scope(b, context) {
      assert.ok(Object.isFrozen(context));
      return invoke('scope', b, () => !contains(context.scopeRoot, b) ? 'outside' : b === context.scopeRoot ? 'root' : 'inside');
    },
    key(b) { return invoke('key', b, () => b.key); },
    nodeKind(b) { return invoke('nodeKind', b, () => b.nodeKind); },
    nodeTag(b) { return invoke('nodeTag', b, () => b.tag); },

  };
  for (const omit of input.omit ?? []) delete properties[omit];
  const namespace = {
    root() { count('root'); return input.invalidRoot ? undefined : get(input.rebasedRoot ?? model.root); },
    contextualRoot: get(input.contextualRoot), properties,
    children(b) { count('children'); return (b.children ?? []).map(get); },
    parent: b => parents.get(b), name: b => b.key ?? b.legacyName, index: b => b.index,
    identity: b => b.identity, attributeSpace: b => get(b.attributeSpace), localSpace: (b, name) => get(b.localSpaces?.[name]),
  };
  return {namespace, calls, bindings};
}
function snapshot(root) {
  const out = [], seen = new Set(), stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node); const descriptors = Object.getOwnPropertyDescriptors(node);
    out.push({node, descriptors});
    for (const descriptor of Object.values(descriptors)) if ('value' in descriptor) stack.push(descriptor.value);
  }
  return out;
}
export function runPropertyVector(vector) {
  const input = vector.input;
  const host = propertyHost(input);
  let source = input.source, ast = input.ast && structuredClone(input.ast), getterCalls = 0;
  if (input.generate) {
    const {kind,count,scalar='x'} = input.generate;
    ast = parseAddress('$&key("x")').address;
    if (kind === 'payload') ast.selectors[0].value = scalar.repeat(count);
    if (kind === 'selectors') ast.selectors = Array.from({length:count}, () => ({type:'propertyFilter',property:'key',value:'x'}));
    if (kind === 'canonical') ast.selectors.unshift({type:'member',name:'@'+'x'.repeat(count-16),quoted:true});
  }
  if (input.astFault === 'accessor') Object.defineProperty(ast.selectors.at(-1), 'value', {get() { getterCalls++; return 'document'; }});
  if (input.astFault === 'cycle') {
    const term = {type:'QualifierTerm',name:'a',arguments:[],parameters:[]};term.parameterGroups=[[term]];
    ast.qualifierExpression={type:'QualifierExpression',terms:[term]};
  }
  const before = ast && snapshot(ast);
  const result = resolveAddress(ast ?? source, host.namespace, input.options);
  if (before) assert.deepEqual(snapshot(ast), before, 'input unchanged');
  const observed = {ok:result.ok,bindings:result.bindings.map(b=>b.id),addresses:result.bindings.map(b=>b.address),calls:host.calls,astGetterCalls:getterCalls,inputUnchanged:true};
  if (!result.ok) Object.assign(observed, result.errors[0], {error: result.errors[0].code});
  for (const [field, expected] of Object.entries(vector.expected)) {
    assert.ok(['ok','bindings','addresses','calls','error','limit','observed','budget','selectorIndex','causeCode','astGetterCalls','inputUnchanged'].includes(field), `unasserted expected field ${field}`);
    if (field === 'calls') for (const [name,count] of Object.entries(expected)) assert.equal(observed.calls[name]??0,count,`calls.${name}`);
    else assert.deepEqual(observed[field], expected, field);
  }
  return {result,host,observed};
}
