document.addEventListener("DOMContentLoaded", () => {
  const shell = document.querySelector("[data-sansa-playground]");
  if (!shell) return;

  const source = shell.querySelector("[data-sansa-source]");
  const address = shell.querySelector("[data-sansa-address]");
  const query = shell.querySelector("[data-sansa-query]");
  const result = shell.querySelector("[data-sansa-result]");
  const inputTitle = shell.querySelector("[data-sansa-input-title]");
  const resultTitle = shell.querySelector("[data-sansa-result-title]");
  const diagnostics = shell.querySelector("[data-sansa-diagnostics]");
  const loading = shell.querySelector("[data-sansa-loading]");
  const modeButtons = shell.querySelectorAll("[data-sansa-mode]");
  const viewButtons = shell.querySelectorAll("[data-sansa-view]");
  const composerOpen = shell.querySelectorAll("[data-sansa-composer-open]");
  const composerModal = shell.querySelector("[data-sansa-composer-modal]");
  const composerClose = shell.querySelectorAll("[data-sansa-composer-close]");
  const composerTitle = shell.querySelector("[data-sansa-composer-title]");
  const resolveComposer = shell.querySelector("[data-sansa-resolve-composer]");
  const queryComposer = shell.querySelector("[data-sansa-query-composer]");
  const composerInput = shell.querySelector("[data-sansa-composer-input]");
  const composerOptions = shell.querySelector("[data-sansa-composer-options]");
  const composerApply = shell.querySelector("[data-sansa-composer-apply]");
  const composerApplyLabel = shell.querySelector("[data-sansa-composer-apply-label]");
  const queryClauseButtons = shell.querySelectorAll("[data-sansa-query-clause]");
  const queryClauseTitle = shell.querySelector("[data-sansa-query-clause-title]");
  const queryClauseHelp = shell.querySelector("[data-sansa-query-clause-help]");
  const queryClauseRequirement = shell.querySelector("[data-sansa-query-clause-requirement]");
  const queryClauseLabel = shell.querySelector("[data-sansa-query-clause-label]");
  const queryClauseInput = shell.querySelector("[data-sansa-query-clause-input]");
  const queryClauseOptions = shell.querySelector("[data-sansa-query-clause-options]");
  const queryPreview = shell.querySelector("[data-sansa-query-preview]");
  const queryValidation = shell.querySelector("[data-sansa-query-validation]");
  const examplesOpen = shell.querySelector("[data-sansa-examples-open]");
  const examplesModal = shell.querySelector("[data-sansa-examples-modal]");
  const examplesClose = shell.querySelectorAll("[data-sansa-examples-close]");
  const exampleTabs = shell.querySelectorAll("[data-sansa-example-key]");
  const exampleSource = shell.querySelector("[data-sansa-example-source]");
  const exampleExpression = shell.querySelector("[data-sansa-example-expression]");
  const exampleLoad = shell.querySelector("[data-sansa-example-load]");

  if (!source || !address || !query || !result || !diagnostics || !loading) return;

  const runtimeReady = Promise.all([
    import("@aeon/runtime"),
    import("../../src/index.js"),
    import("@altopelago/aeon-sdk/sansa"),
    import("./namespace.mjs")
  ]).then(([runtime, sansa, sdk, projection]) => ({
    runRuntime: runtime.runRuntime,
    parseAddress: sansa.parseAddress,
    renderAddress: sansa.renderAddress,
    parseQuery: sansa.parseQuery,
    evaluateQuery: sansa.evaluateQuery,
    resolveAddress: sansa.resolveAddress,
    createAeonNamespace: sdk.createAeonNamespace,
    ...projection
  }));

  const examples = window.SansaPlaygroundExamples || {};
  const state = {
    mode: "transport",
    view: "resolve",
    requestId: 0,
    rows: [],
    namespace: null,
    diagnosticLines: [],
    hasDiagnosticErrors: false,
    diagnosticLineOffset: 0,
    caretBindingPath: null,
    queryComposerClause: "from",
    queryDraft: {
      from: "$",
      where: "",
      order: "",
      offset: "",
      limit: "",
      select: "."
    },
    whereBuilder: {
      step: "root",
      field: null,
      operator: null,
      functionName: null,
      temporalTarget: null
    },
    queryRenderedOptions: [],
    example: Object.keys(examples)[0] || "",
    parseAddress: null,
    resolveAddress: null,
    selectionRows: null,
    parseQuery: null
  };

  const sourceComposer = window.AeonSourceComposer?.mount({
    shell,
    source,
    runtimeReady,
    getMode: () => state.mode,
    runtimeConfig: (text, mode, relaxed = false) => {
      if (relaxed) {
        return {
          text: sourceForBuilderSeed(text),
          options: { mode: "loose", datatypePolicy: "reserved_only", includeAnnotations: true, output: "map" }
        };
      }
      const mapping = mapMode(mode);
      return {
        text: sourceForMode(text, mode),
        options: { mode: mapping.runtimeMode, datatypePolicy: mapping.datatypePolicy, includeAnnotations: true, output: "map" }
      };
    },
    onApply: () => scheduleResolve(),
    onError: (error) => {
      diagnostics.textContent = error instanceof Error ? error.message : String(error);
    }
  });

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function mapMode(mode) {
    if (mode === "strict") return { runtimeMode: "strict", datatypePolicy: "reserved_only" };
    if (mode === "custom") return { runtimeMode: "strict", datatypePolicy: "allow_custom" };
    return { runtimeMode: "transport", datatypePolicy: "reserved_only" };
  }

  function sourceForMode(text, mode) {
    const sourceText = String(text ?? "");
    if (mode === "transport" || /^\s*aeon\s*:\s*header\s*=/im.test(sourceText)) return sourceText;
    const headerMode = mode === "custom" ? "custom" : "strict";
    const withoutModeHeader = sourceText.replace(/^\s*aeon:mode\s*=\s*["'](?:transport|custom|strict)["']\s*(?:\r?\n)?/i, "");
    return `aeon:mode = "${headerMode}"\n${withoutModeHeader}`;
  }

  function sourceDiagnosticLineOffset(text, mode) {
    const sourceText = String(text ?? "");
    if (mode === "transport"
      || /^\s*aeon\s*:\s*header\s*=/im.test(sourceText)
      || /^\s*aeon:mode\s*=\s*["'](?:transport|custom|strict)["']/i.test(sourceText)) {
      return 0;
    }
    return 1;
  }

  function visibleDiagnosticLine(item, lineOffset = 0) {
    const line = item?.span?.start?.line;
    if (!Number.isInteger(line)) return null;
    const visibleLine = line - lineOffset;
    return visibleLine > 0 ? visibleLine : null;
  }

  function showFirstSourceError(items, lineOffset = 0) {
    const first = items?.find((item) => visibleDiagnosticLine(item, lineOffset) !== null);
    window.AeonWebHighlight?.setEditorDiagnosticLine?.(
      source,
      first ? visibleDiagnosticLine(first, lineOffset) : null,
      first?.span?.start?.column
    );
  }

  function sourceForBuilderSeed(text) {
    return String(text ?? "").replace(/^\s*aeon:mode\s*=\s*["'](?:transport|custom|strict)["']\s*(?:\r?\n)?/i, "");
  }

  function formatAttributePath(key) {
    const text = String(key || "attr");
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? `.@.${text}` : `.@.[${JSON.stringify(text)}]`;
  }

  function memberPath(key) {
    const text = String(key || "field");
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? `.${text}` : `.[${JSON.stringify(text)}]`;
  }

  function formatPath(path) {
    if (typeof path === "string") return path;
    if (path && typeof path === "object" && typeof window.AeonFormatPath === "function") {
      return window.AeonFormatPath(path);
    }
    if (!path?.segments) return "$";
    let output = "";
    for (const segment of path.segments) {
      if (segment.type === "root") output = "$";
      if (segment.type === "member") output += memberPath(segment.key);
      if (segment.type === "index") output += `[${segment.index}]`;
      if (segment.type === "attribute") output += formatAttributePath(segment.key);
    }
    return output || "$";
  }

  function valueFromEvent(event) {
    if (event.raw !== null && event.raw !== undefined) return event.raw;
    const value = event.value;
    if (value && typeof value === "object") return value.raw ?? value.value ?? undefined;
    return value;
  }

  function renderValue(value) {
    if (value === undefined) return "{...}";
    if (typeof value === "string") return JSON.stringify(value);
    return JSON.stringify(value);
  }

  function eventType(event) {
    return event.valueType ?? event.type ?? event.value?.type ?? "";
  }

  function attributeEntries(attributes) {
    if (attributes instanceof Map) return Array.from(attributes.entries());
    if (attributes && !Array.isArray(attributes) && typeof attributes === "object") return Object.entries(attributes);
    return [];
  }

  function pushRows(rows, event, path) {
    rows.push({
      path,
      type: eventType(event),
      datatype: event.datatype ?? "",
      value: valueFromEvent(event),
      event
    });
    for (const [key, entry] of attributeEntries(event?.annotations ?? event?.attributes)) {
      pushRows(rows, entry, `${path}${formatAttributePath(key)}`);
    }
  }

  function rowsFromEvents(events) {
    const rows = [];
    for (const event of events ?? []) pushRows(rows, event, formatPath(event.path));
    return rows;
  }

  function temporalKind(datatype) {
    const base = String(datatype ?? "").split(/[<\[]/, 1)[0].toLowerCase();
    return ["date", "time", "datetime", "wtc"].includes(base) ? base : "datetime";
  }

  function scalarKind(row) {
    const type = String(row.type ?? "");
    if (["DateLiteral", "TimeLiteral", "DateTimeLiteral", "WTCDateTimeLiteral"].includes(type)) {
      return temporalKind(row.datatype);
    }
    const kinds = {
      StringLiteral: "string",
      NumberLiteral: "number",
      InfinityLiteral: "infinity",
      NaNLiteral: "nan",
      BooleanLiteral: "boolean",
      NullLiteral: "null",
      ToggleLiteral: "toggle",
      HexLiteral: "hex",
      RadixLiteral: "radix",
      EncodingLiteral: "encoding",
      SeparatorLiteral: "separator",
      SymbolicLiteral: "symbol",
      SansaAddressLiteral: "sansaAddress",
      CloneReference: "referenceForm",
      PointerReference: "referenceForm"
    };
    return kinds[type];
  }

  function representationKind(row) {
    const type = String(row.type ?? "");
    const kinds = {
      ObjectNode: "object",
      ListNode: "list",
      TupleLiteral: "tuple",
      NodeLiteral: "node",
      StringLiteral: "string",
      NumberLiteral: "number",
      InfinityLiteral: "infinity",
      NaNLiteral: "nan",
      BooleanLiteral: "boolean",
      NullLiteral: "null",
      ToggleLiteral: "toggle",
      HexLiteral: "hex",
      RadixLiteral: "radix",
      EncodingLiteral: "encoding",
      SeparatorLiteral: "separator",
      SymbolicLiteral: "symbol",
      SansaAddressLiteral: "sansa",
      CloneReference: "cloneReference",
      PointerReference: "pointerReference"
    };
    if (["DateLiteral", "TimeLiteral", "DateTimeLiteral", "WTCDateTimeLiteral"].includes(type)) {
      return temporalKind(row.datatype);
    }
    return kinds[type] ?? type;
  }

  function queryBinding(row, selector) {
    const binding = {
      address: row.path,
      children: [],
      semanticType: row.datatype || undefined,
      representationKind: representationKind(row),
      scalarKind: scalarKind(row)
    };
    if (selector?.type === "member") binding.name = selector.name;
    if (selector?.type === "position") binding.index = selector.index;
    if (row.value !== undefined) binding.value = row.value;
    if (row.type === "NumberLiteral") binding.numericLexeme = String(row.value);
    if (row.type === "NullLiteral") binding.nullReason = row.value;
    return binding;
  }

  function appendSelector(base, selector) {
    if (selector.type === "member") return `${base}${memberPath(selector.name)}`;
    if (selector.type === "position") return `${base}[${selector.index}]`;
    return base;
  }


  function parsePath(path) {
    if (!state.parseAddress) return null;
    const parsed = state.parseAddress(path);
    return parsed.ok ? parsed.address : null;
  }

  function globToRegExp(pattern) {
    let output = "^";
    for (const char of String(pattern ?? "")) {
      if (char === "*") output += ".*";
      else if (char === "?") output += ".";
      else output += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp(`${output}$`);
  }

  function selectorsEqual(left, right) {
    if (!left || !right) return false;
    if (left.type === "member") return right.type === "member" && right.name === left.name;
    if (left.type === "position") return right.type === "position" && right.index === left.index;
    if (left.type === "attributeSpace") return right.type === "attributeSpace";
    if (left.type === "localSpace") return right.type === "localSpace" && right.name === left.name;
    if (left.type === "namePattern") return right.type === "member" && globToRegExp(left.pattern).test(right.name);
    return false;
  }

  function selectorMatches(pattern, target) {
    if (!pattern || !target) return false;
    if (pattern.type === "positionRange") {
      if (target.type !== "position") return false;
      const start = pattern.start ?? 0;
      const end = pattern.end ?? Number.POSITIVE_INFINITY;
      return target.index >= start && target.index <= end;
    }
    return selectorsEqual(pattern, target);
  }

  function normalizeParentSelectors(selectors) {
    const normalized = [];
    for (const selector of selectors) {
      if (selector.type !== "parent") {
        normalized.push(selector);
        continue;
      }
      if (normalized.length === 0) return null;
      normalized.pop();
    }
    return normalized;
  }

  function isMetadataFilter(selector) {
    return selector?.type === "semanticTypeFilter" || selector?.type === "representationKindFilter";
  }

  function normalizeFilterValue(value) {
    const normalized = String(value ?? "")
      .trim()
      .replace(/Literal$|Node$/i, "")
      .toLowerCase();
    return normalized === "symbolic" ? "symbol" : normalized;
  }

  function representationKindCandidates(row) {
    const candidates = new Set();
    for (const value of [row.type, row.event?.valueType, row.event?.type, row.event?.value?.type]) {
      const normalized = normalizeFilterValue(value);
      if (normalized) candidates.add(normalized);
    }
    if (candidates.has("integer") || candidates.has("float")) candidates.add("number");
    if (candidates.has("boolean")) candidates.add("bool");
    return candidates;
  }

  function semanticTypeCandidates(row) {
    const candidates = new Set();
    for (const value of [row.datatype, row.event?.datatype]) {
      const normalized = normalizeFilterValue(value);
      if (normalized) candidates.add(normalized);
    }
    return candidates;
  }

  function metadataFiltersMatch(selectors, row) {
    for (const selector of selectors) {
      if (selector.type === "representationKindFilter" && !representationKindCandidates(row).has(normalizeFilterValue(selector.name))) {
        return false;
      }
      if (selector.type === "semanticTypeFilter" && !semanticTypeCandidates(row).has(normalizeFilterValue(selector.name))) {
        return false;
      }
    }
    return true;
  }

  function matchSelectors(pattern, target, patternIndex = 0, targetIndex = 0) {
    if (patternIndex >= pattern.length) return targetIndex >= target.length;
    const selector = pattern[patternIndex];
    if (isMetadataFilter(selector)) return matchSelectors(pattern, target, patternIndex + 1, targetIndex);
    if (selector.type === "descendantExpansion") {
      return matchSelectors(pattern, target, patternIndex + 1, targetIndex)
        || (targetIndex < target.length && matchSelectors(pattern, target, patternIndex, targetIndex + 1));
    }
    if (targetIndex >= target.length) return false;
    if (selector.type === "directExpansion") return matchSelectors(pattern, target, patternIndex + 1, targetIndex + 1);
    return selectorMatches(selector, target[targetIndex]) && matchSelectors(pattern, target, patternIndex + 1, targetIndex + 1);
  }


  function hasSelectorSurface(parsedAddress) {
    return parsedAddress.selectors.some((selector) => [
      "childIdentity",
      "directExpansion",
      "descendantExpansion",
      "positionRange",
      "parent",
      "namePattern",
      "semanticTypeFilter",
      "representationKindFilter"
    ].includes(selector.type));
  }

  function addressWarnings(parsedAddress) {
    const warnings = [];
    if (parsedAddress.root.kind === "contextual") {
      warnings.push("Contextual root uses the selected scope root.");
    }
    if (parsedAddress.qualifierExpression) {
      warnings.push("Qualifier syntax parses, but extraction ignores qualifier semantics.");
    }
    return warnings;
  }

  function resultLine(row) {
    return `${row.path}${row.identity ? `  (identity: ${row.identity})` : ""} = ${renderValue(row.value)}`;
  }

  function renderMatches(matches, parsedAddress, warnings) {
    result.classList.add("is-valid");
    result.classList.remove("is-invalid");
    const lines = matches.map(resultLine);
    result.innerHTML = `
      <div class="sansa-status">${matches.length} match${matches.length === 1 ? "" : "es"}</div>
      <div class="sansa-result-grid">
        <span>${parsedAddress.isExact && !hasSelectorSurface(parsedAddress) ? "path" : "selector"}</span>
        <span>${parsedAddress.isExact ? "exact" : "non-exact"}</span>
        <span>${state.rows.length} bindings</span>
      </div>
      ${warnings.length > 0 ? `<p class="sansa-warning">${escapeHtml(warnings.join(" "))}</p>` : ""}
      <pre class="sansa-selection-output">${escapeHtml(lines.join("\n") || "No matching paths.")}</pre>
    `;
  }

  function queryValueText(value) {
    if (value?.type === "bindingSet") {
      return value.bindings.map((binding) => `${binding.address} = ${renderValue(binding.value)}`).join("\n");
    }
    if (value?.type === "object") return JSON.stringify(value.value);
    if (value?.type === "scalar") return renderValue(value.value);
    return String(value ?? "");
  }

  function renderQueryResults(evaluation) {
    if (!evaluation.ok) {
      const first = evaluation.errors?.[0];
      result.classList.remove("is-valid");
      result.classList.add("is-invalid");
      result.innerHTML = `
        <div class="sansa-status">Invalid query</div>
        <p class="sansa-warning">${escapeHtml(first?.message ?? "Unable to evaluate SANSA query.")}</p>
      `;
      return;
    }

    result.classList.add("is-valid");
    result.classList.remove("is-invalid");
    const lines = evaluation.results.map((entry) => {
      const prefix = entry.candidateAddress ? `${entry.candidateAddress} => ` : "";
      return `${prefix}${queryValueText(entry.value)}`;
    });
    result.innerHTML = `
      <div class="sansa-status">${evaluation.results.length} result${evaluation.results.length === 1 ? "" : "s"}</div>
      <div class="sansa-result-grid">
        <span>query</span>
        <span>evaluated</span>
        <span>${state.rows.length} bindings</span>
      </div>
      <pre class="sansa-selection-output">${escapeHtml(lines.join("\n") || "No query results.")}</pre>
    `;
  }

  function sourceCaretPosition() {
    const offset = source.selectionStart;
    if (!Number.isInteger(offset)) return null;
    const beforeCaret = source.value.slice(0, offset);
    const lines = beforeCaret.split("\n");
    return {
      line: lines.length,
      column: (lines[lines.length - 1]?.length ?? 0) + 1
    };
  }

  function compareSourcePositions(left, right) {
    if (left.line !== right.line) return left.line - right.line;
    return left.column - right.column;
  }

  function caretBindingPath() {
    const caret = sourceCaretPosition();
    if (!caret) return null;
    let match = null;
    let matchWidth = Number.POSITIVE_INFINITY;

    for (const row of state.rows) {
      const span = row.event?.span;
      if (!span?.start || !span?.end) continue;
      const start = {
        line: span.start.line - state.diagnosticLineOffset,
        column: span.start.column
      };
      const end = {
        line: span.end.line - state.diagnosticLineOffset,
        column: span.end.column
      };
      if (start.line < 1 || end.line < 1) continue;
      if (compareSourcePositions(caret, start) < 0 || compareSourcePositions(caret, end) > 0) continue;

      const width = Number.isInteger(span.end.offset) && Number.isInteger(span.start.offset)
        ? span.end.offset - span.start.offset
        : Number.POSITIVE_INFINITY;
      if (width <= matchWidth) {
        match = row.path;
        matchWidth = width;
      }
    }

    return match;
  }

  function updateDiagnosticsForCaret() {
    if (state.hasDiagnosticErrors) {
      diagnostics.textContent = state.diagnosticLines.join("\n");
      return;
    }
    const lines = [...state.diagnosticLines];
    if (document.activeElement === source) {
      state.caretBindingPath = caretBindingPath();
    }
    if (state.caretBindingPath) lines.push(`SANSA address: ${state.caretBindingPath}`);
    diagnostics.textContent = lines.length > 0 ? lines.join("\n") : "No diagnostics.";
  }

  function renderDiagnostics(meta, warnings = [], lineOffset = 0, queryErrors = []) {
    const lines = [];
    let hasErrors = false;
    for (const warning of warnings) lines.push(`[warning] ${warning}`);
    for (const warning of meta?.warnings ?? []) {
      lines.push(`[warning] ${warning.code ? `${warning.code}: ` : ""}${warning.message ?? String(warning)}`);
    }
    for (const error of meta?.errors ?? []) {
      hasErrors = true;
      const line = visibleDiagnosticLine(error, lineOffset);
      const column = error?.span?.start?.column;
      const location = line === null
        ? ""
        : Number.isInteger(column) ? `[line ${line}, column ${column}] ` : `[line ${line}] `;
      lines.push(`[error] ${location}${error.code ? `${error.code}: ` : ""}${error.message ?? String(error)}`);
    }
    for (const error of queryErrors) {
      hasErrors = true;
      const phase = error.phase ? `[${error.phase}] ` : "";
      const context = ["selectorIndex", "identity", "limit", "observed"].filter(key => error[key] !== undefined).map(key => `${key}=${error[key]}`).join(", ");
      lines.push(`[error] ${phase}${error.code ? `${error.code}: ` : ""}${error.message ?? String(error)}${context ? ` (${context})` : ""}`);
    }
    state.diagnosticLines = lines;
    state.hasDiagnosticErrors = hasErrors;
    state.diagnosticLineOffset = lineOffset;
    updateDiagnosticsForCaret();
  }

  function renderParseError(parsed) {
    const first = parsed.errors?.[0];
    result.classList.remove("is-valid");
    result.classList.add("is-invalid");
    result.innerHTML = `
      <div class="sansa-status">Invalid address</div>
      <p class="sansa-warning">${escapeHtml(first?.message ?? "Unable to parse SANSA address.")}</p>
    `;
    state.diagnosticLines = [`[error] ${first?.code ?? "SANSA_PARSE_ERROR"}: ${first?.message ?? "Invalid SANSA address."}`];
    state.hasDiagnosticErrors = true;
    updateDiagnosticsForCaret();
  }

  async function resolveNow() {
    const requestId = ++state.requestId;
    loading.hidden = false;
    try {
      const { runRuntime, parseAddress, renderAddress, parseQuery, evaluateQuery, resolveAddress, createAeonNamespace, scopedNamespace, rowsFromNamespace, selectionRows } = await runtimeReady;
      state.parseAddress = parseAddress;
      state.resolveAddress = resolveAddress;
      state.selectionRows = selectionRows;
      state.parseQuery = parseQuery;
      if (requestId !== state.requestId) return;

      const mapping = mapMode(state.mode);
      const lineOffset = sourceDiagnosticLineOffset(source.value, state.mode);
      const runtimeResult = runRuntime(sourceForMode(source.value, state.mode), {
        mode: mapping.runtimeMode,
        datatypePolicy: mapping.datatypePolicy,
        includeAnnotations: true,
        output: "map"
      });
      showFirstSourceError(runtimeResult.meta?.errors, lineOffset);
      if ((runtimeResult.meta?.errors?.length ?? 0) > 0) {
        state.rows = [];
        state.namespace = null;
        result.classList.remove("is-valid");
        result.classList.add("is-invalid");
        result.innerHTML = '<div class="sansa-status">Invalid AEON source</div>';
        renderDiagnostics(runtimeResult.meta, [], lineOffset);
        return;
      }
      const eventRows = new Map(rowsFromEvents(runtimeResult.aes ?? []).map(row => [row.path, row]));
      const documentNamespace = createAeonNamespace(runtimeResult.aes ?? []);
      state.rows = rowsFromNamespace(documentNamespace).map(row => ({...row, event: eventRows.get(row.path)?.event}));
      state.namespace = null;
      state.namespace = scopedNamespace(documentNamespace, shell.querySelector("[data-sansa-scope]").value);
      renderComposerOptions();

      if (state.view === "query") {
        const evaluation = evaluateQuery(query.value.trim(), state.namespace, { addressActivation: "trusted" });
        renderQueryResults(evaluation);
        renderDiagnostics(runtimeResult.meta, [], lineOffset, evaluation.ok ? [] : evaluation.errors);
        return;
      }

      const parsed = parseAddress(address.value.trim());
      if (!parsed.ok) {
        renderParseError(parsed);
        return;
      }

      const canonical = renderAddress(parsed.address);
      if (address.value.trim() !== canonical) address.dataset.canonical = canonical;
      else delete address.dataset.canonical;

      const warnings = addressWarnings(parsed.address);
      const selection = resolveAddress(parsed.address, state.namespace, resolveOptions());
      if (!selection.ok) {
        result.classList.remove("is-valid");
        result.classList.add("is-invalid");
        result.innerHTML = '<div class="sansa-status">Resolution failed</div>';
        renderDiagnostics(runtimeResult.meta, warnings, lineOffset, selection.errors);
        return;
      }
      const matches = selectionRows(selection, state.rows);
      renderMatches(matches, parsed.address, warnings);
      renderDiagnostics(runtimeResult.meta, warnings, lineOffset);
    } catch (error) {
      showFirstSourceError(null);
      result.classList.remove("is-valid");
      result.classList.add("is-invalid");
      result.innerHTML = "<div class=\"sansa-status\">Runtime error</div>";
      state.diagnosticLines = [error instanceof Error ? error.message : String(error)];
      state.hasDiagnosticErrors = true;
      updateDiagnosticsForCaret();
    } finally {
      if (requestId === state.requestId) loading.hidden = true;
    }
  }

  function scheduleResolve() {
    window.clearTimeout(scheduleResolve.timer);
    scheduleResolve.timer = window.setTimeout(resolveNow, 120);
  }

  function selectorAppend(selector) {
    if (selector.type === "member") return memberPath(selector.name);
    if (selector.type === "position") return `[${selector.index}]`;
    if (selector.type === "attributeSpace") return ".@";
    return "";
  }

  function optionLabel(option) {
    if (option.kind === "directExpansion") return "*";
    if (option.kind === "descendantExpansion") return "**";
    if (option.kind === "attributeSpace") return "@";
    if (option.kind === "childIdentity") return option.label;
    if (option.kind === "representationKindFilter") return `%${option.label}`;
    if (option.kind === "semanticTypeFilter") return `#${option.label}`;
    return option.label;
  }

  function optionDescription(option) {
    if (option.kind === "directExpansion") return "direct children";
    if (option.kind === "descendantExpansion") return "descendants";
    if (option.kind === "attributeSpace") return "attribute space";
    if (option.kind === "childIdentity") return "child identity";
    if (option.kind === "member") return "member";
    if (option.kind === "position") return "position";
    if (option.kind === "representationKindFilter") return "kind filter";
    if (option.kind === "semanticTypeFilter") return "type filter";
    return "segment";
  }

  function optionValue(base, option) {
    const normalizedBase = base.trim() || "$";
    if (option.kind === "directExpansion") return `${normalizedBase}.*`;
    if (option.kind === "descendantExpansion") return `${normalizedBase}.**`;
    if (option.kind === "attributeSpace") return `${normalizedBase}.@`;
    if (option.kind === "representationKindFilter") return `${normalizedBase}%${option.label}`;
    if (option.kind === "semanticTypeFilter") return `${normalizedBase}#${option.label}`;
    return `${normalizedBase}${option.append}`;
  }

  function hasFilter(addressText, type) {
    const parsed = parsePath(addressText);
    return parsed?.selectors.some((selector) => selector.type === type) === true;
  }

  function resolveOptions() {
    const value = shell.querySelector("[data-sansa-inspections]").value;
    const maxIdentityInspections = Number(value);
    if (!value.trim() || !Number.isSafeInteger(maxIdentityInspections) || maxIdentityInspections < 0) {
      throw new Error("Identity inspections must be a non-negative safe integer.");
    }
    return {maxIdentityInspections, maxBindings: 1000};
  }

  function rowsMatchingAddress(addressText) {
    if (!state.namespace || !state.resolveAddress) return [];
    const selection = state.resolveAddress(addressText, state.namespace, resolveOptions());
    return selection.ok ? state.selectionRows(selection, state.rows) : [];
  }

  function exactPrefixMatch(prefix, target) {
    if (target.length <= prefix.length) return false;
    for (let index = 0; index < prefix.length; index += 1) {
      if (!selectorsEqual(prefix[index], target[index])) return false;
    }
    return true;
  }

  function representationFilterOptions(base) {
    if (hasFilter(base, "representationKindFilter")) return [];
    const matches = rowsMatchingAddress(base);
    const values = new Set();
    for (const row of matches) {
      for (const value of representationKindCandidates(row)) {
        if (/^[a-z_][a-z0-9_]*$/.test(value)) values.add(value);
      }
    }
    return Array.from(values)
      .sort((left, right) => left.localeCompare(right))
      .map((label) => ({ kind: "representationKindFilter", label }));
  }

  function semanticFilterOptions(base) {
    if (hasFilter(base, "semanticTypeFilter")) return [];
    const matches = rowsMatchingAddress(base);
    const values = new Set();
    for (const row of matches) {
      for (const value of semanticTypeCandidates(row)) {
        if (/^[a-z_][a-z0-9_]*$/.test(value)) values.add(value);
      }
    }
    return Array.from(values)
      .sort((left, right) => left.localeCompare(right))
      .map((label) => ({ kind: "semanticTypeFilter", label }));
  }

  function childOptions(base) {
    const options = new Map([
      ["directExpansion:*", {kind: "directExpansion", label: "Direct children"}],
      ["descendantExpansion:**", {kind: "descendantExpansion", label: "Descendants"}]
    ]);
    for (const parent of rowsMatchingAddress(base)) {
      for (const child of parent.binding.children ?? []) {
        const append = child.name !== undefined ? memberPath(child.name) : `[${child.index}]`;
        options.set(append, {kind: child.name !== undefined ? "member" : "position", label: append.replace(/^\./, ""), append});
        if (child.identity) {
          const label = String.fromCharCode(92) + child.identity + String.fromCharCode(92);
          options.set(label, {kind: "childIdentity", label, append: "." + label});
        }
      }
      if (parent.binding.attributeSpace) options.set("@", {kind: "attributeSpace", label: "@", append: ".@"});
    }
    return Array.from(options.values());
  }

  function renderComposerOptions() {
    if (!composerInput || !composerOptions) return;
    const base = composerInput.value.trim() || "$";
    const options = [...childOptions(base), ...representationFilterOptions(base), ...semanticFilterOptions(base)];
    composerOptions.innerHTML = options.map((option) => `
      <button class="sansa-composer-option" type="button" data-sansa-option="${escapeHtml(optionValue(base, option))}">
        <span>${escapeHtml(optionLabel(option))}</span>
        <small>${escapeHtml(optionDescription(option))}</small>
      </button>
    `).join("");
  }

  const queryClauseDetails = {
    from: {
      title: "From",
      label: "Source address",
      help: "Choose the source bindings evaluated by the query.",
      requirement: "Required",
      placeholder: "$.inventory.items.*"
    },
    where: {
      title: "Where",
      label: "Predicate",
      help: "Keep only candidates for which this Boolean expression is true.",
      requirement: "Optional",
      placeholder: ".qty >= 4"
    },
    order: {
      title: "Order by",
      label: "Sort keys",
      help: "Order candidates using one or more expressions and directions.",
      requirement: "Optional",
      placeholder: ".name asc"
    },
    offset: {
      title: "Offset",
      label: "Rows to skip",
      help: "Skip a non-negative number of ordered candidates.",
      requirement: "Optional",
      placeholder: "0"
    },
    limit: {
      title: "Limit",
      label: "Maximum rows",
      help: "Cap the number of candidates projected by select.",
      requirement: "Optional",
      placeholder: "10"
    },
    select: {
      title: "Select",
      label: "Projection",
      help: "Choose the value or object returned for each candidate.",
      requirement: "Required",
      placeholder: "{ sku = .sku name = .name }"
    }
  };

  function buildQueryDraft() {
    const draft = state.queryDraft;
    const lines = [`from ${draft.from.trim() || "$"}`];
    if (draft.where.trim()) lines.push(`where ${draft.where.trim()}`);
    if (draft.order.trim()) lines.push(`order by ${draft.order.trim()}`);
    if (draft.offset.trim()) lines.push(`offset ${draft.offset.trim()}`);
    if (draft.limit.trim()) lines.push(`limit ${draft.limit.trim()}`);
    lines.push(`select ${draft.select.trim() || "."}`);
    return lines.join("\n");
  }

  function resetWhereBuilder() {
    state.whereBuilder = {
      step: "root",
      field: null,
      operator: null,
      functionName: null,
      temporalTarget: null
    };
  }

  function seedQueryDraft(parseQuery) {
    resetWhereBuilder();
    const parsed = parseQuery(query.value.trim());
    if (!parsed.ok) {
      state.queryDraft = { from: "$", where: "", order: "", offset: "", limit: "", select: "." };
      return;
    }
    const model = parsed.query;
    state.queryDraft = {
      from: model.from.source === "address" ? model.from.address.canonical : model.from.expression,
      where: model.where?.expression ?? "",
      order: model.orderBy?.keys.map((key) => `${key.expression} ${key.direction}`).join(", ") ?? "",
      offset: model.offset ? String(model.offset.value) : "",
      limit: model.limit ? String(model.limit.value) : "",
      select: model.select.expression
    };
  }

  function querySourceOptions() {
    const base = state.queryDraft.from.trim() || "$";
    const parsed = parsePath(base);
    const options = [];
    if (base !== "$") {
      options.push({ value: "$", label: "$", description: "restart from the document root" });
    }
    if (!parsed) return options;
    return [
      ...options,
      ...[
        ...childOptions(base),
        ...representationFilterOptions(base),
        ...semanticFilterOptions(base)
      ].map((option) => ({
        value: optionValue(base, option),
        label: optionLabel(option),
        description: optionDescription(option)
      }))
    ];
  }

  function queryRelativeFields() {
    const sourceText = state.queryDraft.from.trim() || "$";
    const parsedSource = parsePath(sourceText);
    if (!parsedSource || parsedSource.root.kind !== "absolute") return [];
    const parents = hasSelectorSurface(parsedSource)
      ? rowsMatchingAddress(sourceText).map((row) => parsePath(row.path)).filter(Boolean)
      : [parsedSource];
    const fields = new Map();

    for (const row of state.rows) {
      const rowAddress = parsePath(row.path);
      if (!rowAddress) continue;
      for (const parent of parents) {
        if (!exactPrefixMatch(parent.selectors, rowAddress.selectors)) continue;
        if (rowAddress.selectors.length !== parent.selectors.length + 1) continue;
        const selector = rowAddress.selectors[parent.selectors.length];
        if (!selector || !["member", "position"].includes(selector.type)) continue;
        const append = selectorAppend(selector);
        const expression = append.startsWith("[") ? `.${append}` : append;
        const existing = fields.get(expression);
        if (existing) {
          existing.rows.push(row);
        } else {
          fields.set(expression, {
            expression,
            label: selector.type === "member" ? selector.name : `[${selector.index}]`,
            row,
            rows: [row]
          });
        }
      }
    }
    return Array.from(fields.values()).slice(0, 16);
  }

  function queryComparisonLiteral(row) {
    const kind = scalarKind(row);
    if (["number", "radix", "hex"].includes(kind)) return "0";
    if (kind === "boolean") return "true";
    if (kind === "toggle") return "yes";
    if (["date", "time", "datetime", "wtc"].includes(kind) && row.value !== undefined) return String(row.value);
    return '"value"';
  }

  function queryAuthoredLiteral(row) {
    if (row.value === undefined) return queryComparisonLiteral(row);
    const kind = scalarKind(row);
    if (kind === "string") return JSON.stringify(String(row.value));
    if (kind === "boolean") return row.value ? "true" : "false";
    if (kind === "null") return "null";
    return String(row.value);
  }

  function whereClauseOptionValues(fields) {
    const builder = state.whereBuilder;
    if (builder.step === "operator" && builder.field) {
      const kind = scalarKind(builder.field.row);
      const ordered = !["boolean", "null", "toggle", "referenceForm"].includes(kind);
      const temporal = ["date", "time", "datetime", "wtc"].includes(kind);
      return [
        { action: "where-back-root", value: "", label: "Back", description: "choose another field or predicate" },
        ...(temporal ? [{
          action: "where-temporal",
          value: "",
          label: "Temporal relation",
          description: "compare completion sets"
        }] : []),
        { action: "where-operator", operator: "==", value: "", label: "Equals", description: "==" },
        { action: "where-operator", operator: "!=", value: "", label: "Does not equal", description: "!=" },
        ...(ordered ? [
          { action: "where-operator", operator: ">", value: "", label: "Greater than", description: ">" },
          { action: "where-operator", operator: ">=", value: "", label: "Greater than or equal", description: ">=" },
          { action: "where-operator", operator: "<", value: "", label: "Less than", description: "<" },
          { action: "where-operator", operator: "<=", value: "", label: "Less than or equal", description: "<=" }
        ] : [])
      ];
    }

    if (builder.step === "temporal-target" && builder.field) {
      const options = [
        { action: "where-back-operator", value: "", label: "Back", description: "choose another operator" }
      ];
      const temporalFields = fields.filter((field) =>
        ["date", "time", "datetime", "wtc"].includes(scalarKind(field.row))
        && field.expression !== builder.field.expression
      );
      for (const field of temporalFields) {
        options.push({
          action: "where-temporal-target",
          temporalTarget: { expression: field.expression, label: field.label },
          value: "",
          label: field.label,
          description: `${field.expression} · ${scalarKind(field.row)}`
        });
      }
      const literals = new Map();
      for (const field of fields) {
        const kind = scalarKind(field.row);
        if (!["date", "time", "datetime", "wtc"].includes(kind)) continue;
        for (const row of field.rows ?? [field.row]) {
          const literal = queryAuthoredLiteral(row);
          if (literals.has(`${kind}:${literal}`)) continue;
          literals.set(`${kind}:${literal}`, {
            action: "where-temporal-target",
            temporalTarget: { expression: literal, label: literal },
            value: "",
            label: literal,
            description: `${kind} value from the AEON source`
          });
        }
      }
      return [...options, ...Array.from(literals.values()).slice(0, 12)];
    }

    if (builder.step === "temporal-relation" && builder.field && builder.temporalTarget) {
      const relations = [
        ["equal", "Equal"],
        ["before", "Before"],
        ["after", "After"],
        ["contains", "Contains"],
        ["containedBy", "Contained by"],
        ["overlaps", "Overlaps"],
        ["incomparable", "Incomparable"]
      ];
      return [
        { action: "where-back-temporal-target", value: "", label: "Back", description: "choose another temporal binding" },
        ...relations.map(([relation, label]) => ({
          action: "where-temporal-relation",
          relation,
          value: "",
          label,
          description: relation
        }))
      ];
    }

    if (builder.step === "value" && builder.field && builder.operator) {
      const values = new Map();
      for (const row of builder.field.rows ?? [builder.field.row]) {
        const literal = queryAuthoredLiteral(row);
        if (!values.has(literal)) values.set(literal, {
          action: "where-value",
          literal,
          value: "",
          label: literal,
          description: "value from the AEON source"
        });
      }
      const example = queryComparisonLiteral(builder.field.row);
      if (!values.has(example)) values.set(example, {
        action: "where-value",
        literal: example,
        value: "",
        label: example,
        description: "example value"
      });
      return [
        { action: "where-back-operator", value: "", label: "Back", description: "choose another operator" },
        ...Array.from(values.values()).slice(0, 16)
      ];
    }

    if (builder.step === "function-field" && builder.functionName) {
      const options = [
        { action: "where-back-root", value: "", label: "Back", description: "choose another field or predicate" }
      ];
      if (builder.functionName === "isValue") {
        options.push({
          action: "where-function-field",
          fieldExpression: ".",
          value: "",
          label: "Current binding",
          description: "."
        });
      }
      for (const field of fields) {
        options.push({
          action: "where-function-field",
          fieldExpression: field.expression,
          value: "",
          label: field.label,
          description: field.expression
        });
      }
      return options;
    }

    return [
      { action: "where-remove", value: "", label: "Remove clause", description: "omit this optional clause" },
      ...fields.map((field) => ({
        action: "where-field",
        fieldExpression: field.expression,
        value: "",
        label: field.label,
        description: field.expression,
        field
      })),
      { action: "where-function", functionName: "isValue", value: "", label: "isValue", description: "require a concrete value" },
      { action: "where-function", functionName: "exists", value: "", label: "exists", description: "require a binding to exist" }
    ];
  }

  function queryClauseOptionValues(clause) {
    const fields = queryRelativeFields();
    const optional = !["from", "select"].includes(clause)
      ? [{ value: "", label: "Remove clause", description: "omit this optional clause" }]
      : [];
    if (clause === "from") return querySourceOptions();
    if (clause === "where") return whereClauseOptionValues(fields);
    if (clause === "select") {
      const options = [{ value: ".", label: ".", description: "current binding" }];
      for (const field of fields) {
        options.push({ value: field.expression, label: field.label, description: "project this field" });
      }
      if (fields.length > 0) {
        const projection = fields.slice(0, 6)
          .map((field) => `${String(field.label).replace(/[^A-Za-z0-9_]/g, "_")} = ${field.expression}`)
          .join(" ");
        options.push({ value: `{ ${projection} }`, label: "Object projection", description: "project the visible fields" });
      }
      const temporal = fields.filter((field) => ["date", "time", "datetime", "wtc"].includes(scalarKind(field.row)));
      if (temporal.length >= 2) {
        options.push({
          value: `{ relation = temporalRelation(${temporal[0].expression}, ${temporal[1].expression}) }`,
          label: "Temporal relation",
          description: "return a completion-set relation"
        });
      }
      return options;
    }
    if (clause === "order") {
      return [
        ...optional,
        ...fields.flatMap((field) => [
          { value: `${field.expression} asc`, label: `${field.label} ascending`, description: "lowest first" },
          { value: `${field.expression} desc`, label: `${field.label} descending`, description: "highest first" }
        ])
      ];
    }
    if (clause === "offset") {
      return [...optional, ...[0, 1, 10, 25].map((value) => ({ value: String(value), label: String(value), description: "rows to skip" }))];
    }
    if (clause === "limit") {
      return [...optional, ...[1, 10, 25, 100].map((value) => ({ value: String(value), label: String(value), description: "maximum results" }))];
    }
    return optional;
  }

  function renderQueryPreview() {
    if (!queryPreview || !queryValidation) return;
    const text = buildQueryDraft();
    queryPreview.textContent = text;
    const parsed = state.parseQuery?.(text);
    const valid = parsed?.ok === true;
    queryValidation.classList.toggle("is-invalid", !valid);
    queryValidation.textContent = valid
      ? "Valid SANSA query."
      : parsed?.errors?.[0]?.message ?? "Complete the required clauses.";
  }

  function syncQueryClauseButtons() {
    queryClauseButtons.forEach((button) => {
      const clause = button.dataset.sansaQueryClause;
      const active = clause === state.queryComposerClause;
      const hasValue = Boolean(state.queryDraft[clause]?.trim());
      button.classList.toggle("is-active", active);
      button.classList.toggle("has-value", hasValue);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function whereBuilderHelp() {
    const builder = state.whereBuilder;
    if (builder.step === "operator" && builder.field) {
      return `Choose how to compare ${builder.field.label}.`;
    }
    if (builder.step === "value" && builder.field) {
      return `Choose a value for ${builder.field.label}, or edit the predicate directly.`;
    }
    if (builder.step === "temporal-target" && builder.field) {
      return `Choose the temporal binding compared with ${builder.field.label}.`;
    }
    if (builder.step === "temporal-relation" && builder.field && builder.temporalTarget) {
      return `Choose how ${builder.field.label} relates to ${builder.temporalTarget.label}.`;
    }
    if (builder.step === "function-field" && builder.functionName) {
      return `Choose the binding passed to ${builder.functionName}().`;
    }
    return queryClauseDetails.where.help;
  }

  function renderQueryClauseOptions() {
    if (!queryClauseOptions) return;
    const options = queryClauseOptionValues(state.queryComposerClause);
    state.queryRenderedOptions = options;
    queryClauseOptions.innerHTML = options.map((option, index) => `
      <button class="sansa-composer-option" type="button" data-sansa-query-option-index="${index}">
        <span>${escapeHtml(option.label)}</span>
        <small>${escapeHtml(option.description)}</small>
      </button>
    `).join("");
  }

  function renderQueryComposer() {
    const clause = state.queryComposerClause;
    const details = queryClauseDetails[clause];
    if (!details || !queryClauseInput) return;
    if (queryClauseTitle) queryClauseTitle.textContent = details.title;
    if (queryClauseHelp) queryClauseHelp.textContent = clause === "where" ? whereBuilderHelp() : details.help;
    if (queryClauseRequirement) queryClauseRequirement.textContent = details.requirement;
    if (queryClauseLabel) queryClauseLabel.textContent = details.label;
    queryClauseInput.placeholder = details.placeholder;
    queryClauseInput.value = state.queryDraft[clause] ?? "";
    queryClauseInput.inputMode = ["offset", "limit"].includes(clause) ? "numeric" : "text";
    syncQueryClauseButtons();
    renderQueryClauseOptions();
    renderQueryPreview();
  }

  function applyQueryClauseOption(option) {
    const clause = state.queryComposerClause;
    if (clause !== "where" || !option.action) {
      state.queryDraft[clause] = option.value ?? "";
      if (clause === "from") resetWhereBuilder();
      return;
    }

    if (option.action === "where-remove") {
      state.queryDraft.where = "";
      resetWhereBuilder();
      return;
    }
    if (option.action === "where-field") {
      state.whereBuilder = { step: "operator", field: option.field, operator: null, functionName: null, temporalTarget: null };
      state.queryDraft.where = option.field.expression;
      return;
    }
    if (option.action === "where-operator") {
      state.whereBuilder.step = "value";
      state.whereBuilder.operator = option.operator;
      state.queryDraft.where = `${state.whereBuilder.field.expression} ${option.operator}`;
      return;
    }
    if (option.action === "where-value") {
      const { field, operator } = state.whereBuilder;
      state.queryDraft.where = `${field.expression} ${operator} ${option.literal}`;
      resetWhereBuilder();
      return;
    }
    if (option.action === "where-temporal") {
      state.whereBuilder.step = "temporal-target";
      state.whereBuilder.temporalTarget = null;
      state.queryDraft.where = `temporalRelation(${state.whereBuilder.field.expression}, )`;
      return;
    }
    if (option.action === "where-temporal-target") {
      state.whereBuilder.step = "temporal-relation";
      state.whereBuilder.temporalTarget = option.temporalTarget;
      state.queryDraft.where = `temporalRelation(${state.whereBuilder.field.expression}, ${option.temporalTarget.expression})`;
      return;
    }
    if (option.action === "where-temporal-relation") {
      const { field, temporalTarget } = state.whereBuilder;
      state.queryDraft.where = `temporalRelation(${field.expression}, ${temporalTarget.expression}) == ${JSON.stringify(option.relation)}`;
      resetWhereBuilder();
      return;
    }
    if (option.action === "where-function") {
      state.whereBuilder = { step: "function-field", field: null, operator: null, functionName: option.functionName, temporalTarget: null };
      state.queryDraft.where = `${option.functionName}()`;
      return;
    }
    if (option.action === "where-function-field") {
      state.queryDraft.where = `${state.whereBuilder.functionName}(${option.fieldExpression})`;
      resetWhereBuilder();
      return;
    }
    if (option.action === "where-back-root") {
      state.queryDraft.where = "";
      resetWhereBuilder();
      return;
    }
    if (option.action === "where-back-operator") {
      state.whereBuilder.step = "operator";
      state.whereBuilder.operator = null;
      state.whereBuilder.temporalTarget = null;
      state.queryDraft.where = state.whereBuilder.field.expression;
      return;
    }
    if (option.action === "where-back-temporal-target") {
      state.whereBuilder.step = "temporal-target";
      state.whereBuilder.temporalTarget = null;
      state.queryDraft.where = `temporalRelation(${state.whereBuilder.field.expression}, )`;
    }
  }

  async function openComposer() {
    if (!composerModal || !composerInput) return;
    const opener = document.activeElement;
    if (state.view === "query") {
      const { parseQuery } = await runtimeReady;
      state.parseQuery = parseQuery;
      seedQueryDraft(parseQuery);
      state.queryComposerClause = "from";
      if (composerTitle) composerTitle.textContent = "SANSA Query Composer";
      if (composerApplyLabel) composerApplyLabel.textContent = "Apply query";
      resolveComposer.hidden = true;
      queryComposer.hidden = false;
      renderQueryComposer();
      window.AeonAccessibility?.openModal(composerModal, opener, queryClauseInput);
      window.requestAnimationFrame(() => queryClauseInput?.select());
      return;
    }

    if (composerTitle) composerTitle.textContent = "SANSA Resolve Composer";
    if (composerApplyLabel) composerApplyLabel.textContent = "Apply address";
    resolveComposer.hidden = false;
    queryComposer.hidden = true;
    composerInput.value = address.value.trim() || "$";
    renderComposerOptions();
    window.AeonAccessibility?.openModal(composerModal, opener, composerInput);
    window.requestAnimationFrame(() => composerInput.select());
  }

  function closeComposer() {
    if (composerModal) window.AeonAccessibility?.closeModal(composerModal);
  }

  function setEditorValue(field, value) {
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function applyComposer() {
    if (state.view === "query") {
      const queryText = buildQueryDraft();
      const parsed = state.parseQuery?.(queryText);
      if (!parsed?.ok) {
        renderQueryPreview();
        queryClauseInput?.focus();
        return;
      }
      setEditorValue(query, parsed.query.canonical);
      closeComposer();
      return;
    }
    if (!composerInput) return;
    setEditorValue(address, composerInput.value.trim() || "$");
    closeComposer();
  }

  function syncModeButtons() {
    modeButtons.forEach((button) => {
      const active = button.dataset.sansaMode === state.mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function syncView() {
    const queryView = state.view === "query";
    address.hidden = queryView;
    query.hidden = !queryView;
    if (inputTitle) inputTitle.textContent = queryView ? "SANSA query" : "SANSA address";
    if (resultTitle) resultTitle.textContent = queryView ? "Query result" : "Resolve result";
    viewButtons.forEach((button) => {
      const active = button.dataset.sansaView === state.view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function showExamplePreview() {
    const example = examples[state.example];
    if (!example) return;
    exampleSource.textContent = example.source || "";
    if (exampleExpression) {
      exampleExpression.textContent = example.view === "query"
        ? example.query || ""
        : `${example.addressKind || "selector"}: ${example.address || "$"}`;
    }
    exampleTabs.forEach((tab) => {
      const active = tab.dataset.sansaExampleKey === state.example;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function openExamples() {
    showExamplePreview();
    window.AeonAccessibility?.openModal(examplesModal, examplesOpen);
  }

  function closeExamples() {
    window.AeonAccessibility?.closeModal(examplesModal);
  }

  source.addEventListener("input", () => {
    if (document.activeElement !== source) state.caretBindingPath = null;
    scheduleResolve();
  });
  source.addEventListener("focus", updateDiagnosticsForCaret);
  source.addEventListener("blur", updateDiagnosticsForCaret);
  source.addEventListener("click", updateDiagnosticsForCaret);
  source.addEventListener("keyup", updateDiagnosticsForCaret);
  source.addEventListener("select", updateDiagnosticsForCaret);
  address.addEventListener("input", scheduleResolve);
  query.addEventListener("input", scheduleResolve);
  composerOpen.forEach((button) => button.addEventListener("click", openComposer));
  composerClose.forEach((button) => button.addEventListener("click", closeComposer));
  composerInput?.addEventListener("input", renderComposerOptions);
  composerInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyComposer();
    }
  });
  composerOptions?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-sansa-option]");
    if (!option || !composerInput) return;
    composerInput.value = option.dataset.sansaOption || "$";
    renderComposerOptions();
    composerInput.focus();
  });
  queryClauseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const clause = button.dataset.sansaQueryClause;
      if (!queryClauseDetails[clause]) return;
      state.queryComposerClause = clause;
      renderQueryComposer();
      queryClauseInput?.focus();
      queryClauseInput?.select();
    });
  });
  queryClauseInput?.addEventListener("input", () => {
    state.queryDraft[state.queryComposerClause] = queryClauseInput.value;
    if (state.queryComposerClause === "where") resetWhereBuilder();
    if (state.queryComposerClause === "from") resetWhereBuilder();
    syncQueryClauseButtons();
    if (["from", "where"].includes(state.queryComposerClause)) renderQueryClauseOptions();
    renderQueryPreview();
  });
  queryClauseOptions?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-sansa-query-option-index]");
    if (!target || !queryClauseInput) return;
    const index = Number.parseInt(target.dataset.sansaQueryOptionIndex ?? "", 10);
    const option = state.queryRenderedOptions[index];
    if (!option) return;
    applyQueryClauseOption(option);
    renderQueryComposer();
    queryClauseInput.focus();
    queryClauseInput.select();
  });
  composerApply?.addEventListener("click", applyComposer);

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.sansaMode || "transport";
      syncModeButtons();
      sourceComposer?.setMode?.(state.mode);
      scheduleResolve();
    });
  });

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.sansaView === "query" ? "query" : "resolve";
      syncView();
      scheduleResolve();
    });
  });

  examplesOpen?.addEventListener("click", openExamples);
  examplesClose.forEach((button) => button.addEventListener("click", closeExamples));
  exampleTabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.example = button.dataset.sansaExampleKey || state.example;
      showExamplePreview();
    });
  });
  exampleLoad?.addEventListener("click", () => {
    const example = examples[state.example];
    if (!example) return;
    setEditorValue(source, example.source || "");
    setEditorValue(address, example.address || "$");
    if (example.query) setEditorValue(query, example.query);
    state.view = example.view === "query" ? "query" : "resolve";
    state.mode = example.mode || "transport";
    shell.querySelector("[data-sansa-scope]").value = example.scope ?? "$";
    shell.querySelector("[data-sansa-inspections]").value = example.inspections ?? 10000;
    syncView();
    syncModeButtons();
    sourceComposer?.setMode?.(state.mode);
    closeExamples();
    scheduleResolve();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && examplesModal && !examplesModal.hidden) {
      closeExamples();
    }
    if (event.key === "Escape" && composerModal && !composerModal.hidden) {
      closeComposer();
    }
  });

  syncModeButtons();
  syncView();
  showExamplePreview();
  const initialExample = examples.identity;
  if (initialExample) {
    setEditorValue(source, initialExample.source);
    setEditorValue(address, initialExample.address);
    query.value = "from $.inventory.items.*\nselect .name";
    window.AeonWebHighlight?.refreshEditor?.(source);
  }
  for (const control of shell.querySelectorAll("[data-sansa-scope], [data-sansa-inspections]")) {
    control.addEventListener("input", scheduleResolve);
  }
  shell.querySelector("[data-sansa-run]").addEventListener("click", resolveNow);
  for (const input of [source, address, query]) input.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void resolveNow(); }
  });
  scheduleResolve();
});
