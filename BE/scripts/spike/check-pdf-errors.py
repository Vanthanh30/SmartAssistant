"""Exercise real PDF.js failures; no extractor mocks."""
import json
import subprocess
from pathlib import Path
from reportlab.pdfgen import canvas

root = Path(__file__).resolve().parents[3]
runtime = root / 'docs/evidence/runtime/pdf error cases'
runtime.mkdir(parents=True, exist_ok=True)
blank = runtime / 'no text.pdf'
pdf = canvas.Canvas(str(blank), invariant=1)
pdf.rect(20, 20, 100, 100)
pdf.showPage()
pdf.save()
broken = runtime / 'broken.pdf'
broken.write_bytes(b'%PDF-1.7\nnot a real PDF structure')
encrypted = runtime / 'encrypted.pdf'
pdf = canvas.Canvas(str(encrypted), encrypt='spike-password', invariant=1)
pdf.drawString(40, 40, 'Encrypted document')
pdf.showPage()
pdf.save()
cases = []
for path, expected in [(blank, 'UNSUPPORTED_NO_TEXT'), (broken, 'Invalid PDF'), (encrypted, 'password')]:
    output = path.with_suffix('.json')
    result = subprocess.run(['node', str(root / 'BE/scripts/spike/extract-pdf.mjs'), str(path), str(output)],
                            capture_output=True, text=True, encoding='utf-8')
    passed = result.returncode == 1 and expected.lower() in result.stderr.lower() and not output.exists()
    cases.append({'case': path.stem, 'exitCode': result.returncode, 'error': result.stderr.strip(), 'passed': passed})
report = {'status': 'passed' if all(c['passed'] for c in cases) else 'failed', 'cases': cases}
(root / 'docs/evidence/pdf-errors.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
raise SystemExit(0 if report['status'] == 'passed' else 1)
