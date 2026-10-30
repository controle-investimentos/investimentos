# Meus Investimentos

App web (HTML + JavaScript puro) com **Firebase** (login Google + Firestore) hospedado no **GitHub Pages**.
Controle de saldo inicial, caixinhas/metas (Ações, Fundos, Renda Fixa, Reserva, Outros), aportes, retiradas e rendimentos de várias pessoas, com painel, gráficos e exportação CSV.

## Estrutura
- `index.html`, `style.css`, `app.js` — interface e lógica
- `calc.js` — cálculos (saldo, metas, evolução); testado com `node test-calc.mjs`
- `firebase-config.js` — configuração do seu projeto Firebase
- `firestore.rules` — regras: cada usuário só acessa `users/{uid}/...`
- `.github/workflows/pages.yml` — publica no GitHub Pages a cada push na `main`

## Publicado
- Site: https://controle-investimentos.github.io/investimentos/
- Repositório: https://github.com/controle-investimentos/investimentos
- Firebase: projeto `controle-investimentos-4cea3` (login Google, Firestore em `southamerica-east1`)

## Passo a passo (para recriar do zero)
1. **Firebase**: console.firebase.google.com > Adicionar projeto.
2. **Authentication** > Método de login > ative **Google**.
3. **Firestore Database** > Criar banco (modo produção, região `southamerica-east1`).
4. **Firestore > Regras**: cole o conteúdo de `firestore.rules` e publique.
5. **Configurações do projeto > Seus apps > Web (`</>`)**: registre o app e copie o objeto `firebaseConfig` para `firebase-config.js`.
6. **GitHub**: crie o repositório, suba estes arquivos na `main`. Em *Settings > Pages > Source* escolha **GitHub Actions**.
7. **Authentication > Configurações > Domínios autorizados**: adicione `controle-investimentos.github.io`.
8. Abra `https://controle-investimentos.github.io/investimentos/`, entre com o Google, cadastre as pessoas, depois as caixinhas (com o saldo já investido) e os lançamentos mensais.

Teste local: `python3 -m http.server 8000` e abra `http://localhost:8000` (adicione `localhost` aos domínios autorizados).

## Modelo de dados (Firestore)
`users/{uid}/pessoas/{id}`: `nome`
`users/{uid}/caixinhas/{id}`: `pessoaId, nome, tipo, saldoInicial, dataInicial, meta, prazo`
`users/{uid}/lancamentos/{id}`: `data, caixinhaId, tipo (Aporte|Retirada|Rendimento), valor, obs`

Saldo da caixinha = saldo inicial + aportes − retiradas + rendimentos.

## Observações
- O `apiKey` do Firebase não é segredo; quem protege os dados são o login e as regras.
- Os dados são do usuário logado. Para os amigos verem o próprio saldo, o próximo passo é criar um papel "leitor" por pessoa (posso adicionar).
