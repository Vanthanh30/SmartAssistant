"""Generate PDF inputs only; does not run acceptance tests or call application APIs."""
from pathlib import Path
import argparse
import hashlib
import json
from io import BytesIO
from PIL import Image, ImageDraw
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parents[2]


def generate():
    output = ROOT / 'docs/fixtures/pdf'
    output.mkdir(parents=True, exist_ok=True)
    cases = {}
    text = output / 'text.pdf'
    pdf = canvas.Canvas(str(text), invariant=1)
    pdf.drawString(50, 760, 'Study Assistant: real text-layer PDF fixture, page one.')
    pdf.showPage()
    pdf.drawString(50, 760, 'Page two preserves 1-based page mapping.')
    pdf.save()
    cases[text.name] = 'Expected extractionCompleted=true, pageCount=2, status=extracting; not ready.'
    image = Image.new('RGB', (800, 150), 'white')
    ImageDraw.Draw(image).text((30, 40), 'Image-only PDF fixture. No text layer.', fill='black')
    buffer = BytesIO(); image.save(buffer, format='PNG'); buffer.seek(0)
    scanned = output / 'image-only.pdf'
    pdf = canvas.Canvas(str(scanned), invariant=1)
    pdf.drawImage(ImageReader(buffer), 50, 600, width=500, height=94)
    pdf.save()
    cases[scanned.name] = 'Expected unsupported/PDF_NO_TEXT; no OCR.'
    broken = output / 'broken.pdf'; broken.write_bytes(b'%PDF-1.7\nInvalid fixture; missing PDF objects and trailer.\n')
    cases[broken.name] = 'Header accepted202; async failed/PDF_INVALID.'
    encrypted = output / 'encrypted.pdf'
    pdf = canvas.Canvas(str(encrypted), encrypt='fixture-only-password', invariant=1)
    pdf.drawString(50, 760, 'Encrypted fixture, password is not an application credential.'); pdf.save()
    cases[encrypted.name] = 'Expected failed/PDF_PASSWORD_PROTECTED; fixture password fixture-only-password.'
    spoof = output / 'not-a-pdf.pdf'; spoof.write_bytes(b'This is plain text, not a PDF.')
    cases[spoof.name] = 'Expected422 INVALID_PDF header check.'
    manifest = {'verification': 'NOT RUN; generated inputs and expected outcomes only',
                'cases': [{'file': name, 'sha256': hashlib.sha256((output / name).read_bytes()).hexdigest(), 'expected': expected} for name, expected in cases.items()]}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--large', action='store_true'); args = parser.parse_args()
    generate()
    if args.large:
        target = ROOT / 'docs/evidence/runtime/oversize.pdf'; target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('wb') as file:
            file.write(b'%PDF-1.7\n'); file.write(b'0' * (21 * 1024 * 1024))
        print('Generated ignored >20MiB size-limit input, not a valid PDF.')
    print('Generated fixtures; no tests executed.')
