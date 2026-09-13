# Painel da Oficina — Frontend

Interface web do Tech Challenge Fase 3 (13SOAT). Consome a API de gestão da oficina **através do Azure API Management**, nunca direto do cluster.

**No ar:** https://gustavollier.github.io/postech-front/

## O que ele faz

| Tela | Conteúdo |
|---|---|
| **Entrar** | Dois caminhos de autenticação: cliente por CPF (Azure Function) e funcionário por CPF e senha (API no AKS) |
| **Painel** | Totais por situação, distribuição por status e as ordens mais recentes |
| **Ordens de serviço** | Busca, filtro por status, trilha visual do fluxo e avanço de status |
| **Clientes** | Pessoas físicas e frotas, com documento formatado |
| **Peças** | Catálogo com preço e nível de estoque |

## O inspetor de requisições

O botão **Gateway**, no canto inferior direito, abre o inspetor: método, rota, status HTTP, tempo de resposta e o **X-Correlation-ID** de cada chamada.

Esse ID não é decorativo. Ele sai do navegador no header, o APIM o reaproveita, a aplicação o coloca no escopo do logger e ele aparece no Datadog ligando log e trace. Clicar nele copia o valor — dá para colar direto na busca do Datadog e achar a requisição exata.

## Arquitetura

```
Navegador (GitHub Pages)
        │  https + X-Correlation-ID
        ▼
Azure API Management  ← valida o JWT, aplica rate limit
        ├─ /auth          → Container App (Azure Function, escala a zero)
        └─ /api/v1/...    → LoadBalancer do AKS → pods da API
                                    │
                              Azure SQL Database
```

O painel é estático: não há servidor próprio, segredo embutido nem backend intermediário. Todo o controle de acesso acontece no gateway.

## Stack

React 18 · TypeScript · Vite · Tailwind CSS · React Router

Sem biblioteca de componentes e sem biblioteca de gráficos — a interface é feita à mão para manter o bundle pequeno (≈63 KB gzip) e o controle visual inteiro.

## Rodando local

```bash
npm install
npm run dev
```

Para apontar para outro ambiente, crie um `.env.local`:

```
VITE_API_BASE=https://outro-gateway.azure-api.net
```

## Deploy

`.github/workflows/deploy.yml` publica no GitHub Pages a cada push na `main`, empurrando o build para o branch `gh-pages`. Pull request roda apenas build e verificação de tipos, sem publicar.

A publicação é um push de branch, e não a API do Pages: o token do Actions desta conta não tem permissão para criar o site via API. Empurrar para `gh-pages` precisa apenas de `contents: write`.

O `base` do Vite é `/postech-front/`, que é o caminho onde o Pages serve o site. O roteamento usa `HashRouter` porque hospedagem estática não reescreve rotas — sem isso, atualizar a página em `/ordens` daria 404.

## Credenciais de demonstração

| Perfil | CPF | Senha |
|---|---|---|
| Cliente | `98765432100` | — |
| Funcionário (gerente) | `11111111111` | `Senha@123` |

O CPF `12345678901`, também presente no seed, tem dígito verificador inválido de propósito — serve para demonstrar a rejeição com HTTP 400.

## Repositórios da entrega

| Repo | Conteúdo |
|---|---|
| [postech-app](https://github.com/Gustavollier/postech-app) | API .NET e manifestos do AKS |
| [postech-auth-function](https://github.com/Gustavollier/postech-auth-function) | Autenticação por CPF, emite o JWT |
| [postech-infra-db](https://github.com/Gustavollier/postech-infra-db) | Azure SQL e Key Vault |
| [postech-infra-k8s](https://github.com/Gustavollier/postech-infra-k8s) | AKS, ACR, APIM e Datadog |
| **postech-front** | este repositório |
