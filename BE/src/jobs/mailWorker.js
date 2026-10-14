import { randomUUID } from 'node:crypto';
import { mailEnabled, mailTransport } from '../integrations/email.js';
import { log } from '../config/logger.js';
export async function processMailQueue(pool,config){
  if(!mailEnabled(config))return false;
  const db=await pool.getConnection();let mail;
  try{
    await db.beginTransaction();
    const [rows]=await db.query("SELECT * FROM mail_outbox WHERE (state='queued' AND next_run_at<=UTC_TIMESTAMP(3)) OR (state='sending' AND locked_until<=UTC_TIMESTAMP(3)) ORDER BY next_run_at,id LIMIT 1 FOR UPDATE SKIP LOCKED");
    if(!rows.length){await db.commit();return false;}mail=rows[0];
    if(mail.attempts>=3){await db.execute("UPDATE mail_outbox SET state='failed',body=NULL,locked_by=NULL,locked_until=NULL,error_code='EMAIL_ATTEMPTS_EXHAUSTED' WHERE id=?",[mail.id]);await db.commit();return true;}
    mail.locked_by=randomUUID();mail.attempts++;
    await db.execute("UPDATE mail_outbox SET state='sending',attempts=?,locked_by=?,locked_until=TIMESTAMPADD(SECOND,120,UTC_TIMESTAMP(3)) WHERE id=?",[mail.attempts,mail.locked_by,mail.id]);
    await db.commit();
  }catch(error){await db.rollback();throw error;}finally{db.release();}
  const [users]=await pool.execute('SELECT id FROM users WHERE id=? AND status=\'active\'',[mail.user_id]);
  if(!users.length){await pool.execute("UPDATE mail_outbox SET state='cancelled',body=NULL,locked_by=NULL,locked_until=NULL WHERE id=? AND locked_by=?",[mail.id,mail.locked_by]);return true;}
  const transport=mailTransport(config);
  try{
    const result=await transport.sendMail({from:config.EMAIL_FROM,to:mail.recipient,subject:mail.subject,text:mail.body,messageId:`<study-mail-${mail.id}@study-assistant.local>`});
    if(!result.accepted?.length)throw new Error('EMAIL_REJECTED');
    await pool.execute("UPDATE mail_outbox SET state='sent',body=NULL,sent_at=UTC_TIMESTAMP(3),locked_by=NULL,locked_until=NULL,error_code=NULL WHERE id=? AND locked_by=?",[mail.id,mail.locked_by]);
    log('worker','email-accepted',{mailId:String(mail.id)});
  }catch{
    await pool.execute("UPDATE mail_outbox SET state=?,body=IF(?='failed',NULL,body),error_code='SMTP_DELIVERY_FAILED',locked_by=NULL,locked_until=NULL,next_run_at=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) WHERE id=? AND locked_by=?",
      [mail.attempts>=3?'failed':'queued',mail.attempts>=3?'failed':'queued',30*2**mail.attempts,mail.id,mail.locked_by]);
    log('worker','email-delivery-failed',{mailId:String(mail.id),code:'SMTP_DELIVERY_FAILED'});
  }finally{transport.close();}
  return true;
}
