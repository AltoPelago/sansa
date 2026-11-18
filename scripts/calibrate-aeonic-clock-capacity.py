"""Isolate all16 native default dimensions; no Cartesian/host/whole-chain claim."""
import argparse
import json
from pathlib import Path
import shlex
import subprocess

parser=argparse.ArgumentParser();parser.add_argument('--sut',required=True);parser.add_argument('--report',type=Path);args=parser.parse_args()
repository=Path(__file__).resolve().parents[1];PROFILE='aeonic.operations.temporal.civil-clock.v1'
def compact(v):return json.dumps(v,ensure_ascii=False,separators=(',',':'))
def civil(v):return dict(temporal=dict(category='civilClock',value=v))
def derived(pieces):return dict(temporal=dict(category='civilClockSet',pieces=pieces),originClockForm='undeclared',history='none-declared')
def point(day,time):return dict(kind='point',at=dict(day=day,time=time))
def points(n):return [point('0','%02d:%02d:%02d'%(i//3600,i//60%60,i%60)) for i in range(n)]
def request(v,op='shiftClock',policy=None,amount='0'):
    data=dict(value=v,context=dict(profile=PROFILE))
    if policy is not None:data['policy']=policy
    if op=='shiftClock':data['amount']=dict(number=dict(category='finiteNumber',value=amount))
    return dict(operation=op,input=data)
checks=[]
def check(name,logical,expected='value',limits=None,text=False):
    envelope=dict(lane='aeonic-temporal-civil-clock',case_id=name,fixture={'requestText' if text else 'request':logical},policy={} if limits is None else dict(resourceLimits=limits))
    child=subprocess.run(shlex.split(args.sut),input=compact(envelope),text=True,capture_output=True,cwd=repository,timeout=30)
    if child.returncode:raise RuntimeError((name,child.stderr))
    result=json.loads(child.stdout)['result']
    valid=result.get('outcome')=='value' if expected=='value' else result.get('reason')==expected[0] and result.get('context',{}).get('stage')==expected[1] and 'value' not in result
    if not valid:raise RuntimeError((name,result))
    checks.append(dict(name=name,status='passed',companion_limits=limits or {},expected=expected));return result
small=compact(request(civil('00:00:00')))
for n in (65536,65537):check('request-bytes-'+str(n),small+' '*(n-len(small)),'value' if n==65536 else ('resource_limit',1),text=True)
for arrays in (28,29):
    payload=None
    for _ in range(arrays):payload=[payload]
    q=dict(operation='equal',input=dict(left=dict(temporal=dict(category='container',payload=payload)),right=civil('09:30'),context=dict(profile=PROFILE)))
    check('request-depth-'+str(arrays+4),q,('unsupported_domain',5) if arrays==28 else ('resource_limit',1))
for n in (1024,1025):check('temporal-characters-'+str(n),request(civil('00:00:00.'+'1'*(n-9))),'value' if n==1024 else ('resource_limit',4),dict(maxFractionDigits=1025))
for n in (512,513):check('input-pieces-'+str(n),request(derived(points(n))),'value' if n==512 else ('resource_limit',4))
for n in (4096,4097):check('intermediate-pieces-'+str(n),request(derived(points(n))),'value' if n==4096 else ('resource_limit',6),dict(maxInputPieces=4097,maxOutputPieces=4097,maxRequestBytes=1048576,maxResultBytes=1048576))
for n in (512,513):check('output-pieces-'+str(n),request(derived(points(n))),'value' if n==512 else ('resource_limit',7),dict(maxInputPieces=513))
for n in (16384,16385):
    q=dict(operation='equal',input=dict(context=dict(profile=PROFILE),left=derived(points(8192)),right=derived(points(n-8192))))
    check('work-'+str(n),q,'value' if n==16384 else ('resource_limit',6),dict(maxInputPieces=8193,maxRequestBytes=2097152))
for n in (256,257):check('fraction-digits-'+str(n),request(civil('00:00:00.'+'1'*n)),'value' if n==256 else ('resource_limit',4))
for n in (256,257):check('relative-day-digits-'+str(n),request(derived([point('1'*n,'00:00:00')])),'value' if n==256 else ('resource_limit',4))
for n in (32,33):check('count-characters-'+str(n),request(civil('00:00:00'),'step',dict(clockForm='second',count='9'*n)),'value' if n==32 else ('resource_limit',3))
for n in (4096,4097):check('numeric-characters-'+str(n),request(civil('00:00:00'),amount='0e'+'0'*(n-2)),'value' if n==4096 else ('resource_limit',4))
for n in (1024,1025):check('coefficient-digits-'+str(n),request(civil('00:00:00'),amount='1'*n+'e-'+str(n)),'value' if n==1024 else ('resource_limit',4),dict(maxFractionDigits=1025))
for n in (1000000,1000001):check('authored-exponent-'+str(n),request(civil('00:00:00'),amount='0e'+str(n)),'value' if n==1000000 else ('resource_limit',4))
for n in (4089,4090):check('workspace-'+str(n+7),request(civil('00:00:00'),amount='1e-'+str(n)),'value' if n==4089 else ('resource_limit',6),dict(maxFractionDigits=4090))
for n in (1024,1025):check('output-characters-'+str(n),request(civil('00:00:00.'+'1'*(n-9)),'materialize',dict(clockForm='second')),'value' if n==1024 else ('resource_limit',7),dict(maxTemporalCharacters=1025,maxFractionDigits=1016))
def expected_result(n):return dict(outcome='value',value=derived(points(n)),metadata=dict(evaluation='exact-for-policy',effectivePolicy=dict(profile=PROFILE)))
base=len(compact(expected_result(1)));increment=len(compact(expected_result(2)))-base;n=1+(131072-base)//increment
companions=dict(maxInputPieces=n+1,maxOutputPieces=n+1,maxRequestBytes=1048576)
actual=check('native-result-bytes-last-admitted',request(derived(points(n))),limits=companions)
if actual!=expected_result(n):raise RuntimeError('Unexpected result value')
check('native-result-bytes-next-rejected',request(derived(points(n+1))),('resource_limit',7),companions)
size=len(compact(expected_result(n)))
check('exact-result-byte-boundary',request(derived(points(n))),limits=dict(companions,maxResultBytes=size))
check('exact-result-byte-boundary-minus-one',request(derived(points(n))),('resource_limit',7),dict(companions,maxResultBytes=size-1))
report=dict(status='passed',checks=len(checks),sut=args.sut,cases=checks,result_byte_probe=dict(last_reachable_below_default=size,next_reachable=size+increment),limits='All16 dimensions isolated using recorded companion limits. No Cartesian-product, process/heap, transport, native accessor/proxy or whole-chain guarantee.')
if args.report:args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(status='passed',checks=len(checks))))
