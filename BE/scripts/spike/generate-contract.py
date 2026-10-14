"""Generate contract; implementation status distinguishes runtime from planned endpoints."""
from pathlib import Path
import yaml
from copy import deepcopy


def ref(name):
    return {'$ref': f'#/components/schemas/{name}'}


def obj(properties, required=()):
    result = {'type': 'object', 'properties': properties, 'additionalProperties': False}
    if required:
        result['required'] = list(required)
    return result


def string(**kwargs):
    return {'type': 'string', **kwargs}


def array(item):
    return {'type': 'array', 'items': item}


schemas = {
    'Id': string(pattern=r'^[1-9][0-9]*$', description='MySQL BIGINT serialized as string'),
    'RequestId': string(format='uuid'),
    'User': obj({'id': ref('Id'), 'fullName': string(), 'email': string(format='email'),
                 'role': string(enum=['student', 'admin']), 'status': string(enum=['active', 'blocked']),
                 'avatarUrl': string(nullable=True)}, ['id', 'fullName', 'email', 'role', 'status']),
    'AdminUser': obj({'id': ref('Id'), 'fullName': string(), 'email': string(format='email'), 'role': string(enum=['student','admin']), 'status': string(enum=['active','blocked']), 'createdAt': string(format='date-time'), 'updatedAt': string(format='date-time')}, ['id','fullName','email','role','status','createdAt','updatedAt']),
    'AuthData': obj({'user': ref('User'), 'csrfToken': string()}, ['user', 'csrfToken']),
    'Register': obj({'fullName': string(minLength=2, maxLength=100), 'email': string(format='email', maxLength=254),
                     'password': string(format='password', description='8–72 UTF-8 bytes; no trim/normalization'),
                     'confirmPassword': string(format='password')}, ['fullName', 'email', 'password', 'confirmPassword']),
    'Login': obj({'email': string(format='email', maxLength=254), 'password': string(format='password')}, ['email', 'password']),
    'ProfileUpdate': obj({'fullName': string(minLength=2, maxLength=100)}, ['fullName']),
    'CourseInput': obj({'name': string(minLength=1, maxLength=150), 'description': string(maxLength=2000)}, ['name']),
    'CoursePatch': {**obj({'name': string(minLength=1, maxLength=150), 'description': string(maxLength=2000)}), 'minProperties': 1},
    'Course': obj({'id': ref('Id'), 'name': string(), 'description': string(),
                   'createdAt': string(format='date-time'), 'updatedAt': string(format='date-time'),
                   'readyDocumentCount': {'type': 'integer', 'minimum': 0, 'description': 'Count of own non-deleted ready documents from MySQL'}}, ['id', 'name', 'description', 'createdAt', 'updatedAt', 'readyDocumentCount']),
    'DocumentStatus': string(enum=['queued', 'extracting', 'chunking', 'embedding', 'indexing', 'ready', 'failed', 'unsupported', 'deleting', 'deleted']),
    'Document': obj({'id': ref('Id'), 'courseId': ref('Id'), 'fileName': string(), 'status': ref('DocumentStatus'),
                     'sizeBytes': {'type': 'integer', 'minimum': 0}, 'pageCount': {'type': 'integer', 'minimum': 1, 'nullable': True},
                     'errorCode': string(nullable=True), 'errorMessage': string(nullable=True),
                     'deletionRetryable': {'type': 'boolean', 'description': 'Deletion stopped after bounded retries; repeat DELETE explicitly to resume'},
                     'extractionCompleted': {'type': 'boolean', 'description': 'Extraction job complete; not index-ready. Ready only after ST/FAISS immutable index publication and MySQL commit.'},
                     'updatedAt': string(format='date-time'),
                     'createdAt': string(format='date-time')}, ['id', 'courseId', 'fileName', 'status', 'sizeBytes', 'pageCount', 'deletionRetryable', 'extractionCompleted', 'errorCode', 'errorMessage', 'createdAt', 'updatedAt']),
    'Chunk': obj({'chunkId': string(), 'documentId': ref('Id'), 'content': string(), 'pageFrom': {'type': 'integer', 'minimum': 1},
                  'pageTo': {'type': 'integer', 'minimum': 1}}, ['chunkId', 'documentId', 'content', 'pageFrom', 'pageTo']),
    'Citation': obj({'chunkId': string(nullable=True), 'documentId': string(nullable=True), 'fileName': string(),
                     'pageFrom': {'type': 'integer', 'minimum': 1}, 'pageTo': {'type': 'integer', 'minimum': 1},
                     'excerpt': string(), 'sourceDeleted': {'type': 'boolean'}}, ['chunkId', 'documentId', 'fileName', 'pageFrom', 'pageTo', 'excerpt', 'sourceDeleted']),
    'Question': obj({'question': string(minLength=1, maxLength=1000), 'requestId': ref('RequestId'),
                     'documentIds': {**array(ref('Id')), 'minItems': 1, 'maxItems': 50, 'uniqueItems': True},
                     'answerMode': string(enum=['documents','auto','general'], default='auto', description='documents forbids general fallback; selected PDFs or explicit PDF questions always require document sources. auto preserves legacy policy. general is labelled as not based on documents.')}, ['question', 'requestId']),
    'Answer': obj({'answer': string(), 'status': string(enum=['answered', 'insufficient_context']),
                   'messageId': ref('Id'), 'citations': array(ref('Citation'))}, ['answer', 'status', 'messageId', 'citations']),
    'Message': obj({'id': ref('Id'), 'role': string(enum=['user', 'assistant']), 'content': string(),
                    'status': string(enum=['processing', 'answered', 'insufficient_context', 'failed'], nullable=True),
                    'citations': array(ref('Citation')), 'requestId': ref('RequestId'), 'errorCode': string(nullable=True), 'createdAt': string(format='date-time')}, ['id', 'role', 'content']),
    'Conversation': obj({'id': ref('Id'), 'courseId': ref('Id'), 'title': string(), 'courseName': string(), 'messageCount': {'type': 'integer', 'minimum': 0},
                         'createdAt': string(format='date-time'), 'updatedAt': string(format='date-time')}, ['id', 'courseId', 'title']),
    'ConversationDetail': obj({'conversation': ref('Conversation'), 'messages': array(ref('Message')), 'hasOlderMessages': {'type': 'boolean'}, 'nextBeforeMessageId': string(nullable=True, description='Before cursor for older messages, null at oldest page')}, ['conversation', 'messages', 'hasOlderMessages', 'nextBeforeMessageId']),
    'ConversationInput': obj({'title': string(minLength=1, maxLength=150)}),
    'StatusInput': obj({'status': string(enum=['active', 'blocked'])}, ['status']),
    'AcceptedDocument': obj({'documentId': ref('Id'), 'status': ref('DocumentStatus')}, ['documentId', 'status']),
    'Acknowledgement': obj({'success': {'type': 'boolean'}}, ['success']),
    'Health': obj({'status': string(enum=['ok', 'not_ready'])}, ['status']),
    'Pagination': obj({'page': {'type': 'integer', 'minimum': 1}, 'pageSize': {'type': 'integer', 'minimum': 1, 'maximum': 100},
                       'total': {'type': 'integer', 'minimum': 0}}, ['page', 'pageSize', 'total']),
    'Error': obj({'error': obj({'code': string(), 'message': string(), 'details': {'type': 'object', 'additionalProperties': True}}, ['code', 'message']),
                  'requestId': ref('RequestId')}, ['error', 'requestId']),
    'PdfUpload': obj({'file': string(format='binary', description='Actual PDF <=20 MiB; text layer required, no OCR')}, ['file']),
    'AvatarUpload': obj({'file': string(format='binary', description='JPEG/PNG/WebP <=2 MiB; decoded and re-encoded')}, ['file']),
}
schemas['AdminDocument'] = obj({**schemas['Document']['properties'], 'uploadedBy': ref('User'), 'courseName': string()}, schemas['Document']['required'] + ['uploadedBy','courseName'])
schemas['AdminDocumentCourse'] = obj({'id': ref('Id'), 'name': string(), 'userId': ref('Id'), 'ownerName': string()}, ['id','name','userId','ownerName'])
schemas['LearningInput'] = obj({'requestId': ref('RequestId'), 'kind': string(enum=['quiz','flashcards']), 'title': string(minLength=1,maxLength=150),
    'count': {'type':'integer','minimum':1,'maximum':10}, 'documentIds': {**array(ref('Id')), 'minItems':1,'maxItems':10,'uniqueItems':True}}, ['requestId','kind','title','count','documentIds'])
schemas['LearningSet'] = obj({'id':ref('Id'),'courseId':ref('Id'),'kind':string(enum=['quiz','flashcards']),'title':string(),'model':string(),
    'sourceCount':{'type':'integer','minimum':1},'itemCount':{'type':'integer','minimum':1,'maximum':10},'createdAt':string(format='date-time')},
    ['id','courseId','kind','title','model','sourceCount','itemCount','createdAt'])
schemas['LearningItem'] = obj({'id':ref('Id'),'position':{'type':'integer','minimum':1},'prompt':string(),'answer':string(description='Flashcards only'),
    'choices':{**array(string()),'minItems':4,'maxItems':4},'correctIndex':{'type':'integer','minimum':0,'maximum':3,'description':'Completed quiz review only'},
    'explanation':string(description='Completed quiz review only'),'citations':array(ref('Citation'))},['id','position','prompt','citations'])
# Learning citations use source snapshots without retrieval similarity scores.
schemas['LearningCitation'] = obj({k:v for k,v in schemas['Citation']['properties'].items() if k != 'score'}, [k for k in schemas['Citation'].get('required',[]) if k != 'score'])
schemas['LearningItem']['properties']['citations'] = array(ref('LearningCitation'))
schemas['LearningDetail'] = obj({**schemas['LearningSet']['properties'],'items':array(ref('LearningItem'))},schemas['LearningSet']['required']+['items'])
schemas['LearningAnswer'] = obj({'itemId':ref('Id'),'choice':{'type':'integer','minimum':0,'maximum':3,'nullable':True}},['itemId','choice'])
schemas['LearningSubmission'] = obj({'answers':{**array(ref('LearningAnswer')),'minItems':1,'maxItems':10}},['answers'])
schemas['LearningStart'] = obj({'requestId':ref('RequestId')},['requestId'])
schemas['LearningAttemptSummary'] = obj({'id':ref('Id'),'score':{'type':'number','minimum':0,'maximum':100,'nullable':True},
    'correctCount':{'type':'integer','minimum':0,'nullable':True},'totalQuestions':{'type':'integer','minimum':1,'maximum':10},
    'startedAt':string(format='date-time'),'completedAt':string(format='date-time',nullable=True)},['id','score','correctCount','totalQuestions','startedAt','completedAt'])
schemas['LearningAttempt'] = obj({**schemas['LearningAttemptSummary']['properties'],'setId':ref('Id'),'set':ref('LearningDetail'),
    'answers':array(obj({**schemas['LearningAnswer']['properties'],'correct':{'type':'boolean'}},['itemId','choice','correct']))},schemas['LearningAttemptSummary']['required']+['setId','set','answers'])
schemas['LearningAttemptList'] = array(ref('LearningAttemptSummary'))
schemas['LearningDeleted'] = obj({'deleted':{'type':'boolean'}},['deleted'])
schemas['User']['properties'].update({'avatarStorageStatus':string(enum=['queued','uploading','uploaded','failed','deleting','deleted'],nullable=True)})
schemas['Document']['properties'].update({'storageProvider':string(enum=['local','cloudinary']),'cloudStorageStatus':string(enum=['queued','uploading','uploaded','failed','deleting','deleted'],nullable=True)})
schemas['AdminDocument']['properties'].update({key:schemas['Document']['properties'][key] for key in ['storageProvider','cloudStorageStatus']})
paths = {}
errors = {400: 'Yêu cầu sai', 401: 'Chưa đăng nhập hoặc phiên hết hạn', 403: 'Không đủ quyền / tài khoản bị khóa',
          404: 'Không tồn tại hoặc không thuộc quyền', 409: 'Trạng thái xung đột', 413: 'File quá lớn',
          422: 'Validation không hợp lệ', 429: 'Rate limit hoặc quota', 502: 'Dependency lỗi',
          503: 'Dependency chưa sẵn sàng', 504: 'Dependency timeout'}


def param(name, location='query', schema=None, required=False):
    return {'name': name, 'in': location, 'required': required, 'schema': schema or string()}


def operation(path, method, operation_id, summary, response, status=200, body=None, public=False, paginated=False, multipart=False, description=''):
    data = array(ref(response)) if paginated else ref(response)
    envelope = obj({'data': data, 'requestId': ref('RequestId'), **({'meta': ref('Pagination')} if paginated else {})},
                   ['data', 'requestId'] + (['meta'] if paginated else []))
    params = []
    import re
    for name in re.findall(r'\{(\w+)\}', path):
        params.append(param(name, 'path', string() if name == 'chunkId' else ref('Id'), True))
    if paginated:
        params.extend([param('page', schema={'type': 'integer', 'minimum': 1, 'default': 1}),
                       param('pageSize', schema={'type': 'integer', 'minimum': 1, 'maximum': 100, 'default': 20})])
    if method in ['post', 'patch', 'delete'] and not public:
        params.append(param('X-CSRF-Token', 'header', string(), True))
    op = {'operationId': operation_id, 'summary': summary, 'description': description or
          ('Admin API riêng; kiểm tra phiên active và role admin.' if path.startswith('/admin') else
           'Student API: kiểm tra phiên active, role student và ownership trước truy cập.' if not public and not path.startswith('/auth') else summary),
          'tags': [path.split('/')[1]], 'security': [] if public else [{'sessionCookie': []}],
          'x-implementation-status': 'implemented' if operation_id in ['register', 'login', 'logout', 'me', 'liveness', 'readiness', 'getProfile', 'updateProfile', 'uploadAvatar', 'getAvatar', 'listCourses', 'createCourse', 'getCourse', 'updateCourse', 'listDocuments', 'uploadPdf', 'getDocument', 'getPdfContent', 'deleteDocument', 'getChunk', 'createConversation', 'getConversation', 'askQuestion', 'listConversations', 'listHistory', 'deleteConversation', 'listAdminUsers', 'getAdminUser', 'setUserStatus', 'listAdminDocuments', 'getAdminDocument', 'deleteAdminDocument', 'getAdminPdfContent', 'listAdminDocumentCourses'] else 'planned',
          'responses': {str(status): {'description': 'Thành công', 'content': {'application/json': {'schema': envelope}}}}}
    if operation_id in ['listDocuments', 'uploadPdf', 'getDocument', 'getPdfContent', 'deleteDocument', 'getChunk', 'createConversation', 'getConversation', 'askQuestion', 'listConversations', 'listHistory', 'deleteConversation', 'listAdminUsers', 'getAdminUser', 'setUserStatus', 'listAdminDocuments', 'getAdminDocument', 'deleteAdminDocument', 'getAdminPdfContent', 'listAdminDocumentCourses']:
        op['x-runtime-verification'] = 'NOT RUN by user request; implemented code only'
    if params:
        op['parameters'] = params
    if body:
        op['requestBody'] = {'required': True, 'content': {'multipart/form-data' if multipart else 'application/json': {'schema': ref(body)}}}
    codes = [400, 422, 429, 503] if public else [400, 401, 403, 404, 409, 422, 429, 503]
    if multipart:
        codes += [413]
    if operation_id == 'askQuestion':
        codes += [502, 504]
    for code in codes:
        op['responses'][str(code)] = {'$ref': f'#/components/responses/Error{code}'}
    if operation_id in ['register', 'login']:
        op['responses'][str(status)]['headers'] = {'Set-Cookie': {'description': 'Opaque session cookie; HttpOnly; SameSite=Lax; Secure on HTTPS', 'schema': string()}}
        for code in [401, 403, 409]:
            op['responses'][str(code)] = {'$ref': f'#/components/responses/Error{code}'}
    paths.setdefault(path, {})[method] = op
    return op


operation('/auth/register', 'post', 'register', 'Đăng ký student', 'AuthData', 201, 'Register', public=True)
operation('/auth/login', 'post', 'login', 'Đăng nhập', 'AuthData', body='Login', public=True,
          description='Kiểm tra Origin/rate limit; sai thông tin 401, blocked 403; không nhận CSRF của phiên chưa tạo.')
operation('/auth/logout', 'post', 'logout', 'Thu hồi phiên', 'Acknowledgement')
operation('/auth/me', 'get', 'me', 'Phiên hiện tại và CSRF token', 'AuthData')
operation('/users/me', 'get', 'getProfile', 'Hồ sơ cá nhân', 'User')
operation('/users/me', 'patch', 'updateProfile', 'Cập nhật họ tên', 'User', body='ProfileUpdate')
operation('/users/me/avatar', 'post', 'uploadAvatar', 'Cập nhật avatar', 'User', body='AvatarUpload', multipart=True)
avatar_op = operation('/users/me/avatar', 'get', 'getAvatar', 'Ảnh riêng tư của chính tài khoản', 'User',
                      description='Student active only; no userId parameter; reads own private normalized WebP. Cache-Control=no-store. Original filename/storage key never exposed. JPEG/PNG/WebP input <=2 MiB, max16 megapixels, no animated files; upload rate20/15min/user.')
avatar_op['responses']['200'] = {'description': 'Ảnh đã bỏ metadata, xác thực mỗi request', 'headers': {'Cache-Control': {'schema': string(enum=['no-store'])}},
                               'content': {'image/webp': {'schema': string(format='binary')}}}
op = operation('/courses', 'get', 'listCourses', 'Tìm môn học cá nhân', 'Course', paginated=True)
op['parameters'].append(param('q', schema=string(maxLength=150, description='Literal case/accent-insensitive name search, personal ownership only; percent/underscore escaped')))
operation('/courses', 'post', 'createCourse', 'Tạo môn học', 'Course', 201, 'CourseInput')
operation('/courses/{courseId}', 'get', 'getCourse', 'Xem môn học', 'Course')
operation('/courses/{courseId}', 'patch', 'updateCourse', 'Sửa môn học', 'Course', body='CoursePatch')
doc_list = operation('/courses/{courseId}/documents', 'get', 'listDocuments', 'Liệt kê tài liệu', 'Document', paginated=True, description='Own course only; metadata never includes storage keys or raw text. Pagination includes configured upload limits; poll queued/extracting/chunking/embedding/indexing until ready or terminal error.')
doc_meta = obj({'page': {'type': 'integer', 'minimum': 1}, 'pageSize': {'type': 'integer', 'minimum': 1, 'maximum': 100}, 'total': {'type': 'integer', 'minimum': 0},
                'limits': obj({name: {'type': 'integer', 'minimum': 1} for name in ['maxFileBytes','maxDocumentsPerCourse','maxCourseBytes','maxUserBytes']}, ['maxFileBytes','maxDocumentsPerCourse','maxCourseBytes','maxUserBytes'])}, ['page','pageSize','total','limits'])
doc_list['responses']['200']['content']['application/json']['schema']['properties']['meta'] = doc_meta
operation('/courses/{courseId}/documents', 'post', 'uploadPdf', 'Upload và ghi job', 'AcceptedDocument', 202, 'PdfUpload', multipart=True, description='202 after private file + document + durable extract_pdf job persisted. Extension/MIME/header validation before acceptance; full pdf.js structural validation is asynchronous. Default20MiB file,50 documents/course,500MiB/course,1024MiB/user; owner-lock quota concurrency; upload10/15min/user. No OCR. Extraction chains durable prepare_source job; ready only after index publish.')
operation('/documents/{documentId}', 'get', 'getDocument', 'Metadata và trạng thái', 'Document')
op = operation('/documents/{documentId}/content', 'get', 'getPdfContent', 'PDF private có xác thực', 'Document', description='Own active student session checked before file/Range access including HEAD. Only structurally valid, text-extracted PDF is viewable; pending/failed/unsupported409; deleting/deleted404. No static/public URL. Cache-Control=no-store. Single bytes range incl suffix/open-end; multiple/unsatisfiable416. Stream from private disk.')
op['parameters'].append(param('Range', 'header', string(description='Single bytes range')))
op['responses']['200'] = {'description': 'PDF đầy đủ', 'headers': {'Cache-Control': {'schema': string(enum=['no-store'])}, 'Accept-Ranges': {'schema': string(enum=['bytes'])}}, 'content': {'application/pdf': {'schema': string(format='binary')}}}
op['responses']['206'] = {'description': 'PDF range; kiểm tra quyền trước trả bytes',
                         'headers': {'Content-Range': {'schema': string()}, 'Accept-Ranges': {'schema': string(enum=['bytes'])}},
                         'content': {'application/pdf': {'schema': string(format='binary')}}}
op['responses']['416'] = {'description': 'Range không hợp lệ', 'headers': {'Content-Range': {'schema': string()}},
                         'content': {'application/json': {'schema': ref('Error')}}}
operation('/documents/{documentId}', 'delete', 'deleteDocument', 'Bắt đầu cleanup bền vững', 'AcceptedDocument', 202, description='Own active student; Origin/CSRF required. Transaction marks deleting, cancels source/extraction claims and queues delete_pdf. Repeat request idempotent; exhausted cleanup may be retried by repeating DELETE. 202 is accepted, not cleanup completed. Own metadata remains readable through deleting/deleted for polling; content/HEAD/Range return404 immediately; list omits completed deleted records.')
operation('/documents/{documentId}/chunks/{chunkId}', 'get', 'getChunk', 'Đọc nguồn đã kiểm tra scope', 'Chunk')
for path, name in [('/conversations', 'listHistory'), ('/courses/{courseId}/conversations', 'listConversations')]:
    history_op = operation(path, 'get', name, 'Lịch sử hội thoại của owner', 'Conversation', paginated=True, description='Owner scoped, newest updated_at/id first. Page/pageSize (default20,max100); optional literal title q (max150). Global list optionally filters own courseId; foreign/missing course404. No LLM/RAG calls.')
    history_op['parameters'].append(param('q', schema=string(maxLength=150)))
    if path == '/conversations':
        history_op['parameters'].append(param('courseId', schema=ref('Id')))
operation('/courses/{courseId}/conversations', 'post', 'createConversation', 'Tạo hội thoại', 'Conversation', 201, 'ConversationInput')
detail_op = operation('/conversations/{conversationId}', 'get', 'getConversation', 'Xem hội thoại và citation snapshot', 'ConversationDetail', description='Owner only. Latest messages in chronological order; limit1–100 default100, beforeMessageId must belong to same conversation. nextBeforeMessageId continues toward oldest messages. Snapshot remains readable when source FK null/deleting/deleted, sourceDeleted true; no provider calls.')
detail_op['parameters'].extend([param('beforeMessageId',schema=ref('Id')), param('limit',schema={'type':'integer','minimum':1,'maximum':100,'default':100})])
operation('/conversations/{conversationId}', 'delete', 'deleteConversation', 'Xóa hội thoại', 'Acknowledgement', description='Owner/student, Origin/CSRF. Conversation advisory lock shared with ask; active question409. Hard delete conversation with message/citation cascades only; PDF/course/chunks/index unaffected. Quota usage retained without question/answer/source content. After deletion GET/ask404, repeated DELETE404.')
operation('/conversations/{conversationId}/questions', 'post', 'askQuestion', 'Hỏi đáp có nguồn', 'Answer', body='Question',
          description='Scope từ conversation/owner/course/ready. documentIds lọc trước FAISS top-k, tối đa50000 chunks và100000 windows; vượt giới hạn trả lỗi. answerMode documents không fallback general; auto giữ policy cũ; general gắn nhãn Không dựa trên tài liệu, citations rỗng. PDF scope hoặc câu hỏi rõ tài liệu luôn bắt buộc nguồn. Context mở rộng tới ranh giới trong12 chunks mỗi phía/seed, giữ nhóm nguyên vẹn khi fit input_tokens; nhóm thiếu trả insufficient_context. LLM cấu hình thì gọi grounded adapter với context verified, không cấu hình thì trích đoạn trực tiếp. Lỗi provider không ghi answered/fallback. Citation IDs phải thuộc context; metadata nguồn do backend gắn. RequestId hash gồm mode khác auto; omitted/auto giữ legacy hash. Quota/idempotency/private source unchanged. Không retry generation mơ hồ khi timeout/network/5xx. Restart Node và RAG đồng bộ; migration015 bắt buộc trước API, không cần reindex. answer_origin chỉ ghi mới trong cùng transaction answer/user; dữ liệu cũ unknown, không backfill suy đoán. Account/session rechecked before commit.')
def arr(items):
    return {'type':'array','items':items}
count = {'type':'integer','minimum':0}
nullable_number = {'type':'number','nullable':True}
day_count = obj({'day':string(format='date'),'count':count})
schemas['AdminDashboard'] = obj({
 'updatedAt':string(format='date-time'),'timezone':string(enum=['Asia/Ho_Chi_Minh']),
 'range':obj({'start':string(format='date'),'end':string(format='date')}),
 'totals':obj({'users':obj({'total':count,'active':count,'blocked':count}),'courses':count,
               'documents':obj({name:count for name in ['total','ready','processing','failed','unsupported']})}),
 'activity':obj({**{name:count for name in ['total','answered','insufficient','failed','processing','latencySamples']},
                 'averageLatencyMs':nullable_number,'insufficientRate':nullable_number,
                 'origins':obj({name:count for name in ['grounded','general','unknown']}, ['grounded','general','unknown'])}),
 'charts':obj({'questions':arr(day_count),'uploads':arr(day_count),
               'documentStates':arr(obj({'status':string(),'count':count}))}),
 'recentDocuments':arr(obj({'id':ref('Id'),'fileName':string(),'uploader':string(),'courseName':string(),'createdAt':string(format='date-time'),'status':string()})),
 'audit':arr(obj({'id':ref('Id'),'actor':string(),'action':string(),'entityType':string(),'entityId':ref('Id'),'createdAt':string(format='date-time')})),
 'configuration':obj({'llmModel':string(nullable=True),'llmProvider':string(),
  'embedding':arr(obj({'model':string(),'revision':string(),'dimension':count,'metric':string()})),
  'ragTopK':count,'ragScoreThreshold':{'type':'number'},'retrievalCandidates':count}),
 'notes':arr(string())
})
dashboard_op=operation('/admin/dashboard','get','getAdminDashboard','Thống kê tổng quan Admin','AdminDashboard',description='Active admin only, no-store. Default7 or30 days inclusive; start/end YYYY-MM-DD custom max93 days, no future end. Asia/Ho_Chi_Minh via UTC+07 boundaries/grouping independent of MySQL timezone tables. Current totals unaffected by range; PDFs exclude deleting/deleted/tombstones; unsupported separate from failed. Questions count role=user once, retained history only. Insufficient rate = insufficient/(answered+insufficient), null for no business results. Mean latency from valid terminal user latency_ms samples (full request recording starts with dashboard release); historical absent measurement stays null. Daily arrays zero-filled. Upload activity includes retained deleted PDF rows; recent active PDFs8/audit8. No raw PDF/question/answer/audit metadata/hash/secret. Config/index metadata is not health. Consistent RR aggregate snapshot. activity.origins counts answered user rows only by persisted answer_origin: grounded/general/unknown. Migration015 leaves historical rows unknown; no inference/backfill from model or citations.')
dashboard_op['x-implementation-status']='implemented'
dashboard_op['x-runtime-verification']='Real MySQL integration tested: roles, timezone boundaries, aggregates, zero-fill and validation'
dashboard_op['parameters']=[param('days','query',string(enum=['7','30'])),param('start','query',string(format='date')),param('end','query',string(format='date'))]
op = operation('/admin/users', 'get', 'listAdminUsers', 'Danh sách người dùng', 'AdminUser', paginated=True, description='Active admin session only. Literal name/email q (max150 codepoints), status active/blocked, page1/pageSize20 max100; stable created_at/id descending; rows/count in repeatable-read snapshot. Explicit public columns only; no hash/token/avatar storage key or other-user private avatar URL.')
op['parameters'].extend([param('q', schema=string(maxLength=150)), param('status', schema=string(enum=['active', 'blocked']))])
operation('/admin/users/{userId}', 'get', 'getAdminUser', 'Chi tiết người dùng', 'AdminUser')
operation('/admin/users/{userId}/status', 'patch', 'setUserStatus', 'Khóa/mở khóa và audit', 'AdminUser', body='StatusInput',
          description='Active admin + Origin/CSRF; strict status-only input, no role/password/email changes. Transaction first locks admin_status_guard row1, then rechecks actor role/status and current session validity, locks target and protects last active admin409 even concurrent requests. Status/session revocation/audit commit atomically. Blocking marks all non-revoked sessions revoked; unblocking never restores old sessions. Same status is a successful no-op without duplicate audit. Self-block allowed only if another active admin remains; client clears session after success. Audit metadata contains only previousStatus/status/role/revokedSessions, never credentials or PDF/prompt content.')
op = operation('/admin/documents', 'get', 'listAdminDocuments', 'Tìm/lọc metadata hệ thống', 'AdminDocument', paginated=True, description='Active admin only; default excludes deleted tombstones. Status explicitly deleted includes completed tombstones. q literal filename/course/owner name/email max255 codepoints, userId/courseId filters, page/pageSize max100. Stable created_at/id descending, snapshot count/list. No storage keys/raw text/token fields.')
op['parameters'].extend([param('q', schema=string(maxLength=255)), param('status', schema=ref('DocumentStatus')), param('userId', schema=ref('Id')), param('courseId',schema=ref('Id'))])
course_filters = operation('/admin/documents/courses', 'get', 'listAdminDocumentCourses', 'Môn học cho bộ lọc admin', 'AdminDocumentCourse', paginated=True, description='Admin only; actual courses/owners from DB, optional userId and literal course-name q max255. Page/pageSize max100 default100; stable course name/id sort.')
course_filters['parameters'].extend([param('userId',schema=ref('Id')),param('q',schema=string(maxLength=255))])
for item in course_filters['parameters']:
    if item['name'] == 'pageSize': item['schema']['default'] = 100
admin_pdf = operation('/admin/documents/{documentId}/content', 'get', 'getAdminPdfContent', 'PDF private cho admin', 'Document', description='Active admin before GET/HEAD/Range, no owner bypass on student routes. Shared PDF validity/file/stream checks; pending/failed/unsupported409, deleting/deleted404, missing-file404. Private no-store, same bytes/Range/CSP semantics as student content.')
admin_pdf['parameters'].append(param('Range','header',string(description='Single bytes range')))
for status_code in ['200','206','416']:
    admin_pdf['responses'][status_code] = deepcopy(paths['/documents/{documentId}/content']['get']['responses'][status_code])
operation('/admin/documents/{documentId}', 'get', 'getAdminDocument', 'Metadata quản trị', 'AdminDocument')
operation('/admin/documents/{documentId}', 'delete', 'deleteAdminDocument', 'Cleanup tài liệu và audit', 'AcceptedDocument', 202, description='Active admin Origin/CSRF; shared F06 deletion workflow, same job-before-document lock order and durable worker ST/FAISS cleanup. Recheck actor active admin/session inside transaction. Audit document.delete_requested or document.delete_retry committed with deleting/cancel claims/delete_pdf job. In-progress/deleted replay is no-op without duplicate audit. 202 means accepted, not cleanup complete. Own/student citations keep snapshots/null FK; metadata stays readable to poll deleting/deleted or exhausted cleanup retry. No raw PDF/filename/secret in audit metadata.')
learning_ops = [
    operation('/courses/{courseId}/learning-sets','get','listLearningSets','Bộ học của môn học','LearningSet',paginated=True),
    operation('/courses/{courseId}/learning-sets','post','generateLearningSet','Tạo quiz/flashcard từ nguồn ready','LearningDetail',201,'LearningInput',
        description='Student owner + Origin/CSRF. Local document-rules-v2, no LLM/OpenAI calls. Sample 16 page/order strata with 2 seeded chunks each per PDF (32 maximum), fetching up to4000 chars/chunk; parse first1000 chars/sample, at most4 facts/sample,32000 chars and128 facts/PDF. Rotate eligible PDFs and parts; count below PDF count cannot cover every file. No full-document coverage guarantee. Quiz is exact-quotation cloze with4 distinct terms from the same PDF; flashcards contain missing term and full source sentence. Broken formulas are skipped. Count1–10, insufficient suitable items422. Used chunk citations are owner/ready rechecked before atomic persistence. Existing daily/minute limits, UUID/hash replay/conflict journal, ownership, grading and deletion remain unchanged.'),
    operation('/learning-sets/{setId}','get','getLearningSet','Xem bộ học','LearningDetail',description='Owner only; quiz prompts/choices with empty citations, no correctIndex/answer/explanation until a completed attempt review. Flashcards return front/back/citation snapshots. Source unavailable keeps stored content but private viewer is denied.'),
    operation('/learning-sets/{setId}','delete','deleteLearningSet','Xóa bộ học và các lần làm','LearningDeleted',description='Owner/student Origin/CSRF. Cascade items/citations/attempts/answers; PDF/course/chunks/index unchanged. Generation quota/journal retained, result FK null. Repeated DELETE404.'),
    operation('/learning-sets/{setId}/attempts','get','listLearningAttempts','50 lần làm gần nhất','LearningAttemptList'),
    operation('/learning-sets/{setId}/attempts','post','startLearningAttempt','Bắt đầu quiz','LearningAttempt',201,'LearningStart',description='Own quiz only; flashcards422. UUID idempotent per owner; same UUID other set409. Persist start time/total; no answer key or source until submission.'),
    operation('/learning-attempts/{attemptId}','get','getLearningAttempt','Mở lần làm bài/kết quả','LearningAttempt',description='Own attempt/set; completed review includes answer key, explanation and source snapshots. Unsubmitted choices are not saved.'),
    operation('/learning-attempts/{attemptId}/submit','post','submitLearningAttempt','Chấm quiz và lưu kết quả','LearningAttempt',body='LearningSubmission',description='Owner/student Origin/CSRF. Exactly one answer per question in same set; null choice means skipped/incorrect, unknown/duplicate/missing IDs422. Server computes score=100*correct/total rounded2 decimals, persists choices/correctness/completion atomically. Same canonical submission replays saved result; changing completed answers409. No provider call for grading.'),
]
for op in learning_ops:
    op['x-implementation-status'] = 'implemented'
    op['x-runtime-verification'] = 'NOT RUN by user request; implemented code only'
    if op['operationId'] == 'generateLearningSet':
        for code in [502,504]: op['responses'][str(code)] = {'$ref':f'#/components/responses/Error{code}'}
operation('/health/live', 'get', 'liveness', 'Process sống', 'Health', public=True)
operation('/health/ready', 'get', 'readiness', 'Dependency thật sẵn sàng', 'Health', public=True,
          description='MySQL connection and all existing auth/course/document/RAG/chat/audit tables plus migration009 learning_sets/items/citations/attempts/answers/generation_requests. Startup checks private writable storage. Does not claim rag/model/worker/LLM readiness.')
api = {'openapi': '3.0.3', 'info': {'title': 'Trợ lý học tập — API contract', 'version': '0.14.0',
        'description': 'F10: admin documents list/filter/detail/private PDF and audited shared durable deletion implemented/manual pending. F09: admin user list/search/detail/status, transactional last-active-admin protection, session revocation and audit implemented/manual pending. Admin document operations added in F10; runtime verification not run. F08: owner history global/course list/filter/pagination, full transcript cursor pagination and locked deletion implemented; F07 grounded LLM chat/citation reuse. No runtime verification this sprint. Quota journal survives deleting history via migration007 ask_usage. auth/health/profile/courses plus private PDF upload/list/metadata/content and durable extraction jobs implemented. Real chunking/embedding/scoped FAISS pipeline; durable deletion/index cleanup/reconciliation; grounded chat code implemented/manual pending; extractionCompleted never implies ready. No delete course or shared catalog. Other paths remain planned (x-implementation-status). Admin user routes implemented behind namespace guard; unimplemented routes return404. Success {data,meta?,requestId}; errors {error,requestId}. JSON IDs strings. Mutations require Origin and session CSRF except public auth. Names trimmed/NFC; description max2000 codepoints; profile email/role are read-only. Passwords8–72 UTF8bytes.'},
       'servers': [{'url': 'http://localhost:4000/api/v1', 'description': 'Local Node API: auth/profile/courses and health'}],
       'paths': paths, 'components': {'securitySchemes': {'sessionCookie': {'type': 'apiKey', 'in': 'cookie', 'name': 'study_session'}},
         'schemas': schemas, 'responses': {f'Error{code}': {'description': message, 'content': {'application/json': {'schema': ref('Error')}}} for code, message in errors.items()}}}
root = Path(__file__).resolve().parents[3]
paths['/auth/register']['post']['description'] += ' Migration011 removes email verification; registration issues session immediately without confirmation mail. Document notifications use registered owner email.'
paths['/users/me/avatar']['post']['description'] += ' Cloudinary required. Sanitized WebP uploaded from RAM via private authenticated stream; original hash/size verified through BE-only private download API before profile switches atomically. Durable cloud journal cleans orphan uploads and old avatar. No local avatar cache.'
paths['/courses/{courseId}/documents']['post']['description'] += ' Cloudinary required, no permanent local PDF. Bounded memory upload (max3 active requests), durable document/job/cloud upload-intent created before remote I/O, private authenticated original verified by hash/size before extraction eligibility. Failure503/failed document, no silent local fallback; crashed upload intent recovered by cloud worker.'
paths['/documents/{documentId}/content']['get']['description'] += ' Private Cloudinary original downloaded to bounded RAM, integrity checked; Range/HEAD preserved, no signed URL returned and no disk cache. Cloud unavailable503; legacy local-only assets require migration.'
paths['/admin/documents/{documentId}/content']['get']['description'] += ' Same cloud-only in-memory content path, no local PDF cache.'
api['info']['version'] = '0.15.0'
api['info']['description'] = 'Current implementation after code review rounds1–4,14/10/2026: cookie auth/RBAC/profile/courses; private Cloudinary PDF/avatar RAM reads; ST/FAISS scoped RAG and grounded LLM when configured, extractive otherwise; documents mode forbids general fallback, permitted general responses labelled without PDF citations. Quiz/flashcard document-rules-v2 sampled across page/order strata, no LLM; server grading/snapshots/UUID/quota preserved. Admin users/documents/audit/dashboard implemented. Migration015 adds persisted answer_origin; history unknown without inferred backfill; dashboard counts answered user rows only for origin distribution and retained QA history. Migration015 is required before new API; not applied by this code-only change. Email verification removed by011; document SMTP outbox retained. No new runtime/test/benchmark evidence. No planner/calendar/reminder/OCR. See docs/CURRENT_IMPLEMENTATION.md and CODE_REVIEW_REPORT.md.'
(root / 'docs/api.openapi.yaml').write_text(yaml.safe_dump(api, allow_unicode=True, sort_keys=False), encoding='utf-8')
print(f'Generated {len(paths)} paths')
