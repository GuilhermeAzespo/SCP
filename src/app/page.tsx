import Link from "next/link";
import { FolderKanban, ShieldCheck, Link2 } from "lucide-react";

export default function Home() {
  return (
    <main style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem",
      position: "relative"
    }}>
      <div className="glass-panel-glow animate-fade-in" style={{
        maxWidth: "600px",
        width: "100%",
        padding: "3.5rem 2.5rem",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "2rem"
      }}>
        {/* Logo/Icon */}
        <div style={{
          background: "linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(6,182,212,0.2) 100%)",
          border: "1px solid rgba(99,102,241,0.3)",
          width: "80px",
          height: "80px",
          borderRadius: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 32px rgba(99,102,241,0.15)",
          color: "#6366f1"
        }}>
          <FolderKanban size={40} />
        </div>

        {/* Title */}
        <div>
          <h1 style={{ fontSize: "2.25rem", marginBottom: "0.5rem", background: "linear-gradient(to right, #fff, #9ca3af)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            SCP Portal
          </h1>
          <p style={{ fontSize: "1.125rem", color: "var(--text-secondary)" }}>
            Sistema de Compartilhamento e Armazenamento de Arquivos
          </p>
        </div>

        {/* Features */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1.5rem",
          width: "100%",
          textAlign: "left",
          marginTop: "1rem"
        }}>
          <div className="glass-panel" style={{ padding: "1.25rem", borderRadius: "var(--border-radius-md)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--accent-secondary)", fontWeight: 600 }}>
              <Link2 size={18} />
              <span>Links Diretos</span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              Acesse seus arquivos diretamente através de URLs limpas e fáceis de lembrar.
            </p>
          </div>
          <div className="glass-panel" style={{ padding: "1.25rem", borderRadius: "var(--border-radius-md)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--accent-primary)", fontWeight: 600 }}>
              <ShieldCheck size={18} />
              <span>Acesso Seguro</span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              Portais protegidos por senha para assegurar que apenas pessoas autorizadas façam downloads.
            </p>
          </div>
        </div>

        {/* Call to Actions */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          width: "100%",
          marginTop: "1rem"
        }}>
          <Link href="/admin" className="btn btn-primary" style={{ width: "100%", height: "50px", fontSize: "1rem" }}>
            Painel do Administrador
          </Link>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            Clientes devem acessar seus arquivos pelo link direto compartilhado (ex: <code style={{ color: "var(--accent-secondary)", fontFamily: "var(--font-mono)" }}>dominio.com/nome-cliente</code>).
          </div>
        </div>
      </div>
      
      <div style={{
        marginTop: "2rem",
        fontSize: "0.75rem",
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono)"
      }}>
        SCP v1.0.0 • Hospedado no Easypanel
      </div>
    </main>
  );
}
