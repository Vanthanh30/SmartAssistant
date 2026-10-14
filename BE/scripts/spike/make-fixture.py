"""Create an actual, reproducible VN/EN PDF, not fake extractor output."""
import argparse
import hashlib
import json
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import simpleSplit

parser = argparse.ArgumentParser()
parser.add_argument('--font', type=Path, required=True, help='Unicode TTF with Vietnamese glyphs')
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('FixtureFont', str(args.font)))
topics = [
    ('Giao dịch cơ sở dữ liệu', 'Giao dịch cơ sở dữ liệu có bốn thuộc tính ACID: tính nguyên tử, tính nhất quán, tính cô lập và tính bền vững. Tính nguyên tử đảm bảo toàn bộ thao tác cùng thành công hoặc cùng bị hủy. Khi chuyển tiền, trừ tiền và cộng tiền phải nằm trong cùng một giao dịch.'),
    ('Photosynthesis', 'Photosynthesis converts light energy into chemical energy. Chlorophyll in chloroplasts absorbs sunlight. Plants use carbon dioxide and water to produce glucose and release oxygen. The light reactions occur in thylakoid membranes, while the Calvin cycle takes place in the stroma.'),
    ('Thuật toán tìm kiếm nhị phân', 'Tìm kiếm nhị phân yêu cầu mảng đã sắp xếp. Mỗi bước so sánh khóa với phần tử giữa rồi loại bỏ một nửa phạm vi tìm kiếm. Độ phức tạp thời gian là O(log n). Nếu mảng chưa sắp xếp thì không thể đảm bảo kết quả đúng.'),
    ('Networking protocols', 'TCP provides reliable ordered delivery with acknowledgements and retransmission. UDP sends independent datagrams without guaranteeing delivery or ordering. DNS translates domain names into IP addresses. HTTP is an application protocol used to request web resources.'),
]
pdf_path = args.out / 'study-vn-en.pdf'
pdf = canvas.Canvas(str(pdf_path), pagesize=(595, 842), invariant=1)
pdf.setTitle('Sprint 00 VN EN technical fixture')
expected = []
for number, (title, text) in enumerate(topics, 1):
    pdf.setFont('FixtureFont', 14)
    pdf.drawString(40, 800, f'{number}. {title}')
    pdf.setFont('FixtureFont', 11)
    # A long real page forces the parent/window boundary to be exercised.
    repeated = ' '.join([text] * (8 if number == 1 else 3))
    lines = simpleSplit(repeated, 'FixtureFont', 11, 510)
    assert len(lines) < 49, 'Fixture content must fit its labeled page'
    for i, line in enumerate(lines):
        pdf.drawString(40, 770 - i * 14, line)
    pdf.showPage()
    expected.append({'pageNumber': number, 'anchor': text.split('.')[0]})
pdf.save()
labels = {
    'source': 'Authored controlled corpus for technical spike, not final RAG evaluation',
    'pdfSha256': hashlib.sha256(pdf_path.read_bytes()).hexdigest(),
    'fontSha256': hashlib.sha256(args.font.read_bytes()).hexdigest(),
    'pages': expected,
    'queries': [
        {'question': 'Tính nguyên tử của giao dịch chuyển tiền đảm bảo điều gì?', 'expectedPage': 1, 'evidence': 'cùng thành công hoặc cùng bị hủy'},
        {'question': 'Where do the light reactions and Calvin cycle occur in photosynthesis?', 'expectedPage': 2, 'evidence': 'thylakoid'},
        {'question': 'Tìm kiếm nhị phân yêu cầu mảng như thế nào và có độ phức tạp bao nhiêu?', 'expectedPage': 3, 'evidence': 'O(log n)'},
        {'question': 'Which protocol guarantees reliable ordered delivery with retransmission?', 'expectedPage': 4, 'evidence': 'TCP'},
    ],
}
(args.out / 'labels.json').write_text(json.dumps(labels, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'pdf': str(pdf_path), 'pages': len(topics)}))
