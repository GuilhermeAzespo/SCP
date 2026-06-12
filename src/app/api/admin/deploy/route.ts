import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-utils";

export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const webhookUrl = process.env.EASYPANEL_DEPLOY_HOOK;

    if (!webhookUrl) {
      return NextResponse.json(
        { error: "EASYPANEL_DEPLOY_HOOK não configurada nas variáveis de ambiente." },
        { status: 503 }
      );
    }

    const res = await fetch(webhookUrl, { method: "GET" });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Easypanel respondeu com status ${res.status}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, message: "Deploy iniciado com sucesso!" });
  } catch (error: any) {
    console.error("Deploy webhook error:", error);
    return NextResponse.json(
      { error: "Erro ao acionar o deploy.", details: error.message },
      { status: 500 }
    );
  }
}
