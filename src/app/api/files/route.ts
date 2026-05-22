import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth-utils";
import fs from "fs";
import path from "path";

// GET files for a client
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    if (!clientId) {
      return NextResponse.json(
        { error: "Client ID is required" },
        { status: 400 }
      );
    }

    const files = await db.file.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, files });
  } catch (error) {
    console.error("Fetch files error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST upload file
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const clientId = formData.get("clientId") as string | null;

    if (!file || !clientId) {
      return NextResponse.json(
        { error: "File and Client ID are required" },
        { status: 400 }
      );
    }

    // Get client info to use slug for directories
    const client = await db.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const originalName = file.name;
    const size = file.size;
    const mimeType = file.type || "application/octet-stream";

    // 1. Resolve a unique client-scoped name in DB (e.g. logo (1).png)
    let finalName = originalName;
    const ext = path.extname(originalName);
    const baseWithoutExt = path.basename(originalName, ext);
    let count = 1;

    while (true) {
      const existing = await db.file.findFirst({
        where: {
          clientId,
          name: finalName,
        },
      });
      if (!existing) break;
      finalName = `${baseWithoutExt} (${count})${ext}`;
      count++;
    }

    // 2. Prepare physical directories
    const dataDir = process.env.DATA_DIR || "./data";
    const clientUploadDir = path.join(process.cwd(), dataDir, "uploads", client.slug);
    
    if (!fs.existsSync(clientUploadDir)) {
      fs.mkdirSync(clientUploadDir, { recursive: true });
    }

    // 3. Generate a safe filesystem path name to avoid characters issue
    const fileId = Math.random().toString(36).substring(2, 15) + "_" + Date.now();
    const safePhysicalName = `${fileId}-${finalName.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const physicalPath = path.join(clientUploadDir, safePhysicalName);

    // 4. Save file to filesystem
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    fs.writeFileSync(physicalPath, buffer);

    // Save relative physical path in database (relative to DATA_DIR/uploads)
    const dbPath = path.join("uploads", client.slug, safePhysicalName);

    // 5. Save in SQLite DB
    const dbFile = await db.file.create({
      data: {
        name: finalName,
        path: dbPath,
        size,
        mimeType,
        clientId,
      },
    });

    return NextResponse.json({
      success: true,
      file: dbFile,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during upload" },
      { status: 500 }
    );
  }
}
