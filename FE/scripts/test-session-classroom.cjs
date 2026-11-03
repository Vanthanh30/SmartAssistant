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
    const item={id:'1',prompt:'Từ trường tồn tại xung quanh đâu?',choices:['Nam châm','Vật không xác định','Khoảng trống không xác định','Không có đáp án'],correctIndex:0,answer:'Nam châm',explanation:'Đối chiếu nguồn buổi học.',citations:[]};
    await page.route('**/api/v1/**',async route=>{
      const req=route.request(),url=new URL(req.url()),p=url.pathname.replace('/api/v1','');
      const reply=(data,extra={})=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data,...extra})});
      if(req.method()!=='GET')writes.push({path:p,body:req.postDataJSON()});
      if(p==='/auth/me')return reply({user:{id:'7',role:'student',fullName:'Người học thử'},csrfToken:'fixture',schemaVersion:16});
      if(p==='/thong-bao-hoc')return reply({mode:'transient',notifications:[]});
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
    const base=process.env.FE_TEST_URL||'http://localhost:5173';
    const artifacts=path.join(process.cwd(),'tests','artifacts');fs.mkdirSync(artifacts,{recursive:true});
    await page.goto(`${base}/app/study-calendar?date=2030-01-07`);
    await page.getByRole('heading',{name:'Lịch học',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:/Tùy chỉnh nâng cao|Thêm buổi học/}).count(),0);
    await page.getByRole('button',{name:'Lên lịch qua chat',exact:true}).click();
    await page.getByRole('dialog').getByRole('heading',{name:'Lên lịch cùng trợ lý',exact:true}).waitFor();
    await page.getByRole('dialog').getByRole('button',{name:'Đóng',exact:true}).click();
    await page.getByRole('button',{name:'Bộ lọc',exact:true}).click();
    await page.getByLabel('Môn học',{exact:true}).selectOption('24');
    await page.getByRole('button',{name:'Xóa bộ lọc',exact:true}).click();
    await page.getByRole('button',{name:/Ôn tập theo tài liệu/}).last().waitFor();
    await page.locator('.fc').waitFor();
    await page.screenshot({path:path.join(artifacts,'calendar-hub-desktop.png'),fullPage:true});
    await page.getByRole('button',{name:/Ôn tập theo tài liệu/}).last().click();
    const dialog=page.getByRole('dialog');
    await dialog.getByRole('link',{name:'Học ngay',exact:true}).waitFor();
    assert.equal(await dialog.getByRole('button',{name:'Sửa nội dung buổi',exact:true}).isVisible(),false);
    assert.equal(await dialog.getByRole('button',{name:'Tiếp tục gỡ sự kiện',exact:true}).count(),0);
    assert.equal(await dialog.getByText('Trạng thái học và đồng bộ Google là hai trạng thái riêng biệt.',{exact:true}).count(),0);
    await page.screenshot({path:path.join(artifacts,'session-preview-desktop.png')});
    await dialog.getByRole('button',{name:'Dời lịch',exact:true}).click();
    await dialog.getByRole('button',{name:'Thêm khoảng giờ',exact:true}).click();
    await dialog.getByRole('button',{name:'Tìm giờ phù hợp',exact:true}).click();
    await dialog.getByRole('button',{name:'Xác nhận dời',exact:true}).waitFor();
    assert.equal(writes.find(w=>w.path.endsWith('/goi-y-doi-gio')).body.duration,30);
    await dialog.getByRole('button',{name:'Đóng phần dời lịch',exact:true}).click();
    await dialog.getByRole('button',{name:/Google Calendar/}).click();
    await dialog.getByRole('button',{name:'Gỡ khỏi Google',exact:true}).waitFor();
    assert.equal(await dialog.getByRole('button',{name:'Kiểm tra / thử đồng bộ lại',exact:true}).count(),0);
    await page.getByRole('link',{name:'Học ngay',exact:true}).click();
    await page.getByRole('heading',{name:'Hôm nay học gì?'}).waitFor();
    assert.ok(page.url().includes(`/sessions/${old.id}`));
    assert.equal(await page.getByText('Không tìm thấy trang',{exact:true}).count(),0);
    await page.getByRole('button',{name:'Bắt đầu đọc',exact:true}).click();
    await page.getByRole('img',{name:'Nội dung PDF trang 2',exact:true}).waitFor();
    await page.waitForFunction(()=>!document.body.innerText.includes('Đang mở PDF'));
    assert.equal(await page.getByRole('button',{name:'Trang trước',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Trang sau',exact:true}).click();
    await page.getByRole('img',{name:'Nội dung PDF trang 3',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Trang sau',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Sang luyện tập',exact:true}).click();
    await page.getByRole('article').filter({has:page.getByRole('heading',{name:'Quiz trắc nghiệm',exact:true})}).getByRole('button').click();
    await page.getByRole('button',{name:'Bắt đầu làm quiz',exact:true}).click();
    await page.getByRole('radio').first().check();
    await page.getByRole('button',{name:'Xác nhận đáp án',exact:true}).click();
    await page.getByText('Trả lời đúng',{exact:true}).waitFor();
    await page.getByRole('article').filter({has:page.getByRole('heading',{name:'Thẻ ghi nhớ',exact:true})}).getByRole('button').click();
    await page.locator('.study-flashcard').click();
    await page.getByText('Mặt sau',{exact:false}).first().waitFor();
    await page.getByRole('button',{name:'Hoàn thành buổi học',exact:true}).click();
    await page.locator('.session-status.completed').waitFor();
    await page.reload();await page.locator('.session-status.completed').waitFor();
    await page.goto(`${base}/app/study-calendar/sessions/10`);
    await page.getByRole('heading',{name:'Khái niệm từ trường',exact:true}).waitFor();
    await page.screenshot({path:path.join(artifacts,'session-classroom-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.account-body')).marginLeft==='0px'&&document.querySelector('#account-sidebar').getBoundingClientRect().right<=1);
    await page.waitForFunction(()=>document.documentElement.scrollWidth<=window.innerWidth+1,{},{timeout:5000}).catch(async error=>{console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right}))));throw error;});
    await page.screenshot({path:path.join(artifacts,'session-classroom-mobile.png'),fullPage:true});
    await page.goto(`${base}/app/study-calendar?date=2030-01-07`);
    await page.getByRole('button',{name:/Ôn tập theo tài liệu/}).last().click();
    await page.getByRole('dialog').getByRole('link',{name:'Học ngay',exact:true}).waitFor();
    const box=await page.getByRole('dialog').boundingBox();assert.ok(box.width<=390&&box.height<=844&&box.y>=0&&box.y+box.height<=844);
    await page.screenshot({path:path.join(artifacts,'session-preview-mobile.png')});
    await page.goto(`${base}/app/study-calendar/sessions/404`);
    await page.getByRole('heading',{name:'Chưa mở được buổi học',exact:true}).waitFor();
    assert.equal(errors.length,0,errors.join('\n'));
    console.log(JSON.stringify({passed:true,mockedApis:true,realWrites:false,checks:['chat-only creation','course filters','compact preview','conditional Google controls','move proposal','calendar link','direct route','legacy session','PDF range 2–3','quiz answer','flashcard flip','complete and reload','prepared lesson','mobile layout and preview','missing session error'],requests:writes.map(w=>w.path)}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
