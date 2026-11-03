// Browser regression with mocked APIs: never changes real sessions or calls AI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const localRequire = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = process.env.PLAYWRIGHT_MODULE ? require(process.env.PLAYWRIGHT_MODULE) : localRequire('playwright');
function pdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R 9 0 R] /Count 4 >>'];
  for (let i=0;i<4;i++) {
    const stream=`BT /F1 18 Tf 30 300 Td (Session source page ${i+1}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 350 400] /Resources << /Font << /F1 11 0 R >> >> /Contents ${4+i*2} 0 R >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let body='%PDF-1.4\n'; const offsets=[0];
  objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(body));body+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const xref=Buffer.byteLength(body);
  body+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[], writes=[];
    page.on('pageerror',e=>errors.push(e.message));
    const old={id:'37319038097580148',courseId:'24',documentId:'21',pageFrom:2,pageTo:3,title:'Ôn tập theo tài liệu',goal:'Ôn tập theo tài liệu · Vật lí.pdf, trang 2–3',start:'2030-01-07T12:00:00Z',end:'2030-01-07T12:30:00Z',status:'planned',version:1,lesson:null,googleSync:true,syncStatus:'synced'};
    const prepared={...old,id:'10',title:'Từ trường và cảm ứng từ',lesson:{difficulty:'basic',objectives:['Giải thích khái niệm từ trường.'],topics:[{title:'Khái niệm từ trường',content:'Từ trường tồn tại xung quanh nam châm và dòng điện.'}],activities:[{kind:'read',minutes:15,instruction:'Đọc và ghi lại ý chính.'},{kind:'practice',minutes:10,instruction:'Làm quiz kiểm tra.'},{kind:'review',minutes:5,instruction:'Ôn bằng thẻ ghi nhớ.'}],resources:[{documentId:'21',fileName:'Vật lí.pdf',pageFrom:2,pageTo:3,chunkIds:['11']}],quizCount:3,flashcardCount:3}};
    let sets=[], completed=false,attempt=null,conversationId='301',messages=[];
    const item={id:'1',prompt:'Từ trường tồn tại xung quanh đâu?',choices:['Nam châm','Vật không xác định','Khoảng trống không xác định','Không có đáp án'],correctIndex:0,answer:'Nam châm',explanation:'Đối chiếu nguồn buổi học.',citations:[]};
    await page.route('**/api/v1/**',async route=>{
      const req=route.request(),url=new URL(req.url()),p=url.pathname.replace('/api/v1','');
      const reply=(data,extra={})=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data,...extra})});
      if(req.method()!=='GET')writes.push({path:p,body:req.postDataJSON()});
      if(p==='/auth/me')return reply({user:{id:'7',role:'student',fullName:'Người học thử'},csrfToken:'fixture',schemaVersion:16});
      if(p==='/thong-bao-hoc')return reply({mode:'transient',notifications:[]});
      if(p===`/lich-hoc/${old.id}/hoi-thoai`){if(req.postDataJSON().newConversation){conversationId='302';messages=[];}return reply({id:conversationId,courseId:'24',title:'Hoi buoi hoc'});}
      if(p===`/conversations/${conversationId}`)return reply({conversation:{id:conversationId,courseId:'24'},messages});
      if(p===`/conversations/${conversationId}/questions`){const body=req.postDataJSON();assert.equal(body.sessionId,old.id);assert.deepEqual(body.documentIds,['21']);assert.equal(body.pageFrom,undefined);messages.push({id:'q1',role:'user',content:body.question,status:'answered',citations:[]},{id:'a1',role:'assistant',content:'Từ trường tồn tại xung quanh nam châm và dòng điện.',blocks:[{id:'p1',type:'paragraph',text:'Từ trường tồn tại xung quanh nam châm và dòng điện.'}],status:'answered',citations:[]});return reply({status:'answered'});}
      if(p==='/courses')return reply([{id:'24',name:'Vật lí'}],{meta:{total:1}});
      if(p==='/courses/24')return reply({id:'24',name:'Vật lí',readyDocumentCount:1});
      if(p==='/ket-noi/google')return reply({status:'connected',configured:true,email:'learner@example.test'});
      if(p==='/lich-hoc')return reply({sessions:[old],summary:{total:1,completed:0},serverNow:'2026-10-29T00:00:00Z'});
      if(p===`/lich-hoc/${old.id}/goi-y-doi-gio`)return reply({version:1,slots:[{requestId:'move-fixture',start:'2030-01-08T12:00:00Z',end:'2030-01-08T12:30:00Z'}]});
      if(p===`/lich-hoc/${old.id}`)return reply({...old,status:completed?'completed':'planned'});
      if(p==='/lich-hoc/10')return reply(prepared);
      if(p.startsWith('/lich-hoc/404'))return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:{code:'NOT_FOUND',message:'Không tìm thấy buổi học thuộc tài khoản.'}})});
      if(p.endsWith('/hoan-thanh')){completed=true;return reply({...old,status:'completed'});}
      if(p==='/documents/21')return reply({id:'21',fileName:'Vật lí.pdf',status:'ready',pageCount:4});
      if(p==='/courses/24/documents')return reply([{id:'21',fileName:'Vật lí.pdf',status:'ready',pageCount:4}],{meta:{total:1}});
      if(p==='/documents/21/content')return route.fulfill({status:200,contentType:'application/pdf',body:pdf()});
      if(p==='/courses/24/learning-sets'&&req.method()==='POST'){
        const body=req.postDataJSON();assert.equal(body.sessionId,old.id);assert.deepEqual(body.documentIds,['21']);
        const set={id:body.kind==='quiz'?'101':'102',courseId:'24',sessionId:old.id,title:body.kind==='quiz'?'Quiz của buổi học':'Thẻ nhớ của buổi học',kind:body.kind,itemCount:1,sourceCount:1,model:'fixture',items:[item]};sets.push(set);return reply(set);
      }
      if(p==='/courses/24/learning-sets')return reply(sets,{meta:{total:sets.length}});
      if(/^\/learning-sets\/\d+$/.test(p))return reply(sets.find(s=>s.id===p.split('/')[2]));
      if(p.endsWith('/attempts')&&req.method()==='GET')return reply([]);
      if(p.endsWith('/attempts')){const id=p.split('/')[2];attempt={id:'201',setId:id,set:sets.find(s=>s.id===id),answers:[],completedAt:null};return reply(attempt);}
      if(p==='/learning-attempts/201/confirm-answer'){attempt={...attempt,answers:[{itemId:'1',choice:0,correct:true,locked:true}]};return reply(attempt);}
      if(p==='/learning-attempts/201')return reply(attempt);
      throw new Error(`Unmocked request: ${req.method()} ${p}`);
    });
    const base=process.env.FE_TEST_URL||'http://localhost:5173';
    const artifacts=path.join(process.cwd(),'tests','artifacts');fs.mkdirSync(artifacts,{recursive:true});
    await page.goto(`${base}/app/study-calendar/sessions/${old.id}`);

    await page.getByRole('button',{name:'Hỏi trợ lý',exact:true}).click();
    const chat=page.getByRole('complementary',{name:'Trợ lý trong buổi học'});
    await chat.getByRole('textbox',{name:'Câu hỏi của bạn',exact:true}).waitFor();
    await chat.getByRole('textbox',{name:'Câu hỏi của bạn',exact:true}).fill('Từ trường là gì?');
    await chat.getByRole('button',{name:'Gửi câu hỏi',exact:true}).click();
    await chat.getByText('Từ trường tồn tại xung quanh nam châm và dòng điện.',{exact:true}).waitFor();
    const questionsBeforePractice=writes.filter(w=>w.path.endsWith('/questions')).length;
    await chat.getByRole('textbox',{name:'Câu hỏi của bạn',exact:true}).fill('tạo câu hỏi để luyện tập');
    await chat.getByRole('button',{name:'Gửi câu hỏi',exact:true}).click();
    const practice=chat.getByRole('region',{name:'Tạo bài luyện từ hội thoại'});
    await practice.waitFor();
    assert.equal(await practice.getByRole('textbox',{name:'Chủ đề luyện tập'}).inputValue(),'');
    assert.equal(await practice.getByRole('button',{name:'Bắt đầu luyện tập',exact:true}).isDisabled(),true);
    await practice.getByRole('radio',{name:'Từ trường (gần nhất)',exact:true}).check();
    await practice.getByRole('button',{name:'Bắt đầu luyện tập',exact:true}).click();
    await page.waitForURL('**/app/courses/24?view=study&studySet=101');
    await page.getByRole('button',{name:'Bắt đầu làm quiz',exact:true}).waitFor();
    assert.equal(await page.locator('#course-chat').isVisible(),false);
    assert.equal(writes.filter(w=>w.path.endsWith('/questions')).length,questionsBeforePractice);
    const createdPractice=writes.find(w=>w.path==='/courses/24/learning-sets');
    assert.equal(createdPractice.body.topic,'Từ trường');
    assert.equal(createdPractice.body.sessionId,old.id);
    assert.equal(createdPractice.body.forceNew,false);
    await page.goBack();
    await page.getByRole('button',{name:'Hỏi trợ lý',exact:true}).click();
    await page.getByRole('navigation',{name:'Các bước học trong buổi'}).getByRole('button',{name:/Đọc tài liệu/}).click();
    await page.locator('canvas').waitFor();
    assert.equal(await chat.getByRole('textbox',{name:'Câu hỏi của bạn',exact:true}).count(),1);
    await page.screenshot({path:path.join(artifacts,'session-chat-desktop.png'),fullPage:true});
    await page.reload();await page.getByRole('button',{name:'Hỏi trợ lý',exact:true}).click();
    await chat.getByText('Từ trường tồn tại xung quanh nam châm và dòng điện.',{exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.account-body')).marginLeft==='0px'&&document.querySelector('#account-sidebar').getBoundingClientRect().right<=1);
    await chat.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:path.join(artifacts,'session-chat-mobile.png')});
    await chat.getByRole('button',{name:'Hội thoại mới',exact:true}).click();
    await chat.getByRole('textbox',{name:'Câu hỏi của bạn',exact:true}).waitFor();
    await chat.getByText('Từ trường tồn tại xung quanh nam châm và dòng điện.',{exact:true}).waitFor({state:'detached'});
    await chat.getByRole('button',{name:'Đóng khung hỏi đáp',exact:true}).click();
    await chat.waitFor({state:'detached'});
    assert.equal(errors.length,0,errors.join('\n'));
    console.log(JSON.stringify({passed:true,mockedApis:true,realAiCalls:false,checks:['open chat inside lesson','session/document scope payload','send and display answer','read PDF while chatting','history after reload','mobile layout','new conversation','close chat'],requests:writes.map(w=>w.path)}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
