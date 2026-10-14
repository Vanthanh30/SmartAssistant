import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / '.env')


def settings(env=None):
    env = os.environ if env is None else env
    token = env.get('RAG_SERVICE_TOKEN', '')
    if len(token) < 32 or token.startswith('replace_'):
        raise ValueError('Invalid env: RAG_SERVICE_TOKEN (random secret >=32 chars required)')
    host = env.get('HOST', '127.0.0.1')
    if host != '127.0.0.1':
        raise ValueError('Invalid env: HOST (local service must bind 127.0.0.1)')
    try:
        port = int(env.get('RAG_PORT', env.get('PORT', '8001')))
        if not 1 <= port <= 65535:
            raise ValueError()
    except ValueError:
        raise ValueError('Invalid env: RAG_PORT/PORT') from None
    revision = env.get('EMBEDDING_REVISION', 'd128750597153bb5987e10b1c3493a34e5a4502a')
    if len(revision) != 40 or any(c not in '0123456789abcdef' for c in revision):
        raise ValueError('Invalid env: EMBEDDING_REVISION (pinned commit required)')
    parent_tokens = int(env.get('RAG_PARENT_CHUNK_TOKENS', '700'))
    overlap = float(env.get('RAG_CHUNK_OVERLAP', '0.15'))
    if not 100 <= parent_tokens <= 1000 or not 0.1 <= overlap <= 0.2:
        raise ValueError('Invalid chunk configuration')
    return {'host': host, 'port': port, 'token': token, 'revision': revision,
            'parent_tokens': parent_tokens, 'overlap': overlap,
            'model': env.get('EMBEDDING_MODEL', 'intfloat/multilingual-e5-base'),
            'index_root': (ROOT / env.get('INDEX_ROOT', '../storage/indexes')).resolve(),
            'vector_root': (ROOT / env.get('VECTOR_ROOT', '../storage/vectors')).resolve()}
