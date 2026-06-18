<div align="center">

# 📦 SCP — Secure Cloud Portal

**Plataforma self-hosted de compartilhamento de arquivos com SFTP, RSYNC e portal web para clientes.**

[![Docker](https://img.shields.io/badge/Docker-Alpine%20Linux-2496ED?style=flat-square&logo=docker)](https://www.docker.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-Prisma%207-003B57?style=flat-square&logo=sqlite)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-Privado-red?style=flat-square)](#)

</div>

---

## 💡 O que é o SCP?

O **SCP (Secure Cloud Portal)** é uma plataforma **100% self-hosted** para gerenciar e compartilhar arquivos de forma profissional com seus clientes. Cada cliente recebe um **portal exclusivo com URL própria**, protegido por senha, onde pode visualizar e baixar seus arquivos diretamente.

Além do portal web, o SCP oferece um **servidor SFTP integrado** para transferências diretas via terminal ou programas como FileZilla, e um **sistema de sincronização automática (RSYNC/FTP)** que mantém os arquivos sempre atualizados a partir de servidores remotos.

```
https://seu-dominio.com/nome-do-cliente       → Portal do cliente (web)
sftp://nome-do-cliente@seu-dominio.com:2222   → Acesso SFTP direto
```

---

## ✨ Funcionalidades

| Recurso | Descrição |
|---|---|
| 🔒 **Painel Admin** | Controle total sobre clientes, arquivos, senhas e sincronização via `/admin` |
| 👤 **Portais por Cliente** | Cada cliente tem uma URL exclusiva com seus arquivos isolados |
| 🔑 **Proteção por Senha** | Portais podem ser individualmente protegidos com senha |
| ⚡ **Servidor SFTP** | OpenSSH nativo rodando em paralelo — acesso direto com FileZilla, WinSCP, etc. |
| 🔒 **Chroot Jail** | Cada usuário SFTP é isolado na sua própria pasta, sem acesso ao resto do sistema |
| 🔄 **Sincronização RSYNC** | Sync de arquivos por cliente com suporte a Push, Pull e Both |
| 📅 **Agendador CRON** | Cronogramas individuais por cliente (ex: `*/15 * * * *`) |
| 📊 **SLog — Logs em Tempo Real** | Visualize logs de CRON e RSYNC direto no painel admin |
| 🔁 **Reconstituição no Boot** | Contas SSH são recriadas automaticamente ao reiniciar o container |
| 📤 **Upload Drag & Drop** | Upload múltiplo com barra de progresso em tempo real |
| 📈 **Contador de Downloads** | Acompanhe quantas vezes cada arquivo foi baixado |
| 📦 **Streaming Seguro** | Downloads em chunks para não sobrecarregar a memória do servidor |
| 🎨 **Design Obsidian** | Interface premium com Glassmorphism, animações e tema dark |

---

## 🛠️ Stack Tecnológica

```
Framework:     Next.js 16  (App Router + RSC)
Banco de dados: SQLite + Prisma 7  (adapter better-sqlite3)
Autenticação:  JWT (HttpOnly Cookie) + bcryptjs
SSH/SFTP:      OpenSSH nativo no Alpine Linux (Chroot Jail)
Sincronização: rsync, sshpass, lftp  (via node-cron direto)
Container:     Docker — Node 22 Alpine
Notificações:  react-hot-toast
CSS:           Vanilla CSS  (CSS Variables + Glassmorphism)
```

---

## 🚀 Deploy no Easypanel

### 1. Criar o Serviço
1. No Easypanel, abra seu projeto e clique em **Create Service → App**
2. Dê um nome (ex: `scp`) e salve

### 2. Configurar o Repositório
Na aba **Source**, configure:
- **Repository URL**: `https://github.com/GuilhermeAzespo/SCP.git`
- **Branch**: `main`

### 3. Volume Persistente ⚠️ (Obrigatório)
Na aba **Storage**, adicione um volume:
- **Name**: `scp-data`
- **Container Path**: `/app/data`

> Sem esse volume, o banco SQLite, os arquivos e as chaves SSH serão perdidos a cada reinicialização!

### 4. Portas
Na aba **Ports**, adicione:

| Container Port | Host Port | Uso |
|---|---|---|
| `3000` | `80/443` | Portal web (gerenciado pelo Easypanel) |
| `22` | `2222` | Acesso SFTP/SSH dos clientes |

### 5. Variáveis de Ambiente
Na aba **Environment**, configure:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=sua-senha-segura
JWT_SECRET=uma-string-aleatoria-longa-aqui
```

> Na primeira inicialização com banco vazio, o sistema cria o usuário admin automaticamente com base nessas variáveis.

### 6. Deploy!
Clique em **Deploy**. O Easypanel irá:
1. Clonar o repositório e ler o `Dockerfile`
2. Instalar dependências e compilar o Next.js
3. Ao iniciar, rodar o `entrypoint.sh` que:
   - Aplica as migrations do Prisma
   - Reconstrói todas as contas SSH dos clientes
   - Inicia o servidor OpenSSH (porta 22)
   - Inicia o agendador RSYNC em background
   - Inicia o Next.js (porta 3000)

---

## 💻 Desenvolvimento Local

### Requisitos
- Node.js 22+
- `rsync`, `openssh-client`, `sshpass` instalados no sistema

### Setup

```bash
# 1. Clonar o repositório
git clone https://github.com/GuilhermeAzespo/SCP.git
cd SCP

# 2. Instalar dependências
npm install

# 3. Criar o arquivo de ambiente
cp .env.example .env
# Edite o .env com suas configurações locais

# 4. Inicializar o banco de dados
npx prisma migrate dev --name init
npx prisma generate

# 5. (Opcional) Iniciar o agendador RSYNC em background
node rsync-cron.js &

# 6. Iniciar o servidor de desenvolvimento
npm run dev
```

Acesse em: [http://localhost:3000/admin](http://localhost:3000/admin) — usuário `admin` / senha `admin`

### Variáveis de Ambiente (`.env`)

```env
DATABASE_URL="file:./data/dev.db"
DATA_DIR="./data"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin"
JWT_SECRET="sua-chave-secreta-local"
```

---

## 📁 Estrutura do Projeto

```
SCP/
├── src/
│   ├── app/
│   │   ├── admin/          # Painel administrativo
│   │   ├── [clientSlug]/   # Portal público por cliente
│   │   └── api/            # Endpoints da API REST
│   └── lib/
│       ├── rsync.ts        # Lógica de sincronização RSYNC/FTP
│       └── ssh-sync.ts     # Gerenciamento de usuários SSH
├── prisma/
│   └── schema.prisma       # Esquema do banco de dados
├── rsync-cron.js           # Agendador de tarefas background (CRON)
├── boot-sync.js            # Reconstituição de usuários SSH no boot
├── entrypoint.sh           # Script de inicialização do container
├── sshd_config             # Configuração do servidor OpenSSH
└── Dockerfile              # Imagem Docker de produção
```

---

## 🔐 Segurança

- Senhas de portal web criptografadas com **bcryptjs**
- Senhas SSH armazenadas como hashes **SHA-512** e sincronizadas com o sistema via `chpasswd`
- Sessões gerenciadas com **JWT em cookies HttpOnly** (imunes a XSS)
- Usuários SFTP isolados em **Chroot Jail** — sem acesso fora da sua pasta
- Variáveis sensíveis nunca commitadas (`.env` no `.gitignore`)

---

## 📄 Licença

Uso restrito e privado. Desenvolvido para implantação autônoma em ambientes self-hosted.
