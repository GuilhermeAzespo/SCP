"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, LogIn, Lock, User } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Credenciais inválidas");
      } else {
        router.push("/admin");
        router.refresh();
      }
    } catch (err) {
      setError("Erro de rede. Tente novamente.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem",
      position: "relative"
    }}>
      <div className="glass-panel animate-fade-in" style={{
        maxWidth: "420px",
        width: "100%",
        padding: "2.5rem 2rem",
        boxShadow: "var(--shadow-lg)"
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(6,182,212,0.1) 100%)",
            border: "1px solid rgba(99,102,241,0.2)",
            width: "56px",
            height: "56px",
            borderRadius: "16px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "1rem",
            color: "var(--accent-primary)"
          }}>
            <Lock size={28} />
          </div>
          <h2>Área Restrita</h2>
          <p style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Faça login para gerenciar clientes e arquivos
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="animate-fade-in" style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            padding: "10px 14px",
            borderRadius: "var(--border-radius-md)",
            color: "#fca5a5",
            fontSize: "0.8125rem",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "1.5rem"
          }}>
            <ShieldAlert size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Usuário</label>
            <div style={{ position: "relative" }}>
              <User size={18} style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)"
              }} />
              <input
                type="text"
                className="form-input"
                placeholder="Ex: admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isLoading}
                style={{ paddingLeft: "42px" }}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Senha</label>
            <div style={{ position: "relative" }}>
              <Lock size={18} style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)"
              }} />
              <input
                type="password"
                className="form-input"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                style={{ paddingLeft: "42px" }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
            style={{ width: "100%", height: "46px", marginTop: "0.5rem" }}
          >
            {isLoading ? (
              <span className="spinner" />
            ) : (
              <>
                <LogIn size={18} />
                <span>Entrar no Painel</span>
              </>
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
