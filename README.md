# Bem Estar Animal - Backend API

Esse sistema foi desenvolvido para auxiliar a Superintendência de Bem Estar Animal no agendamento de castrações, atendimentos emergenciais, adoções de animais, entre outras necessidades.

O backend foi construído em uma stack recente focada em performance, utilizando **Hono** como framework, **Bun** como runtime, **Prisma** como ORM e **PostgreSQL** para o banco de dados.

---

## Índice

1. Pré-requisitos
2. Instalação
3. Configuração de Variáveis de Ambiente
4. Arquitetura do Projeto e Estrutura de Diretórios
5. Bibliotecas Principais e Ferramentas
6. Funcionalidades da Pasta `src/lib/`
7. Segurança e Middlewares
8. Grupos de Rotas da API
9. Cron Jobs e Tarefas Agendadas
10. Migrations e Seeding do Banco de Dados

---

## 1. Pré-requisitos

Antes de configurar o projeto localmente, é necessário de ter o seguinte instalado / configurado:

* **Bun** (v1.3.14 ou superior)
* **Node.js** (opcional, se for usar npm/npx/tsx, embora o projeto seja otimizado para o bun)
* Banco de dados **PostgreSQL** (instância local ou um serviço hospedado como supabase)
* Conta e API Key do **Resend** (para envio de e-mails de verificação de cadastro e redefinição de senhas)
* Conta e API Key de um bucket na **Cloudflare R2** (para armazenamento de fotos)

---

## 2. Instalação

Para rodar o servidor backend localmente, siga estes passos:

### Passo 1: Clonar o Repositório

```sh
git clone https://github.com/bem-estar-animal-pmar/bem-estar-animal-backend.git
cd bem-estar-animal/bem-estar-animal-backend

```

### Passo 2: Instalar Dependências

Rode o comando de instalação usando o Bun:

```sh
bun install

```

### Passo 3: Configurar Variáveis de Ambiente

Copie o arquivo de template `.env.example` para criar suas próprias configurações locais.

*(Veja a seção [Configuração de Variáveis de Ambiente](#variaveis-de-ambiente) abaixo para preencher os seus valores.)*

### Passo 4: Rodar as Migrations do Banco de Dados

Aplique as migrations do prisma no banco de dados e gere o client para se comunicar com o banco:

```sh
bunx --bun prisma migrate deploy
bunx --bun prisma generate

```

### Passo 5: Seed do Banco de Dados

A autenticação do sistema trabalha com o formato de roles, onde a role de ADMIN é única e pertence apenas à uma conta principal do sistema, para isso, é necessário gerá-la usando o comando de seed:

Certifique-se de ter definido o e-mail e a senha da conta ADMIN nas variáveis de ambiente.

```sh
bun run prisma/seed.ts

```

### Passo 6: Iniciar o Servidor de Desenvolvimento

Inicie o servidor em modo de desenvolvimento (watch):

```sh
bun run dev

```

O backend Hono estará rodando em `http://localhost:3000` (ou na porta definida no seu arquivo `.env`).

---

## 3. Configuração de Variáveis de Ambiente

O backend é totalmente configurável via variáveis de ambiente. Crie um arquivo `.env` na raiz de `bem-estar-animal-backend/` correspondente a este template de configuração:

| Nome | Descrição | Exemplo / Valor Padrão |
| --- | --- | --- |
| `DATABASE_URL` | String de conexão para o seu banco de dados PostgreSQL | `postgresql://user:pass@localhost:5432/db?schema=public` |
| `PORT` | A porta em que o servidor backend irá rodar | `4000` |
| `PROXY_CONNECTED` | Informa ao Better Auth onde buscar os IPs dos usuários para rate-limiting Use `cloudflare` se estiver usando a cloudflare como proxy para o domínio do site. | `""` ou `cloudflare` |
| `NODE_ENV` | Ambiente de execução atual (`development`, `production`) | `development` |
| `ALLOWED_CORS_URLS` | Um array serializado em JSON com as origens do frontend permitidas para enviar requisições com credenciais | `["http://localhost:4000"]` |
| `BETTER_AUTH_URL` | URL base completa dos endpoints de autenticação para os handlers do Better Auth | `http://localhost:4000/api/auth` |
| `BETTER_AUTH_SECRET` | Chave criptográfica segura usada para cookies de sessão (minímo 32 characteres) | *gerar no site do better-auth* |
| `RESEND_API_KEY` | Chave de API do Resend para envio de e-mails (verificação, redefinições de senha, etc.) | `re_123456...` |
| `R2_ENDPOINT` | URL do endpoint de armazenamento customizado Cloudflare R2 / S3 | `https://<account-id>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | Access key ID de armazenamento para upload de arquivos | `your_r2_access_key_id` |
| `R2_SECRET_ACCESS_KEY` | Secret access key de armazenamento para upload de arquivos | `your_r2_secret_access_key` |
| `R2_BUCKET_NAME` | Nome do Bucket S3/R2 para arquivos de mídia públicos | `bem-estar-animal` |
| `R2_PUBLIC_URL` | URL base pública de distribuição de armazenamento para ler imagens armazenadas | `https://pub-your-bucket-id.r2.dev` |
| `SEED_ADMIN_EMAIL` | E-mail do Admin carregado durante o seeding do banco de dados | `admin@algum.email.com` |
| `SEED_ADMIN_PASSWORD` | Senha do Admin carregada durante o seeding do banco de dados | `SuaSenhaAdmin123!` |

---

## 4. Arquitetura do Projeto e Estrutura de Diretórios

A base de código segue uma abordagem estruturada de domínio limpo, isolando configurações, modelos, controllers, rotas e tarefas em segundo plano:

```text
bem-estar-animal-backend/
├── generated/                     # Arquivos gerados automaticamente do Prisma Client
├── prisma/                        # Definição do schema do BD, migrations e scripts de seeding
│   ├── migrations/                # Arquivos de transição do schema do banco de dados
│   ├── schema.prisma              # Schema de modelagem do banco de dados PostgreSQL no Prisma
│   └── seed.ts                    # Script de seeding para configuração inicial e dados de teste
├── src/
│   ├── index.ts                   # Ponto de entrada da aplicação: monta middlewares, registra rotas e inicia o Hono
│   ├── constants/
│   │   └── constants.ts           # Constantes globais do app
│   ├── jobs/                      # Cron jobs e workers de tarefas agendadas em segundo plano
│   │   ├── accounts.jobs.ts       # Job para limpar contas de usuários desativadas
│   │   └── appointments.jobs.ts   # Job para atualizar status de agendamentos médicos/castrações que não foram resolvidos (marcar como expirados).
│   ├── lib/                       # Serviços de terceiros
│   │   ├── auth.ts                # Configuração do Better Auth para autenticação dos usuários
│   │   ├── file-validator.ts      # Middleware validador de arquivo de foto para evitar arquivo malicioso
│   │   ├── history.ts             # Helper para formatar dados do histórico dos agendamentos
│   │   ├── prisma.ts              # Configuração do PrismaClient (baseado na documentação)
│   │   ├── resend.email.ts        # Configurações do SDK do Resend e templates de e-mail
│   │   └── s3.client.ts           # Wrapper do cliente de upload e exclusão de imagens na Cloudflare R2
│   ├── middleware/                # Middlewares de segurança, rate-limiting e tratamento de erros
│   │   ├── authHandler.ts         # Middleware de verificação de sessão de usuário e role de admin
│   │   ├── errorHandler.ts        # Capturada exceptions HTTP lançadas no app, trata e envia como resposta ao frontend
│   │   ├── limitHandler.ts        # Middleware de Rate Limiter de IP configurado para endpoints gerais
│   │   └── termsHandler.ts        # Middleware que verifica se o cliente aceitou os termos/políticas de privacidade
│   └── routes/                    # Endpoints de rotas e controllers funcionais de serviço
│       ├── adoptions/             # Rotas do programa de adoção de pets
│       ├── emergencies/           # Rotas do atendimento emergencial
│       ├── medical-records/       # Rotas para a tabela de prontuários clínicos e histórico médico (separado por segurança)
│       ├── neuterings/            # Rotas de cotas de castração, vagas, agendamentos de calendário e requisições
│       ├── pets/                  # Rotas do registro de perfil de pets, atualizações e visualização
│       └── users/                 # Endpoints de gerenciamento de admin para os usuários, desativação de conta e revogação de termos (pelo usuário)

```

---

## 5. Bibliotecas Principais e Ferramentas

* **[Hono](https://hono.dev/)**: Framework principal da aplicação, rodando com Bun.
* **[Better Auth](https://www.better-auth.com/)**: Sistema de autenticação para TypeScript. Gerencia automaticamente de forma segura cookies, hash de senhas, verificação de sessão, defesa contra CSRF, entre outros.
* **[Prisma ORM](https://www.prisma.io/)**: Cliente de banco de dados para o PostgreSQL, usado para facilitar criação de queries / tabelas.
* **[Zod](https://zod.dev/)**: Utilizado para validar inputs de schema (como validação de CPFs, formatos de telefone, CEPs e payloads) antes das interações com o banco de dados.
* **[Resend SDK](https://resend.com/)**: Plataforma de e-mail usada para despachar e-mails de verificação de conta e recuperação de senha.
* **[@aws-sdk/client-s3](https://github.com/aws/aws-sdk-js-v3)**: SDK de cliente usado para fazer upload de fotos de perfil de pets em buckets da Cloudflare.
* **[node-cron](https://www.npmjs.com/package/node-cron)**: Cron job para Node.js/Bun usado para disparar tarefas de exclusão de contas e expiração de agendamentos repetidamente.

---

## 6. Funcionalidades da Pasta `src/lib/`

A pasta `src/lib/` centraliza a inicialização de serviços de terceiros, integrações externas e utilitários que suportam as regras de negócio do sistema.

### `auth.ts` (Sistema de Autenticação com Better Auth)
* **Resumo**: Configura o framework de autenticação **Better Auth** acoplado ao banco de dados através do adaptador do Prisma.
* **Validações Estritas com Zod**:Garante que novos cadastros incluam senhas fortes (mínimo de 8 caracteres, contendo letras maiúsculas, minúsculas, números e caracteres especiais), nomes válidos, telefones formatados, CEP válido e CPF autêntico.
* **Validação de CPF**: Utiliza a biblioteca `cpf-cnpj-validator` integrada ao pipeline de validação para impedir que CPFs inválidos ou duplicados sejam cadastrados no banco de dados.
* **Segurança e Proteção (Rate Limiting)**:
  * Configura regras customizadas de controle de requisições por IP (ex: máximo de 3 tentativas de cadastro a cada 5 minutos, ou 2 solicitações de redefinição de senha).
  * Habilita o uso de Cookies Seguros em ambiente de produção para mitigar ataques de sequestro de sessão (*session hijacking*).
* **Campos Customizados**: Estende o modelo de usuário para incluir campos específicos da regra de negócio (como cargo/role, endereço completo, CPF, telefone, logs de histórico, termos aceitos e controle de suspensão/bloqueio temporário).

### `file-validator.ts` (Validação Física de Arquivos/Imagens)
* **Resumo**: Fornece um mecanismo simples de segurança para validação de uploads, evitando ataques onde arquivos maliciosos são disfarçados com extensões de imagem.
* **Assinatura da Imagem**: A função `verifyImageSignature` lê o cabeçalho binário (os primeiros 4 bytes do arquivo) usando `DataView` e analisa a assinatura real do formato dp arquivo. Se um usuário tentar enviar um executável ou script camuflado com a extensão `.jpg`, o validador rejeita o arquivo imediatamente antes de salvá-lo no armazenamento em nuvem.

### `history.ts` (Gerenciador de Histórico de Auditoria)
* **Resumo**: Função que auxilia na gravação de logs de histórico em campos de castração, emergências, adoções e histórico de usuários.
* **Fuso Horário Local**: Formata automaticamente as entradas com carimbo de data/hora no fuso horário oficial de Brasília (`America/Sao_Paulo`) no padrão `pt-BR`.

### `prisma.ts` (Conexão com Banco de Dados)
* **Resumo**: Inicializa e disponibiliza globalmente a instância do `PrismaClient` responsável por todas as consultas ao banco de dados, de acordo com a documentação do Prisma.

### `resend.email.ts` (Envio de E-mails Transacionais)
* **Resumo**: Integra-se com a API do **Resend** para enviar e-mails automatizados em formato HTML.
* **Principais Funcionalidades**:
  * `sendVerification`: Dispara um e-mail contendo botões estilizados para confirmação de cadastro e ativação de contas criadas na plataforma.
  * `sendPasswordReset`: Envia o link com o token seguro e exclusivo para que o usuário possa redefinir sua senha com segurança.

### `s3.client.ts` (Armazenamento de Imagens e Processamento de Mídia)
* **Resumo**: Abstrai as operações de criação e remoção de imagens no bucket da **Cloudflare R2**.
* **Redimensionamento e Otimização Inteligente**:
  * Antes de realizar o upload, a imagem é interceptada e processada via **`Bun.Image`**, convertida para webp e redimensionada proporcionalmente 1:1.
* **Segurança e Organização**:
  * Valida fisicamente o arquivo através de `verifyImageSignature` (file-validator) para bloquear uploads maliciosos.
  * Gera nomes de arquivos criptograficamente seguros e únicos utilizando UUID (`crypto.randomUUID()`) e organiza as mídias em subpastas (ex: `/general`, `/pets`, etc).

---

## 7. Segurança e Middlewares

Features de segurança configuradas em `src/index.ts`:

* **CORS (Cross-Origin Resource Sharing)**: Permite credenciais (cookies) apenas de origens seguras listadas em `ALLOWED_CORS_URLS`. Em desenvolvimento, permite tráfego de qualquer origem.
* **Cabeçalhos Seguros (Secure Headers)**: Utiliza a lib `hono/secure-headers` para aplicar proteções estritas de HTTPS, bloqueios de clickjacking (X-Frame-Options), filtros contra XSS, etc.
* **Limites de Tamanho de Payload**: Limita o corpo das requisições recebidas a um máximo de **6MB** para evitar sobrecarga no servidor e tentativas de negação de serviço (DoS).
* **Proteção contra Injeção de SQL e XSS**: Garantida nativamente pelas queries do Prisma e validação de input via schemas estritos do Zod em todas as rotas POST, PATCH E PUT.
* **Rate Limiting**: Aplicado globalmente em `/api/*` e individualmente via limites customizados do `Better Auth` (`/sign-in`, `/sign-up`, `/update-user`).

Middlewares:

* **Tratamento Centralizado de Erros (`src/middleware/errorHandler.ts`)**: Captura todas as exceções enviadas pela API, padrozina erros do Zod, Prisma e da própria API e retorna respostas de erro JSON padrozinados. Em desenvolvimento inclui a stack.trance do erro também.
* **Interceptador de Termos e Política de Privacidade (`src/middleware/termsHandler.ts`)**: Rejeita automaticamente requisições retornando o status `403 Forbidden` se o usuário autenticado não tiver concordado com as versões legais mais recentes dos Termos de Serviço.
* **Interceptador de Autenticação (`src/middleware/authHandler.ts`)**: Rejeita automaticamente requisições retornando o status `403 Forbidden` se o usuário não enviar credenciais válidas do Netter Auth.
* **Rate Limiter (`src/middleware/limitHandler.ts`)**: Possibilita definir limites de requisições por número e tempo e aplicá-los diretamente nas routas da pasta `src/routes/*`. Os limites relacionados à autenticação (rotas do better auth) são aplicados diretamente via hook em `src/lib/auth.ts`.

---

## 8. Grupos de Rotas da API

Todos os endpoints têm o prefixo `/api` e são montados em `src/index.ts`. Aqui estão as rotas principais:

### `/api/pets`

* **GET** `/api/pets/adoption` - Lista pets disponíveis para adoção (público).
* **GET** `/api/pets/me` - Lista os pets do usuário autenticado (User/Admin/Manager).
* **GET** `/api/pets` - Lista todos os pets (Admin/Manager).
* **GET** `/api/pets/details/:id` - Detalhes de um pet específico.
* **POST** `/api/pets` - Registra um novo pet (User/Admin/Manager).
* **POST** `/api/pets/admin/create-after-emergency` - Rota para o admin registrar um pet na conta do usuário após emergência (pet de rua).
* **PATCH** `/api/pets/:id` - Atualiza dados do pet. (Admin/Manager pode atualizar de qualquer usuário).
* **PATCH** `/api/pets/:id/image` - Atualiza foto do pet (Admin/Manager pode atualizar de qualquer usuário).
* **PATCH** `/api/pets/:id/undo-give-up` - Remove pet da lista de adoção (Admin/Manager pode remover de qualquer usuário).
* **PATCH** `/api/pets/:id/adoption-return` - Processa devolução de pet adotado (Admin/Manager).
* **DELETE** `/api/pets/:id` - Exclui um pet (Admin/Manager).
* **DELETE** `/api/pets/:id/image` - Remove foto do pet.

### `/api/neuterings`

* **GET** `/api/neuterings/me` - Lista agendamentos do usuário.
* **GET** `/api/neuterings` - Lista todos os agendamentos (Admin/Manager).
* **GET** `/api/neuterings/details/:id` - Detalhes de um agendamento.
* **GET** `/api/neuterings/calendar` - Retorna a quantidade de vagas de castração disponível (público).
* **GET** `/api/neuterings/quotas` - Consulta de cotas mensais de castração (Admin).
* **POST** `/api/neuterings` - Cria novo agendamento de castração.
* **POST** `/api/neuterings/admin-register` - Registro manual de castração (Admin). [não utilizado]
* **PUT** `/api/neuterings/quotas/month` - Define cotas mensais de catração (Admin).
* **PUT** `/api/neuterings/quotas/day` - Define exceções diárias de cotas (Admin).
* **PATCH** `/api/neuterings/status/:id` - Atualiza status do agendamento (Admin/Manager).
* **PATCH** `/api/neuterings/cancel/:id` - Usuário cancela seu agendamento.

### `/api/emergencies`

* **GET** `/api/emergencies/me` - Lista emergências do usuário.
* **GET** `/api/emergencies` - Lista todas as emergências (Admin/Manager).
* **GET** `/api/emergencies/details/:id` - Detalhes de uma emergência.
* **POST** `/api/emergencies` - Cria nova solicitação de emergência.
* **POST** `/api/emergencies/admin-register` - Registro manual de emergência (Admin/Manager).
* **PATCH** `/api/emergencies/status/:id` - Atualiza status (triagem/atendimento) (Admin/Manager).
* **PATCH** `/api/emergencies/cancel/:id` - Cancela solicitação de emergência.

### `/api/adoptions`

* **GET** `/api/adoptions/give-up/me` - Lista pedidos de entrega do usuário.
* **GET** `/api/adoptions/give-up` - Lista todos os pedidos de entrega (Admin/Manager).
* **GET** `/api/adoptions/give-up/details/:id` - Detalhes de um pedido de entrega.
* **GET** `/api/adoptions/request` - Lista pedidos de adoção (Admin/Manager).
* **GET** `/api/adoptions/request/details/:id` - Detalhes de um pedido de adoção.
* **GET** `/api/adoptions/pet/:petId/latest-adoption` - Busca adoção aprovada mais recente de um pet.
* **POST** `/api/adoptions/request` - Envia formulário de interesse em adotar (Público).
* **POST** `/api/adoptions/give-up` - Solicita entrega de pet para adoção. 
* **PATCH** `/api/adoptions/give-up/:id/cancel` - Cancela pedido de entrega.
* **PATCH** `/api/adoptions/give-up/:id/status` - Aprova/rejeita pedido de entrega (Admin).
* **PATCH** `/api/adoptions/request/:id/status` - Aprova/rejeita pedido de adoção (Admin).

### `/api/medical-records`

As tabelas de **castração** e agendamentos de **emergências** possuem uma relação 1:1 com a tabela de histórico médico, para evitar que os dados relacionados a prontuários fiquem expostos ao usuário comum.

* **GET** `/api/medical-records` - Lista prontuários (Admin/Manager).
* **GET** `/api/medical-records/appointment/:type/:appointmentId` - Busca prontuário por ID de agendamento (Admin/Manager).
* **POST** `/api/medical-records` - Cria novo prontuário (Admin/Manager).
* **PATCH** `/api/medical-records/:id` - Atualiza prontuário (Admin/Manager).
* **DELETE** `/api/medical-records/:id` - Exclui prontuário (Admin/Manager).

### `/api/admin/users`

Rotas adicionais relacionadas aos usuários, não inclui autenticação.

* **GET** `/api/admin/users` - Lista usuários (Admin/Manager).
* **GET** `/api/admin/users/details/:id` - Detalhes de um usuário. (Admin/Manager)
* **POST** `/api/admin/users/reaccept-terms` - Registra aceite de termos de serviço e políticas de privacidade. (User)
* **POST** `/api/admin/users/revoke-terms` - Revoga aceite de termos LGPD. (o usuário perde acesso ao sistema até que aceite novamente)
* **POST** `/api/admin/users/deactivate-account` - Solicita desativação de conta.
* **POST** `/api/admin/users/reactivate-account` - Reativa conta. (limite de 30 dias)
* **POST** `/api/admin/users/suspend-fraud/:id` - Suspende conta por fraude (Admin).
* **PATCH** `/api/admin/users/admin-update/:id` - Atualiza dados do usuário (Admin).
* **PATCH** `/api/admin/users/block-status/:id` - Altera status de bloqueio (Admin).
* **PATCH** `/api/admin/users/role/:id` - Altera cargo do usuário (Admin).

### `/api/auth/` (Sistema Better Auth)

Todas as rotas abaixo são montadas automaticamente pelo better-auth, suportando:

* `/api/auth/sign-up/email` Registro para novos usuários.
* `/api/auth/sign-in/email` Login que gera cookie de sessão.
* `/api/auth/sign-out` Destrói a sessão ativa no banco de dados.
* `/api/auth/request-password-reset` e `/api/auth/reset-password` Envia spacha e-mail de redefinição de senha com token de verificação
* `/api/auth/verify-email` Rota usada para confirmação de e-mail após registro, enviada por e-mail para o usuário.
---

## 9. Cron Jobs e Tarefas Agendadas

As tarefas em segundo plano são automatizadas sob `src/jobs` para garantir a limpeza do banco de dados e a aplicação automática de status:

* **Exclusão de Contas Pendentes (`accounts.jobs.ts`)**: Roda periodicamente para deletar contas das quais o usuário marcou para serem desativadas. Em conformidade com a LGPD, contas sem histórico de utilização de algum serviço do site são completamente excluidas. Contas cujo atendimentos foram realizados são retidas pelo período legal de 5 anos e após esse tempo apenas os dados identificadores do usuário (email, nome, cpf, endereço, etc.) são removidos.
* **Verificador de Penalidade de Agendamentos Perdidos (`appointments.jobs.ts`)**: Roda automaticamente à meia-noite para detectar consultas de castração ou de emergência que passaram sem que tenha sido feito a confirmação ou cancelamento. Ele as marca como `CANCELLED` e atualiza o histórico mostrando que foi expirado.

Esses workers são inicializados automaticamente em `index.ts` através de:

```typescript
import "./jobs/appointments.jobs"
import "./jobs/accounts.jobs"

```

---

## 10. Migrations e Seeding do Banco de Dados

Este projeto aproveita as migrations do Prisma. Para fazer qualquer alteração no schema, execute o seguinte:

1. **Modifique** seus modelos em `prisma/schema.prisma`.

2. **Gere uma nova migration**:
```sh
bunx --bun prisma migrate dev --name <nome_da_sua_migration>

```

3. **Aplique as migrations em produção**:
```sh
bunx --bun prisma migrate deploy

```

4. **Atualize o Prisma Client**:
```sh
bunx --bun prisma generate

```

---