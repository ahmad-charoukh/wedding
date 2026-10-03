import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {getStore} from '@netlify/blobs';
import {query} from './db.mjs';
import {defaults} from './defaults.mjs';
import {ipHash,verifyPassword,tokenHash,cookie,readToken} from './security.mjs';
import {rsvpSchema,messageSchema,settingsSchema} from './validation.mjs';
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
async function body(req,limit=20000){const text=await req.text();if(Buffer.byteLength(text)>limit)throw new HttpError(413,'حجم البيانات أكبر من المسموح');try{return JSON.parse(text)}catch{throw new HttpError(400,'بيانات غير صالحة')}}
function validate(schema,data){const parsed=schema.safeParse(data);if(!parsed.success)throw new HttpError(400,'تحقق من الحقول المطلوبة وطول النص وصحة البيانات');return parsed.data}
async function settings(){const {rows}=await query('SELECT data FROM wedding_settings WHERE id=1');return {...defaults,...(rows[0]?JSON.parse(rows[0].data):{})}}
async function saveSettings(data){await query('INSERT INTO wedding_settings (id,data) VALUES (1,$1) ON CONFLICT (id) DO UPDATE SET data=excluded.data',[JSON.stringify(data)])}
async function authorized(req){const t=readToken(req);if(!t)return false;const {rows}=await query('SELECT token_hash FROM sessions WHERE token_hash=$1 AND expires_at>$2',[tokenHash(t),Date.now()]);return rows.length>0}
async function limit(key,max=8,window=600000){const now=Date.now();const bucket=Math.floor(now/window);const {rows}=await query('INSERT INTO rate_limits (key,count,expires_at) VALUES ($1,1,$2) ON CONFLICT (key) DO UPDATE SET count=rate_limits.count+1 RETURNING count',[`${key}:${bucket}`,now+window]);if(Number(rows[0].count)>max)throw new HttpError(429,'طلبات كثيرة، يرجى المحاولة لاحقًا');await query('DELETE FROM rate_limits WHERE expires_at<$1',[now]);await query('DELETE FROM sessions WHERE expires_at<$1',[now])}
const localMedia=()=>!process.env.NETLIFY;
async function putMusic(key,bytes){if(localMedia()){await mkdir('.data/music',{recursive:true});await writeFile(`.data/music/${key}`,bytes)}else await getStore('wedding-music').set(key,bytes)}
async function deleteMusic(key){if(!key)return;if(localMedia())await unlink(`.data/music/${key}`).catch(()=>{});else await getStore('wedding-music').delete(key)}
async function getMusic(key){if(localMedia()){try{return await readFile(`.data/music/${key}`)}catch{return null}}const b=await getStore('wedding-music').get(key,{type:'arrayBuffer'});return b?Buffer.from(b):null}
export default async function handler(req,context={}){
 try{
  const url=new URL(req.url),p=url.pathname.replace(/^\/\.netlify\/functions\/api/,'/api'),m=req.method;
  if(!['GET','HEAD'].includes(m)){
   if(req.headers.get('origin')!==url.origin)throw new HttpError(403,'طلب غير مسموح');
   const size=Number(req.headers.get('content-length')||0);if(size>4.1*1024*1024)throw new HttpError(413,'الحد الأقصى للملف 4 MB');
  }
  if(p.startsWith('/api/admin/')&&p!=='/api/admin/login'&&!await authorized(req))throw new HttpError(401,'يرجى تسجيل الدخول');
  if(p==='/api/wedding'&&m==='GET'){const s=await settings();const {musicKey,moderation,...publicSettings}=s;return json(publicSettings)}
  if(p.startsWith('/api/music/')&&['GET','HEAD'].includes(m)){
   const key=p.split('/').pop();if(!/^[a-f0-9-]+\.(mp3|m4a|wav)$/.test(key))throw new HttpError(404,'الملف غير موجود');
   const bytes=await getMusic(key);if(!bytes)throw new HttpError(404,'الملف غير موجود');
   const headers={'Content-Type':key.endsWith('.mp3')?'audio/mpeg':key.endsWith('.m4a')?'audio/mp4':'audio/wav','Cache-Control':'public, max-age=31536000, immutable','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'};
   const range=req.headers.get('range');if(range){const match=range.match(/^bytes=(\d*)-(\d*)$/);if(!match)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.length}`}});let start=match[1]?Number(match[1]):Math.max(0,bytes.length-Number(match[2]));let end=match[1]?(match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1):bytes.length-1;if(start>end||start>=bytes.length)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.length}`}});return new Response(m==='HEAD'?null:bytes.subarray(start,end+1),{status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':String(end-start+1)}})}
   return new Response(m==='HEAD'?null:bytes,{headers:{...headers,'Content-Length':String(bytes.length)}});
  }
  if(p==='/api/messages'&&m==='GET'){const page=Math.max(0,Math.min(100000,Number(url.searchParams.get('page'))||0));const {rows}=await query("SELECT id,full_name,message,created_at FROM guestbook_messages WHERE status='approved' ORDER BY created_at DESC LIMIT 12 OFFSET $1",[page*12]);return json(rows)}
  if(p==='/api/rsvp'&&m==='POST'){const v=validate(rsvpSchema,await body(req));const hash=ipHash(context.ip||'local');await limit('rsvp:'+hash);await query('INSERT INTO rsvp (id,full_name,phone,attendance_status,guest_count,message,created_at,ip_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),v.full_name,v.phone,v.attendance_status,v.guest_count,v.message,new Date().toISOString(),hash]);return json({ok:true},201)}
  if(p==='/api/messages'&&m==='POST'){const v=validate(messageSchema,await body(req));await limit('message:'+ipHash(context.ip||'local'));const s=await settings();await query('INSERT INTO guestbook_messages (id,full_name,message,status,created_at) VALUES ($1,$2,$3,$4,$5)',[randomUUID(),v.full_name,v.message,s.moderation,new Date().toISOString()]);return json({ok:true,status:s.moderation},201)}
  if(p==='/api/admin/login'&&m==='POST'){
   await limit('login:'+ipHash(context.ip||'local'),8,900000);const v=await body(req);if(typeof v.username!=='string'||typeof v.password!=='string'||v.password.length>300)throw new HttpError(400,'بيانات غير صالحة');
   if(!process.env.ADMIN_USERNAME||!process.env.ADMIN_PASSWORD_HASH)throw new HttpError(503,'يجب إعداد حساب المدير أولًا');
   const valid=verifyPassword(v.password,process.env.ADMIN_PASSWORD_HASH);if(v.username!==process.env.ADMIN_USERNAME||!valid)throw new HttpError(401,'اسم المستخدم أو كلمة المرور غير صحيحة');
   const old=readToken(req);if(old)await query('DELETE FROM sessions WHERE token_hash=$1',[tokenHash(old)]);
   const token=randomBytes(32).toString('hex');await query('INSERT INTO sessions (token_hash,expires_at) VALUES ($1,$2)',[tokenHash(token),Date.now()+43200000]);return json({ok:true},200,{'Set-Cookie':cookie(token)});
  }
  if(p==='/api/admin/session'&&m==='GET')return json({ok:true});
  if(p==='/api/admin/logout'&&m==='POST'){await query('DELETE FROM sessions WHERE token_hash=$1',[tokenHash(readToken(req))]);return json({ok:true},200,{'Set-Cookie':cookie('',0)})}
  if(p==='/api/admin/stats'&&m==='GET'){
   const a=(await query("SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN attendance_status='attending' THEN 1 ELSE 0 END),0) AS attending,COALESCE(SUM(CASE WHEN attendance_status='declined' THEN 1 ELSE 0 END),0) AS declined,COALESCE(SUM(guest_count),0) AS guests FROM rsvp")).rows[0];const b=(await query('SELECT COUNT(*) AS messages FROM guestbook_messages')).rows[0];return json({...a,...b})
  }
  if(p==='/api/admin/rsvp'&&m==='GET'){
   const search=(url.searchParams.get('q')||'').slice(0,80),status=url.searchParams.get('status')||'all',page=Math.max(0,Number(url.searchParams.get('page'))||0);
   const {rows}=await query("SELECT id,full_name,phone,attendance_status,guest_count,message,created_at FROM rsvp WHERE (LOWER(full_name) LIKE $1 OR phone LIKE $2) AND ($3='all' OR attendance_status=$4) ORDER BY created_at DESC LIMIT 50 OFFSET $5",[`%${search.toLowerCase()}%`,`%${search}%`,status,status,page*50]);return json(rows)
  }
  if(p==='/api/admin/messages'&&m==='GET'){const page=Math.max(0,Number(url.searchParams.get('page'))||0);return json((await query('SELECT * FROM guestbook_messages ORDER BY created_at DESC LIMIT 50 OFFSET $1',[page*50])).rows)}
  if(/^\/api\/admin\/messages\/[a-f0-9-]+$/.test(p)&&['DELETE','PATCH'].includes(m)){
   const id=p.split('/').pop();if(m==='DELETE')await query('DELETE FROM guestbook_messages WHERE id=$1',[id]);else{const v=await body(req);if(!['approved','hidden','pending'].includes(v.status))throw new HttpError(400,'حالة غير صالحة');await query('UPDATE guestbook_messages SET status=$1 WHERE id=$2',[v.status,id])}return json({ok:true})
  }
  if(p==='/api/admin/settings'&&m==='GET')return json(await settings());
  if(p==='/api/admin/settings'&&m==='PUT'){const v=validate(settingsSchema,await body(req));await saveSettings({...await settings(),...v});return json({ok:true})}
  if(p==='/api/admin/music'&&m==='POST'){
   const form=await req.formData(),file=form.get('file');if(!file||typeof file.arrayBuffer!=='function'||file.size>4*1024*1024||file.size<16)throw new HttpError(400,'اختر ملفًا صوتيًا لا يزيد عن 4 MB');
   const ext=file.name.split('.').pop().toLowerCase(),bytes=Buffer.from(await file.arrayBuffer());
   const valid=(ext==='mp3'&&(bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224)))||(ext==='wav'&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WAVE')||(ext==='m4a'&&bytes.subarray(4,8).toString()==='ftyp');
   if(!valid)throw new HttpError(400,'الصيغ المسموحة MP3 / M4A / WAV فقط');
   const key=`${randomUUID()}.${ext}`;await putMusic(key,bytes);const old=await settings();try{await saveSettings({...old,musicKey:key,musicName:file.name.slice(0,150),musicUrl:'/api/music/'+key})}catch(e){await deleteMusic(key);throw e}await deleteMusic(old.musicKey).catch(()=>{});return json({ok:true})
  }
  if(p==='/api/admin/music'&&m==='DELETE'){const old=await settings();await saveSettings({...old,musicUrl:defaults.musicUrl,musicName:defaults.musicName,musicKey:null});await deleteMusic(old.musicKey).catch(()=>{});return json({ok:true})}
  throw new HttpError(404,'الصفحة غير موجودة');
 }catch(e){if(!e.status)console.error('API error:',e.message);return json({error:e.status?e.message:'تعذر إتمام الطلب، حاول مرة أخرى.'},e.status||503)}
}
