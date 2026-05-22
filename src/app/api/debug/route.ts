import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import fs from "fs";
import path from "path";

export async function GET() {
  const files = await db.file.findMany();
  const dataDir = process.env.DATA_DIR || "./data";
  
  const results = files.map(file => {
    const physicalPath = path.resolve(process.cwd(), dataDir, file.path);
    const exists = fs.existsSync(physicalPath);
    
    // Also test what path.join would have done (the old bug)
    const oldBugPath = path.join(process.cwd(), dataDir, file.path);
    const existsOldBug = fs.existsSync(oldBugPath);
    
    return {
      id: file.id,
      name: file.name,
      dbPath: file.path,
      resolvedPhysicalPath: physicalPath,
      existsOnDisk: exists,
      oldBugPath: oldBugPath,
      existsOnOldBugPath: existsOldBug,
      createdAt: file.createdAt
    };
  });

  return NextResponse.json({
    dataDirEnv: process.env.DATA_DIR,
    cwd: process.cwd(),
    results
  });
}
