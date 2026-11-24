# Lar em Dia — contas da família em dia

Sistema web de **planejamento financeiro familiar**: contas do mês, alertas de vencimento, cartões de crédito com faturas automáticas, contas fixas, parcelamentos e projeção de 12 meses. Roda no navegador (computador e celular) e pode ser **instalado como app** (PWA).

> Nome provisório. Antes de comercializar, consulte a disponibilidade da marca no INPI e do domínio.

## O que já faz (versão 0.1 beta)

| Área | Recursos |
|---|---|
| **Painel** | Receitas e despesas previstas × realizadas, saldo do mês, alertas (vencidas, vence hoje, próximos dias), gastos por categoria, fluxo dos próximos 6 meses, aviso de estouro do planejamento |
| **Contas do mês** | Lista por vencimento, marcar como pago com um clique, filtros (tipo, situação, categoria, pessoa, busca), totais, código de barras/Pix com botão copiar |
| **Lançamento rápido** | Escreva `luz 185,90 dia 10`, `mercado 230 nubank`, `tv 2.400 10x`, `salário 4.500 dia 5 fixa`: o sistema identifica valor, data, parcelas, cartão, forma e categoria |
| **Identificação automática** | Categorias por palavras-chave + **aprendizado**: ao corrigir uma categoria, os próximos lançamentos com o mesmo nome já vêm certos |
| **Contas fixas** | "Repetir todo mês" gera as próximas ocorrências sozinho; editar/excluir só um mês ou deste mês em diante |
| **Parcelamentos** | Valor total ou por parcela, com ajuste de centavos; excluir uma, as seguintes ou todas |
| **Cartões de crédito** | Dia de fechamento/vencimento, compras caem na fatura certa, fatura agrupada, limite usado/disponível, pagar a fatura inteira |
| **Calendário** | Mês em grade com valores por dia; clique para ver ou lançar |
| **Planejamento** | Limite mensal por categoria (alerta a partir de 80%), sobra planejada, projeção de 12 meses com saldo acumulado |
| **Alertas** | Banner, contador no ícone/aba, notificação diária do navegador, **exportação para a agenda do celular (.ics) com lembretes** |
| **Família** | Pessoas responsáveis por cada conta; no modo Firebase, vários logins acessam a mesma família por **código de convite** |
| **Dados** | Backup/restauração (.json), exportação do mês para planilha (.csv), dados de exemplo |

## Estrutura

```
index.html              página única do app
css/style.css           visual (claro/escuro automático, celular e computador)
js/app.js               telas e interações
js/dominio.js           regras: faturas, recorrências, alertas, projeção, identificação
js/store.js             dados: modo local (navegador) ou Firebase (nuvem)
js/util.js              datas, dinheiro, textos
js/firebase-config.js   configuração do Firebase (vazia = modo local)
firestore.rules         regras de segurança do banco
sw.js / manifest        instalação como app e funcionamento offline
```

## 1. Publicar no GitHub Pages

1. Em github.com, crie um repositório (ex.: `lar-em-dia`). Pode ser na mesma conta do Lunelli Office ou numa conta própria do produto.
2. **Add file → Upload files** e arraste todo o conteúdo desta pasta (inclusive `.nojekyll`). Commit.
3. **Settings → Pages → Branch: `main` / root → Save**.
4. Em 1–2 minutos o site fica em `https://SEU-USUARIO.github.io/lar-em-dia/`.

Sem Firebase, o sistema já funciona no **modo local** (dados ficam no navegador de quem usa — bom para testes e demonstração).

## 2. Ativar login e sincronização (Firebase)

1. https://console.firebase.google.com → **Adicionar projeto** (ex.: `lar-em-dia`). Plano gratuito (Spark) basta para começar.
2. **Authentication → Começar → E-mail/senha → Ativar**.
3. **Authentication → Configurações → Domínios autorizados** → adicione `SEU-USUARIO.github.io`.
4. **Firestore Database → Criar banco** (modo produção, região `southamerica-east1`).
5. **Firestore → Regras**: cole o conteúdo de `firestore.rules` → **Publicar**.
6. **Configurações do projeto → Seus apps → Web (`</>`)** → copie o objeto `firebaseConfig` e cole em `js/firebase-config.js`.
7. Suba o arquivo alterado no GitHub. Pronto: o site passa a pedir login; cada pessoa cria a conta, cria a família ou entra com o código de convite (em *Família e ajustes*).

> A `apiKey` do Firebase não é segredo (ela identifica o projeto); quem protege os dados são as regras do Firestore.

**Ao publicar uma versão nova**, aumente `VERSAO` em `sw.js` para os celulares baixarem a atualização.

## 3. Roteiro para virar produto vendável

1. **Marca e domínio** — registro no INPI, domínio `.com.br`, apontar para o GitHub Pages (Settings → Pages → Custom domain).
2. **Página de vendas** (landing page) com planos, demonstração e cadastro.
3. **Termos de uso e Política de Privacidade (LGPD)** — dados financeiros pessoais; informar controlador, finalidade, retenção, exclusão de conta e exportação de dados.
4. **Planos e cobrança** — ex.: Grátis (1 cartão, 30 lançamentos/mês) × Premium (ilimitado, vários acessos, relatórios). Assinatura via Mercado Pago, Asaas ou Stripe; um webhook (Cloud Function) grava `plano: 'premium'` na família e o app libera os recursos.
5. **Alertas com o site fechado** — Cloud Function agendada (plano Blaze do Firebase, cobrança por uso) que roda todo dia às 8h e envia e-mail e/ou push (Firebase Cloud Messaging); WhatsApp via API oficial (Meta/Twilio/Z-API), com custo por mensagem.
6. **Importação** — extrato OFX/CSV do banco e leitura de boleto/Pix pelo código de barras ou QR code (câmera do celular).
7. **Metas e reserva de emergência**, relatórios anuais (IR), anexar comprovantes (Firebase Storage).
8. **Painel administrativo** — famílias cadastradas, planos, suporte.

---
© Davi Luciano Bertoli da Silva. Versão beta.
