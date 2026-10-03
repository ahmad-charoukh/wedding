import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {hashPassword} from '../server/security.mjs';
process.env.LOCAL_DB_PATH=path.join(mkdtempSync(path.join(tmpdir(),'wedding-test-')),'test.sqlite');process.env.ADMIN_USERNAME='tester';process.env.ADMIN_PASSWORD_HASH=hashPassword('a-test-only-password');process.env.SESSION_SECRET='test-only-secret-'.repeat(4);
const {default:handler}=await import('../server/api.mjs');const {defaults}=await import('../server/defaults.mjs');let session='';let counter=0;
async function call(route,{method='GET',data,auth=false,origin='http://localhost',ip='test-'+counter++,rawBody}={}){const headers={Origin:origin};if(auth)headers.cookie=session;if(!rawBody)headers['Content-Type']='application/json';const res=await handler(new Request('http://localhost/api'+route,{method,headers,body:rawBody|| (data?JSON.stringify(data):undefined)}),{ip});return res}
async function data(res){return res.json()}
const attending={full_name:'ضيف التجربة',phone:'+966 555123456',attendance_status:'attending',guest_count:3,message:'ألف مبارك',website:''};
test('full guest and admin lifecycle; validation, privacy, moderation, settings, upload and logout',async()=>{
 assert.equal((await call('/wedding')).status,200);
 assert.equal((await call('/admin/rsvp')).status,401);
 assert.equal((await call('/rsvp',{method:'POST',data:{...attending,full_name:'x'}})).status,400);
 assert.equal((await call('/rsvp',{method:'POST',origin:'https://evil.example',data:attending})).status,403);
 assert.equal((await call('/rsvp',{method:'POST',data:attending})).status,201);
 assert.equal((await call('/rsvp',{method:'POST',data:{...attending,full_name:'معتذر التجربة',attendance_status:'declined',guest_count:8}})).status,201);
 assert.equal((await call('/messages',{method:'POST',data:{full_name:'سارة',message:'<script>alert(1)</script>'}})).status,400);
 assert.equal((await call('/messages',{method:'POST',data:{full_name:'سارة',message:'الله يسعدكم'}})).status,201);
 let publicRows=await data(await call('/messages'));assert.equal(publicRows.length,1);assert.ok(!('phone' in publicRows[0]));
 assert.equal((await call('/admin/login',{method:'POST',data:{username:'tester',password:'wrong'}})).status,401);
 const login=await call('/admin/login',{method:'POST',data:{username:'tester',password:'a-test-only-password'}});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly/);session=login.headers.get('set-cookie').split(';')[0];
 const stats=await data(await call('/admin/stats',{auth:true}));assert.equal(Number(stats.total),2);assert.equal(Number(stats.guests),3);assert.equal(Number(stats.declined),1);
 const rows=await data(await call('/admin/rsvp?status=attending&q='+encodeURIComponent('ضيف'),{auth:true}));assert.equal(rows.length,1);assert.equal(rows[0].phone,attending.phone);assert.ok(!('ip_hash' in rows[0]));
 let message=publicRows[0];assert.equal((await call('/admin/messages/'+message.id,{auth:true,method:'PATCH',data:{status:'hidden'}})).status,200);assert.equal((await data(await call('/messages'))).length,0);
 assert.equal((await call('/admin/settings',{auth:true,method:'PUT',data:{...defaults,moderation:'pending',venue:'قاعة اختبار'}})).status,200);
 assert.equal((await data(await call('/wedding'))).venue,'قاعة اختبار');assert.ok(!('moderation' in await data(await call('/wedding'))));
 await call('/messages',{method:'POST',data:{full_name:'أحمد',message:'مبروك'}});assert.equal((await data(await call('/messages'))).length,0);
 const adminRows=await data(await call('/admin/messages',{auth:true}));const pending=adminRows.find(m=>m.status==='pending');assert.ok(pending);
 await call('/admin/messages/'+pending.id,{method:'PATCH',auth:true,data:{status:'approved'}});assert.equal((await data(await call('/messages'))).length,1);
 await call('/admin/messages/'+pending.id,{method:'DELETE',auth:true});assert.equal((await data(await call('/messages'))).length,0);
 const form=new FormData();form.set('file',new Blob([readFileSync(new URL('../public/music/wedding.mp3',import.meta.url))],{type:'audio/mpeg'}),'test.mp3');assert.equal((await call('/admin/music',{method:'POST',auth:true,rawBody:form})).status,200);
 const s=await data(await call('/wedding'));const media=await call(s.musicUrl.replace('/api',''));assert.equal(media.status,200);assert.equal(media.headers.get('content-type'),'audio/mpeg');
 const range=await handler(new Request('http://localhost'+s.musicUrl,{headers:{Range:'bytes=0-99'}}));assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,100);
 await call('/admin/music',{auth:true,method:'DELETE'});assert.equal((await data(await call('/wedding'))).musicUrl,defaults.musicUrl);
 const invalid=new FormData();invalid.set('file',new Blob(['not really music, just a fake header']),'test.mp3');assert.equal((await call('/admin/music',{method:'POST',auth:true,rawBody:invalid})).status,400);
 assert.equal((await call('/admin/logout',{auth:true,method:'POST'})).status,200);assert.equal((await call('/admin/session',{auth:true})).status,401);
});
test('persistent rate limiting blocks repeated submissions',async()=>{for(let i=0;i<8;i++)assert.equal((await call('/rsvp',{method:'POST',data:attending,ip:'same-rate-ip'})).status,201);assert.equal((await call('/rsvp',{method:'POST',data:attending,ip:'same-rate-ip'})).status,429)});
test('wedding timezone resolves 19:00 Riyadh to 16:00 UTC',async()=>{const {DateTime}=await import('luxon');assert.equal(DateTime.fromISO(`${defaults.date}T${defaults.time}`,{zone:defaults.timezone}).toUTC().toISO(),'2027-08-15T16:00:00.000Z');const {settingsSchema}=await import('../server/validation.mjs');assert.equal(settingsSchema.safeParse({...defaults,date:'2027-02-31'}).success,false);assert.equal(settingsSchema.safeParse({...defaults,mapsUrl:'javascript:alert(1)'}).success,false)});
