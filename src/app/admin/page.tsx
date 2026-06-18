"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  FolderPlus, FolderOpen, FileText, Upload, Copy, 
  Trash2, LogOut, Key, Globe, Search, Plus, 
  Check, ShieldAlert, ArrowLeft, ArrowUpRight, RefreshCw, CloudUpload
} from "lucide-react";
import { toast } from "react-hot-toast";

interface Client {
  id: string;
  name: string;
  slug: string;
  isPasswordProtected: boolean;
  fileCount: number;
  totalSize: number;
  createdAt: string;
  rsyncEnabled: boolean;
  rsyncMode: string;
  rsyncProtocol: string;
  rsyncCron: string | null;
  rsyncHost: string | null;
  rsyncSshPort: string | null;
  rsyncUser: string | null;
  rsyncPath: string | null;
  rsyncSshKey: string | null;
  rsyncSshPassword: string | null;
}

interface FileItem {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  downloadCount: number;
  createdAt: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  
  // Auth state
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminUser, setAdminUser] = useState<string | null>(null);
  
  // App data state
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Interactive UI state
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPassword, setNewClientPassword] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  
  // Notification states
  const [copiedStates, setCopiedStates] = useState<{ [key: string]: boolean }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Deploy state
  const [isDeploying, setIsDeploying] = useState(false);
  
  // RSYNC State
  const [isSyncingRsync, setIsSyncingRsync] = useState(false);
  const [isEditingRsync, setIsEditingRsync] = useState(false);
  const [rsyncLastResult, setRsyncLastResult] = useState<{success: boolean; error?: string; logs?: string} | null>(null);
  const [rsyncForm, setRsyncForm] = useState({
    rsyncEnabled: false,
    rsyncMode: "push",
    rsyncProtocol: "rsync",
    rsyncCron: "",
    rsyncHost: "",
    rsyncSshPort: "",
    rsyncUser: "",
    rsyncPath: "",
    rsyncSshKey: "",
    rsyncSshPassword: ""
  });
  
  // Drag & drop file ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Verify admin session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          router.push("/login");
        } else {
          const data = await res.json();
          setIsAdmin(true);
          setAdminUser(data.user.username);
          fetchClients();
        }
      } catch (err) {
        router.push("/login");
      }
    };
    checkAuth();
  }, [router]);

  // 2. Fetch clients
  const fetchClients = async () => {
    try {
      const res = await fetch("/api/clients");
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients);
      }
    } catch (err) {
      console.error("Failed to load clients", err);
    }
  };

  // 3. Fetch files for selected client
  useEffect(() => {
    if (!selectedClient) return;
    
    const fetchFiles = async () => {
      try {
        const res = await fetch(`/api/files?clientId=${selectedClient.id}`);
        if (res.ok) {
          const data = await res.json();
          setFiles(data.files);
        }
      } catch (err) {
        console.error("Failed to load files", err);
      }
    };
    
    fetchFiles();
    setRsyncForm({
      rsyncEnabled: selectedClient.rsyncEnabled || false,
      rsyncMode: selectedClient.rsyncMode || "push",
      rsyncProtocol: selectedClient.rsyncProtocol || "rsync",
      rsyncCron: selectedClient.rsyncCron || "",
      rsyncHost: selectedClient.rsyncHost || "",
      rsyncSshPort: selectedClient.rsyncSshPort || "",
      rsyncUser: selectedClient.rsyncUser || "",
      rsyncPath: selectedClient.rsyncPath || "",
      rsyncSshKey: selectedClient.rsyncSshKey || "",
      rsyncSshPassword: selectedClient.rsyncSshPassword || ""
    });
    setIsEditingRsync(false);
  }, [selectedClient]);

  // 4. Create new client
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) return;

    setGeneralError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: newClientName, 
          password: newClientPassword 
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setGeneralError(data.error || "Erro ao criar cliente");
      } else {
        setNewClientName("");
        setNewClientPassword("");
        setIsCreatingClient(false);
        fetchClients();
        // Automatically select the newly created client
        setSelectedClient(data.client);
      }
    } catch (err) {
      setGeneralError("Erro ao conectar ao servidor.");
    }
  };

  // 5. Delete client
  const handleDeleteClient = async (client: Client) => {
    if (!confirm(`Tem certeza que deseja excluir o cliente "${client.name}"? Todos os arquivos do cliente serão apagados permanentemente!`)) {
      return;
    }

    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setSelectedClient(null);
        setFiles([]);
        toast.success("Cliente excluído com sucesso!");
      } else {
        toast.error("Erro ao excluir cliente.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 6. Reset password
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !resetPasswordValue.trim()) return;

    setResetPasswordError(null);
    try {
      const res = await fetch(`/api/clients/${selectedClient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPasswordValue }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResetPasswordError(data.error || "Erro ao redefinir senha");
      } else {
        setResetPasswordValue("");
        setIsResettingPassword(false);
        toast.success("Senha redefinida com sucesso!");
        fetchClients(); // Refresh client list to update isPasswordProtected status if needed
      }
    } catch (err) {
      setResetPasswordError("Erro ao conectar ao servidor.");
    }
  };

  // 6. Handle File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || !selectedClient) return;

    const uploadedCount = fileList.length;
    const currentFiles = Array.from(fileList);

    // Keep track of uploading filenames
    const fileNames = currentFiles.map(f => f.name);
    setUploadingFiles(prev => [...prev, ...fileNames]);

    for (let i = 0; i < uploadedCount; i++) {
      const file = currentFiles[i];
      const formData = new FormData();
      formData.append("file", file);
      formData.append("clientId", selectedClient.id);

      // Set initial upload progress
      setUploadProgress(prev => ({ ...prev, [file.name]: 10 }));

      try {
        // Mimic upload progress using intervals since standard fetch doesn't support progress events
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => {
            const current = prev[file.name] || 10;
            if (current >= 90) {
              clearInterval(progressInterval);
              return prev;
            }
            return { ...prev, [file.name]: current + 15 };
          });
        }, 150);

        const res = await fetch("/api/files", {
          method: "POST",
          body: formData,
        });

        clearInterval(progressInterval);

        if (res.ok) {
          setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
          
          // Clear progress after short delay
          setTimeout(() => {
            setUploadProgress(prev => {
              const copy = { ...prev };
              delete copy[file.name];
              return copy;
            });
            setUploadingFiles(prev => prev.filter(name => name !== file.name));
          }, 800);

          // Refresh files and clients data to update counts
          const newFilesRes = await fetch(`/api/files?clientId=${selectedClient.id}`);
          if (newFilesRes.ok) {
            const data = await newFilesRes.json();
            setFiles(data.files);
          }
          fetchClients();
        } else {
          toast.error(`Erro ao fazer upload de ${file.name}`);
          setUploadingFiles(prev => prev.filter(name => name !== file.name));
        }
      } catch (err) {
        console.error(err);
        toast.error(`Erro de rede no upload de ${file.name}`);
        setUploadingFiles(prev => prev.filter(name => name !== file.name));
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // 7. Delete individual file
  const handleDeleteFile = async (fileId: string) => {
    if (!confirm("Excluir este arquivo permanentemente?")) return;

    try {
      const res = await fetch(`/api/files/${fileId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setFiles(prev => prev.filter(f => f.id !== fileId));
        fetchClients();
        toast.success("Arquivo excluído com sucesso!");
      } else {
        toast.error("Erro ao excluir arquivo.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 8. Logout
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch (err) {
      console.error(err);
    }
  };

  // Deploy via Easypanel webhook
  const handleDeploy = async () => {
    if (isDeploying) return;
    const confirmed = window.confirm(
      "Isso vai acionar um novo deploy via Easypanel.\n\nO sistema ficará indisponível por alguns minutos durante o processo.\n\nConfirmar?"
    );
    if (!confirmed) return;
    setIsDeploying(true);
    try {
      const res = await fetch("/api/admin/deploy", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Deploy iniciado! O sistema será atualizado em instantes.", { duration: 8000 });
      } else {
        toast.error(data.error || "Erro ao iniciar o deploy.", { duration: 8000 });
      }
    } catch (err) {
      toast.error("Erro de conexão ao acionar o deploy.");
    } finally {
      setIsDeploying(false);
    }
  };

  // RSYNC Manual Trigger
  const handleRsyncSync = async () => {
    if (!selectedClient) return;
    setIsSyncingRsync(true);
    try {
      // Pass the current form mode so "Sincronizar Agora" respects what's configured
      const res = await fetch(
        `/api/rsync?clientId=${selectedClient.id}&mode=${rsyncForm.rsyncMode}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        const logs = data.results?.map((r: any) => r.logs).filter(Boolean).join("\n") || "";
        toast.success("Sincronização RSYNC concluída com sucesso!");
        if (logs) console.info("[RSYNC LOGS]\n" + logs);
        setRsyncLastResult({ success: true, logs });
      } else {
        const failedResult = data.results?.find((r: any) => !r.success);
        const errorMsg = failedResult?.error || data.error || data.details || "Erro desconhecido";
        const logOutput = failedResult?.logs || "";
        toast.error("Erro RSYNC: " + errorMsg, { duration: 8000 });
        console.error("[RSYNC ERROR]", { error: errorMsg, logs: logOutput, raw: data });
        setRsyncLastResult({ success: false, error: errorMsg, logs: logOutput });
      }
    } catch (err) {
      toast.error("Erro ao conectar ao servidor para sincronização.");
      console.error("[RSYNC FETCH ERROR]", err);
      setRsyncLastResult({ success: false, error: String(err) });
    } finally {
      setIsSyncingRsync(false);
    }
  };

  const handleSaveRsync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;
    try {
      const res = await fetch(`/api/clients/${selectedClient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rsyncForm),
      });
      if (res.ok) {
        toast.success("Configurações RSYNC salvas com sucesso!");
        setIsEditingRsync(false);
        fetchClients();
        // Update local selected client object
        setSelectedClient({ ...selectedClient, ...rsyncForm });
      } else {
        toast.error("Erro ao salvar RSYNC");
      }
    } catch (err) {
      toast.error("Erro de conexão");
    }
  };

  // 9. Copy to clipboard helper
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStates(prev => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setCopiedStates(prev => ({ ...prev, [id]: false }));
    }, 2000);
  };

  // Size formatting helper
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  // Dynamic public domain resolution for copying links
  const getPublicBaseUrl = () => {
    if (typeof window !== "undefined") {
      return `${window.location.protocol}//${window.location.host}`;
    }
    return "";
  };

  // Filtering clients based on search
  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "1rem"
      }}>
        <span className="spinner" style={{ width: "32px", height: "32px", color: "var(--accent-primary)" }} />
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Verificando credenciais...</p>
      </div>
    );
  }

  const baseUrl = getPublicBaseUrl();

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* SIDEBAR - CLIENT LIST */}
      <aside className="glass-panel" style={{
        width: "340px",
        borderRadius: 0,
        borderTop: 0,
        borderBottom: 0,
        borderLeft: 0,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0
      }}>
        {/* Sidebar Header */}
        <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--glass-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ background: "var(--gradient-accent)", width: "32px", height: "32px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FolderOpen size={16} style={{ color: "white", margin: "auto" }} />
            </div>
            <h3 style={{ fontSize: "1.125rem" }}>SCP Dashboard</h3>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button 
              onClick={handleDeploy}
              disabled={isDeploying}
              className="btn btn-secondary" 
              title={isDeploying ? "Iniciando deploy..." : "Atualizar sistema (Deploy)"}
              style={{ 
                padding: "8px", 
                borderRadius: "8px",
                background: isDeploying ? undefined : "rgba(234, 179, 8, 0.1)",
                borderColor: isDeploying ? undefined : "rgba(234, 179, 8, 0.3)",
                opacity: isDeploying ? 0.6 : 1,
                cursor: isDeploying ? "not-allowed" : "pointer"
              }}
            >
              <CloudUpload size={16} className={isDeploying ? "animate-spin" : ""} style={{ color: isDeploying ? undefined : "#eab308" }} />
            </button>
            <button 
              onClick={handleLogout}
              className="btn btn-secondary" 
              title="Sair da conta"
              style={{ padding: "8px", borderRadius: "8px" }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* User profile bar */}
        <div style={{ padding: "1rem 1.5rem", background: "rgba(255,255,255,0.01)", borderBottom: "1px solid rgba(255,255,255,0.03)", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent-success)" }} />
          <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 500 }}>
            Administrador: <strong style={{ color: "var(--text-primary)" }}>{adminUser}</strong>
          </span>
        </div>

        {/* Create Client trigger */}
        <div style={{ padding: "1.25rem 1.5rem 0.75rem 1.5rem" }}>
          {!isCreatingClient ? (
            <button 
              onClick={() => setIsCreatingClient(true)}
              className="btn btn-primary"
              style={{ width: "100%" }}
            >
              <Plus size={16} />
              <span>Novo Cliente</span>
            </button>
          ) : (
            <form onSubmit={handleCreateClient} className="glass-panel animate-fade-in" style={{ padding: "1rem", borderRadius: "var(--border-radius-md)", borderStyle: "dashed" }}>
              <h4 style={{ fontSize: "0.875rem", marginBottom: "0.75rem" }}>Criar Novo Cliente</h4>
              
              {generalError && (
                <div style={{ color: "var(--accent-danger)", fontSize: "0.75rem", marginBottom: "0.5rem" }}>
                  {generalError}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                <input
                  type="text"
                  placeholder="Nome do Cliente"
                  className="form-input"
                  style={{ fontSize: "0.8125rem", padding: "8px 12px" }}
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <div style={{ position: "relative" }}>
                  <Key size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                  <input
                    type="password"
                    placeholder="Senha do Portal (Opcional)"
                    className="form-input"
                    style={{ fontSize: "0.8125rem", padding: "8px 12px 8px 30px" }}
                    value={newClientPassword}
                    onChange={(e) => setNewClientPassword(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button type="submit" className="btn btn-primary" style={{ padding: "6px 12px", fontSize: "0.75rem", flex: 1 }}>
                  Salvar
                </button>
                <button 
                  type="button" 
                  onClick={() => { setIsCreatingClient(false); setGeneralError(null); }}
                  className="btn btn-secondary" 
                  style={{ padding: "6px 12px", fontSize: "0.75rem" }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Client Search */}
        <div style={{ padding: "0.5rem 1.5rem 1rem 1.5rem" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              type="text"
              placeholder="Buscar cliente..."
              className="form-input"
              style={{ fontSize: "0.8125rem", padding: "8px 12px 8px 32px" }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Client List Scroll Area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 1rem 1.5rem 1rem", display: "flex", flexDirection: "column", gap: "6px" }}>
          {filteredClients.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
              Nenhum cliente cadastrado
            </div>
          ) : (
            filteredClients.map((client) => {
              const isSelected = selectedClient?.id === client.id;
              return (
                <div
                  key={client.id}
                  onClick={() => setSelectedClient(client)}
                  className="glass-panel"
                  style={{
                    padding: "1rem",
                    borderRadius: "var(--border-radius-md)",
                    cursor: "pointer",
                    background: isSelected ? "rgba(99, 102, 241, 0.08)" : "var(--glass-bg)",
                    borderColor: isSelected ? "var(--accent-primary)" : "var(--glass-border)",
                    transition: "all 0.2s ease",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.9375rem", color: isSelected ? "white" : "var(--text-primary)" }}>
                      {client.name}
                    </span>
                    {client.isPasswordProtected && (
                      <span title="Protegido por senha" style={{ display: "inline-flex" }}>
                        <Key size={12} style={{ color: "var(--accent-primary)" }} />
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    <span>/{client.slug}</span>
                    <span style={{ marginLeft: "auto" }}>
                      {client.fileCount} {client.fileCount === 1 ? "arq" : "arqs"} • {formatBytes(client.totalSize)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* MAIN LAYOUT - SELECTION CONTENT */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        {!selectedClient ? (
          /* Empty onboarding state */
          <div style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "3rem",
            textAlign: "center",
            gap: "1.5rem"
          }}>
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid var(--glass-border)",
              width: "96px",
              height: "96px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)"
            }}>
              <FolderPlus size={44} />
            </div>
            <div>
              <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Nenhum cliente selecionado</h2>
              <p style={{ color: "var(--text-secondary)", maxWidth: "400px", margin: "auto", fontSize: "0.9375rem" }}>
                Selecione um cliente na barra lateral para gerenciar seus arquivos ou crie um novo para começar a compartilhar.
              </p>
            </div>
          </div>
        ) : (
          /* Client specific details page */
          <div style={{ padding: "2.5rem", display: "flex", flexDirection: "column", gap: "2.5rem" }}>
            {/* Header info */}
            <div className="glass-panel" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <h1 style={{ fontSize: "2rem", marginBottom: "0.25rem" }}>{selectedClient.name}</h1>
                  <p style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                    <Globe size={14} style={{ color: "var(--accent-secondary)" }} />
                    <span>Slug: <strong style={{ color: "var(--text-primary)" }}>{selectedClient.slug}</strong></span>
                    {selectedClient.isPasswordProtected && (
                      <>
                        <span style={{ color: "var(--text-muted)" }}>•</span>
                        <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--accent-primary)" }}>
                          <Key size={12} /> Protegido por Senha
                        </span>
                      </>
                    )}
                  </p>
                </div>
                
                <div style={{ display: "flex", gap: "10px" }}>
                  <button 
                    onClick={() => setIsEditingRsync(!isEditingRsync)}
                    className="btn btn-secondary"
                    style={{ padding: "10px 14px", fontSize: "0.8125rem", background: selectedClient.rsyncEnabled ? "rgba(99, 102, 241, 0.1)" : undefined }}
                  >
                    <RefreshCw size={16} style={{ color: selectedClient.rsyncEnabled ? "var(--accent-primary)" : undefined }} />
                    <span>RSYNC</span>
                  </button>
                  <button 
                    onClick={() => setIsResettingPassword(true)}
                    className="btn btn-secondary"
                    style={{ padding: "10px 14px", fontSize: "0.8125rem" }}
                  >
                    <Key size={16} />
                    <span>Resetar Senha</span>
                  </button>
                  <button 
                    onClick={() => handleDeleteClient(selectedClient)}
                    className="btn btn-danger"
                    style={{ padding: "10px 14px", fontSize: "0.8125rem" }}
                  >
                    <Trash2 size={16} />
                    <span>Excluir Cliente</span>
                  </button>
                </div>
              </div>

              {/* Share links card */}
              <div style={{ 
                background: "rgba(0,0,0,0.2)", 
                border: "1px solid rgba(255,255,255,0.03)", 
                borderRadius: "var(--border-radius-md)", 
                padding: "1rem 1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }}>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", fontWeight: 700 }}>
                  Link do Portal de Compartilhamento:
                </span>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <code style={{ 
                    flex: 1, 
                    background: "rgba(255,255,255,0.02)", 
                    padding: "10px 14px", 
                    borderRadius: "8px", 
                    color: "var(--accent-secondary)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.875rem",
                    border: "1px solid var(--glass-border)",
                    overflowX: "auto"
                  }}>
                    {`${baseUrl}/${selectedClient.slug}`}
                  </code>
                  
                  <button 
                    onClick={() => copyToClipboard(`${baseUrl}/${selectedClient.slug}`, selectedClient.id)}
                    className="btn btn-secondary"
                    style={{ height: "42px", padding: "0 14px" }}
                  >
                    {copiedStates[selectedClient.id] ? <Check size={16} style={{ color: "var(--accent-success)" }} /> : <Copy size={16} />}
                    <span>{copiedStates[selectedClient.id] ? "Copiado" : "Copiar"}</span>
                  </button>

                  <a 
                    href={`/${selectedClient.slug}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="btn btn-secondary"
                    style={{ height: "42px", padding: "0 14px", display: "flex", textDecoration: "none" }}
                  >
                    <ArrowUpRight size={16} />
                  </a>
                </div>
              </div>

              {/* RSYNC Configuration Panel */}
              {isEditingRsync && (
                <div style={{ 
                  background: "rgba(0,0,0,0.2)", 
                  border: "1px solid var(--glass-border)", 
                  borderRadius: "var(--border-radius-md)", 
                  padding: "1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.5rem"
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <h3 style={{ fontSize: "1.125rem", display: "flex", alignItems: "center", gap: "8px" }}>
                      <RefreshCw size={18} style={{ color: "var(--accent-primary)" }} /> Configuração de RSYNC
                    </h3>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button 
                        onClick={handleRsyncSync}
                        className="btn btn-secondary" 
                        title="Sincronizar Arquivos Agora"
                        disabled={isSyncingRsync || !rsyncForm.rsyncEnabled}
                        style={{ padding: "8px 12px", borderRadius: "8px", opacity: isSyncingRsync || !rsyncForm.rsyncEnabled ? 0.5 : 1, cursor: isSyncingRsync || !rsyncForm.rsyncEnabled ? "not-allowed" : "pointer", fontSize: "0.8125rem" }}
                      >
                        <RefreshCw size={14} className={isSyncingRsync ? "animate-spin" : ""} /> Sincronizar Agora
                      </button>
                    </div>
                  </div>

                  {/* Sync result log panel */}
                  {rsyncLastResult && (
                    <div style={{
                      background: rsyncLastResult.success ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
                      border: `1px solid ${rsyncLastResult.success ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                      borderRadius: "var(--border-radius-md)",
                      padding: "1rem 1.25rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: rsyncLastResult.success ? "var(--accent-success)" : "var(--accent-danger)" }}>
                          {rsyncLastResult.success ? "✅ Última Sincronização: Sucesso" : "❌ Última Sincronização: Falhou"}
                        </span>
                        <button onClick={() => setRsyncLastResult(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1rem", lineHeight: 1 }}>✕</button>
                      </div>
                      {rsyncLastResult.error && (
                        <p style={{ fontSize: "0.8125rem", color: "var(--accent-danger)", margin: 0, wordBreak: "break-all" }}>{rsyncLastResult.error}</p>
                      )}
                      {rsyncLastResult.logs && (
                        <pre style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "200px", overflowY: "auto", background: "rgba(0,0,0,0.3)", padding: "10px", borderRadius: "6px" }}>{rsyncLastResult.logs}</pre>
                      )}
                    </div>
                  )}

                  <form onSubmit={handleSaveRsync} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", cursor: "pointer" }}>
                        <input 
                          type="checkbox" 
                          checked={rsyncForm.rsyncEnabled} 
                          onChange={(e) => setRsyncForm({...rsyncForm, rsyncEnabled: e.target.checked})} 
                          style={{ width: "16px", height: "16px", accentColor: "var(--accent-primary)" }}
                        />
                        Habilitar Sincronização RSYNC para este cliente
                      </label>
                    </div>

                    {rsyncForm.rsyncEnabled && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                        <div className="form-group">
                          <label className="form-label" style={{ fontSize: "0.75rem" }}>Modo de Sincronismo</label>
                          <select 
                            className="form-input" 
                            value={rsyncForm.rsyncMode} 
                            onChange={(e) => setRsyncForm({...rsyncForm, rsyncMode: e.target.value})}
                            style={{ padding: "8px 12px", fontSize: "0.875rem" }}
                          >
                            <option value="push">Enviar (Push / Espelhar Local no Remoto)</option>
                            <option value="pull">Receber (Pull / Baixar do Remoto para Local)</option>
                            <option value="both">Ambos (Push e Pull)</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label" style={{ fontSize: "0.75rem" }}>Protocolo de Transferência</label>
                          <select 
                            className="form-input" 
                            value={rsyncForm.rsyncProtocol} 
                            onChange={(e) => setRsyncForm({...rsyncForm, rsyncProtocol: e.target.value})}
                            style={{ padding: "8px 12px", fontSize: "0.875rem" }}
                          >
                            <option value="rsync">Rsync (Recomendado / Diferencial)</option>
                            <option value="scp">SCP (Cópia Completa / Equipamentos Legados)</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label" style={{ fontSize: "0.75rem" }}>Cron (Opcional) <small>ex: 0 * * * * (a cada 1 hora)</small></label>
                          <input 
                            type="text" 
                            className="form-input" 
                            placeholder="Deixe em branco para sincronismo apenas manual"
                            value={rsyncForm.rsyncCron} 
                            onChange={(e) => setRsyncForm({...rsyncForm, rsyncCron: e.target.value})}
                            style={{ padding: "8px 12px", fontSize: "0.875rem" }}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label" style={{ fontSize: "0.75rem" }}>Host (IP / Domínio)</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            placeholder="ex: 192.168.1.100"
                            value={rsyncForm.rsyncHost} 
                            onChange={(e) => setRsyncForm({...rsyncForm, rsyncHost: e.target.value})}
                            required={rsyncForm.rsyncEnabled}
                            style={{ padding: "8px 12px", fontSize: "0.875rem" }}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label" style={{ fontSize: "0.75rem" }}>Porta SSH</label>
                          <input 
                            type="number" 
                            className="form-input" 
                            placeholder="22"
                            value={rsyncForm.rsyncSshPort} 
                            onChange={(e) => setRsyncForm({...rsyncForm, rsyncSshPort: e.target.value})}
                            style={{ padding: "8px 12px", fontSize: "0.875rem" }}
                            min="1"
                            max="65535"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label" style={{ fontSize: "0.75rem" }}>Usuário SSH</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            placeholder="ex: root"
                            value={rsyncForm.rsyncUser} 
                            onChange={(e) => setRsyncForm({...rsyncForm, rsyncUser: e.target.value})}
                            required={rsyncForm.rsyncEnabled}
                            style={{ padding: "8px 12px", fontSize: "0.875rem" }}
                          />
                        </div>
                        <div className="form-group" style={{ gridColumn: "span 2" }}>
                          <label className="form-label" style={{ fontSize: "0.75rem" }}>Caminho no Servidor Remoto</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            placeholder="ex: /backup/cliente-a"
                            value={rsyncForm.rsyncPath} 
                            onChange={(e) => setRsyncForm({...rsyncForm, rsyncPath: e.target.value})}
                            required={rsyncForm.rsyncEnabled}
                            style={{ padding: "8px 12px", fontSize: "0.875rem" }}
                          />
                        </div>
                        <div className="form-group" style={{ gridColumn: "span 2" }}>
                          <label className="form-label" style={{ fontSize: "0.75rem" }}>Chave SSH Privada (id_rsa) <small style={{ color: "var(--accent-success)" }}>← Método preferencial</small></label>
                          <textarea 
                            className="form-input" 
                            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..."
                            value={rsyncForm.rsyncSshKey} 
                            onChange={(e) => setRsyncForm({...rsyncForm, rsyncSshKey: e.target.value})}
                            rows={3}
                            style={{ padding: "8px 12px", fontSize: "0.8125rem", fontFamily: "var(--font-mono)" }}
                          />
                        </div>
                        <div className="form-group" style={{ gridColumn: "span 2" }}>
                          <label className="form-label" style={{ fontSize: "0.75rem" }}>
                            Senha SSH
                            {rsyncForm.rsyncSshKey
                              ? <small style={{ marginLeft: "8px", color: "var(--text-muted)" }}>⚠ Ignorada (chave RSA tem prioridade)</small>
                              : rsyncForm.rsyncSshPassword
                              ? <small style={{ marginLeft: "8px", color: "var(--accent-primary)" }}>✓ Método ativo</small>
                              : <small style={{ marginLeft: "8px", color: "var(--text-muted)" }}>Alternativa à Chave RSA</small>
                            }
                          </label>
                          <div style={{ position: "relative" }}>
                            <Key size={14} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: rsyncForm.rsyncSshKey ? "var(--text-muted)" : "var(--accent-primary)", opacity: rsyncForm.rsyncSshKey ? 0.4 : 1 }} />
                            <input
                              type="password"
                              className="form-input"
                              placeholder={rsyncForm.rsyncSshKey ? "Desabilitada (usando chave RSA)" : "Senha do usuário SSH remoto"}
                              value={rsyncForm.rsyncSshPassword}
                              onChange={(e) => setRsyncForm({...rsyncForm, rsyncSshPassword: e.target.value})}
                              disabled={!!rsyncForm.rsyncSshKey}
                              style={{ padding: "8px 12px 8px 34px", fontSize: "0.875rem", opacity: rsyncForm.rsyncSshKey ? 0.45 : 1 }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div style={{ display: "flex", gap: "10px", marginTop: "0.5rem" }}>
                      <button type="submit" className="btn btn-primary" style={{ padding: "8px 16px", fontSize: "0.875rem" }}>
                        Salvar Configurações RSYNC
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>

            {/* Drag & Drop Upload Zone */}
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="glass-panel animate-fade-in"
              style={{
                border: "2px dashed var(--glass-border-glow)",
                padding: "3rem 2rem",
                textAlign: "center",
                cursor: "pointer",
                borderRadius: "var(--border-radius-lg)",
                background: "rgba(99, 102, 241, 0.02)",
                transition: "all 0.3s ease",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "1rem"
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && fileInputRef.current) {
                  fileInputRef.current.files = e.dataTransfer.files;
                  const event = { target: fileInputRef.current } as unknown as React.ChangeEvent<HTMLInputElement>;
                  handleFileUpload(event);
                }
              }}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                multiple 
                style={{ display: "none" }} 
              />
              
              <div style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: "rgba(99,102,241,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-primary)"
              }}>
                <Upload size={32} />
              </div>
              
              <div>
                <h3 style={{ fontSize: "1.125rem", marginBottom: "0.25rem" }}>
                  Arraste e solte arquivos aqui ou <span style={{ color: "var(--accent-primary)" }}>clique para navegar</span>
                </h3>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  Qualquer formato é aceito. O limite de tamanho é definido pelo seu servidor (Easypanel).
                </p>
              </div>
            </div>

            {/* Dynamic Upload Progress */}
            {uploadingFiles.length > 0 && (
              <div className="glass-panel animate-fade-in" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                <h4 style={{ fontSize: "0.875rem" }}>Enviando Arquivos ({uploadingFiles.length})</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {uploadingFiles.map(name => {
                    const prog = uploadProgress[name] || 0;
                    return (
                      <div key={name} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                          <span style={{ color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>{name}</span>
                          <span style={{ color: "var(--accent-secondary)", fontWeight: 600 }}>{prog}%</span>
                        </div>
                        <div style={{ width: "100%", height: "4px", background: "rgba(255,255,255,0.05)", borderRadius: "2px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${prog}%`, background: "var(--gradient-accent)", borderRadius: "2px", transition: "width 0.2s ease" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* File List Table */}
            <div className="glass-panel" style={{ padding: "1.5rem 0", overflowX: "auto" }}>
              <div style={{ padding: "0 1.5rem 1rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--glass-border)" }}>
                <h3 style={{ fontSize: "1.125rem" }}>Arquivos Compartilhados ({files.length})</h3>
              </div>

              {files.length === 0 ? (
                <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--text-muted)" }}>
                  <FileText size={40} style={{ marginBottom: "1rem", opacity: 0.5 }} />
                  <p style={{ fontSize: "0.875rem" }}>Nenhum arquivo enviado para este cliente ainda.</p>
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--glass-border)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                      <th style={{ padding: "12px 24px" }}>Nome do Arquivo</th>
                      <th style={{ padding: "12px 24px" }}>Tipo</th>
                      <th style={{ padding: "12px 24px" }}>Tamanho</th>
                      <th style={{ padding: "12px 24px" }}>Downloads</th>
                      <th style={{ padding: "12px 24px", textAlign: "right" }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => {
                      const directUrl = `${baseUrl}/${selectedClient.slug}/${file.name}`;
                      const isCopied = copiedStates[file.id];
                      
                      return (
                        <tr key={file.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)", fontSize: "0.875rem", color: "var(--text-secondary)", transition: "background 0.2s ease" }}>
                          {/* Name & Date */}
                          <td style={{ padding: "16px 24px", fontWeight: 600, color: "var(--text-primary)" }}>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <span>{file.name}</span>
                              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400, marginTop: "2px" }}>
                                {new Date(file.createdAt).toLocaleString("pt-BR")}
                              </span>
                            </div>
                          </td>
                          {/* Type */}
                          <td style={{ padding: "16px 24px" }}>
                            <span style={{
                              background: "rgba(255,255,255,0.03)",
                              padding: "4px 8px",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              fontFamily: "var(--font-mono)",
                              border: "1px solid var(--glass-border)",
                              color: "var(--text-secondary)"
                            }}>
                              {file.mimeType.split("/")[1] || "unknown"}
                            </span>
                          </td>
                          {/* Size */}
                          <td style={{ padding: "16px 24px" }}>{formatBytes(file.size)}</td>
                          {/* Downloads */}
                          <td style={{ padding: "16px 24px" }}>
                            <span style={{ color: "var(--accent-secondary)", fontWeight: 700 }}>{file.downloadCount}</span>
                          </td>
                          {/* Actions */}
                          <td style={{ padding: "16px 24px", textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: "8px" }}>
                              {/* Copy direct link */}
                              <button 
                                onClick={() => copyToClipboard(directUrl, file.id)}
                                className="btn btn-secondary"
                                title="Copiar link direto"
                                style={{ padding: "8px", borderRadius: "8px" }}
                              >
                                {isCopied ? <Check size={14} style={{ color: "var(--accent-success)" }} /> : <Copy size={14} />}
                              </button>
                              
                              {/* Delete */}
                              <button 
                                onClick={() => handleDeleteFile(file.id)}
                                className="btn btn-danger"
                                title="Excluir arquivo"
                                style={{ padding: "8px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.05)" }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Reset Password Modal */}
      {isResettingPassword && selectedClient && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div className="glass-panel" style={{
            padding: "2rem",
            width: "100%",
            maxWidth: "400px",
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem"
          }}>
            <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Resetar Senha</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              Digite a nova senha para o cliente <strong style={{ color: "var(--text-primary)" }}>{selectedClient.name}</strong>.
            </p>
            
            <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Nova Senha</label>
                <div style={{ position: "relative" }}>
                  <Key size={18} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                  <input
                    type="password"
                    value={resetPasswordValue}
                    onChange={(e) => setResetPasswordValue(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: "42px" }}
                    placeholder="Mínimo 4 caracteres"
                    required
                    minLength={4}
                  />
                </div>
              </div>

              {resetPasswordError && (
                <div style={{ 
                  padding: "10px 14px", 
                  background: "rgba(239, 68, 68, 0.1)", 
                  borderLeft: "3px solid var(--accent-danger)",
                  color: "var(--text-primary)",
                  fontSize: "0.8125rem",
                  borderRadius: "0 4px 4px 0",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}>
                  <ShieldAlert size={14} style={{ color: "var(--accent-danger)" }} />
                  {resetPasswordError}
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", marginTop: "0.5rem" }}>
                <button 
                  type="button" 
                  onClick={() => {
                    setIsResettingPassword(false);
                    setResetPasswordValue("");
                    setResetPasswordError(null);
                  }}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
