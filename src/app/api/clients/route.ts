import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth-utils";
import { syncSshUser } from "@/lib/ssh-sync";

// Slugify helper
function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w\-]+/g, "") // Remove all non-word chars
    .replace(/\-\-+/g, "-"); // Replace multiple - with single -
}

// GET all clients
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clients = await db.client.findMany({
      orderBy: { name: "asc" },
      include: {
        files: {
          select: {
            size: true,
          },
        },
      },
    });

    // Map clients to include statistics
    const clientStats = clients.map((client) => {
      const fileCount = client.files.length;
      const totalSize = client.files.reduce((acc, f) => acc + f.size, 0);
      
      // Don't leak password hashes
      const { passwordHash, sshPasswordHash, ...safeClient } = client;
      
      return {
        ...safeClient,
        isPasswordProtected: !!passwordHash,
        fileCount,
        totalSize,
      };
    });

    return NextResponse.json({ success: true, clients: clientStats });
  } catch (error) {
    console.error("Fetch clients error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST create client
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, password } = await request.json();

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "Client name is required" },
        { status: 400 }
      );
    }

    // Generate unique slug
    let baseSlug = slugify(name);
    if (!baseSlug) {
      baseSlug = "client";
    }
    
    let slug = baseSlug;
    let count = 1;
    
    // Check if slug already exists and increment until unique
    while (true) {
      const existing = await db.client.findUnique({
        where: { slug },
      });
      if (!existing) break;
      slug = `${baseSlug}-${count}`;
      count++;
    }

    // Optional password protection
    let passwordHash: string | null = null;
    if (password && password.trim() !== "") {
      passwordHash = await hashPassword(password); // bcrypt for web panel
    }

    const client = await db.client.create({
      data: {
        name: name.trim(),
        slug,
        passwordHash,
        sshPasswordHash: null, // Will be populated after chpasswd runs
      },
    });

    // Synchronize to Linux SSH: pass PLAINTEXT password so chpasswd can do SHA-512 natively
    // Then capture the generated hash and store it in DB for boot restores
    const generatedHash = syncSshUser(client.slug, password || null, null);
    if (generatedHash) {
      await db.client.update({
        where: { id: client.id },
        data: { sshPasswordHash: generatedHash },
      });
      console.log(`[SSH Sync] Stored SHA-512 hash in DB for client: ${client.slug}`);
    }

    return NextResponse.json({
      success: true,
      client: {
        id: client.id,
        name: client.name,
        slug: client.slug,
        isPasswordProtected: !!client.passwordHash,
      },
    });
  } catch (error) {
    console.error("Create client error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
