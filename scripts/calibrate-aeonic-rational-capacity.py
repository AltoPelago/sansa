# Adapted from Aeonic at 64347f19181041f86135e958da5a16ecc4b60b57; MIT, Copyright (c) 2026 Patrik.
"""Bounded default-capacity probes, independent of the shared CTS fixtures."""
import argparse
import json
from pathlib import Path
import shlex
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--sut", required=True)
parser.add_argument("--report", type=Path)
args = parser.parse_args()
repository = Path(__file__).resolve().parents[1]
profile = "aeonic.operations.arithmetic.rational.v1"


def finite(text):
    return {"number": {"category": "finiteNumber", "value": text}}


def exact(c, e="0", d=None):
    number = dict(category="exactRational" if d else "exactNumber", coefficient=c, exponent=e)
    if d:
        number["denominator"] = d
    return dict(number=number, history="none-declared")


def request(left, right=None, operation="add", policy=None):
    data = dict(context=dict(profile=profile))
    data.update(dict(value=left, policy=policy) if operation == "materialize" else dict(left=left, right=right or finite("0")))
    return dict(operation=operation, input=data)


checks = []


def check(name, value, expected, limits=None, text=False):
    fixture = {"requestText" if text else "request": value}
    envelope = dict(lane="aeonic-rational-arithmetic", case_id=name, fixture=fixture,
                    policy={} if limits is None else dict(resourceLimits=limits))
    child = subprocess.run(shlex.split(args.sut), input=json.dumps(envelope), text=True,
                           capture_output=True, cwd=repository, timeout=15)
    if child.returncode:
        raise AssertionError(name + ": harness failure: " + child.stderr)
    result = json.loads(child.stdout)["result"]
    if isinstance(expected, tuple):
        reason, stage = expected
        assert result.get("reason") == reason and result.get("context", {}).get("stage") == stage, (name, result)
        assert "value" not in result, (name, result)
    else:
        assert result.get("outcome") == "value" and result["value"] == expected, (name, result)
    checks.append(dict(name=name, status="passed", companion_limits=limits or {}))


check("coefficient-at-512", request(finite("1"*512)), exact("1"*512))
check("coefficient-over-512", request(finite("1"*513)), ("resource_limit", 4))
check("denominator-at-512", request(exact("1", d="9"*512)), exact("1", d="9"*512))
check("denominator-over-512", request(exact("1", d="9"*513)), ("resource_limit", 4))
check("numeric-text-at-1024", request(finite("1e"+"0"*1022)), exact("1"))
check("numeric-text-over-1024", request(finite("1e"+"0"*1023)), ("resource_limit", 4))
check("exponent-at-million", request(finite("1e1000000")), exact("1", "1000000"))
check("exponent-over-million", request(finite("1e1000001")), ("resource_limit", 4))
check("result-exponent-over-million", request(finite("5e1000000"), finite("2"), "multiply"), ("resource_limit", 6))
companions = dict(maxCoefficientDigits=4096, maxNumericCharacters=2048)
product = "9"*2047+"8"+"0"*2047+"1"  # (10^2048 - 1)^2
check("workspace-at-4096", request(finite("9"*2048), finite("9"*2048), "multiply"), exact(product), companions)
check("workspace-below-4096", request(finite("9"*2048), finite("9"*2048), "multiply"),
      ("resource_limit", 6), dict(companions, maxWorkspaceDigits=4095))
check("output-at-1024", request(exact("1", "1023"), operation="materialize", policy=dict(family="integer")),
      finite("1"+"0"*1023) | dict(history="none-declared"))
check("output-over-1024", request(exact("1", "1024"), operation="materialize", policy=dict(family="integer")), ("resource_limit", 7))
logical = json.dumps(request(finite("1")))
check("bytes-at-16384", logical+" "*(16384-len(logical)), exact("1"), text=True)
check("bytes-over-16384", logical+" "*(16385-len(logical)), ("resource_limit", 1), text=True)
for arrays, expected in [(28, ("unsupported_domain", 5)), (29, ("resource_limit", 1))]:
    payload = None
    for _ in range(arrays):
        payload = [payload]
    check("depth-"+str(arrays+4), request(dict(number=dict(category="container", payload=payload))), expected)
report = dict(status="passed", checks=len(checks), sut=args.sut, cases=checks,
              limits="Independent capacities with explicit workspace companion limits; no Cartesian-product or machine-resource guarantee.")
if args.report:
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2)+"\n")
print(json.dumps(dict(status="passed", checks=len(checks))))
