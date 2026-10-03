import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
let connection;
export async function db(){
 if(connection)return connection;
 if(process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL){
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL||process.env.NETLIFY_DATABASE_URL,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000});
  connection={query:(q,p=[])=>pool.query(q,p),close:()=>pool.end()};
 }else{
  if(process.env.NETLIFY||process.env.NODE_ENV==='production')throw new Error('DATABASE_URL is required in production');
  const {DatabaseSync}=await import('node:sqlite');
  const file=process.env.LOCAL_DB_PATH||'.data/wedding.sqlite';mkdirSync(path.dirname(file),{recursive:true});
  const local=new DatabaseSync(file);local.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  local.exec(readFileSync(new URL('../netlify/database/migrations/001_wedding.sql',import.meta.url),'utf8'));
  connection={query:async(q,p=[])=>{const stmt=local.prepare(q.replace(/\$\d+/g,'?'));return {rows:stmt.all(...p)}},close:()=>local.close()};
 }
 return connection;
}
export async function query(q,p=[]){return (await db()).query(q,p)}
