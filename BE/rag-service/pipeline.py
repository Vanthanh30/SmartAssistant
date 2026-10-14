"""Real tokenizer/ST/FAISS runtime. Artifacts are immutable; MySQL owns publication."""
import hashlib
import json
import math
import os
import re
import threading
import unicodedata
import uuid
import shutil
import time
from pathlib import Path

import faiss
import numpy as np
import torch
from sentence_transformers import SentenceTransformer


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(',', ':')).encode('utf-8')).hexdigest()


def write_json(path, value):
    with path.open('w', encoding='utf-8') as output:
        json.dump(value, output, ensure_ascii=False); output.flush(); os.fsync(output.fileno())


def segments(tokenizer, text, budget, overlap, prefix=''):
    offsets = [(a, b) for a, b in tokenizer(text, add_special_tokens=False, truncation=False,
               return_offsets_mapping=True)['offset_mapping'] if b > a]
    start = 0
    while start < len(offsets):
        end = min(len(offsets), start + budget)
        left = 0 if start == 0 else offsets[start][0]
        while end > start:
            right = len(text) if end == len(offsets) else offsets[end][0]
            # Prefer paragraph/sentence boundaries without dropping source characters.
            if end < len(offsets):
                candidates = [i for i in range(start + max(1, (end-start)//2), end)
                              if '\n\n' in text[max(left, offsets[i][0]-2):offsets[i][0]]]
                if candidates:
                    end = candidates[-1]; right = offsets[end][0]
            piece = text[left:right]
            count = len(tokenizer(prefix + piece, add_special_tokens=True,
                                  truncation=False)['input_ids'])
            if count <= budget:
                break
            end -= 1
        if end <= start:
            raise ValueError('TOKEN_BUDGET_TOO_SMALL')
        yield {'text': piece, 'start': left, 'end': right, 'tokens': count}
        if end == len(offsets):
            break
        following = max(start + 1, end - math.floor((end-start)*overlap))
        while following < end and offsets[following][0] <= left:
            following += 1
        start = following


class Pipeline:
    def __init__(self, config):
        self.config = config
        self.model = None
        self.lock = threading.RLock()

    def load(self):
        with self.lock:
            if self.model is None:
                torch.set_num_threads(4)
                self.model = SentenceTransformer(self.config['model'], revision=self.config['revision'],
                                                device='cpu', trust_remote_code=False)
            return self.model

    def contract(self):
        model = self.load()
        return {'model': self.config['model'], 'revision': self.config['revision'], 'schemaVersion': 1,
                'dimension': model.get_sentence_embedding_dimension(), 'metric': 'cosine',
                'maxTokens': model.max_seq_length}

    def chunks(self, document_id, sha256, pages):
        with self.lock:
            model = self.load(); tokenizer = model.tokenizer
            text = ''; page_map = []
            for index, page in enumerate(pages, 1):
                if page['pageNumber'] != index:
                    raise ValueError('INVALID_PAGE_SEQUENCE')
                normalized = unicodedata.normalize('NFC', page['text']).replace('\r\n', '\n').replace('\r', '\n')
                normalized = normalized.replace('\u00a0', ' ')
                left = len(text); text += normalized
                page_map.append({'page': index, 'start': left, 'end': len(text)})
                text += '\n\n' if index < len(pages) else ''
            parents = []
            for order, part in enumerate(segments(tokenizer, text, self.config['parent_tokens'], self.config['overlap'])):
                mapping = [p for p in page_map if p['start'] < part['end'] and p['end'] > part['start']]
                if not mapping:
                    continue
                chunk_id = digest([document_id, sha256, self.config['model'], self.config['revision'],
                                   self.config['parent_tokens'], self.config['overlap'], part['start'], part['end'], part['text']])
                windows = list(segments(tokenizer, part['text'], model.max_seq_length,
                                        self.config['overlap'], 'passage: '))
                parents.append({'id': chunk_id, 'order': order, 'content': part['text'],
                                'pageFrom': mapping[0]['page'], 'pageTo': mapping[-1]['page'],
                                'tokenCount': part['tokens'], 'start': part['start'], 'end': part['end'],
                                'pageMap': mapping, 'windows': windows})
            if not parents:
                raise ValueError('NO_USABLE_CHUNKS')
            return {'contract': self.contract(), 'chunks': parents}

    def embed(self, owner, course, document, chunks):
        with self.lock:
            scope = self.safe_path(self.config['vector_root'], f'{owner}/{course}/{document}/{"0" * 64}').parent
            if (scope / '.deleted').exists():
                raise ValueError('DOCUMENT_DELETED')
            model = self.load(); texts = []; ids = []; windows = []
            for chunk in chunks:
                for window in chunk['windows']:
                    value = 'passage: ' + window['text']
                    if len(model.tokenizer(value, truncation=False)['input_ids']) > model.max_seq_length:
                        raise ValueError('WINDOW_EXCEEDS_MODEL_LIMIT')
                    texts.append(value); ids.append(chunk['id'])
                    windows.append({'chunkId': chunk['id'], 'start': window['start'], 'end': window['end'],
                                    'tokens': window['tokens'], 'windowId': digest([chunk['id'], window['start'], window['end']])})
            vectors = model.encode(texts, batch_size=16, normalize_embeddings=True, convert_to_numpy=True,
                                   show_progress_bar=False).astype('float32')
            key = f'{owner}/{course}/{document}/{digest([self.contract(), texts, ids])}'
            destination = self.safe_path(self.config['vector_root'], key)
            if not destination.exists():
                destination.parent.mkdir(parents=True, exist_ok=True)
                temporary = destination.with_name(destination.name + '.' + uuid.uuid4().hex)
                temporary.mkdir()
                with (temporary / 'vectors.npy').open('wb') as output:
                    np.save(output, vectors, allow_pickle=False); output.flush(); os.fsync(output.fileno())
                checksum = hashlib.sha256((temporary / 'vectors.npy').read_bytes()).hexdigest()
                write_json(temporary / 'manifest.json', {'contract': self.contract(), 'ids': ids, 'windows': windows,
                           'owner': owner, 'course': course, 'document': document, 'sha256': checksum})
                os.replace(temporary, destination)
            manifest = json.loads((destination / 'manifest.json').read_text(encoding='utf-8'))
            if (manifest['contract'] != self.contract() or manifest['ids'] != ids or manifest['windows'] != windows
                    or manifest['owner'] != owner or manifest['course'] != course or manifest['document'] != document
                    or hashlib.sha256((destination / 'vectors.npy').read_bytes()).hexdigest() != manifest['sha256']):
                raise ValueError('VECTOR_INTEGRITY_FAILED')
            return {'vectorKey': key, 'windows': len(ids), 'contract': self.contract()}

    @staticmethod
    def safe_path(root, key):
        if not re.fullmatch(r'[1-9][0-9]*/[1-9][0-9]*(?:/[1-9][0-9]*)?/[a-f0-9]{64}', key):
            raise ValueError('INVALID_ARTIFACT_KEY')
        expected = Path(root).resolve() / key
        path = expected.resolve()
        if path != expected or not path.is_relative_to(Path(root).resolve()):
            raise ValueError('INVALID_ARTIFACT_KEY')
        return path

    def build(self, owner, course, keys):
        with self.lock:
            contract = self.contract(); arrays = []; ids = []; windows = []
            for key in sorted(set(keys)):
                if not key.startswith(f'{owner}/{course}/'):
                    raise ValueError('SCOPE_MISMATCH')
                directory = self.safe_path(self.config['vector_root'], key)
                if (directory.parent / '.deleted').exists():
                    raise ValueError('DOCUMENT_DELETED')
                manifest = json.loads((directory / 'manifest.json').read_text(encoding='utf-8'))
                if manifest['owner'] != owner or manifest['course'] != course or manifest['document'] != key.split('/')[2]:
                    raise ValueError('VECTOR_SCOPE_MISMATCH')
                if manifest['contract'] != contract:
                    raise ValueError('MODEL_CONTRACT_MISMATCH')
                vectors = np.load(directory / 'vectors.npy', allow_pickle=False)
                if hashlib.sha256((directory / 'vectors.npy').read_bytes()).hexdigest() != manifest['sha256']:
                    raise ValueError('VECTOR_INTEGRITY_FAILED')
                if (vectors.shape != (len(manifest['ids']), contract['dimension']) or not np.isfinite(vectors).all()
                        or not np.allclose(np.linalg.norm(vectors, axis=1), 1, atol=1e-4)):
                    raise ValueError('INVALID_VECTORS')
                arrays.append(vectors); ids.extend(manifest['ids']); windows.extend(manifest['windows'])
            if not arrays:
                raise ValueError('EMPTY_INDEX')
            version = digest([contract, sorted(set(keys))]); key = f'{owner}/{course}/{version}'
            destination = self.safe_path(self.config['index_root'], key)
            if not destination.exists():
                destination.parent.mkdir(parents=True, exist_ok=True)
                temporary = destination.with_name(destination.name + '.' + uuid.uuid4().hex); temporary.mkdir()
                index = faiss.IndexFlatIP(contract['dimension']); index.add(np.concatenate(arrays))
                faiss.write_index(index, str(temporary / 'index.faiss'))
                with (temporary / 'index.faiss').open('r+b') as output:
                    os.fsync(output.fileno())
                checksum = hashlib.sha256((temporary / 'index.faiss').read_bytes()).hexdigest()
                write_json(temporary / 'manifest.json', {'contract': contract, 'ids': ids, 'windows': windows,
                    'owner': owner, 'course': course, 'version': version, 'sha256': checksum})
                os.replace(temporary, destination)
            manifest = json.loads((destination / 'manifest.json').read_text(encoding='utf-8'))
            existing = faiss.read_index(str(destination / 'index.faiss'))
            if (manifest['contract'] != contract or manifest['ids'] != ids or manifest['version'] != version
                    or manifest['owner'] != owner or manifest['course'] != course
                    or existing.d != contract['dimension'] or existing.ntotal != len(ids)
                    or hashlib.sha256((destination / 'index.faiss').read_bytes()).hexdigest() != manifest['sha256']):
                raise ValueError('INDEX_INTEGRITY_FAILED')
            return {'version': version, 'manifestKey': key, **contract}

    def search(self, owner, course, key, query, limit, allowed_chunk_ids=None):
        with self.lock:
            if not key.startswith(f'{owner}/{course}/'):
                raise ValueError('SCOPE_MISMATCH')
            directory = self.safe_path(self.config['index_root'], key)
            manifest = json.loads((directory / 'manifest.json').read_text(encoding='utf-8'))
            if manifest['owner'] != owner or manifest['course'] != course or manifest['version'] != key.split('/')[-1]:
                raise ValueError('INDEX_SCOPE_MISMATCH')
            if manifest['contract'] != self.contract():
                raise ValueError('MODEL_CONTRACT_MISMATCH')
            if hashlib.sha256((directory / 'index.faiss').read_bytes()).hexdigest() != manifest['sha256']:
                raise ValueError('INDEX_INTEGRITY_FAILED')
            model = self.load(); value = 'query: ' + query
            if len(model.tokenizer(value, truncation=False)['input_ids']) > model.max_seq_length:
                raise ValueError('QUERY_EXCEEDS_MODEL_LIMIT')
            index = faiss.read_index(str(directory / 'index.faiss'))
            if index.d != self.contract()['dimension'] or index.ntotal != len(manifest['ids']):
                raise ValueError('INDEX_CONTRACT_MISMATCH')
            candidate_ids = manifest['ids']
            if allowed_chunk_ids is not None:
                if any(not re.fullmatch(r'[a-f0-9]{64}', chunk_id) for chunk_id in allowed_chunk_ids):
                    raise ValueError('INVALID_CHUNK_SCOPE')
                allowed = set(allowed_chunk_ids)
                positions_in_scope = [i for i, chunk_id in enumerate(candidate_ids) if chunk_id in allowed]
                if not positions_in_scope:
                    return {'version': manifest['version'], 'candidates': []}
                if len(positions_in_scope) > 100000:
                    raise ValueError('VECTOR_SCOPE_TOO_LARGE')
                # Search the permitted vectors BEFORE top-k; no persisted contract/index changes.
                scoped = faiss.IndexFlatIP(index.d)
                scoped.add(np.stack([index.reconstruct(i) for i in positions_in_scope]).astype('float32'))
                candidate_ids = [candidate_ids[i] for i in positions_in_scope]
                index = scoped
            vector = model.encode([value], normalize_embeddings=True, convert_to_numpy=True).astype('float32')
            scores, positions = index.search(vector, min(index.ntotal, limit * 8))
            results = []; seen = set()
            for score, position in zip(scores[0], positions[0]):
                if position < 0:
                    continue
                chunk_id = candidate_ids[int(position)]
                if chunk_id not in seen:
                    seen.add(chunk_id); results.append({'chunkId': chunk_id, 'score': float(score)})
                if len(results) == limit:
                    break
            return {'version': manifest['version'], 'candidates': results}

    def purge(self, owner, course, document, keep_index_key):
        with self.lock:
            scope = self.safe_path(self.config['vector_root'], f'{owner}/{course}/{document}/{"0" * 64}').parent
            scope.mkdir(parents=True, exist_ok=True)
            # Durable tombstone rejects delayed HTTP embedding/build after Node cancellation.
            write_json(scope / '.deleted', {'document': document})
            for child in scope.iterdir():
                if child.name == '.deleted':
                    continue
                if not re.fullmatch(r'[a-f0-9]{64}(?:\.[a-f0-9]{32})?', child.name):
                    continue
                if child.is_symlink() or child.resolve().parent != scope:
                    raise ValueError('UNSAFE_STORAGE_PATH')
                if child.is_dir():
                    shutil.rmtree(child)
                else:
                    child.unlink()
            index_scope = self.safe_path(self.config['index_root'], f'{owner}/{course}/{"0" * 64}').parent
            if keep_index_key is not None:
                if not keep_index_key.startswith(f'{owner}/{course}/'):
                    raise ValueError('SCOPE_MISMATCH')
                keep = self.safe_path(self.config['index_root'], keep_index_key)
                if not (keep / 'manifest.json').is_file():
                    raise ValueError('ACTIVE_INDEX_MISSING')
            else:
                keep = None
            if index_scope.exists():
                for child in index_scope.iterdir():
                    if child == keep:
                        continue
                    if not re.fullmatch(r'[a-f0-9]{64}(?:\.[a-f0-9]{32})?', child.name):
                        continue
                    if child.is_symlink() or child.resolve().parent != index_scope:
                        raise ValueError('UNSAFE_STORAGE_PATH')
                    if child.is_dir():
                        shutil.rmtree(child)
                    else:
                        child.unlink()
            return {'success': True}

    def reconcile(self, owner, course, keep_indexes, keep_vectors, busy_documents, grace_seconds):
        with self.lock:
            cutoff = time.time() - grace_seconds; removed = 0
            index_scope = self.safe_path(self.config['index_root'], f'{owner}/{course}/{"0" * 64}').parent
            vector_scope = self.safe_path(self.config['vector_root'], f'{owner}/{course}/1/{"0" * 64}').parent.parent
            keep_paths = {self.safe_path(self.config['index_root'], key) for key in keep_indexes}
            vector_paths = {self.safe_path(self.config['vector_root'], key) for key in keep_vectors}
            if any(not key.startswith(f'{owner}/{course}/') for key in keep_indexes + keep_vectors):
                raise ValueError('SCOPE_MISMATCH')
            missing_references = sum(not (path / 'manifest.json').is_file() or not (path / 'index.faiss').is_file() for path in keep_paths)
            missing_references += sum(not (path / 'manifest.json').is_file() or not (path / 'vectors.npy').is_file() for path in vector_paths)
            candidates = list(index_scope.iterdir()) if index_scope.exists() else []
            if vector_scope.exists():
                for doc in vector_scope.iterdir():
                    if not doc.name.isdigit() or doc.name in busy_documents or doc.is_symlink():
                        continue
                    if doc.resolve().parent != vector_scope:
                        raise ValueError('UNSAFE_STORAGE_PATH')
                    if doc.is_dir():
                        candidates.extend(child for child in doc.iterdir() if child.name != '.deleted')
            for child in candidates:
                if not re.fullmatch(r'[a-f0-9]{64}(?:\.[a-f0-9]{32})?', child.name):
                    continue
                if child in keep_paths or child in vector_paths or child.stat().st_mtime >= cutoff:
                    continue
                if child.is_symlink() or not (child.resolve().is_relative_to(index_scope) or child.resolve().is_relative_to(vector_scope)):
                    raise ValueError('UNSAFE_STORAGE_PATH')
                if child.is_dir():
                    shutil.rmtree(child)
                else:
                    child.unlink()
                removed += 1
            return {'success': True, 'removed': removed, 'missingReferences': missing_references}
