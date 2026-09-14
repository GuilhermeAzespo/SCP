import { NextResponse } from 'next/server';
import fs from 'fs';
import { execSync } from 'child_process';

export async function GET() {
  try {
    const getLog = (path: string) => {
      try {
        if (fs.existsSync(path)) {
          return execSync(`tail -n 100 ${path}`, { encoding: 'utf-8' }).split('\n');
        }
      } catch (e) {}
      return ['Arquivo não encontrado ou vazio.'];
    };

    const sshdLog = getLog('/app/data/sshd.log');
    const cronLog = getLog('/app/data/cron.log');
    const rsyncLog = getLog('/app/data/rsync.log');
    
    // Check chroot directory permissions to debug
    let perms: string[] = [];
    try {
      perms = execSync('ls -ld / /app /app/data /app/data/uploads /app/data/uploads/* 2>/dev/null', { encoding: 'utf-8' }).split('\n');
    } catch(e) {}

    // Check shadow entries for client users (mask password hash prefix only for security)
    let shadowEntries: string[] = [];
    try {
      const shadowFile = fs.readFileSync('/etc/shadow', 'utf-8');
      shadowEntries = shadowFile.split('\n')
        .filter(line => line && !line.startsWith('root') && !line.startsWith('nobody'))
        .map(line => {
          const parts = line.split(':');
          if (parts.length >= 2 && parts[1] && parts[1] !== '!' && parts[1] !== '*' && parts[1] !== '!!') {
            // Show only the algorithm prefix (e.g. $6$ for SHA-512, $y$ for yescrypt) 
            const hash = parts[1];
            const algoMatch = hash.match(/^\$[^$]+\$/);
            parts[1] = algoMatch ? `${algoMatch[0]}***HASH_MASKED***` : '***NO_VALID_HASH***';
          } else if (parts.length >= 2) {
            parts[1] = parts[1] || '***EMPTY/LOCKED***';
          }
          return parts.join(':');
        });
    } catch(e: any) { shadowEntries = [`Error reading shadow: ${e.message}`]; }

    // Check /etc/login.defs for default encryption method
    let loginDefs: string[] = [];
    try {
      loginDefs = execSync("grep -E 'ENCRYPT_METHOD|SHA_CRYPT' /etc/login.defs 2>/dev/null || echo 'not found'", { encoding: 'utf-8' }).split('\n');
    } catch(e) { loginDefs = ['error reading login.defs']; }

    // Check /etc/passwd for client users
    let passwdEntries: string[] = [];
    try {
      const passwdFile = fs.readFileSync('/etc/passwd', 'utf-8');
      passwdEntries = passwdFile.split('\n').filter(line => {
        const uid = parseInt(line.split(':')[2] || '0');
        return uid >= 1000 && uid < 65534;
      });
    } catch(e: any) { passwdEntries = [`Error: ${e.message}`]; }

    return NextResponse.json({ 
      sshd: sshdLog, 
      cron: cronLog, 
      rsync: rsyncLog,
      perms,
      shadowEntries,
      loginDefs,
      passwdEntries
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}