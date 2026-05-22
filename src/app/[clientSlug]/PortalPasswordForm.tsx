"use client";

import React, { useState } from "react";
import { ShieldAlert, Key, LogIn } from "lucide-react";

interface PortalPasswordFormProps {
  clientId: string;
}

export default function PortalPasswordForm({ clientId }: PortalPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/clients/${clientId}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Senha inválida");
      } else {
        // Successful authentication - reload page to let server render files
        window.location.reload();
      }
    } catch (err) {
      setError("Erro de rede. Tente novamente.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-panel animate-fade-in" style={{
      maxWidth: "400px",
      width: "100%",
      padding: "2.5rem 2rem",
      boxShadow: "var(--shadow-lg)",
      textAlign: "center"
    }}>
      {/* Icon */}
      <div style={{
        background: "linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(6,182,212,0.1) 100%)",
        border: "1px solid rgba(99,102,241,0.2)",
        width: "56px",
        height: "56px",
        borderRadius: "16px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: "1.25rem",
        color: "var(--accent-primary)"
      }}>
        <Key size={24} />
      </div>

      <h2 style={{ fontSize: "1.375rem" }}>Portal Protegido</h2>
      <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginTop: "0.25rem", marginBottom: "1.75rem" }}>
        Este portal é restrito. Digite a senha para acessar os arquivos compartilhados.
      </p>

      {/* Error display */}
      {error && (
        <div style={{
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          padding: "10px 14px",
          borderRadius: "var(--border-radius-md)",
          color: "#fca5a5",
          fontSize: "0.8125rem",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "1.25rem",
          textAlign: "left"
        }}>
          <ShieldAlert size={16} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Password form */}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <input
          type="password"
          className="form-input"
          placeholder="Digite a senha de acesso"
          value={password}
          style={{ textAlign: "center" }}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isLoading}
        />

        <button
          type="submit"
          className="btn btn-primary"
          disabled={isLoading}
          style={{ width: "100%", height: "46px" }}
        >
          {isLoading ? (
            <span className="spinner" />
          ) : (
            <>
              <LogIn size={16} />
              <span>Acessar Portal</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
