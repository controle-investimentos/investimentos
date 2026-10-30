# Meus Investimentos

App web (HTML + JavaScript puro) com **Firebase** (login Google + Firestore) hospedado no **GitHub Pages**.
Controle de saldo inicial, caixinhas/metas (Ações, Fundos, Renda Fixa, Reserva, Outros), aportes, retiradas e rendimentos de várias pessoas, com painel, gráficos e exportação CSV.

## Estrutura
- `index.html`, `style.css`, `app.js` — interface e lógica
- `calc.js` — cálculos (saldo, metas, evolução); testado com `node test-calc.mjs`
- `firebase-config.js` — configuração do seu projeto Firebase
- `firestore.rules` — regras: o dono acessa tudo; o usuário lê e lança só os próprios dados, sempre como pendente
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

## Usuários, aprovação e ranking
- Na aba **Pessoas**, preencha o **e-mail Google** da pessoa. Ela entra no mesmo link com essa conta, vê só os próprios dados e pode criar caixinhas e lançamentos.
- Tudo que o usuário grava fica **pendente**: aparece no saldo dele na hora, mas só conta no ranking depois que você aprovar (card "Aguardando sua aprovação" no Painel, ou o botão Aprovar nas tabelas). O usuário só pode excluir o que ainda está pendente; se editar algo aprovado, volta para aprovação.
- **Ranking** (Painel), só com itens aprovados:
  - Quem mais guardou no mês e no ano: aportes − retiradas no período (rendimento não conta). No ano, desempata quem guardou em mais meses.
  - Maior patrimônio: saldo total aprovado.
  - Constância: meses seguidos guardando.
  - Meta no prazo (ritmo): quanto já juntou do que faltava para a meta (meta − saldo inicial), comparado com o tempo que já passou até o prazo. 100% = no ritmo. Só caixinhas com prazo e meta maior que o saldo inicial (meta fácil não conta).
- Você vê os valores de todos. Os usuários veem as posições e os nomes, e só o próprio valor. O ranking publicado para eles é atualizado sempre que você abre o app.

## Modelo de dados (Firestore)
`users/{uid}/pessoas/{id}`: `nome, email`
`users/{uid}/caixinhas/{id}`: `pessoaId, nome, tipo, saldoInicial, dataInicial, meta, prazo`
`users/{uid}/lancamentos/{id}`: `data, caixinhaId, pessoaId, tipo (Aporte|Retirada|Rendimento), valor, obs`
`acessos/{email}`: `ownerUid, pessoaId, nome` (liga o e-mail Google à pessoa)
`users/{uid}/ranking/geral`: posições e nomes de cada ranking (sem valores)
Caixinhas e lançamentos têm `aprovado` (true/false).

Saldo da caixinha = saldo inicial + aportes − retiradas + rendimentos.

## Observações
- O `apiKey` do Firebase não é segredo; quem protege os dados são o login e as regras.
- Quem entra sem e-mail cadastrado como amigo ganha um espaço próprio e vazio; não vê os seus dados.
