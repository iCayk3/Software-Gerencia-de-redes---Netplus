# Guia: Como Continuar o Desenvolvimento em Casa (Sem Go)

Este documento foi preparado para você continuar desenvolvendo o **NetPulse** da sua máquina em casa com o mínimo de atrito e **sem precisar ter o compilador Go instalado**.

---

## Opção 1: Modo 100% Node.js (Recomendado para Casa)

> [!TIP]
> **Ideal para:** Desenvolver novas telas, componentes React, personalização de layout, regras visuais, ajustes de prefixos e botões, **mesmo sem VPN ou acesso aos roteadores físicos**.

Neste modo, você utiliza o **Servidor Mock Node.js nativo** (`mock-server.cjs`), que funciona em qualquer máquina que tenha apenas o **Node.js** instalado (sem bibliotecas externas pesadas).

### Como Iniciar:
1. Abra a pasta do projeto.
2. Dê **dois cliques** no arquivo:
   ```bash
   iniciar_em_casa.bat
   ```
3. O script irá automaticamente:
   * Testar a instalação do Node.js.
   * Iniciar o servidor da API na porta `8080` (lendo e gravando os arquivos reais em `backend/data/`).
   * Instalar dependências do React (`npm install`) caso seja a primeira vez.
   * Iniciar o servidor Vite na porta `5173`.
   * Abrir o navegador em `http://localhost:5173`.

### Como Iniciar Manualmente pelo Terminal:
Se preferir rodar em terminais separados no VS Code:
* **Terminal 1 (API Mock):**
  ```bash
  node mock-server.cjs
  ```
* **Terminal 2 (Frontend React):**
  ```bash
  cd frontend
  npm install   # (apenas na primeira vez)
  npm run dev
  ```

---

## Opção 2: Usando o Executável Nativo do Go (`api.exe`)

> [!NOTE]
> Binários compilados em Go (`.exe`) são **independentes e autocontidos**: eles rodam diretamente no Windows **sem precisar do Go instalado**.

Se você copiar toda a pasta do projeto (incluindo `backend/bin/api.exe`) para um pendrive ou arquivo ZIP:

1. Dê **dois cliques** no arquivo:
   ```bash
   iniciar_com_exe.bat
   ```
2. O binário `backend/bin/api.exe` irá subir na porta `8080` e o frontend na porta `5173`.

> [!IMPORTANT]
> Se estiver em casa sem VPN conectada à rede dos roteadores (`45.166.28.254` e `45.166.28.249`), as tentativas de conexão SSH aos equipamentos reais darão timeout. Nesses momentos sem VPN, use a **Opção 1 (Modo Node.js)** para desenvolver tranquilamente com resposta instantânea.

---

## O que já está simulado e pronto no Servidor Mock:
* **Dispositivos:** Cadastro, edição, exclusão e toggle de `Roteador de Borda BGP` (salva direto em `backend/data/devices.json`).
* **BGP & OSPF:** Sessões ativas de BGP1 (Huawei NE8000) e BGP2 (Huawei NE40), incluindo SEA Telecom, Wiki Telecom, PTT São Paulo, PTT Brasília, PTT Belém e PTT Ceará.
* **Download (Prepend & Bloqueio Seletivo):** Visão Global de todos os links com identificação do roteador em cada card, modal com cálculo dinâmico de comunidades (`1:4100X`, `1:2003X`, etc.) e gerador de comandos CLI para Putty.
* **Upload (Local-Preference):** Quadrados por AS, rotas estáticas e modal com prévia de comandos.
* **Personalização de AS:** Troca de apelido (alias), papéis de tráfego e gravação em `backend/data/as_metadata.json`.
* **Central de Alertas:** Alertas em tempo real com botão de confirmação (`ack`).

---

## Quer instalar o Go em casa no futuro? (Opcional)
Se você quiser alterar arquivos do backend Go (`.go`) em casa no futuro, instalar o Go leva menos de 2 minutos:
* **Via Windows Terminal / PowerShell:**
  ```powershell
  winget install GoLang.Go
  ```
* **Ou pelo site oficial:**
  Acesse [go.dev/dl](https://go.dev/dl/) e baixe o instalador `.msi` para Windows.
