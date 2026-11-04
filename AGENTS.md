# NetPulse - Regras e Diretrizes para Assistentes de IA (Antigravity / Gemini)

Este projeto gerencia roteadores de borda de provedores de internet (ISPs) e infraestruturas de telecomunicações de missão crítica (Huawei VRP, Datacom DmOS, MikroTik RouterOS v6/v7).

---

## 🚨 REGRA MANDATÓRIA: PROTOCOLO DE TESTES EM TODA ATUALIZAÇÃO

Toda vez que você realizar qualquer atualização, alteração de código, refatoração ou adição de novas telas/endpoints, você **DEVE OBRIGATORIAMENTE executar e validar os testes** antes de considerar a tarefa concluída.

O procedimento detalhado de checagem está formalizado em:
👉 [**CHECKLIST_DE_TESTES_E_ATUALIZACOES.md**](./CHECKLIST_DE_TESTES_E_ATUALIZACOES.md)

### Checklist Mínimo que Você Deve Executar Automaticamente:
1. **Frontend:**
   - Rodar `npm run build` na pasta `frontend/` (validação de tipos TypeScript estritos e bundling Vite sem erros).
   - Rodar `npm run lint` na pasta `frontend/` (0 erros permitidos).
2. **Backend:**
   - Rodar `go test ./...` na pasta `backend/` (100% de sucesso em todas as suítes de testes).
   - Rodar `go build -o bin/api.exe ./cmd/api` na pasta `backend/` para garantir compilação do executável.
3. **Segurança & Hardening:**
   - Nunca escrever senhas em texto puro em `devices.json` (usar criptografia AES-256-GCM `enc:v1:`).
   - Nunca expor senhas descriptografadas nos payloads públicos da API (`GET /api/devices`).
   - Manter isolamento estrito entre empresas clientes (Multi-Tenancy por `tenant_id`).
4. **Modo Manual Seguro:**
   - **Zero Commits Automáticos:** Nunca enviar comandos de alteração de rota, prepend ou local-preference direto para os roteadores físicos sem a revisão e ação explícita do usuário.
5. **Verificação de Saúde:**
   - Validar se o endpoint `GET /api/health` responde com `status: "online"`.
