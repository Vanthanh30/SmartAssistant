import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[3]
css = (root / 'docs/design-tokens.css').read_text(encoding='utf-8')
colors = dict(re.findall(r'--([\w-]+):\s*(#[0-9A-Fa-f]{6})', css))


def luminance(value):
    rgb = [int(value[i:i+2], 16) / 255 for i in (1, 3, 5)]
    linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return sum(c * weight for c, weight in zip(linear, [0.2126, 0.7152, 0.0722]))


pairs = [('surface', 'action'), ('text', 'surface'), ('text-muted', 'surface'),
         ('text', 'primary-soft'), ('text', 'primary'), ('error', 'surface'),
         ('success', 'surface'), ('text-muted', 'background')]
results = []
for fg, bg in pairs:
    a, b = sorted([luminance(colors[fg]), luminance(colors[bg])])
    ratio = (b + 0.05) / (a + 0.05)
    results.append({'foreground': fg, 'background': bg, 'ratio': round(ratio, 2), 'passesAA4_5': ratio >= 4.5})
report = {'status': 'passed' if all(r['passesAA4_5'] for r in results) else 'failed', 'pairs': results}
out = root / 'docs/evidence/design-contrast.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
raise SystemExit(0 if report['status'] == 'passed' else 1)
