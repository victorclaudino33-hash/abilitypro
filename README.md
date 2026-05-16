# Ability Pro v3 — Sistema de Certificação com Assinatura Digital

## O que há de novo na v3

| Funcionalidade | Descrição |
|---|---|
| **Duplo Fluxo** | Baixar PDFs direto OU gerar link de assinatura digital |
| **Assinatura pelo Celular** | Aluno acessa link, verifica CPF e assina com o dedo |
| **Manifesto Jurídico** | PDF extra com IP, data, hora e CPF do signatário |
| **Certificados Automáticos** | Gerados com pdf-lib a partir de templates ou do zero |
| **Painel Admin Completo** | Dashboard, lotes, busca, ações em lote |

---

## Estrutura do Projeto

```
abilitypro/
├── backend/
│   ├── server.js          # Servidor Express principal
│   ├── db.js              # Banco SQLite (better-sqlite3)
│   ├── middleware/
│   │   └── auth.js        # JWT middleware
│   ├── routes/
│   │   ├── auth.js        # Login
│   │   ├── admin.js       # CSV upload, lotes, colaboradores
│   │   ├── aluno.js       # Portal do aluno (token + CPF)
│   │   ├── pdf.js         # Geração PDF em lote / individual
│   │   └── signature.js   # Recebe assinatura, gera PDF + manifesto
│   └── utils/
│       └── pdfGenerator.js # Geração de PDFs com pdf-lib
├── frontend/
│   ├── index.html         # Login
│   ├── admin.html         # Painel Admin
│   ├── aluno.html         # Painel do Aluno (assinatura)
│   └── app.js             # Config + utilitários compartilhados
├── data/
│   └── templates/         # Coloque seus PDFs aqui: NR35.pdf, NR06.pdf...
├── package.json
├── railway.json
└── vercel.json
```

---

## Como usar Templates PDF Personalizados

Coloque seus arquivos PDF originais na pasta `data/templates/`:

- `data/templates/NR06.pdf`
- `data/templates/NR10.pdf`
- `data/templates/NR35.pdf`
- `data/templates/NR33.pdf`
- `data/templates/DIRECAO_DEFENSIVA.pdf`
- `data/templates/SGA_NR20.pdf`
- `data/templates/NR10_SEP.pdf`

O sistema usa seu template original e preenche: nome, CPF, data e assinatura.

---

## PASSO 1 — Subir no GitHub

```bash
git init
git add .
git commit -m "AbilityPro v3 cloud"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/abilitypro.git
git push -u origin main
```

---

## PASSO 2 — Deploy do Backend no Railway

1. Acesse **railway.app** e entre com sua conta GitHub
2. Clique em **New Project → Deploy from GitHub repo**
3. Selecione o repositório `abilitypro`
4. Em **Settings → Variables** adicione:
   - `JWT_SECRET` = uma frase longa e secreta
   - `PORT` = 3000
   - `FRONTEND_URL` = (URL do Vercel depois de fazer o deploy)
5. Em **Settings → Networking → Generate Domain**
6. Copie a URL gerada (ex: `https://abilitypro-production.up.railway.app`)

---

## PASSO 3 — Configurar a URL no Frontend

Abra `frontend/app.js` e altere:

```javascript
const BACKEND_URL = 'https://abilitypro-production.up.railway.app';
```

Depois commit e push:

```bash
git add frontend/app.js
git commit -m "Configura URL do Railway"
git push
```

---

## PASSO 4 — Deploy do Frontend no Vercel

1. Acesse **vercel.com**, entre com GitHub
2. **Add New → Project → selecione abilitypro**
3. Clique **Deploy**
4. URL pública: `https://abilitypro.vercel.app`

---

## Formato do CSV

Use **ponto-e-vírgula** como separador. Valor `1` = possui aquele treinamento.

```
NOME;CPF;NR06;NR10;DIRECAO;NR35;SGA.NR20;NR33;NR10 SEP
ANDERSON NASCIMENTO;12345678901;1;1;0;1;0;0;0
MARIA SILVA;98765432100;1;0;1;1;1;0;1
```

---

## Login padrão

- **Usuário:** Admin
- **Senha:** Admin2024!

---

## Fluxo de Trabalho

### Fluxo 1 — Baixar PDFs Direto
1. Admin faz upload do CSV
2. Clica **⬇️ Baixar PDFs** (individual ou lote inteiro)
3. Recebe ZIP com todos os certificados preenchidos

### Fluxo 2 — Assinatura Digital
1. Admin faz upload do CSV
2. Clica **🔗 Link Assinatura** para cada colaborador
3. Envia o link para o colaborador (WhatsApp, email, etc.)
4. Colaborador acessa pelo celular, digita CPF, assina com o dedo
5. Sistema gera ZIP: certificados assinados + Manifesto Jurídico Digital
6. Download automático no celular do colaborador

---

## Atualizar o sistema

```bash
git add .
git commit -m "Descrição da mudança"
git push
```

Railway e Vercel atualizam automaticamente em menos de 1 minuto.
