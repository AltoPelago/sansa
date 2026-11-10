// JSON.parse loses duplicate member names before a reviver can inspect them.
// This decoder retains JSON's string/number grammar and rejects duplicate keys.
export function parseStrictJson(text) {
  const result = JSON.parse(text);
  const stack = [];
  for (let offset = 0; offset < text.length; offset += 1) {
    const character = text[offset];
    if (character === '"') {
      const start = offset;
      while (++offset < text.length) {
        if (text[offset] === '\\') offset += 1;
        else if (text[offset] === '"') break;
      }
      const context = stack.at(-1);
      if (context?.object && context.key) {
        const key = JSON.parse(text.slice(start, offset + 1));
        if (context.keys.has(key)) throw new SyntaxError('Duplicate JSON member');
        context.keys.add(key);
        context.key = false;
      }
    } else if (character === '{') stack.push({ object: true, key: true, keys: new Set() });
    else if (character === '[') stack.push({ object: false });
    else if (character === '}' || character === ']') stack.pop();
    else if (character === ',' && stack.at(-1)?.object) stack.at(-1).key = true;
  }
  return result;
}

export function exceedsJsonDepth(text, limit) {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{' || character === '[') {
      depth += 1;
      if (depth > limit) return true;
    } else if (character === '}' || character === ']') depth -= 1;
  }
  return false;
}
