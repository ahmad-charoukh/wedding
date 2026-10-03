import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {randomBytes} from 'node:crypto';import {hashPassword} from '../server/security.mjs';import readline from 'node:readline/promises';
const rl=readline.createInterface({input:process.stdin,output:process.stdout});
const username=(await rl.question('Admin username [admin]: ')).trim()||'admin';
// Generate a strong password instead of echoing a user-entered secret in a terminal prompt.
const password=randomBytes(18).toString('base64url');rl.close();
let env=existsSync('.env')?readFileSync('.env','utf8'):'';
for(const [key,value] of Object.entries({ADMIN_USERNAME:username,ADMIN_PASSWORD_HASH:hashPassword(password),SESSION_SECRET:randomBytes(48).toString('hex')})){env=env.replace(new RegExp(`^${key}=.*$`,'gm'),'').trim()+`\n${key}=${value}\n`}
writeFileSync('.env',env,{mode:0o600});console.log(`\nAdmin: ${username}\nPassword: ${password}\nSaved hashed credentials to .env. Save the password securely; it is not stored. Restart dev after changes.\nProduction: copy .env values into Netlify environment variables (never upload .env).`);
