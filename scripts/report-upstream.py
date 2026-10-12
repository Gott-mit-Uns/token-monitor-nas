#!/usr/bin/env python3
"""Read-only, public upstream report. Never changes the locked source baseline."""
import argparse, json, pathlib, subprocess, tempfile
from urllib.request import Request, urlopen

def report(lock, latest, files):
    lines = ['# Official upstream comparison', '', f"Locked: `{lock['tag']}` at `{lock['commit']}`", f"Latest published release: `{latest['tag_name']}` ({latest['published_at']})", '', 'A detected release requires review; this report does not import or publish code.', '', '| Area | Changed files |', '| --- | ---: |']
    groups = {'shared': [], 'agent': [], 'hub': [], 'dependencies': [], 'desktop and other': []}
    for name in files:
        key = next((area for area in ('shared', 'agent', 'hub') if name.startswith('src/' + area + '/')), None)
        key = key or ('dependencies' if name in ('package.json', 'package-lock.json', 'scripts/vendor/tokscale.json') else 'desktop and other')
        groups[key].append(name)
    lines.extend(f'| {key} | {len(names)} |' for key, names in groups.items())
    lines += ['', '## Changed paths', ''] + [f'- `{name}`' for name in files]
    if not files: lines.append('No source changes between the frozen baseline and latest release.')
    return '\n'.join(lines) + '\n'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    root = pathlib.Path(__file__).resolve().parent.parent
    lock = json.loads((root / 'upstream-lock.json').read_text())
    req = Request('https://api.github.com/repos/Javis603/token-monitor/releases/latest', headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'token-monitor-nas-upstream-audit'})
    with urlopen(req, timeout=30) as response: latest = json.load(response)
    with tempfile.TemporaryDirectory(prefix='tm-upstream-report-') as temp:
        subprocess.run(['git', 'init', '--quiet', temp], check=True)
        subprocess.run(['git', '-C', temp, 'fetch', '--quiet', '--no-tags', lock['repository'], lock['commit'] + ':refs/locks/base', 'refs/tags/' + latest['tag_name'] + ':refs/locks/latest'], check=True)
        files = subprocess.check_output(['git', '-C', temp, 'diff', '--name-only', 'refs/locks/base^{commit}', 'refs/locks/latest^{commit}'], text=True).splitlines()
        latest['resolvedCommit'] = subprocess.check_output(['git', '-C', temp, 'rev-parse', 'refs/locks/latest^{commit}'], text=True).strip()
    pathlib.Path(args.output).write_text(report(lock, latest, files) + f"\nLatest resolved commit: `{latest['resolvedCommit']}`\n")
    print(f"Upstream report: {lock['tag']} -> {latest['tag_name']}; {len(files)} changed files")

if __name__ == '__main__': main()
