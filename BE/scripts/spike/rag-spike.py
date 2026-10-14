"""Offline spike only. No API, DB, production ingestion, or LLM flow."""
import argparse
import hashlib
import importlib.metadata
import json
import math
import platform
import threading
import time
import traceback
from pathlib import Path

MODEL = 'intfloat/multilingual-e5-base'
REVISION = 'd128750597153bb5987e10b1c3493a34e5a4502a'


def token_count(tokenizer, text, prefix=''):
    return len(tokenizer(prefix + text, add_special_tokens=True, truncation=False)['input_ids'])


def segments(tokenizer, text, max_tokens, overlap, prefix=''):
    """Use tokenizer offsets to retain exact normalized text, never decode token slices."""
    offsets = tokenizer(text, add_special_tokens=False, truncation=False, return_offsets_mapping=True)['offset_mapping']
    offsets = [(a, b) for a, b in offsets if b > a]
    start = 0
    while start < len(offsets):
        end = min(len(offsets), start + max_tokens)
        char_start = 0 if start == 0 else offsets[start][0]
        while end > start:
            char_end = len(text) if end == len(offsets) else offsets[end][0]
            piece = text[char_start:char_end]
            count = token_count(tokenizer, piece, prefix)
            if count <= max_tokens:
                break
            end -= 1
        if end <= start:
            raise ValueError('Token budget cannot fit one text segment')
        yield {'text': piece, 'start': char_start, 'end': char_end, 'tokens': count}
        if end == len(offsets):
            break
        keep = math.floor((end - start) * overlap)
        next_start = max(start + 1, end - keep)
        # Some tokenizers split a code point or assign identical offsets.
        while next_start < end and offsets[next_start][0] <= char_start:
            next_start += 1
        start = next_start


def assert_coverage(records, length):
    cursor = 0
    for record in records:
        assert record['start'] <= cursor, 'Uncovered source characters'
        cursor = max(cursor, record['end'])
    assert cursor == length, 'Lost source tail'


def run(args, report):
    import faiss
    import numpy as np
    import psutil
    import torch
    from sentence_transformers import SentenceTransformer

    report['versions'] = {name: importlib.metadata.version(name) for name in
                          ['torch', 'sentence-transformers', 'transformers', 'faiss-cpu', 'numpy', 'psutil']}
    torch.set_num_threads(4)
    proc = psutil.Process()
    baseline = proc.memory_info().rss
    peak = [baseline]
    stop = threading.Event()

    def sample():
        while not stop.wait(0.05):
            peak[0] = max(peak[0], proc.memory_info().rss)

    watcher = threading.Thread(target=sample, daemon=True)
    watcher.start()
    try:
        started = time.perf_counter()
        model = SentenceTransformer(MODEL, revision=REVISION, device='cpu', trust_remote_code=False)
        loaded = time.perf_counter() - started
        tokenizer = model.tokenizer
        limit = min(model.max_seq_length, tokenizer.model_max_length)
        assert tokenizer.is_fast, 'Need offset mapping from fast tokenizer'
        report['model'] = {'id': MODEL, 'revision': REVISION, 'dimension': model.get_sentence_embedding_dimension(),
                           'modelMaxSeqLength': model.max_seq_length, 'tokenizerMaxLength': tokenizer.model_max_length,
                           'effectiveLimit': limit, 'loadSeconds': loaded, 'device': 'cpu',
                           'passagePrefix': 'passage: ', 'queryPrefix': 'query: '}
        report['memory'] = {'rssBaselineMiB': baseline / 1024**2,
                            'rssAfterModelMiB': proc.memory_info().rss / 1024**2,
                            'samplingIntervalMs': 50, 'scope': 'Python process RSS; includes libraries; excludes Node'}
        source = json.loads(args.pages.read_text(encoding='utf-8'))
        labels = json.loads(args.labels.read_text(encoding='utf-8'))
        assert source['sourceSha256'] == labels['pdfSha256'], 'Labels do not belong to PDF'
        assert source['pageCount'] == len(labels['pages'])
        for page, expected in zip(source['pages'], labels['pages']):
            assert page['pageNumber'] == expected['pageNumber']
            assert expected['anchor'] in ' '.join(page['text'].split()), f'Extract mismatch on page {page["pageNumber"]}'
        parents, windows = [], []
        for page in source['pages']:
            parts = list(segments(tokenizer, page['text'], 700, 0.15))
            assert_coverage(parts, len(page['text']))
            for order, parent in enumerate(parts):
                identity = f'{source["sourceSha256"]}:{page["pageNumber"]}:{parent["start"]}:{parent["end"]}:700:0.15:{REVISION}'
                parent_id = hashlib.sha256(identity.encode()).hexdigest()
                parent.update({'id': parent_id, 'pageFrom': page['pageNumber'], 'pageTo': page['pageNumber'],
                               'pageMap': [{'pageNumber': page['pageNumber'], 'parentStart': 0,
                                            'parentEnd': len(parent['text']), 'pageStart': parent['start'], 'pageEnd': parent['end']}]})
                parents.append(parent)
                pieces = list(segments(tokenizer, parent['text'], limit, 0.15, 'passage: '))
                assert_coverage(pieces, len(parent['text']))
                for w, piece in enumerate(pieces):
                    piece.update({'id': f'{parent_id}:{w}', 'parentId': parent_id,
                                  'pageNumber': page['pageNumber'], 'pageStart': parent['start'] + piece['start'],
                                  'pageEnd': parent['start'] + piece['end'], 'vectorId': len(windows)})
                    assert piece['text'] == page['text'][piece['pageStart']:piece['pageEnd']]
                    windows.append(piece)
        # Must exercise long parents and ensure the last evidence survives the split.
        assert any(token_count(tokenizer, p['text'], 'passage: ') > limit for p in parents)
        stress = ('Tính nguyên tử giữ toàn bộ thao tác chuyển tiền trong cùng giao dịch. ' * 100
                  + 'TAIL_EVIDENCE_đúng_trang')
        stress_windows = list(segments(tokenizer, stress, limit, 0.15, 'passage: '))
        assert_coverage(stress_windows, len(stress))
        assert 'TAIL_EVIDENCE_đúng_trang' in stress_windows[-1]['text']
        passages = ['passage: ' + w['text'] for w in windows]
        lengths = [token_count(tokenizer, p) for p in passages]
        assert max(lengths) <= limit
        # Compare untruncated lengths with ST's actual tokenization at encode boundary.
        actual_lengths = model.tokenize(passages)['attention_mask'].sum(dim=1).tolist()
        assert lengths == actual_lengths, 'SentenceTransformer tokenization truncated passages'
        embed_started = time.perf_counter()
        vectors = model.encode(passages, batch_size=4, normalize_embeddings=True, convert_to_numpy=True).astype('float32')
        assert np.isfinite(vectors).all()
        assert np.allclose(np.linalg.norm(vectors, axis=1), 1, atol=1e-5)
        index = faiss.IndexIDMap2(faiss.IndexFlatIP(vectors.shape[1]))
        index.add_with_ids(vectors, np.arange(len(windows), dtype='int64'))
        args.runtime.mkdir(parents=True, exist_ok=True)
        faiss.write_index(index, str(args.runtime / 'spike.faiss'))
        index = faiss.read_index(str(args.runtime / 'spike.faiss'))
        results = []
        for query in labels['queries']:
            text = 'query: ' + query['question']
            assert token_count(tokenizer, text) <= limit
            assert model.tokenize([text])['attention_mask'].sum().item() == token_count(tokenizer, text)
            qv = model.encode([text], normalize_embeddings=True, convert_to_numpy=True).astype('float32')
            scores, ids = index.search(qv, index.ntotal)
            found, seen = [], set()
            for score, vector_id in zip(scores[0], ids[0]):
                window = windows[int(vector_id)]
                if window['parentId'] in seen:
                    continue
                seen.add(window['parentId'])
                parent = next(p for p in parents if p['id'] == window['parentId'])
                found.append({'parentId': parent['id'], 'page': window['pageNumber'], 'score': float(score),
                              'containsEvidence': query['evidence'] in parent['text']})
                if len(found) == 5:
                    break
            hit1 = found[0]['page'] == query['expectedPage'] and found[0]['containsEvidence']
            hit5 = any(f['page'] == query['expectedPage'] and f['containsEvidence'] for f in found)
            results.append({**query, 'hitAt1': hit1, 'hitAt5': hit5, 'retrieved': found})
        report['extraction'] = {'pageCount': source['pageCount'], 'pdfSha256': source['sourceSha256'],
                                'pageAnchorsPassed': True, 'extractMs': source['elapsedMs']}
        report['chunking'] = {'parentTargetTokens': 700, 'overlapRatio': 0.15, 'parentCount': len(parents),
                              'windowCount': len(windows), 'maxWindowInputTokens': max(lengths),
                              'maxParentTokens': max(p['tokens'] for p in parents),
                              'prefixSpecialTokens': token_count(tokenizer, '', 'passage: '),
                              'coveragePassed': True, 'actualModelTokenLengthsMatch': True,
                              'stressWindowCount': len(stress_windows), 'tailEvidencePreserved': True}
        report['retrieval'] = {'queries': results, 'hitAt1': sum(r['hitAt1'] for r in results) / len(results),
                               'hitAt5': sum(r['hitAt5'] for r in results) / len(results),
                               'metric': 'cosine / normalized IndexFlatIP', 'diskReloadPassed': True,
                               'indexBytes': (args.runtime / 'spike.faiss').stat().st_size,
                               'embeddingAndRetrievalSeconds': time.perf_counter() - embed_started}
        (args.runtime / 'manifest.json').write_text(json.dumps({'model': report['model'], 'parents': parents, 'windows': windows}, ensure_ascii=False, indent=2), encoding='utf-8')
        report['checks'] = {'extractPages': True, 'searchCorrectEvidence': all(r['hitAt1'] for r in results),
                            'memoryAndLoadMeasured': True, 'noEmbeddingTruncation': True,
                            'remainingDependenciesDocumented': True}
        assert report['checks']['searchCorrectEvidence'], 'Top-1 did not retrieve labeled evidence for every query'
        report['status'] = 'passed'
    finally:
        stop.set()
        watcher.join()
        report.setdefault('memory', {})['sampledPeakRssMiB'] = max(peak[0], proc.memory_info().rss) / 1024**2


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pages', type=Path, required=True)
    parser.add_argument('--labels', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--runtime', type=Path, required=True)
    args = parser.parse_args()
    report = {'status': 'running', 'platform': platform.platform(), 'python': platform.python_version(),
              'modelRequested': MODEL, 'revisionRequested': REVISION,
              'notRun': ['MySQL/Express/React production (Sprint 01+)', 'LLM API (Sprint 08)',
                         'final corpus benchmark (Sprint 11)']}
    try:
        run(args, report)
    except Exception as error:
        report['status'] = 'failed'
        report['error'] = f'{type(error).__name__}: {error}'
        traceback.print_exc()
    finally:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'status': report['status'], 'report': str(args.report)}))
    raise SystemExit(0 if report['status'] == 'passed' else 1)
