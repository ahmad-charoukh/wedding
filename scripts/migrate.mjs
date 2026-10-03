import {readFileSync} from 'node:fs';import {db} from '../server/db.mjs';
if(!process.env.DATABASE_URL&&!process.env.NETLIFY_DATABASE_URL)throw new Error('Set DATABASE_URL to your Postgres URL first');
const conn=await db();await conn.query(readFileSync(new URL('../netlify/database/migrations/001_wedding.sql',import.meta.url),'utf8'));await conn.close();console.log('Database migration completed.');
