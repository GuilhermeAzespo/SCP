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
    
    // Also check chroot directory permissions to debug
    let perms: string[] = [];
    try {
      perms = execSync('ls -ld / /app /app/data /app/data/uploads /app/data/uploads/* 2>/dev/null', { encoding: 'utf-8' }).split('\n');
    } catch(e) {}

    return NextResponse.json({ 
      sshd: sshdLog, 
      cron: cronLog, 
      rsync: rsyncLog,
      perms 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
