"""Verify snapshot bytes and coverage before accepting an archive; stdlib only."""
import datetime as dt
import hashlib
import json
import pathlib
import sys


def verify(root):
    root = pathlib.Path(root).resolve()
    manifest = json.loads((root / 'manifest.json').read_text())
    coverage_bytes = (root / 'coverage.json').read_bytes()
    if hashlib.sha256(coverage_bytes).hexdigest() != manifest['coverage_sha256']:
        raise ValueError('Coverage checksum mismatch')
    if not manifest['files']:
        raise ValueError('Empty archive')
    seen = set()
    for item in manifest['files']:
        path = (root / item['file']).resolve()
        if not path.is_relative_to(root / 'raw') or path in seen:
            raise ValueError('Invalid or duplicate archive path')
        seen.add(path)
        content = path.read_bytes()
        if hashlib.sha256(content).hexdigest() != item['sha256']:
            raise ValueError('Page checksum mismatch')
        page = json.loads(content)
        if page.get('possiblyTruncated') is not False or len(page['rows']) != item['rows']:
            raise ValueError('Truncated or inconsistent page')
    coverage = json.loads(coverage_bytes)
    expected = {'BTCUSDT', 'ETHUSDT', 'SOLUSDT'}
    for resource in ('samples', 'trades', 'funding'):
        rows = coverage[resource]
        if not expected.issubset({r['symbol'] for r in rows if int(r['rows']) > 0}):
            raise ValueError('Missing symbol coverage: ' + resource)
    print('Verified', len(seen), 'pages')


if __name__ == '__main__':
    verify(sys.argv[1])
