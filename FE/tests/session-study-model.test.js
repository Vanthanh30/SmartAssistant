import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionStudyModel, sessionStudyPath } from '../src/features/studyCalendar/sessionStudyModel.js';
const session={id:'37319038097580148',documentId:'21',pageFrom:2,pageTo:3,title:'Ôn tập',goal:'Đọc nguồn',start:'2030-01-07T12:00:00Z',end:'2030-01-07T12:30:00Z'};
test('session links retain full bigint IDs without numeric precision loss',()=>{
  assert.equal(sessionStudyPath(session.id),'/app/study-calendar/sessions/37319038097580148');
});
test('old sessions can read and practise their actual saved range without inventing an AI lesson',()=>{
  const model=sessionStudyModel(session);
  assert.equal(model.prepared,false);
  assert.deepEqual(model.topics,[]);
  assert.equal(model.resources[0].documentId,'21');
  assert.equal(model.resources[0].pageFrom,2);
  assert.equal(model.resources[0].pageTo,3);
  assert.equal(model.activities[0].minutes,30);
  assert.equal(model.quizCount,5);
});
test('missing or invalid saved scope never invents PDF pages',()=>{
  for(const change of [{pageFrom:undefined},{pageTo:1},{documentId:null}])assert.deepEqual(sessionStudyModel({...session,...change}).resources,[]);
});
test('prepared session retains all lesson content and per-session practice counts',()=>{
  const lesson={resources:[{documentId:'22',pageFrom:4,pageTo:5}],quizCount:3,flashcardCount:4,topics:[{title:'Khái niệm',content:'Nội dung đã xác minh'}]};
  const model=sessionStudyModel({...session,lesson});
  assert.equal(model.prepared,true);
  assert.deepEqual(model.resources,lesson.resources);
  assert.deepEqual(model.topics,lesson.topics);
  assert.equal(model.flashcardCount,4);
});
