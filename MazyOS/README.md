# MazyOS (Antigravity Edition)

> O sistema operacional do seu negócio dentro do Antigravity.

Você acaba de instalar o **MazyOS** adaptado para o **Antigravity**. Em alguns minutos, sua empresa vai ter uma memória própria, uma identidade visual aplicada em tudo que o sistema gerar, e 15 skills prontas pra fazer marketing, SEO, ads e operação rodarem com você dirigindo.

---

## Ligando o sistema no Antigravity

### 1. Primeiro Setup (Entrevista de Instalação)
No chat do Antigravity, basta digitar:
```
/instalar
```
ou simplesmente pedir:
> *"Instalar o MazyOS"*

O Antigravity iniciará uma entrevista amigável para conhecer seu negócio, tom de voz, foco estratégico e identidade visual, preenchendo automaticamente a pasta `_memoria/` e configurando as regras em `GEMINI.md` e `AGENTS.md`.

### 2. Renomear a pasta (Recomendado)
Quando o `/instalar` terminar, você pode renomear a pasta `MazyOS/` para o nome do seu negócio. A pasta não precisa ficar como "MazyOS" — ela é a central do seu negócio agora.

---

## As 15 Skills do Sistema

As skills ficam localizadas em `.agents/skills/` (com espelhamento em `.claude/skills/` para compatibilidade total).

### 🛠️ Núcleo — O jeito de operar o dia a dia
- **/instalar** — Entrevista guiada que configura todo o negócio pela primeira vez.
- **/abrir** — Carrega a memória e foco estratégico antes de iniciar uma sessão de trabalho.
- **/salvar** — Faz commit e push automático do seu trabalho para o GitHub.
- **/atualizar** — Varre o projeto e reconcilia o estado real do workspace com os arquivos de memória.
- **/novo-projeto** — Cria pasta isolada para cliente ou projeto com `GEMINI.md` próprio herdando o contexto geral.
- **/mapear-rotinas** — Identifica tarefas repetitivas da sua rotina e gera novas skills sob medida em `.agents/skills/`.

### 📢 Conteúdo e SEO — Vitrine pública da empresa
- **/carrossel** — Cria carrosséis 1080×1350 com identidade da marca. *(No Antigravity, gera fotos de IA nativamente via `generate_image` sem precisar de API externa!)*
- **/publicar-tema** — Pega um tema e entrega artigo de blog + carrossel + 3 legendas interligadas (Insta, FB, LinkedIn).
- **/seo** — Fluxo completo de 8 passos: Demanda, Concorrência, Google Meu Negócio, On-page, Estratégia de Conteúdo, Google Ads, Monitoramento e GEO (otimização para respostas de IAs).
- **/responder-avaliacoes** — Escreve respostas humanas, empáticas e personalizadas para reviews do Google.
- **/aprovar-post** — Publica blog + Instagram + Facebook em um pipeline coordenado.

### 💰 Anúncios Pagos — Onde o dinheiro entra
- **/anuncio-google** — Monta campanhas completas Search em CSV pronto para importar no Google Ads Editor.
- **/relatorio-ads** — Lê os exports do Google Ads e Meta Ads e entrega relatório executivo com alertas de queima e recomendações.

### ⚡ Produção e Comunicação — Ferramentas do cotidiano
- **/analisar-dados** — Lê arquivos CSV/XLSX/PDF e produz análise executiva com números-chave e ações.
- **/email-profissional** — Rascunha emails profissionais calibrados ao tom e objetivo desejado.

---

## Superpoderes Nativos do Antigravity

O MazyOS no Antigravity ganha recursos avançados integrados:
1. **Geração de Imagens Nativa (`generate_image`)**: Criação de fotos conceituais e mockups diretamente no carrossel sem depender de chaves pagas da OpenAI.
2. **Subagente de Browser (`browser_subagent`)**: Inspeção visual de páginas, verificação de concorrência e testes de layout.
3. **Pesquisa Web Ativa (`search_web`)**: Coleta de dados reais de demanda de busca e SEO atualizados.
4. **Integrações MCP (`mcp_config.json`)**: Conectores padronizados para Notion, Gmail, Google Calendar, Canva, N8N, etc. (veja modelo em `mcp_config.example.json`).

---

## Como o MazyOS Pensa

- **`_memoria/`** é o cérebro:
  - `empresa.md`: Quem é o negócio, o que faz, clientes, equipe.
  - `preferencias.md`: Tom de voz, estilo, termos a evitar.
  - `estrategia.md`: Prioridades atuais, gargalos e prazos.
- **`identidade/`** é o rosto:
  - `design-guide.md`: Cores, fontes, padrão visual e logo.
- **`GEMINI.md` / `AGENTS.md`** são as regras de operação:
  - O agente consulta a memória no início de cada sessão e segue os padrões estabelecidos.
- **`marketing/`**, **`saidas/`** e **`scripts/`** são os resultados gerados.

---

## Como Começar Agora

No chat do Antigravity, basta enviar:
```
/instalar
```
E responder às perguntas da entrevista inicial!
