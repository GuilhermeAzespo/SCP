import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth-utils";
import { cookies } from "next/headers";
import fs from "fs";
import path from "path";
import { Readable } from "stream";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientSlug: string; filename: string }> }
) {
  try {
    const { clientSlug, filename } = await params;

    // 1. Find the client
    const client = await db.client.findUnique({
      where: { slug: clientSlug },
    });

    if (!client) {
      return new Response("Client not found", { status: 404 });
    }

    // 2. Check authorization if password protected
    if (client.passwordHash) {
      // Admin bypass
      const adminSession = await getSession();
      if (!adminSession) {
        // Check client-specific cookie
        const cookieStore = await cookies();
        const clientCookie = cookieStore.get(`client_auth_${client.id}`)?.value;
        
        if (clientCookie !== "authenticated") {
          return new Response("Unauthorized - Password required for this client", { status: 401 });
        }
      }
    }

    // 3. Find the file
    const file = await db.file.findFirst({
      where: {
        clientId: client.id,
        name: filename,
      },
    });

    if (!file) {
      return new Response("File not found", { status: 404 });
    }

    // 4. Resolve physical path
    const dataDir = process.env.DATA_DIR || "./data";
    const physicalPath = path.resolve(process.cwd(), dataDir, file.path);

    if (!fs.existsSync(physicalPath)) {
      return new Response("File not found on server storage", { status: 404 });
    }

    // 5. Increment download count in the background
    await db.file.update({
      where: { id: file.id },
      data: { downloadCount: { increment: 1 } },
    });

    // 6. Stream the file using memory-efficient Node Streams
    const fileStream = fs.createReadStream(physicalPath);
    
    // Set headers
    const headers = new Headers();
    headers.set("Content-Type", file.mimeType || "application/octet-stream");
    
    // Serve inline for PDFs and media types to render directly in browser, attachment otherwise
    const viewInline = [
      "application/pdf", 
      "image/png", 
      "image/jpeg", 
      "image/gif", 
      "image/webp", 
      "image/svg+xml",
      "text/plain", 
      "video/mp4", 
      "audio/mpeg"
    ];
    
    if (viewInline.includes(file.mimeType)) {
      headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(file.name)}"`);
    } else {
      headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(file.name)}"`);
    }
    
    headers.set("Content-Length", file.size.toString());

    // Convert node stream to web stream for Next.js response compatibility
    const webStream = Readable.toWeb(fileStream) as ReadableStream;

    return new Response(webStream, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Direct serve error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
