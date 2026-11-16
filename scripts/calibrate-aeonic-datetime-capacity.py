"""Native-default capacity probes, independent of shared semantic CTS fixtures.

Companion limits isolate each dimension; admission is not a claim about the
Cartesian product, operating-system heap, arbitrary transports or chain budgets.
"""
import argparse
from datetime import date, timedelta
import json
from pathlib import Path
import shlex
import subprocess

parser=argparse.ArgumentParser()
parser.add_argument('--sut',required=True)
parser.add_argument('--report',type=Path)
args=parser.parse_args()
repository=Path(__file__).resolve().parents[1]
PROFILE='aeonic.operations.temporal.civil-datetime.v1'
HISTORY=dict(clamping='none-declared',approximation='none-declared')
def compact(v):return json.dumps(v,ensure_ascii=False,separators=(',',':'))
def civil(v):return dict(temporal=dict(category='civilDateTime',value=v))
def derived(pieces):return dict(temporal=dict(category='civilDateTimeSet',pieces=pieces),originDateGranularity='undeclared',originClockForm='undeclared',history=HISTORY)
def request(value,op='shift',policy=None,amount=None):
    data=dict(value=value,context=dict(profile=PROFILE))
    if policy is not None:data['policy']=policy
    elif op=='shift':data['policy']=dict(unit='day',count='0')
    if amount is not None:data['amount']=dict(number=dict(category='finiteNumber',value=amount))
    return dict(operation=op,input=data)
def points(n):return [dict(kind='point',at='2024-03-01T'+f'{i//3600:02}:{i//60%60:02}:{i%60:02}') for i in range(n)]
def span(days):return derived([dict(kind='interval',start='2000-01-01T00:00:00',end=(date(2000,1,1)+timedelta(days=days)).isoformat()+'T00:00:00',includeStart=True,includeEnd=False)])
checks=[]
def check(name,logical,expected='value',limits=None,text=False):
    envelope=dict(lane='aeonic-temporal-civil-datetime',case_id=name,fixture={'requestText' if text else 'request':logical},policy={} if limits is None else dict(resourceLimits=limits))
    child=subprocess.run(shlex.split(args.sut),input=compact(envelope),text=True,capture_output=True,cwd=repository,timeout=30)
    assert child.returncode==0,(name,child.stderr)
    result=json.loads(child.stdout)['result']
    if expected=='value':assert result.get('outcome')=='value',(name,result)
    else:assert result.get('reason')==expected[0] and result.get('context',{}).get('stage')==expected[1] and 'value' not in result,(name,result)
    checks.append(dict(name=name,status='passed',companion_limits=limits or {},expected=expected))
    return result

small=compact(request(civil('2024-03-01T09:30')))
for n in (65536,65537):check('request-bytes-'+str(n),small+' '*(n-len(small)),'value' if n==65536 else ('resource_limit',1),text=True)
for arrays in (28,29):
    payload=None
    for _ in range(arrays):payload=[payload]
    logical=dict(operation='equal',input=dict(left=dict(temporal=dict(category='container',payload=payload)),right=civil('2024-03-01T09:30'),context=dict(profile=PROFILE)))
    check('request-depth-'+str(arrays+4),logical,('unsupported_domain',5) if arrays==28 else ('resource_limit',1))
for n in (1024,1025):check('temporal-characters-'+str(n),request(civil('2024-03-01T00:00:00.'+'1'*(n-20))),'value' if n==1024 else ('resource_limit',4),dict(maxFractionDigits=1025))
for n in (512,513):check('input-pieces-'+str(n),request(derived(points(n))),'value' if n==512 else ('resource_limit',4))
for n in (4096,4097):check('intermediate-pieces-'+str(n),request(span(n),policy=dict(unit='month',count='1')),'value' if n==4096 else ('resource_limit',6))
for n in (512,513):check('output-pieces-'+str(n),request(derived(points(n))),'value' if n==512 else ('resource_limit',7),dict(maxInputPieces=513))
for n in (16384,16385):check('work-'+str(n),request(span(n),policy=dict(unit='month',count='1')),'value' if n==16384 else ('resource_limit',6),dict(maxIntermediatePieces=16385))
for n in (256,257):check('fraction-digits-'+str(n),request(civil('2024-03-01T00:00:00.'+'1'*n)),'value' if n==256 else ('resource_limit',4))
for n in (32,33):check('count-characters-'+str(n),request(civil('2024-03-01T09:30'),policy=dict(unit='month',count='9'*n)),('unrepresentable_result',6) if n==32 else ('resource_limit',3))
for n in (4096,4097):check('numeric-characters-'+str(n),request(civil('2024-03-01T09:30'),'shiftClock',amount='0e'+'0'*(n-2)),'value' if n==4096 else ('resource_limit',4))
for n in (1024,1025):check('coefficient-digits-'+str(n),request(civil('2024-03-01T09:30:00'),'shiftClock',amount='1'*n+'e-'+str(n)),'value' if n==1024 else ('resource_limit',4),dict(maxFractionDigits=1025))
for n in (1000000,1000001):check('authored-exponent-'+str(n),request(civil('2024-03-01T09:30'),'shiftClock',amount='0e'+str(n)),'value' if n==1000000 else ('resource_limit',4))
for n in (4083,4084):check('workspace-'+str(n+13),request(civil('2024-03-01T09:30:00'),'shiftClock',amount='1e-'+str(n)),'value' if n==4083 else ('resource_limit',6),dict(maxFractionDigits=4084))
for n in (1024,1025):check('output-characters-'+str(n),request(civil('2024-03-01T00:00:00.'+'1'*(n-20)),'materialize',dict(dateGranularity='day',clockForm='second')),'value' if n==1024 else ('resource_limit',7),dict(maxTemporalCharacters=1025,maxFractionDigits=1005))
def expected_result(n):return dict(outcome='value',value=derived(points(n)),metadata=dict(evaluation='exact-for-policy',clamping='not-applied',effectivePolicy=dict(profile=PROFILE,unit='day',count='0')))
# Every point has the same spelling length. Derive the last reachable default
# result from the public envelope, not a value supplied by the SUT.
base=len(compact(expected_result(1)));increment=len(compact(expected_result(2)))-base
n=1+(131072-base)//increment
companions=dict(maxInputPieces=n+1,maxOutputPieces=n+1,maxRequestBytes=524288)
actual=check('native-result-bytes-last-admitted',request(derived(points(n))),limits=companions)
assert actual==expected_result(n)
check('native-result-bytes-next-rejected',request(derived(points(n+1))),('resource_limit',7),companions)
size=len(compact(expected_result(n)))
check('exact-result-byte-boundary',request(derived(points(n))),limits=dict(companions,maxResultBytes=size))
check('exact-result-byte-boundary-minus-one',request(derived(points(n))),('resource_limit',7),dict(companions,maxResultBytes=size-1))
report=dict(status='passed',checks=len(checks),sut=args.sut,cases=checks,result_byte_probe=dict(last_reachable_below_default=size,next_reachable=size+increment),limits='15 dimensions isolated using recorded companion limits. Counts and extreme zero exponents admit input before later domain/normalization checks. No Cartesian-product, heap, process, transport or whole-chain guarantee.')
if args.report:
    args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(status='passed',checks=len(checks))))
