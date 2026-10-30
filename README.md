# Meus Investimentos

App web (HTML + JavaScript puro) com **Firebase** (login Google + Firestore) hospedado no **GitHub Pages**.
Controle de saldo inicial, caixinhas/metas (Ações, Fundos, Renda Fixa, Reserva, Outros), aportes, retiradas e rendimentos de várias pessoas, com painel, gráficos e exportação CSV.

## Estrutura
- `index.html`, `style.css`, `app.js` — interface e lógica
- `calc.js` — cálculos (saldo, metas, evolução); testado com `node test-calc.mjs`
- `firebase-config.js` — configuração do seu projeto Firebase
- `firestore.rules` — regras: o dono acessa `users/{uid}/...`; o amigo só lê os próprios dados
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

## Acesso dos amigos (somente leitura)
Na aba **Pessoas**, edite a pessoa e preencha o **e-mail Google** dela. Ela entra no mesmo link com essa conta e vê só as próprias caixinhas, lançamentos e painel, sem poder alterar nada. Para tirar o acesso, apague o e-mail (ou exclua a pessoa).

## Modelo de dados (Firestore)
`users/{uid}/pessoas/{id}`: `nome, email`
`users/{uid}/caixinhas/{id}`: `pessoaId, nome, tipo, saldoInicial, dataInicial, meta, prazo`
`users/{uid}/lancamentos/{id}`: `data, caixinhaId, pessoaId, tipo (Aporte|Retirada|Rendimento), valor, obs`
`acessos/{email}`: `ownerUid, pessoaId, nome` (libera a leitura dos dados daquela pessoa)

Saldo da caixinha = saldo inicial + aportes − retiradas + rendimentos.

## Observações
- O `apiKey` do Firebase não é segredo; quem protege os dados são o login e as regras.
- Quem entra sem e-mail cadastrado como amigo ganha um espaço próprio e vazio; não vê os seus dados.
