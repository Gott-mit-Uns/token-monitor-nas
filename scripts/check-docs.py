#!/usr/bin/env python3
"""Bounded documentation policy. No dependencies, credentials or remote access."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
INITIAL_README_SHA256 = '0269faff0e1222adb48b91f093244295a53e2825259b0a8ae9dc0f161ba53a55'
INITIAL_ARCHIVE = {
    'docs/archive/upstream/UPSTREAM_0.69_AUDIT.md': 'dc63f65025e86fac7962b5b1ae0e2fd09cd8daf027c05d6a5b028a240d733f8d',
    'docs/archive/upstream/UPSTREAM_0.70_AUDIT.md': '9ac8c82fd3c8818f0f7d47246bc0e369d96ca0f43730a06b9cdde491123ba52a',
    'docs/archive/upstream/UPSTREAM_0.71_AUDIT.md': 'd5fa248d1e3227fa4ff1e59ab79d53b875d4e25989ab1aa75a53b5dd71f42899',
    'docs/archive/upstream/UPSTREAM_0.71_SHARED.md': 'f7cd3d80b8cbec7b614e36a03e430b158223ee4ce5480698109a74d4bae231aa',
}
CANONICAL = {'README.md', 'AGENTS.md', 'docs/VALIDATION.md', 'docs/HANDOFF.md',
             'docs/COST_MODEL.md', 'docs/archive/README.md'}
PUBLICATION = re.compile(r'^publications/v\d+\.\d+\.\d+-\d{2}/(?:manifest\.json|UPGRADE\.md|ROLLBACK\.md)$')
DUPLICATE = re.compile(r'^(?:handoff|validation|cost[_-](?:validation|model)|deployment[_-](?:plan|validation)|upstream)[_.-](?:v?\d|nas[_-]tag)', re.I)


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT).decode()


def fixture(name):
    return name.startswith(('app/tests/fixtures/', 'tests/fixtures/'))


def content_without_code(text):
    # Fences are examples, not local document links. Backtick inline source paths
    # are checked manually; Markdown links inside ordinary prose remain checked.
    return re.sub(r'^\s*(`{3,}|~{3,})[^\n]*\n.*?^\s*\1\s*$', '', text,
                  flags=re.M | re.S)


def anchors(text):
    result, counts = set(), {}
    for title in re.findall(r'^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$', content_without_code(text), re.M):
        title = re.sub(r'!?\[([^]]*)\]\([^)]*\)', r'\1', title)
        title = re.sub(r'<[^>]*>', '', title)
        slug = ''.join(c for c in title.lower() if c.isalnum() or c in '-_ ').replace(' ', '-')
        count = counts.get(slug, 0)
        counts[slug] = count + 1
        result.add(slug if count == 0 else f'{slug}-{count}')
    result.update(re.findall(r'<(?:a|h\d)\b[^>]*\bid=["\']([^"\']+)', text, re.I))
    return result


def link_errors(root, files):
    errors = []
    for name in files:
        if not name.lower().endswith('.md') or fixture(name):
            continue
        path = root / name
        if not path.is_file():
            continue
        text = content_without_code(path.read_text(encoding='utf-8'))
        targets = re.findall(r'!?\[[^\]\n]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["\'][^\n]*?["\'])?\s*\)', text)
        targets += re.findall(r'^\s*\[[^]]+\]:\s*(<[^>]+>|\S+)', text, re.M)
        for target in targets:
            target = target.strip('<>')
            parts = urlsplit(target)
            if parts.scheme or parts.netloc:
                continue
            rel, fragment = unquote(parts.path), unquote(parts.fragment)
            dest = (path.parent / rel).resolve() if rel else path.resolve()
            if not dest.is_relative_to(root.resolve()):
                errors.append(f'{name}: local link escapes repository')
            elif not dest.exists():
                errors.append(f'{name}: missing local link {target}')
            elif fragment and dest.is_file() and dest.suffix.lower() == '.md':
                if fragment not in anchors(dest.read_text(encoding='utf-8')):
                    errors.append(f'{name}: missing heading {target}')
    return errors


def metadata(event_path):
    if not event_path:
        return ''
    event = json.loads(Path(event_path).read_text(encoding='utf-8'))
    return event.get('pull_request', {}).get('body') or ''


def policy_errors(root, added, changed, body='', readme_authorization='', readme_correction=''):
    errors = []
    for name in added:
        if fixture(name) or PUBLICATION.fullmatch(name):
            continue
        if name.startswith('docs/archive/') and name != 'docs/archive/README.md':
            digest = hashlib.sha256((root / name).read_bytes()).hexdigest()
            if INITIAL_ARCHIVE.get(name) != digest:
                errors.append(f'{name}: archive is closed; review a specific policy change first')
            continue
        if DUPLICATE.match(Path(name).stem):
            errors.append(f'{name}: update the canonical current document instead')
        if name.lower().endswith('.md') and name not in CANONICAL:
            marker = re.search(r'^Documentation-Topic:\s*' + re.escape(name) + r'\s*\|\s*\S.+$', body, re.M)
            if not marker:
                errors.append(f'{name}: new durable topic requires Documentation-Topic in PR description')
    if 'README.md' in changed:
        digest = hashlib.sha256((root / 'README.md').read_bytes()).hexdigest()
        if digest != INITIAL_README_SHA256:
            authorization = readme_authorization or next(iter(re.findall(r'^README-Authorization:\s*(https://\S+)\s*$', body, re.M)), '')
            correction = readme_correction or next(iter(re.findall(r'^README-Correction:\s*(\S.{9,})$', body, re.M)), '')
            if not re.fullmatch(r'https://[^\s]+', authorization) and len(correction.strip()) < 10:
                errors.append('README.md: requires a traceable user authorization URL or a specific minimal correction reason')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='origin/main', help='existing comparison ref; required to check changes')
    parser.add_argument('--readme-authorization', default='')
    parser.add_argument('--readme-correction', default='')
    args = parser.parse_args()
    # Fail closed when the comparison ref is missing; CI fetches full history.
    git('rev-parse', '--verify', args.base + '^{commit}')
    tracked = git('ls-files', '-z').split('\0')
    tracked = [p for p in tracked if p and (ROOT / p).exists()]
    added = git('diff', '--no-renames', '--name-only', '--diff-filter=A', args.base, '--').splitlines()
    changed = git('diff', '--name-only', args.base, '--').splitlines()
    body = metadata(os.environ.get('GITHUB_EVENT_PATH'))
    # Commit trailers keep the evidence available after merge and on push CI.
    body += '\n' + git('log', '--format=%B', args.base + '..HEAD')
    errors = link_errors(ROOT, tracked)
    errors += policy_errors(ROOT, added, changed, body, args.readme_authorization, args.readme_correction)
    for error in errors:
        print(error)
    print(f'Documentation check: {len(errors)} finding(s); local links/anchors, added records and README evidence checked.')
    if 'README.md' in changed:
        print('README changed: a maintainer must verify user authorization or minimal correction scope.')
    return bool(errors)


if __name__ == '__main__':
    sys.exit(main())
