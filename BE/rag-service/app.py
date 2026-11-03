import hmac
import logging
import traceback
from contextlib import asynccontextmanager
from pathlib import Path
from tempfile import TemporaryFile
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from config import settings
from pydantic import BaseModel, Field, ConfigDict
from pipeline import Pipeline


class Payload(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Page(Payload):
    pageNumber: int = Field(ge=1, le=10000)
    text: str = Field(max_length=5000000)


class ChunkRequest(Payload):
    documentId: str = Field(pattern=r'^[1-9][0-9]*$')
    sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    pages: list[Page] = Field(min_length=1, max_length=10000)


class Scope(Payload):
    owner: str = Field(pattern=r'^[1-9][0-9]*$')
    course: str = Field(pattern=r'^[1-9][0-9]*$')


class EmbeddingWindow(Payload):
    text: str = Field(min_length=1, max_length=100000)
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    tokens: int = Field(gt=0)


class EmbeddingChunk(Payload):
    id: str = Field(pattern=r'^(?:[a-f0-9]{64}|[1-9][0-9]{0,19})$')
    windows: list[EmbeddingWindow] = Field(min_length=1, max_length=1000)


class EmbedRequest(Scope):
    document: str = Field(pattern=r'^[1-9][0-9]*$')
    chunks: list[EmbeddingChunk] = Field(min_length=1, max_length=50000)


class BuildRequest(Scope):
    keys: list[str] = Field(min_length=1, max_length=1000)


class SearchRequest(Scope):
    key: str = Field(max_length=200)
    query: str = Field(min_length=1, max_length=10000)
    limit: int = Field(default=5, ge=1, le=20)
    allowedChunkIds: list[str] | None = Field(default=None, max_length=50000,
        description='Optional DB-verified chunk scope, filtered before FAISS ranking. IDs are legacy 64-hex or ERD15 unsigned BIGINT strings. Maximum 100000 selected vector windows; over limit returns 422, no silent truncation. Persisted index contract unchanged.')


class PurgeRequest(Scope):
    document: str = Field(pattern=r'^[1-9][0-9]*$')
    keepIndexKey: str | None = Field(default=None, max_length=200)


class SearchBatchRequest(Scope):
    key: str = Field(max_length=200)
    queries: list[str] = Field(min_length=1, max_length=8)
    limit: int = Field(default=5, ge=1, le=20)
    allowedChunkIds: list[str] | None = Field(default=None, max_length=50000)


class ReconcileRequest(Scope):
    keepIndexKeys: list[str] = Field(max_length=1000)
    keepVectorKeys: list[str] = Field(max_length=10000)
    busyDocuments: list[str] = Field(max_length=10000)
    graceSeconds: int = Field(default=86400, ge=3600)


class ModelContract(Payload):
    model: str
    revision: str
    schemaVersion: int
    dimension: int
    metric: str
    maxTokens: int


class PageOffset(Payload):
    page: int
    start: int
    end: int


class ParentChunk(EmbeddingChunk):
    order: int
    content: str
    pageFrom: int
    pageTo: int
    tokenCount: int
    start: int
    end: int
    pageMap: list[PageOffset]


class ChunkResult(Payload):
    contract: ModelContract
    chunks: list[ParentChunk]


class EmbedResult(Payload):
    vectorKey: str
    windows: int
    contract: ModelContract


class IndexPosition(Payload):
    chunkId: str
    position: int = Field(ge=0)


class BuildResult(ModelContract):
    version: str
    manifestKey: str
    positions: list[IndexPosition]


class Candidate(Payload):
    chunkId: str
    score: float = Field(allow_inf_nan=False)


class SearchResult(Payload):
    version: str
    candidates: list[Candidate]
    timings: dict[str, float] | None = None


class PurgeResult(Payload):
    success: bool


class SearchBatchResult(Payload):
    version: str
    rankings: list[list[Candidate]]
    timings: dict[str, float]


class ReconcileResult(PurgeResult):
    removed: int = Field(ge=0)
    missingReferences: int = Field(ge=0)


def check_dependencies(config):
    # Real imports and tiny vector round trip, not a model/pipeline readiness claim.
    import numpy as np
    import faiss
    import sentence_transformers  # noqa: F401
    for directory in (config['index_root'], config['vector_root']):
        Path(directory).mkdir(parents=True, exist_ok=True)
        with TemporaryFile(dir=directory) as file:
            file.write(b'readiness'); file.flush()
    index = faiss.IndexFlatIP(2)
    index.add(np.array([[1.0, 0.0]], dtype='float32'))
    _, ids = index.search(np.array([[1.0, 0.0]], dtype='float32'), 1)
    if int(ids[0][0]) != 0:
        raise RuntimeError('FAISS dependency check failed')


def create_app(config=None):
    config = settings() if config is None else config
    pipeline = Pipeline(config)

    @asynccontextmanager
    async def lifespan(app):
        check_dependencies(config)
        # Readiness includes the real model, not only import/storage checks.
        pipeline.contract()
        yield

    app = FastAPI(title='Internal RAG source pipeline', docs_url=None,
                  redoc_url=None, openapi_url=None, lifespan=lifespan)

    @app.middleware('http')
    async def authenticate(request: Request, call_next):
        if not hmac.compare_digest(request.headers.get('x-service-token', '').encode('utf-8'), config['token'].encode('utf-8')):
            return JSONResponse({'error': 'UNAUTHORIZED'}, status_code=401)
        length = request.headers.get('content-length', '0')
        if not length.isdigit() or int(length) > 32 * 1024 ** 2:
            return JSONResponse({'error': 'PAYLOAD_TOO_LARGE'}, status_code=413)
        # Limit actual streamed body too, including chunked requests.
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 32 * 1024 ** 2:
                return JSONResponse({'error': 'PAYLOAD_TOO_LARGE'}, status_code=413)
        request._body = bytes(body)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.get('/health/live')
    def live():
        return {'status': 'ok', 'service': 'rag'}

    @app.get('/health/ready')
    def ready():
        try:
            check_dependencies(config)
        except Exception:
            return JSONResponse({'error': 'DEPENDENCIES_NOT_READY'}, status_code=503)
        if pipeline.model is None:
            return JSONResponse({'error': 'MODEL_NOT_READY'}, status_code=503)
        return {'status': 'ok', 'scope': 'runtime-dependencies-storage',
                'modelLoaded': pipeline.model is not None, 'pipelineImplemented': True}

    @app.exception_handler(ValueError)
    async def invalid_input(request, error):
        logging.error('RAG input failure path=%s type=%s frames=%s', request.url.path,
                      type(error).__name__, ''.join(traceback.format_tb(error.__traceback__)))
        return JSONResponse({'error': 'INVALID_PIPELINE_INPUT'}, status_code=422)

    @app.exception_handler(Exception)
    async def dependency_error(request, error):
        logging.error('RAG dependency failure path=%s type=%s frames=%s', request.url.path,
                      type(error).__name__, ''.join(traceback.format_tb(error.__traceback__)))
        memory_error = isinstance(error, MemoryError) or isinstance(error, OSError) and (
            getattr(error, 'winerror', None) == 1455 or 'paging file is too small' in str(error).lower())
        return JSONResponse({'error': 'RAG_MEMORY_LIMIT' if memory_error else 'RAG_DEPENDENCY_FAILED'}, status_code=503)

    @app.post('/chunks', response_model=ChunkResult)
    def chunks(body: ChunkRequest):
        if sum(len(page.text) for page in body.pages) > 5000000:
            raise ValueError('TEXT_LIMIT')
        return pipeline.chunks(body.documentId, body.sha256, [page.model_dump() for page in body.pages])

    @app.post('/embed', response_model=EmbedResult)
    def embed(body: EmbedRequest):
        return pipeline.embed(body.owner, body.course, body.document, [chunk.model_dump() for chunk in body.chunks])

    @app.post('/indexes/build', response_model=BuildResult)
    def build(body: BuildRequest):
        return pipeline.build(body.owner, body.course, body.keys)

    @app.post('/indexes/search', response_model=SearchResult)
    def search(body: SearchRequest):
        result = pipeline.search_many(body.owner, body.course, body.key, [body.query], body.limit, body.allowedChunkIds)
        return {'version': result['version'], 'candidates': result['rankings'][0], 'timings': result['timings']}

    @app.post('/indexes/search-batch', response_model=SearchBatchResult)
    def search_batch(body: SearchBatchRequest):
        if any(not query.strip() or len(query) > 10000 for query in body.queries):
            raise ValueError('INVALID_QUERY_BATCH')
        return pipeline.search_many(body.owner, body.course, body.key, body.queries, body.limit, body.allowedChunkIds)

    @app.post('/documents/purge', response_model=PurgeResult)
    def purge(body: PurgeRequest):
        return pipeline.purge(body.owner, body.course, body.document, body.keepIndexKey)

    @app.post('/storage/reconcile', response_model=ReconcileResult)
    def reconcile(body: ReconcileRequest):
        return pipeline.reconcile(body.owner, body.course, body.keepIndexKeys, body.keepVectorKeys,
                                  body.busyDocuments, body.graceSeconds)

    return app
