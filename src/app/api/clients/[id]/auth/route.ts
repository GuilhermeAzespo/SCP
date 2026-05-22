import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { comparePassword } from "@/lib/auth-utils";
import { cookies } from "next/headers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { password } = await request.json();

    if (!password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    const client = await db.client.findUnique({
      where: { id },
    });

    if (!client || !client.passwordHash) {
      return NextResponse.json(
        { error: "Client not found or not password-protected" },
        { status: 400 }
      );
    }

    // Verify client password
    const isPasswordValid = await comparePassword(password, client.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 }
      );
    }

    // Set client-specific cookie
    const cookieStore = await cookies();
    cookieStore.set({
      name: `client_auth_${client.id}`,
      value: "authenticated",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 1 day
      path: "/",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Client portal auth error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
