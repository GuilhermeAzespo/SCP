"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  FolderPlus, FolderOpen, FileText, Upload, Copy, 
  Trash2, LogOut, Key, Globe, Search, Plus, 
  Check, ShieldAlert, ArrowLeft, ArrowUpRight, RefreshCw, CloudUpload,
  BookOpen, Terminal, Clock, Settings, Info
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
  const [showTutorial, setShowTutorial] = useState(false);
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

  // Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    danger?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {}
  });

  const showConfirm = (title: string, message: React.ReactNode, onConfirm: () => void, confirmText = "Confirmar", danger = false) => {
    setConfirmModal({ isOpen: true, title, message, confirmText, danger, onConfirm });
  };

  const closeConfirm = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

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
  const handleDeleteClient = (client: Client) => {
    showConfirm(
      "Excluir Cliente",
      `Tem certeza que deseja excluir o cliente "${client.name}"? Todos os arquivos do cliente serão apagados permanentemente!`,
      async () => {
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
      },
      "Excluir",
      true
    );
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
  const handleDeleteFile = (fileId: string) => {
    showConfirm(
      "Excluir Arquivo",
      "Excluir este arquivo permanentemente?",
      async () => {
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
      },
      "Excluir",
      true
    );
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
  const handleDeploy = () => {
    if (isDeploying) return;
    showConfirm(
      "Iniciar Deploy",
      "Isso vai acionar um novo deploy via Easypanel.\n\nO sistema ficará indisponível por alguns minutos durante o processo.\n\nConfirmar?",
      async () => {
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
      },
      "Iniciar Deploy",
      false
    );
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
        
        // Refresh file list automatically after sync
        const newFilesRes = await fetch(`/api/files?clientId=${selectedClient.id}`);
        if (newFilesRes.ok) {
          const fileData = await newFilesRes.json();
          setFiles(fileData.files);
        }
        fetchClients();
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
      {/* CONFIRM MODAL OVERLAY */}
      {confirmModal.isOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)", zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel animate-fade-in" style={{
            width: "100%", maxWidth: "420px", padding: "1.5rem",
            display: "flex", flexDirection: "column", gap: "1rem",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)"
          }}>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 600 }}>{confirmModal.title}</h3>
            <div style={{ color: "var(--text-secondary)", fontSize: "0.9375rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {confirmModal.message}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "0.5rem" }}>
              <button onClick={closeConfirm} className="btn btn-secondary" style={{ padding: "8px 16px" }}>
                Cancelar
              </button>
              <button 
                onClick={() => { closeConfirm(); confirmModal.onConfirm(); }} 
                className={confirmModal.danger ? "btn btn-danger" : "btn btn-primary"}
                style={{ padding: "8px 16px" }}
              >
                {confirmModal.confirmText || "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

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
            <h3 style={{ fontSize: "1.125rem" }}>SCP</h3>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button 
              onClick={() => { setSelectedClient(null); setShowTutorial(true); }}
              className="btn btn-secondary" 
              title="Tutorial do Sistema"
              style={{ padding: "8px", borderRadius: "8px" }}
            >
              <BookOpen size={16} />
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
                  onClick={() => { setSelectedClient(client); setShowTutorial(false); }}
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
        {showTutorial ? (
          <div style={{ padding: "3rem", maxWidth: "900px", margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: "2.5rem", animation: "fadeIn 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", borderBottom: "1px solid var(--glass-border)", paddingBottom: "1.5rem" }}>
              <div style={{ background: "var(--gradient-primary)", padding: "12px", borderRadius: "12px", boxShadow: "0 4px 20px rgba(99, 102, 241, 0.3)" }}>
                <BookOpen size={28} style={{ color: "white" }} />
              </div>
              <div>
                <h1 style={{ fontSize: "2rem", margin: 0, fontWeight: 700 }}>Tutorial do Sistema</h1>
                <p style={{ color: "var(--text-secondary)", margin: "4px 0 0 0", fontSize: "0.9375rem" }}>Guia completo de uso: SFTP, RSYNC e Agendamentos</p>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--accent-primary)" }}>
                <Terminal size={22} />
                <h2 style={{ fontSize: "1.25rem", margin: 0, fontWeight: 600 }}>1. Como acessar via SFTP / FileZilla</h2>
              </div>
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, margin: 0, fontSize: "0.9375rem" }}>
                O sistema permite que seus clientes se conectem diretamente à pasta deles usando um cliente de FTP moderno (como o <strong>FileZilla</strong> ou WinSCP) utilizando o protocolo seguro <strong>SFTP</strong>.
              </p>
              <div style={{ background: "rgba(0,0,0,0.2)", padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--glass-border)" }}>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px", color: "var(--text-primary)", fontSize: "0.9375rem" }}>
                  <li style={{ display: "flex" }}><strong style={{ color: "var(--text-muted)", width: "120px", flexShrink: 0 }}>Host / Link:</strong> <code style={{ color: "var(--accent-success)", background: "rgba(34, 197, 94, 0.1)", padding: "2px 6px", borderRadius: "4px" }}>sftp://scp.uctechnology.com.br</code></li>
                  <li style={{ display: "flex" }}><strong style={{ color: "var(--text-muted)", width: "120px", flexShrink: 0 }}>Porta:</strong> <code style={{ background: "rgba(255, 255, 255, 0.05)", padding: "2px 6px", borderRadius: "4px" }}>2222</code></li>
                  <li style={{ display: "flex" }}><strong style={{ color: "var(--text-muted)", width: "120px", flexShrink: 0 }}>Usuário:</strong> <span>O "Slug" do cliente (ex: <code style={{ background: "rgba(255, 255, 255, 0.05)", padding: "2px 6px", borderRadius: "4px" }}>uctechdemo</code>)</span></li>
                  <li style={{ display: "flex" }}><strong style={{ color: "var(--text-muted)", width: "120px", flexShrink: 0 }}>Senha:</strong> <span>A senha configurada no painel de administração</span></li>
                </ul>
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", background: "rgba(99, 102, 241, 0.1)", padding: "1.25rem", borderRadius: "8px", borderLeft: "4px solid var(--accent-primary)" }}>
                <Info size={20} style={{ color: "var(--accent-primary)", flexShrink: 0, marginTop: "2px" }} />
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  <strong>Atenção:</strong> Ao fazer o login, o usuário cairá automaticamente na pasta <code>/files</code>, que é a pasta isolada ("Jail") contendo apenas os arquivos dele. Ele não terá acesso aos arquivos de outros clientes nem aos arquivos vitais do servidor.
                </p>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--accent-warning)" }}>
                <RefreshCw size={22} />
                <h2 style={{ fontSize: "1.25rem", margin: 0, fontWeight: 600 }}>2. Como configurar a Sincronização RSYNC</h2>
              </div>
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, margin: 0, fontSize: "0.9375rem" }}>
                A sincronização é uma ferramenta poderosa para espelhar pastas entre servidores automaticamente. Você pode configurar o sistema para puxar (Pull) arquivos de um equipamento de telefonia (PABX) ou enviar (Push) arquivos para outro servidor.
              </p>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                <div style={{ background: "rgba(0,0,0,0.2)", padding: "1.25rem", borderRadius: "8px", border: "1px solid var(--glass-border)" }}>
                  <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem", color: "white" }}>Modo PULL (Puxar)</h3>
                  <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                    O SCP se conecta no servidor do cliente e <strong>copia os arquivos de lá para cá</strong>. Ideal para backup automático de gravações de centrais telefônicas antigas.
                  </p>
                </div>
                <div style={{ background: "rgba(0,0,0,0.2)", padding: "1.25rem", borderRadius: "8px", border: "1px solid var(--glass-border)" }}>
                  <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem", color: "white" }}>Modo PUSH (Enviar)</h3>
                  <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                    O SCP envia os arquivos recém recebidos daqui <strong>para o servidor do cliente</strong>. Ideal para atualizar firmwares ou distribuir mídias remotamente.
                  </p>
                </div>
              </div>
              
              <h3 style={{ fontSize: "1rem", marginTop: "0.5rem", color: "white" }}>Protocolos Disponíveis:</h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.9375rem" }}>
                <li style={{ display: "flex", gap: "10px" }}><span style={{ color: "var(--accent-primary)" }}>•</span><div><strong style={{ color: "var(--text-primary)" }}>Rsync Nativo:</strong> O mais rápido e eficiente. Transfere apenas a diferença entre os arquivos. Requer que o servidor remoto suporte RSYNC sobre SSH.</div></li>
                <li style={{ display: "flex", gap: "10px" }}><span style={{ color: "var(--accent-primary)" }}>•</span><div><strong style={{ color: "var(--text-primary)" }}>SCP Clássico:</strong> Compatível com equipamentos antigos que não possuem o binário do RSYNC instalado, mas aceitam conexões SSH.</div></li>
                <li style={{ display: "flex", gap: "10px" }}><span style={{ color: "var(--accent-primary)" }}>•</span><div><strong style={{ color: "var(--text-primary)" }}>FTP Legacy:</strong> Selecionando a porta 21 nas configurações, o sistema usará automaticamente o protocolo FTP antigo (usando lftp) para conectar em PABXs legados (ex: Yeastar Antigos).</div></li>
              </ul>
            </div>

            <div className="glass-panel" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--accent-success)" }}>
                <Clock size={22} />
                <h2 style={{ fontSize: "1.25rem", margin: 0, fontWeight: 600 }}>3. Configurando Agendamentos (CRON)</h2>
              </div>
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, margin: 0, fontSize: "0.9375rem" }}>
                Para não precisar sincronizar manualmente toda vez, você pode configurar um agendamento automático usando a sintaxe CRON padrão do Linux (5 campos separados por espaço).
              </p>
              
              <div style={{ background: "rgba(0,0,0,0.2)", padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--glass-border)", overflowX: "auto" }}>
                <pre style={{ margin: 0, color: "var(--text-muted)", fontFamily: "monospace", fontSize: "0.875rem", lineHeight: 1.4 }}>
{`*    *    *    *    *
┬    ┬    ┬    ┬    ┬
│    │    │    │    └─ Dia da semana (0 - 7) (0 ou 7 são Domingo)
│    │    │    └── Mês (1 - 12)
│    │    └──── Dia do mês (1 - 31)
│    └────── Hora (0 - 23)
└──────── Minuto (0 - 59)`}
                </pre>
              </div>

              <div>
                <h3 style={{ fontSize: "1rem", marginBottom: "1rem", color: "white" }}>Exemplos Práticos:</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <code style={{ color: "var(--accent-primary)", fontSize: "1rem" }}>0 2 * * *</code>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>Todo dia às 02:00 da manhã</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <code style={{ color: "var(--accent-primary)", fontSize: "1rem" }}>30 18 * * 1-5</code>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>De Segunda a Sexta às 18:30</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <code style={{ color: "var(--accent-primary)", fontSize: "1rem" }}>0 * * * *</code>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>De hora em hora (ex: 10:00, 11:00...)</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <code style={{ color: "var(--accent-primary)", fontSize: "1rem" }}>*/15 * * * *</code>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>A cada 15 minutos indefinidamente</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ height: "2rem" }}></div>
          </div>
        ) : !selectedClient ? (
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
                        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
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
                        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                          <label className="form-label" style={{ fontSize: "0.75rem", marginBottom: "8px" }}>Agendamento CRON (Opcional - deixe em branco para manual)</label>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px" }}>
                            {[
                              { label: "Minuto", placeholder: "*" },
                              { label: "Hora", placeholder: "*" },
                              { label: "Dia do Mês", placeholder: "*" },
                              { label: "Mês", placeholder: "*" },
                              { label: "Dia da Semana", placeholder: "*" }
                            ].map((field, idx) => {
                              const parts = rsyncForm.rsyncCron ? rsyncForm.rsyncCron.split(' ') : ['', '', '', '', ''];
                              const val = parts[idx] || '';
                              return (
                                <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                  <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>{field.label}</span>
                                  <input 
                                    type="text" 
                                    className="form-input" 
                                    placeholder={field.placeholder}
                                    value={val}
                                    onChange={(e) => {
                                      const newParts = [...parts];
                                      while(newParts.length < 5) newParts.push('');
                                      newParts[idx] = e.target.value;
                                      
                                      if (newParts.every(p => !p || p.trim() === '')) {
                                        setRsyncForm({...rsyncForm, rsyncCron: ''});
                                      } else {
                                        const safeParts = newParts.map(p => p && p.trim() !== '' ? p.trim() : '*');
                                        setRsyncForm({...rsyncForm, rsyncCron: safeParts.join(' ')});
                                      }
                                    }}
                                    style={{ padding: "8px 12px", fontSize: "0.875rem", textAlign: "center", background: "rgba(255,255,255,0.03)" }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "8px" }}>
                            O sistema suporta a sintaxe Cron. Exemplos: <code>* * * * *</code> (a cada minuto) | <code>*/5 * * * *</code> (a cada 5 min)
                          </div>
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
