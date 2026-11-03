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
    let sets=[], completed=false,attempt=null;
    let notices=[{id:old.id+':aaaaaaaaaaaaaaaaaaaaaaaa:missed',kind:'missed',title:old.title,session:old,dueAt:'2030-01-06T12:30:00Z',read:false},{id:old.id+':bbbbbbbbbbbbbbbbbbbbbbbb:moved',kind:'moved',title:'Buổi học đã thay đổi',session:old,dueAt:'2030-01-06T12:20:00Z',read:false}];
    const item={id:'1',prompt:'Từ trường tồn tại xung quanh đâu?',choices:['Nam châm','Vật không xác định','Khoảng trống không xác định','Không có đáp án'],correctIndex:0,answer:'Nam châm',explanation:'Đối chiếu nguồn buổi học.',citations:[]};
    await page.route('**/api/v1/**',async route=>{
      const req=route.request(),url=new URL(req.url()),p=url.pathname.replace('/api/v1','');
      const reply=(data,extra={})=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data,...extra})});
      if(req.method()!=='GET')writes.push({path:p,body:req.postDataJSON()});
      if(p==='/auth/me')return reply({user:{id:'7',role:'student',fullName:'Người học thử'},csrfToken:'fixture',schemaVersion:16});
      if(p==='/thong-bao-hoc')return reply({mode:'persistent',notifications:notices,unreadCount:notices.filter(n=>!n.read).length,serverNow:'2030-01-07T00:00:00Z',nextCursor:null});
      if(p==='/thong-bao-hoc/doc-tat-ca'){notices=notices.map(n=>({...n,read:true}));return reply({ok:true});}
      if(p.startsWith('/thong-bao-hoc/')&&p.endsWith('/doc')){const id=decodeURIComponent(p.split('/')[2]);notices=notices.map(n=>n.id===id?{...n,read:true}:n);return reply({ok:true});}
      if(p==='/thong-bao-hoc/push')return req.method()==='GET'?reply({enabled:true,publicKey:'A'.repeat(87)}):reply({subscribed:Boolean(req.postDataJSON().keys)});
      if(p==='/courses')return reply([{id:'24',name:'Vật lí'}],{meta:{total:1}});
      if(p==='/ket-noi/google')return reply({status:'connected',configured:true,email:'learner@example.test'});
      if(p==='/lich-hoc')return reply({sessions:[old],summary:{total:1,completed:0},serverNow:'2026-10-29T00:00:00Z'});
      if(p===`/lich-hoc/${old.id}/goi-y-doi-gio`)return reply({version:1,slots:[{requestId:'move-fixture',start:'2030-01-08T12:00:00Z',end:'2030-01-08T12:30:00Z'}]});
      if(p===`/lich-hoc/${old.id}`)return reply({...old,status:completed?'completed':'planned'});
      if(p==='/lich-hoc/10')return reply(prepared);
      if(p.startsWith('/lich-hoc/404'))return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:{code:'NOT_FOUND',message:'Không tìm thấy buổi học thuộc tài khoản.'}})});
      if(p.endsWith('/hoan-thanh')){completed=true;return reply({...old,status:'completed'});}
      if(p==='/documents/21')return reply({id:'21',fileName:'Vật lí.pdf',status:'ready',pageCount:4});
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
    await page.addInitScript(()=>{
      let subscription=null;
      const registration={pushManager:{getSubscription:async()=>subscription,subscribe:async()=>{
        subscription={endpoint:'https://fcm.googleapis.com/fcm/send/fixture',toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/fixture',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}}),unsubscribe:async()=>{subscription=null;return true;}};
        return subscription;
      }}};
      Object.defineProperty(navigator,'serviceWorker',{value:{getRegistration:async()=>registration,register:async()=>registration,ready:Promise.resolve(registration)},configurable:true});
      Object.defineProperty(window,'PushManager',{value:function(){},configurable:true});
      Object.defineProperty(Notification,'permission',{get:()=> 'granted',configurable:true});
      Notification.requestPermission=async()=> 'granted';
    });
    const base=process.env.FE_TEST_URL||'http://localhost:5173';
    const artifacts=path.join(process.cwd(),'tests','artifacts');fs.mkdirSync(artifacts,{recursive:true});
    await page.goto(`${base}/app/study-calendar?date=2030-01-07`);

    await page.getByRole('button',{name:'Thông báo, 2 chưa đọc',exact:true}).click();
    const panel=page.getByRole('region',{name:'Thông báo học tập'});
    await panel.waitFor();assert.equal(await panel.locator('.notification-row').count(),2);
    assert.equal(await panel.getByRole('link',{name:old.title}).getAttribute('href'),'/app/study-calendar/sessions/'+old.id);
    await panel.getByRole('button',{name:'Đánh dấu đã đọc'}).first().click();
    await page.getByRole('button',{name:'Thông báo, 1 chưa đọc',exact:true}).waitFor();
    await page.screenshot({path:path.join(artifacts,'notifications-desktop.png')});
    await panel.locator('summary').click();
    await panel.getByRole('button',{name:'Bật nhắc khi đóng tab',exact:true}).click();
    await panel.getByRole('button',{name:'Tắt nhắc nền',exact:true}).waitFor();
    await panel.getByRole('button',{name:'Tắt nhắc nền',exact:true}).click();
    await panel.getByRole('button',{name:'Bật nhắc khi đóng tab',exact:true}).waitFor();
    await page.keyboard.press('Escape');await page.reload();
    await page.getByRole('button',{name:'Thông báo, 1 chưa đọc',exact:true}).click();
    await panel.getByRole('button',{name:'Chưa đọc',exact:true}).click();
    assert.equal(await panel.locator('.notification-row').count(),1);
    await panel.getByRole('button',{name:'Đọc tất cả',exact:true}).click();
    await panel.getByText('Không có thông báo chưa đọc').waitFor();
    await page.setViewportSize({width:390,height:844});
    const box=await panel.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);
    await page.screenshot({path:path.join(artifacts,'notifications-mobile.png')});
    await page.keyboard.press('Escape');assert.equal(await panel.count(),0);
    assert.equal(errors.length,0,errors.join('\n'));
    console.log(JSON.stringify({passed:true,mockedApis:true,realWrites:false,checks:['unread badge','compact inbox','exact session link','mark read','reload persistence','unread filter','mark all','mobile width','escape close','enable background push','disable background push'],requests:writes.map(w=>w.path)}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
