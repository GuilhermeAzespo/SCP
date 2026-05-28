# SCP — Sistema de Compartilhamento de Arquivos

Um sistema auto-hospedado (**Self-Hosted**), seguro e de alta performance para gerenciar e compartilhar arquivos com links diretos, projetado especificamente para ser implantado no **Easypanel** com persistência total em banco SQLite.

Ideal para compartilhar arquivos com clientes de forma rápida, segura e elegante.
Exemplo de acesso:
- `https://seu-dominio.com/cliente-1` (Acesso ao portal do cliente com todos os seus downloads)
- `https://seu-dominio.com/cliente-1/documento.pdf` (Download direto e streaming de alta velocidade)
---

## ✨ Funcionalidades

- 🔒 **Painel Administrativo Restrito**: Controle total sobre clientes, arquivos, senhas e parâmetros de sincronização via `/admin`.
- 👥 **Portais Scoped por Cliente**: Cada cliente possui uma URL única com sua marca e seus arquivos.
- 🔑 **Proteção por Senha (Portal Web)**: Portais de clientes podem ser protegidos por senha individual para segurança adicional.
- ⚡ **Servidor OpenSSH/SFTP Integrado**: O container Docker executa um servidor SSH/SFTP seguro em paralelo na porta `22`. Usuários do sistema Linux são criados e gerenciados dinamicamente com base no `slug` de cada cliente para transferências super velozes via CLI ou programas de FTP (como FileZilla, Cyberduck ou WinSCP).
- 🔄 **Sincronização RSYNC por Cliente**: Configuração granular de sincronização de arquivos para cada cliente com suporte a modos **Push** (envio de arquivos para servidor remoto), **Pull** (recuperação de arquivos do servidor remoto) ou **Both** (ambos).
- 📅 **Agendador Cron Dinâmico**: Defina cronogramas personalizados (ex: `*/15 * * * *`) individualmente por cliente para sincronizações automáticas periódicas.
- 🔑 **Reset de Senha Simplificado**: Interface administrativa avançada para redefinir a senha do portal web e a senha SSH de qualquer cliente com apenas um clique.
- 🔒 **Autenticação Segura com Chave Privada (RSYNC)**: Suporte para chave privada SSH individual por cliente, permitindo sincronização passwordless segura.
- 📝 **Restauro Automático no Boot (Persistência)**: Durante a inicialização do container, um script reconstrói todas as contas SSH Linux de forma segura a partir dos hashes SHA-512 persistidos no SQLite, garantindo que reinicializações ou upgrades de container não quebrem o acesso SFTP/SCP.
- 📈 **Logs de RSYNC em Tempo Real**: Visualize o histórico e o output detalhado da última sincronização manual ou agendada diretamente na página administrativa do cliente.
- 🚀 **Uploader Inteligente**: Suporte a múltiplos uploads por drag & drop com barra de progresso em tempo real.
- 📂 **Resolução de Conflitos**: Renomeia automaticamente arquivos com o mesmo nome para evitar sobrescritas acidentais (ex: `foto.png` -> `foto (1).png`).
- 📈 **Contador de Downloads**: Acompanhe o número total de downloads realizados por arquivo em tempo real.
- 📦 **Downloads de Alta Performance**: Utiliza streaming seguro em pedaços (chunks) evitando sobrecarga de memória RAM no servidor host.
- 🎨 **Design Moderno Obsidian**: Interface fluida, responsiva e premium com tema escuro, efeito Glassmorphism de ponta e notificações visuais interativas por Toast utilizando `react-hot-toast`.

---

## 🛠️ Tecnologias Utilizadas

- **Framework**: Next.js 16 (App Router + React Server Components)
- **Banco de Dados**: SQLite + Prisma 7 (com driver adapter `@prisma/adapter-better-sqlite3` para máxima performance em ambiente standalone)
- **Estilização**: Vanilla CSS (CSS Variables + Glassmorphism Avançado)
- **Segurança**: Criptografia de senhas com `bcryptjs`, senhas SSH em hash criptográfico SHA-512 (`chpasswd`) e sessões JWT seguras em cookies `HttpOnly`
- **Servidor SSH/SFTP**: OpenSSH nativo no Alpine Linux rodando em paralelo no container
- **Agendamento**: `node-cron` com carregamento dinâmico para execução das sincronizações periódicas de RSYNC
- **Notificações**: `react-hot-toast` para notificações e alertas visuais premium na interface
- **Container**: Docker (Node 22 Alpine com ferramentas nativas de compilação C++, `rsync`, `openssh` e `shadow`)

---

## 🚀 Passo a Passo para Subir no Easypanel

O **Easypanel** é um painel de controle incrível que facilita o deploy de aplicações Docker. Siga o passo a passo detalhado abaixo para colocar o seu SCP no ar em minutos:

### 1. Criar um Novo Aplicativo no Easypanel
1. Acesse o painel do seu **Easypanel**.
2. Selecione o seu **Projeto**.
3. Clique no botão **"Create Service"** (Criar Serviço) ou **"App"**.
4. Selecione a opção **"App"** para criar um novo aplicativo em branco.
5. Defina um nome fácil de lembrar (ex: `scp` ou `compartilhamento`).

### 2. Configurar a Origem do Código (GitHub)
1. Vá até a aba **"Source"** (Origem) nas configurações do seu novo aplicativo.
2. Em **Repository Type**, selecione **Git Repository**.
3. No campo **Repository URL**, insira o endereço do seu repositório:
   ```txt
   https://github.com/GuilhermeAzespo/SCP.git
   ```
4. No campo **Branch**, insira: `main`
5. Clique em **Save** (Salvar).

### 3. Configurar o Volume de Persistência (Importante! ⚠️)
Como o aplicativo usa um banco de dados SQLite (`dev.db`), armazena os uploads locais e as chaves SSH em `/app/data`, você **DEVE** configurar um volume persistente. Caso contrário, seus dados, usuários SSH e arquivos serão apagados sempre que o container reiniciar!

1. Acesse a aba **"Storage"** (Armazenamento ou Volumes) no menu do aplicativo no Easypanel.
2. Clique em **"Add Volume"** (Adicionar Volume).
3. Preencha as seguintes informações:
   - **Name**: `scp-data`
   - **Container Path** (Caminho no Container): `/app/data`
   - **Host Path** (Caminho no Host): Pode deixar em branco (o Easypanel criará uma pasta segura automaticamente).
4. Clique em **Save** (Salvar).

### 4. Configurar Portas para Acesso SFTP/SCP (Opcional 📡)
Para permitir que seus clientes façam uploads diretos e transferências por SFTP (porta `22` interna):
1. Acesse a aba **"Ports"** (Portas) nas configurações do aplicativo no Easypanel.
2. Adicione um novo mapeamento de porta:
   - **Container Port**: `22`
   - **Host Port**: `2222` (ou a porta de sua preferência no servidor host, ex: `22` se não estiver em uso).
3. Clique em **Save** (Salvar).
4. *Nota: Seus clientes e ferramentas externas poderão se conectar usando a URL do seu servidor na porta configurada (ex: `sftp://slug-do-cliente@seu-servidor.com:2222`).*

### 5. Configurar as Variáveis de Ambiente (Opcional 🔒)
Se você deseja personalizar o acesso do administrador inicial ou definir uma senha segura padrão, configure as variáveis na aba **"Environment"**:

1. Vá até a aba **"Environment"** (Variáveis de Ambiente).
2. Adicione as seguintes chaves/valores:
   - `ADMIN_USERNAME`: O nome de usuário para acessar o painel `/admin` (Padrão caso não definido: `admin`).
   - `ADMIN_PASSWORD`: A senha para acessar o painel `/admin` (Padrão caso não definido: `admin`).
   - `JWT_SECRET`: Insira uma sequência de caracteres aleatórios seguros (usada para criptografar as sessões).
3. Clique em **Save** (Salvar).

> 💡 **Nota**: O sistema é auto-regenerativo. Na primeira vez que ele iniciar com o banco de dados vazio, ele lerá essas variáveis de ambiente e criará o usuário administrador inicial de forma automática no banco persistente!

### 6. Realizar o Deploy
1. Volte para a aba **"General"** (Geral) ou use o menu superior.
2. Clique no botão **"Deploy"**.
3. O Easypanel irá:
   - Clonar o código diretamente do GitHub.
   - Ler o `Dockerfile` nativo.
   - Instalar as dependências e compilar a aplicação standalone.
   - Executar o `entrypoint.sh` para rodar todas as migrações no banco persistente `/app/data/dev.db`.
   - Iniciar o servidor OpenSSH na porta `22` e o agendador de tarefas RSYNC (`rsync-cron.js`) em segundo plano.
   - Iniciar o servidor Next.js na porta `3000`.

### 7. Configurar o Domínio / DNS
1. Na aba **"Domains"** do Easypanel, o painel criará um subdomínio automático com SSL configurado.
2. Se quiser usar um domínio próprio (ex: `arquivos.suaempresa.com.br`), basta adicioná-lo ali e apontar o DNS tipo `CNAME` no seu provedor de domínios (Cloudflare, GoDaddy, etc.) para o endereço do seu Easypanel.

Pronto! Seu portal de compartilhamento seguro estará no ar e pronto para uso! 🎉

---

## 💻 Desenvolvimento Local

Se você quiser rodar e testar o projeto na sua máquina de desenvolvimento local:

### Requisitos
- Node.js 22 ou superior instalado.
- NPM ou Yarn.

### Passo a Passo

1. **Clonar o Repositório**:
   ```bash
   git clone https://github.com/GuilhermeAzespo/SCP.git
   cd SCP
   ```

2. **Instalar Dependências**:
   ```bash
   npm install
   ```

3. **Configurar as Variáveis de Ambiente**:
   Crie um arquivo `.env` na raiz do projeto contendo:
   ```env
   DATABASE_URL="file:./data/dev.db"
   DATA_DIR="./data"
   ADMIN_USERNAME="admin"
   ADMIN_PASSWORD="admin"
   JWT_SECRET="sua-chave-secreta-local"
   ```

4. **Gerar o Prisma Client e rodar Migrations**:
   ```bash
   npx prisma migrate dev --name init
   npx prisma generate
   ```

5. **Iniciar o Agendador de Sincronizações RSYNC** (Opcional, para testar background cron):
   ```bash
   node rsync-cron.js
   ```

6. **Iniciar Servidor de Desenvolvimento**:
   ```bash
   npm run dev
   ```

7. Acesse:
   - Painel Admin: `http://localhost:3000/admin` (usuário: `admin` / senha: `admin`)
   - Home: `http://localhost:3000`

---

## 📄 Licença

Este projeto é de uso restrito e privado. Desenvolvido para implantação rápida e autônoma.
