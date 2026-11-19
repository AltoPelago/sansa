"""Isolate eleven native anchoring defaults with explicit companion allowances.

These are admitted/denied threshold observations, separate from CTS conformance,
combined support floors, arbitrary native graphs, framing, heap/disk and chains.
Only the command supplied explicitly by --sut is executed, without a shell.
"""
import argparse
import copy
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PROFILE = 'aeonic.operations.temporal.civil-anchor.v1'
DEFAULTS = dict(maxRequestBytes=65536, maxRequestDepth=32, maxTemporalCharacters=1024,
                maxInputRanges=128, maxInputPieces=512, maxRelativeDayDigits=256,
                maxFractionDigits=256, maxWork=16384, maxIntermediatePieces=4096,
                maxOutputPieces=512, maxResultBytes=131072)
MAX_PROTOCOL_BYTES = 16 * 1024 * 1024


def compact(value, canonical=False):
    return json.dumps(value, ensure_ascii=False, allow_nan=False,
                      separators=(',', ':'), sort_keys=canonical)


def fingerprint(value):
    return hashlib.sha256(compact(value, True).encode('utf-8')).hexdigest()


def diagnostic(reason, stage, path=None):
    return dict(outcome='diagnostic', reason=reason, context=dict(stage=stage, path=path))


def clock(text):
    return dict(temporal=dict(category='civilClock', value=text))


def point(i, fraction=''):
    return dict(kind='point', at=dict(day='0', time='%02d:%02d:%02d' %
                (i//3600, i//60 % 60, i % 60) + ('.'+fraction if fraction else '')))


def derived(pieces):
    return dict(temporal=dict(category='civilClockSet', pieces=pieces),
                originClockForm='undeclared', history='none-declared')


def request(value=None, anchor=None):
    return dict(operation='anchor', input=dict(
        anchor=anchor if anchor is not None else dict(temporal=dict(category='civilDate', value='2024-01-01')),
        clock=value if value is not None else clock('00:00:00'), context=dict(profile=PROFILE)))


def success(value):
    """Independent expected fixture image: known reference-day-zero points only.

    No stage evaluator or general anchoring engine is supplied by this tool.
    """
    temporal = value['temporal']
    if temporal['category'] == 'civilClock':
        text = temporal['value']
        if '.' in text:
            whole, fraction = text.split('.')
            text = whole + ('.'+fraction.rstrip('0') if fraction.rstrip('0') else '')
        points = [dict(kind='point', at='2024-01-01T'+text)]
        origin = 'second'
    else:
        assert all(p['kind'] == 'point' and p['at']['day'] == '0' for p in temporal['pieces'])
        points = [dict(kind='point', at='2024-01-01T'+p['at']['time']) for p in temporal['pieces']]
        origin = 'undeclared'
    return dict(outcome='value', value=dict(temporal=dict(category='civilDateTimeSet', pieces=points),
        originDateGranularity='day', originClockForm=origin,
        history=dict(clamping='none-declared', approximation='none-declared')),
        metadata=dict(evaluation='exact-for-policy', clamping='not-applied', effectivePolicy=dict(profile=PROFILE)))


def build_cases():
    cases = []

    def add(dimension, role, value, logical, expected, companions=None, text=False, suffix=''):
        companions = companions or {}
        assert dimension in DEFAULTS and dimension not in companions
        assert set(companions) <= set(DEFAULTS)
        cases.append(dict(id=dimension+'-'+role+suffix, dimension=dimension, role=role,
            observed_quantity=value, companion_limits=companions,
            fixture={'requestText' if text else 'request':logical}, expected=expected))

    small = request(); small_result = success(small['input']['clock']); text = compact(small)
    for size in (65536, 65537):
        add('maxRequestBytes', 'at-default' if size == 65536 else 'over-default', size,
            text+' '*(size-len(text)), small_result if size == 65536 else diagnostic('resource_limit', 1), text=True)
    for size in (65536, 65537):
        q = request(anchor=dict(temporal=dict(category='container', payload='')))
        q['input']['anchor']['temporal']['payload'] = 'x'*(size-len(compact(q)))
        assert len(compact(q).encode('utf-8')) == size
        add('maxRequestBytes', 'at-default' if size == 65536 else 'over-default', size, q,
            diagnostic('unsupported_domain', 5, '/input/anchor/temporal/category') if size == 65536 else diagnostic('resource_limit', 1), suffix='-structured')
    for depth in (32, 33):
        payload = None
        for _ in range(depth-4): payload = [payload]
        q = request(anchor=dict(temporal=dict(category='container', payload=payload)))
        add('maxRequestDepth', 'at-default' if depth == 32 else 'over-default', depth, q,
            diagnostic('unsupported_domain', 5, '/input/anchor/temporal/category') if depth == 32 else diagnostic('resource_limit', 1))
    for size in (1024, 1025):
        c = clock('00:00:00.'+'1'*(size-9))
        add('maxTemporalCharacters', 'at-default' if size == 1024 else 'over-default', size, request(c),
            success(c) if size == 1024 else diagnostic('resource_limit', 4, '/input/clock/temporal/value'), dict(maxFractionDigits=1016))
    for count in (128, 129):
        first = date(2024, 1, 1)
        ranges = [dict(start=(first+timedelta(days=2*i)).isoformat(), end=(first+timedelta(days=2*i)).isoformat()) for i in range(count)]
        a = dict(temporal=dict(category='civilDateSet', ranges=ranges), originGranularity='undeclared', history='none-declared')
        add('maxInputRanges', 'at-default' if count == 128 else 'over-default', count, request(anchor=a),
            diagnostic('incompatible_operand', 6, '/input/anchor/temporal') if count == 128 else diagnostic('resource_limit', 4, '/input/anchor/temporal/ranges'))
    for dimension, count, companions, stage in [
        ('maxInputPieces', 512, {}, 4),
        ('maxIntermediatePieces', 4096, dict(maxInputPieces=4097, maxOutputPieces=4097,
             maxRequestBytes=1048576, maxResultBytes=1048576), 6),
        ('maxOutputPieces', 512, dict(maxInputPieces=513), 7),
    ]:
        for n in (count, count+1):
            c = derived([point(i) for i in range(n)])
            path = '/input/clock/temporal/pieces' if stage == 4 else None
            add(dimension, 'at-default' if n == count else 'over-default', n, request(c),
                success(c) if n == count else diagnostic('resource_limit', stage, path), companions)
    for digits in (256, 257):
        c = derived([dict(kind='point', at=dict(day='9'*digits, time='00:00:00'))])
        add('maxRelativeDayDigits', 'at-default' if digits == 256 else 'over-default', digits, request(c),
            diagnostic('unrepresentable_result', 7) if digits == 256 else diagnostic('resource_limit', 4, '/input/clock/temporal/pieces/0/at/day'))
    for suffix, digit in [('', '1'), ('-raw-trailing-zeroes', '0')]:
        for digits in (256, 257):
            fraction = '1'*digits if digit == '1' else '1'+'0'*(digits-1)
            c = clock('00:00:00.'+fraction)
            add('maxFractionDigits', 'at-default' if digits == 256 else 'over-default', digits, request(c),
                success(c) if digits == 256 else diagnostic('resource_limit', 4, '/input/clock/temporal/value'), suffix=suffix)
    for work in (16384, 16385):
        c = derived([point(i) for i in range(work-1)])
        add('maxWork', 'at-default' if work == 16384 else 'over-default', work, request(c),
            success(c) if work == 16384 else diagnostic('resource_limit', 6),
            dict(maxRequestBytes=2097152, maxInputPieces=16384, maxIntermediatePieces=16384,
                 maxOutputPieces=16384, maxResultBytes=2097152))

    # Reach the *exact* native successful-envelope byte default. Fraction text
    # supplies the remaining bytes without overriding the dimension under test.
    c = derived([point(i) for i in range(512)])
    remaining = 131072-len(compact(success(c)).encode('utf-8'))
    for p in c['temporal']['pieces']:
        take = min(257, remaining)
        if remaining-take == 1: take -= 1
        if take >= 2:
            p['at']['time'] += '.'+'1'*(take-1); remaining -= take
    assert remaining == 0 and len(compact(success(c)).encode('utf-8')) == 131072
    add('maxResultBytes', 'at-default', 131072, request(c), success(c), dict(maxRequestBytes=262144))
    larger = copy.deepcopy(c); raw = larger['temporal']['pieces']
    partial = next((p for p in raw if '.' in p['at']['time'] and len(p['at']['time'].split('.')[1]) < 256), None)
    if partial is not None: partial['at']['time'] += '1'
    else:
        full = next(p for p in raw if '.' in p['at']['time'])
        full['at']['time'] = full['at']['time'][:-1]
        next(p for p in raw if '.' not in p['at']['time'])['at']['time'] += '.1'
    assert len(compact(success(larger)).encode('utf-8')) == 131073
    add('maxResultBytes', 'over-default', 131073, request(larger), diagnostic('resource_limit', 7), dict(maxRequestBytes=262144))
    assert len(cases) == 26 and len({c['id'] for c in cases}) == 26
    for dimension in DEFAULTS:
        assert {'at-default', 'over-default'} <= {c['role'] for c in cases if c['dimension'] == dimension}
    return cases


def strict_pairs(items):
    value = {}
    for key, child in items:
        if key in value: raise ValueError('Duplicate protocol key')
        value[key] = child
    return value


class OpaqueNumber:
    def __init__(self, text): self.text = text


def protocol_number(text):
    # Only small exact stage numbers need numerical interpretation. Preserve
    # other tokens opaquely, including in allowed transport extensions, rather
    # than converting arbitrarily wide decimal integers or extreme exponents.
    if len(text) <= 64:
        try:
            number = Decimal(text)
            if number.is_finite() and number.copy_abs() <= 9007199254740991 and number == number.to_integral_value():
                return int(number)
        except InvalidOperation:
            pass
    return OpaqueNumber(text)


def decode(text):
    def constant(value): raise ValueError('Non-JSON constant: '+value)
    return json.loads(text, object_pairs_hook=strict_pairs, parse_constant=constant,
                      parse_int=protocol_number, parse_float=protocol_number)


def equal(a, b):
    if isinstance(a, dict) and isinstance(b, dict): return a.keys() == b.keys() and all(equal(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list): return len(a) == len(b) and all(equal(x, y) for x, y in zip(a, b))
    if type(a) in (int, float) and type(b) in (int, float): return a == b
    return type(a) is type(b) and a == b


def execute(command, envelope, timeout):
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        child = subprocess.run(shlex.split(command), input=compact(envelope), text=True, encoding='utf-8',
                               stdout=out, stderr=err, cwd=ROOT, timeout=timeout)
        err.seek(0); message = err.read(4096).decode('utf-8', errors='replace')
        if child.returncode: raise ValueError('Provider harness failure: '+message)
        if out.tell() > MAX_PROTOCOL_BYTES: raise ValueError('Provider output exceeds controller read cap')
        out.seek(0)
        return decode(out.read(MAX_PROTOCOL_BYTES+1).decode('utf-8'))


def check_output(output, expected):
    if not isinstance(output, dict): raise ValueError('Protocol output must be an object')
    actual = output.get('result')
    ok = expected['outcome'] == 'value'
    if type(output.get('ok')) is not bool or output['ok'] != ok: raise ValueError('Protocol status mismatch')
    if not equal(output.get('warnings'), []): raise ValueError('Unexpected protocol warnings')
    errors = output.get('errors')
    if ok:
        if not equal(errors, []): raise ValueError('Unexpected protocol errors')
    else:
        if not isinstance(errors, list) or len(errors) != 1 or not isinstance(errors[0], dict): raise ValueError('One protocol error required')
        if not all(key in errors[0] and equal(errors[0][key], value) for key, value in dict(code=expected['reason'], path=None, span=None, phase=None).items()): raise ValueError('Protocol error mismatch')
        if isinstance(actual, dict) and 'message' in actual:
            message = actual['message']
            if not isinstance(message, str) or any(0xD800 <= ord(c) <= 0xDFFF for c in message): raise ValueError('Invalid diagnostic message')
            actual = {k:v for k,v in actual.items() if k != 'message'}
    if not equal(actual, expected): raise ValueError('Complete operation result mismatch')
    return actual


def calibrator_digest():
    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def run(command, timeout=30):
    source_digest = calibrator_digest()
    cases = []; failures = []
    for case in build_cases():
        expected = case['expected']
        envelope = dict(lane='aeonic-temporal-civil-anchor', case_id=case['id'], fixture=case['fixture'],
                        policy=dict(resourceLimits=case['companion_limits']))
        item = {key:case[key] for key in ['id','dimension','role','observed_quantity','companion_limits']}
        item.update(expected_outcome=expected['outcome'], expected_sha256=fingerprint(expected))
        if expected['outcome'] == 'diagnostic': item.update(expected_reason=expected['reason'], expected_context=expected['context'])
        else: item['expected_result_bytes'] = len(compact(expected).encode('utf-8'))
        try:
            actual = check_output(execute(command, envelope, timeout), expected)
            item.update(status='passed', actual_sha256=fingerprint(actual))
        except Exception as error:
            item.update(status='failed', failure=str(error)[:1500]); failures.append(case['id'])
        cases.append(item)
    covered = []
    for dimension, limit in DEFAULTS.items():
        observed = {(c['role'], c['observed_quantity']) for c in cases
                    if c['dimension'] == dimension and c['status'] == 'passed'
                    and dimension not in c['companion_limits']}
        if {('at-default', limit), ('over-default', limit+1)} <= observed: covered.append(dimension)
        else: failures.append('incomplete-coverage:'+dimension)
    if calibrator_digest() != source_digest: failures.append('calibrator-integrity')
    return dict(status='failed' if failures else 'passed', checks=len(cases), defaults=DEFAULTS,
                covered_dimensions=sorted(covered), calibrator_sha256=source_digest,
                sut=command, cases=cases, failures=failures, stable_conformance_claim=False,
                scope='Individual native default admission thresholds with explicit companion settings. Range-count and relative-day admitted controls reach later semantic diagnostics; each is recorded as such.',
                limits='No Cartesian-product, arbitrary accessor/proxy/subclass, eager-key, outer-frame, process/heap/disk, browser-preparation or whole-chain capacity guarantee. The controller output read cap is not a provider disk quota.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sut', required=True); parser.add_argument('--report', type=Path)
    parser.add_argument('--timeout', type=float, default=30)
    args = parser.parse_args()
    if not args.sut or not shlex.split(args.sut) or not 0 < args.timeout <= 60: raise ValueError('Explicit provider and positive timeout at most 60s required')
    report = run(args.sut, args.timeout)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True); args.report.write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({key:report[key] for key in ['status','checks','covered_dimensions','failures']}))
    return 1 if report['failures'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
