#!/usr/bin/env python3
"""Check reachable Git history without printing secret values or file contents."""
import re
import subprocess
import sys


def git(*args):
    return subprocess.check_output(['git', *args])


def forbidden(path):
    return bool(re.search(
        r'(^|/)(?:\.env(?:\.[^/]+)?|state|backups|node_modules)(?:/|$)'
        r'|\.(?:db|sqlite|sqlite3|log|tar|tar\.gz|tgz|zip)$', path
    )) and not path.endswith('/.env.example') and path != '.env.example'


credential = re.compile(
    rb'gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}'
    rb'|sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}'
    rb'|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'
)
problems = set()
count = 0
# One streaming cat-file process avoids spawning twice per historical object.
# It reads the same reachable objects and applies exactly the same guards.
reader = subprocess.Popen(['git', 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
try:
    for line in git('rev-list', '--objects', '--all').decode().splitlines():
        sha, _, path = line.partition(' ')
        if not path:
            continue
        reader.stdin.write((sha + '\n').encode())
        reader.stdin.flush()
        header = reader.stdout.readline().decode().split()
        if len(header) != 3:
            raise RuntimeError('Git object could not be inspected')
        size = int(header[2])
        contents = reader.stdout.read(size)
        if len(contents) != size or reader.stdout.read(1) != b'\n':
            raise RuntimeError('Incomplete Git object inspection')
        if header[1] != 'blob':
            continue
        count += 1
        if forbidden(path):
            problems.add((path, 'runtime/data file in history'))
        if credential.search(contents):
            problems.add((path, 'possible credential in history'))
finally:
    reader.stdin.close()
    reader.stdout.close()
    if reader.wait() != 0:
        raise RuntimeError('Git object inspection failed')
for path, reason in sorted(problems):
    print(f'{path}: {reason}')
print(f'Checked {count} historical file versions; findings: {len(problems)}')
sys.exit(bool(problems))
