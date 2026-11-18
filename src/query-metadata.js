const QUERY_VALUE_METADATA_PROPERTY = '__sansaQueryValueMetadata';
const QUERY_OBJECT_FIELD_METADATA_PROPERTY = '__sansaObjectFieldMetadata';

// Public presentation accessors. Metadata storage is private; callers receive
// detached, frozen scalar descriptors and never need to know the property keys.
const QUERY_METADATA_FIELDS = ['kind', 'category', 'semanticType', 'containerKind',
  'nullReason', 'numericLexeme', 'radixBase', 'radixScale'];
function copyQueryMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return undefined;
  return Object.freeze(Object.fromEntries(QUERY_METADATA_FIELDS
    .filter((name) => metadata[name] !== undefined)
    .map((name) => [name, metadata[name]])));
}

export function getQueryValueMetadata(value) {
  if (value?.type !== 'scalar') return undefined;
  return copyQueryMetadata(Object.getOwnPropertyDescriptor(value, QUERY_VALUE_METADATA_PROPERTY)?.value);
}

export function getQueryObjectFieldMetadata(value) {
  if (!value || typeof value !== 'object') return Object.freeze({});
  const fields = Object.getOwnPropertyDescriptor(value, QUERY_OBJECT_FIELD_METADATA_PROPERTY)?.value;
  return Object.freeze(Object.fromEntries(Object.entries(fields ?? {})
    .map(([name, metadata]) => [name, copyQueryMetadata(metadata)])));
}
