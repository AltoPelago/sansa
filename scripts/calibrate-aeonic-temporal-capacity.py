"""Independent native-default boundary probes; not shared semantic fixtures."""
import argparse
from datetime import date, timedelta
import json
from pathlib import Path
import shlex
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--sut', required=True)
parser.add_argument('--report', type=Path)
args = parser.parse_args()
repository = Path(__file__).resolve().parents[1]
PROFILE = 'aeonic.operations.temporal.civil-date.v1'

def civil(value):
    return dict(temporal=dict(category='civilDate', value=value))

def derived(ranges):
    return dict(temporal=dict(category='civilDateSet', ranges=ranges), originGranularity='undeclared', history='none-declared')

def request(value, operation='shift', policy=None):
    return dict(operation=operation, input=dict(value=value, context=dict(profile=PROFILE), policy=policy or dict(unit='day', count='0')))

def points(n):
    return [dict(start=(date(2024, 1, 1)+timedelta(days=2*i)).isoformat(), end=(date(2024, 1, 1)+timedelta(days=2*i)).isoformat()) for i in range(n)]

def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))

checks = []
def check(name, logical, expected='value', limits=None, text=False):
    envelope = dict(lane='aeonic-temporal-civil-date', case_id=name,
                    fixture={'requestText' if text else 'request':logical}, policy={} if limits is None else dict(resourceLimits=limits))
    child = subprocess.run(shlex.split(args.sut), input=compact(envelope), text=True, capture_output=True, cwd=repository, timeout=20)
    assert child.returncode == 0, (name, child.stderr)
    result = json.loads(child.stdout)['result']
    if isinstance(expected, tuple):
        reason, stage = expected
        assert result.get('reason') == reason and result.get('context', {}).get('stage') == stage and 'value' not in result, (name, result)
    else:
        assert result.get('outcome') == 'value' and result['metadata']['evaluation'] == 'exact-for-policy', (name, result)
        if result['value']['temporal']['category'] == 'civilDateSet':
            ranges = result['value']['temporal']['ranges']
            assert ranges and all(r['start'] <= r['end'] for r in ranges), name
            assert all(date.fromisoformat(ranges[i]['start']).toordinal() > date.fromisoformat(ranges[i-1]['end']).toordinal()+1 for i in range(1, len(ranges))), name
    checks.append(dict(name=name, status='passed', companion_limits=limits or {}))
    return result

small = compact(request(civil('2024-03-15')))
check('request-bytes-at-16384', small+' '*(16384-len(small)), text=True)
check('request-bytes-over-16384', small+' '*(16385-len(small)), ('resource_limit', 1), text=True)
for arrays in [28, 29]:
    payload = None
    for _ in range(arrays):
        payload = [payload]
    logical = dict(operation='equal', input=dict(left=dict(temporal=dict(category='container', payload=payload)), right=civil('2024-01'), context=dict(profile=PROFILE)))
    check('depth-'+str(arrays+4), logical, ('unsupported_domain', 5) if arrays == 28 else ('resource_limit', 1))
check('input-ranges-at-128', request(derived(points(128))))
check('input-ranges-over-128', request(derived(points(129))), ('resource_limit', 4))
check('count-characters-at-32', request(civil('2024-01'), policy=dict(unit='month', count='9'*32)), ('unrepresentable_result', 6))
check('count-characters-over-32', request(civil('2024-01'), policy=dict(unit='month', count='9'*33)), ('resource_limit', 3))
# A non-leap source year shifted by one year leaves a gap on target leap days.
# Through source year524 there are127such gaps→128canonical output ranges.
for end, expected in [('0524-12-31', 'value'), ('0528-12-31', ('resource_limit', 6))]:
    r = request(derived([dict(start='0001-01-01', end=end)]), policy=dict(unit='year', count='1'))
    result = check('output-ranges-'+end, r, expected, dict(maxCalendarWork=7000))
    if expected == 'value':
        assert len(result['value']['temporal']['ranges']) == 128
companions = dict(maxOutputRanges=4096, maxResultBytes=524288)
for end, expected in [('0342-04-30', 'value'), ('0342-05-31', ('resource_limit', 6))]:
    check('calendar-work-'+end, request(derived([dict(start='0001-01-01', end=end)]), policy=dict(unit='month', count='1')), expected, companions)
check('output-characters-at-10', request(civil('2024-03-15'), 'materialize', dict(granularity='day')))
check('output-characters-below-10', request(civil('2024-03-15'), 'materialize', dict(granularity='day')), ('resource_limit', 7), dict(maxOutputCharacters=9))
# Find the last reachable envelope below16KiB. Raise range/input/work companions;
# exact successful byte preflight is checked at its own size and one byte below.
def expected_result(n):
    return dict(outcome='value', value=derived(points(n)), metadata=dict(evaluation='exact-for-policy', clamping='not-applied', effectivePolicy=dict(profile=PROFILE, unit='day', count='0')))
n = 1
while len(compact(expected_result(n+1))) <= 16384:
    n += 1
companions = dict(maxInputRanges=n+1, maxOutputRanges=n+1, maxCalendarWork=n+1, maxRequestBytes=65536)
accepted = check('native-result-bytes-below-16384', request(derived(points(n))), limits=companions)
size = len(compact(expected_result(n)))
assert compact(accepted) == compact(expected_result(n)) or accepted == expected_result(n)
check('native-result-bytes-over-16384', request(derived(points(n+1))), ('resource_limit', 7), companions)
check('exact-result-byte-boundary', request(derived(points(n))), limits=dict(companions, maxResultBytes=size))
check('exact-result-byte-boundary-minus-one', request(derived(points(n))), ('resource_limit', 7), dict(companions, maxResultBytes=size-1))
report = dict(status='passed', checks=len(checks), sut=args.sut, cases=checks,
              result_byte_probe=dict(last_reachable_below_default=size, next_reachable=len(compact(expected_result(n+1)))),
              limits='Companion limits isolate dimensions. Count32 admits syntax then rejects domain at stage6. Date spellings have at most10characters. No Cartesian-product, elapsed-time, heap or process-capacity guarantee.')
if args.report:
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(dict(status='passed', checks=len(checks))))
