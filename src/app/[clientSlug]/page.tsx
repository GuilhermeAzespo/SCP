import React from "react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth-utils";
import { cookies } from "next/headers";
import { 
  FolderOpen, FileText, Download, Calendar, 
  HardDrive, Lock, ShieldCheck, HelpCircle 
} from "lucide-react";
import PortalPasswordForm from "./PortalPasswordForm";
import Link from "next/link";

interface PageProps {
  params: Promise<{ clientSlug: string }>;
}

export default async function ClientPortalPage({ params }: PageProps) {
  const { clientSlug } = await params;

  // 1. Fetch client and their files directly from SQLite
  const client = await db.client.findUnique({
    where: { slug: clientSlug },
    include: {
      files: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  // 2. Handle client not found
  if (!client) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <div className="glass-panel" style={{ maxWidth: "480px", width: "100%", padding: "3rem 2rem", textAlign: "center" }}>
          <HelpCircle size={48} style={{ color: "var(--accent-danger)", marginBottom: "1rem" }} />
          <h2 style={{ fontSize: "1.5rem" }}>Portal Não Encontrado</h2>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.5rem", marginBottom: "1.5rem", fontSize: "0.9375rem" }}>
            O link de compartilhamento que você acessou parece estar incorreto, foi removido ou está temporariamente indisponível.
          </p>
          <Link href="/" className="btn btn-secondary" style={{ textDecoration: "none", display: "inline-flex" }}>
            Voltar ao Início
          </Link>
        </div>
      </main>
    );
  }

  // 3. Verify access permissions
  let isAuthorized = true;
  
  if (client.passwordHash) {
    isAuthorized = false;
    
    // Check if logged in as admin (bypass)
    const adminSession = await getSession();
    if (adminSession) {
      isAuthorized = true;
    } else {
      // Check client session cookie
      const cookieStore = await cookies();
      const clientCookie = cookieStore.get(`client_auth_${client.id}`)?.value;
      if (clientCookie === "authenticated") {
        isAuthorized = true;
      }
    }
  }

  // 4. Render password prompt if unauthorized
  if (!isAuthorized) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <PortalPasswordForm clientId={client.id} />
      </main>
    );
  }

  // 5. Calculate statistics
  const fileCount = client.files.length;
  const totalSize = client.files.reduce((acc, f) => acc + f.size, 0);

  // Formatting utilities
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  return (
    <main style={{ minHeight: "100vh", padding: "3rem 1.5rem" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "2.5rem" }}>
        {/* PORTAL HEADER CARD */}
        <div className="glass-panel animate-fade-in" style={{ padding: "2.5rem 2rem", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "1.5rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "0.25rem" }}>
              <div style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", width: "36px", height: "36px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-primary)" }}>
                <FolderOpen size={18} />
              </div>
              <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", fontWeight: 700 }}>
                Portal do Cliente
              </span>
            </div>
            <h1 style={{ fontSize: "2.25rem", color: "white" }}>{client.name}</h1>
            <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "4px" }}>
              <ShieldCheck size={14} style={{ color: "var(--accent-success)" }} />
              Acesso seguro autorizado pelo SCP
            </p>
          </div>

          {/* Aggregate metrics */}
          <div style={{ display: "flex", gap: "1.5rem" }}>
            <div className="glass-panel" style={{ padding: "10px 18px", borderRadius: "var(--border-radius-md)", background: "rgba(255,255,255,0.01)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                <HardDrive size={12} />
                <span>Espaço Total</span>
              </div>
              <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>
                {formatBytes(totalSize)}
              </div>
            </div>

            <div className="glass-panel" style={{ padding: "10px 18px", borderRadius: "var(--border-radius-md)", background: "rgba(255,255,255,0.01)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                <FileText size={12} />
                <span>Arquivos</span>
              </div>
              <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>
                {fileCount}
              </div>
            </div>
          </div>
        </div>

        {/* SHARED FILES HUB */}
        <div>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "1.25rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>Arquivos Disponíveis para Download</span>
          </h2>

          {client.files.length === 0 ? (
            <div className="glass-panel animate-fade-in" style={{ padding: "5rem 2rem", textAlign: "center" }}>
              <FileText size={48} style={{ color: "var(--text-muted)", marginBottom: "1rem", opacity: 0.4 }} />
              <h3>Nenhum arquivo compartilhado</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", maxWidth: "340px", margin: "0.5rem auto 0 auto" }}>
                Nenhum documento ou arquivo foi anexado a este portal até o momento. Por favor, contate o administrador.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }} className="animate-fade-in">
              {client.files.map((file) => (
                <div 
                  key={file.id} 
                  className="glass-panel" 
                  style={{
                    padding: "1.5rem 1.75rem",
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    gap: "1.5rem",
                    transition: "transform 0.2s ease, border-color 0.2s ease"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", minWidth: "240px", flex: 1 }}>
                    {/* File Icon */}
                    <div style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid var(--glass-border)",
                      width: "48px",
                      height: "48px",
                      borderRadius: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text-secondary)"
                    }}>
                      <FileText size={22} />
                    </div>

                    {/* Metadata details */}
                    <div>
                      <h3 style={{ fontSize: "1.0625rem", color: "white", wordBreak: "break-all" }}>{file.name}</h3>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <HardDrive size={12} />
                          {formatBytes(file.size)}
                        </span>
                        <span>•</span>
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <Calendar size={12} />
                          Compartilhado em {new Date(file.createdAt).toLocaleDateString("pt-BR")}
                        </span>
                        <span>•</span>
                        <span style={{
                          background: "rgba(255,255,255,0.03)",
                          padding: "1px 6px",
                          borderRadius: "3px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.6875rem",
                          border: "1px solid var(--glass-border)",
                          color: "var(--text-secondary)"
                        }}>
                          {file.mimeType.split("/")[1] || "unknown"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Link button */}
                  <div>
                    <a 
                      href={`/${client.slug}/${encodeURIComponent(file.name)}`}
                      className="btn btn-primary"
                      style={{
                        padding: "10px 18px",
                        fontSize: "0.875rem",
                        textDecoration: "none"
                      }}
                    >
                      <Download size={16} />
                      <span>Baixar Arquivo</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
