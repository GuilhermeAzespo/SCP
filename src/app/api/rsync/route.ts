import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-utils";
import { runRsync, SyncMode } from "@/lib/rsync";

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cronSecret = searchParams.get("cronSecret");
    const modeOverride = searchParams.get("mode") as SyncMode | null;
    const clientId = searchParams.get("clientId") || undefined;

    const session = await getSession();
    // Allow either a valid web session OR the internal cron secret
    if (!session && cronSecret !== "scp-internal-cron-secret-2026") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results = await runRsync(clientId, modeOverride || undefined);
    
    const hasError = results.some(r => !r.success);

    return NextResponse.json({ 
      success: !hasError, 
      results 
    }, { status: hasError ? 500 : 200 });

  } catch (error: any) {
    console.error("RSYNC API error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during RSYNC", details: error.message },
      { status: 500 }
    );
  }
}
