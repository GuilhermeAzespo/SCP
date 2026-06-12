import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth-utils";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { syncSshUser } from "@/lib/ssh-sync";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Find the client to get their slug
    const client = await db.client.findUnique({
      where: { id },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Delete files from the filesystem
    const uploadDir = process.env.DATA_DIR || "./data";
    const clientUploadPath = path.resolve(process.cwd(), uploadDir, "uploads", client.slug);

    if (fs.existsSync(clientUploadPath)) {
      fs.rmSync(clientUploadPath, { recursive: true, force: true });
    }

    // Delete client from DB (cascade deletes file records due to Prisma schema schema)
    await db.client.delete({
      where: { id },
    });

    // Remove the Linux OpenSSH user
    import("@/lib/ssh-sync").then(({ deleteSshUser }) => {
      deleteSshUser(client.slug);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete client error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { 
      password,
      rsyncEnabled,
      rsyncMode,
      rsyncCron,
      rsyncHost,
      rsyncSshPort,
      rsyncUser,
      rsyncPath,
      rsyncSshKey,
      rsyncSshPassword
    } = body;

    const client = await db.client.findUnique({
      where: { id },
    });

    if (!client) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const updateData: any = {};

    // Update password if provided
    if (password !== undefined) {
      if (password.length < 4) {
        return NextResponse.json(
          { error: "A senha deve ter pelo menos 4 caracteres" },
          { status: 400 }
        );
      }
      updateData.passwordHash = await bcrypt.hash(password, 10);
      
      const generatedHash = syncSshUser(client.slug, password, null);
      if (generatedHash) {
        updateData.sshPasswordHash = generatedHash;
      }
    }

    // Update RSYNC settings if provided
    if (rsyncEnabled !== undefined) updateData.rsyncEnabled = rsyncEnabled;
    if (rsyncMode !== undefined) updateData.rsyncMode = rsyncMode;
    if (rsyncCron !== undefined) updateData.rsyncCron = rsyncCron;
    if (rsyncHost !== undefined) updateData.rsyncHost = rsyncHost;
    if (rsyncSshPort !== undefined) updateData.rsyncSshPort = rsyncSshPort;
    if (rsyncUser !== undefined) updateData.rsyncUser = rsyncUser;
    if (rsyncPath !== undefined) updateData.rsyncPath = rsyncPath;
    if (rsyncSshKey !== undefined) updateData.rsyncSshKey = rsyncSshKey;
    if (rsyncSshPassword !== undefined) updateData.rsyncSshPassword = rsyncSshPassword;

    await db.client.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update client error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

