// Isolated credentials and database for browser acceptance tests only.
import{hashPassword}from'../server/security.mjs';import{mkdtempSync}from'node:fs';import{tmpdir}from'node:os';import path from'node:path';
process.env.ADMIN_USERNAME='test-admin';process.env.ADMIN_PASSWORD_HASH=hashPassword('test-browser-password');process.env.SESSION_SECRET='test-session-only-'.repeat(4);process.env.LOCAL_DB_PATH=path.join(mkdtempSync(path.join(tmpdir(),'wedding-browser-')),'db.sqlite');await import('./dev.mjs');
