import { NextResponse } from 'next/server';
import fs from 'fs';
import { execSync } from 'child_process';

export async function GET() {
  try {
    let log = '';
    if (fs.existsSync('/app/data/sshd.log')) {
      log = execSync('tail -n 100 /app/data/sshd.log', { encoding: 'utf-8' });
    } else {
      log = 'No sshd.log found';
    }
    
    // Also check chroot directory permissions to debug
    let perms = '';
    try {
      perms = execSync('ls -ld / /app /app/data /app/data/uploads /app/data/uploads/* 2>/dev/null', { encoding: 'utf-8' });
    } catch(e) {}

    return NextResponse.json({ log: log.split('\n'), perms: perms.split('\n') });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
