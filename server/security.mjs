import {scryptSync,randomBytes,timingSafeEqual,createHmac,createHash} from 'node:crypto';
export function hashPassword(password){const salt=randomBytes(16).toString('hex');return `scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`}
export function verifyPassword(password,hash){try{const [type,salt,key]=hash.split(':');if(type!=='scrypt'||!salt||key.length!==128)return false;return timingSafeEqual(Buffer.from(key,'hex'),scryptSync(password,salt,64))}catch{return false}}
export const tokenHash=t=>createHash('sha256').update(t).digest('hex');
export function ipHash(ip){if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32)throw new Error('SESSION_SECRET must be at least 32 characters');return createHmac('sha256',process.env.SESSION_SECRET).update(ip).digest('hex')}
export function cookie(token,maxAge=43200){return `wedding_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NETLIFY||process.env.NODE_ENV==='production'?'; Secure':''}`}
export function readToken(req){return req.headers.get('cookie')?.match(/(?:^|;\s*)wedding_session=([a-f0-9]{64})(?:;|$)/)?.[1]||''}
