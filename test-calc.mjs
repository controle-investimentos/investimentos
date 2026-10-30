import assert from "node:assert/strict";
import { saldoCaixinha, totais, porTipo, evolucao } from "./calc.js";
const cx = [{id:"a",pessoaId:"p1",tipo:"Fundos",saldoInicial:5000,meta:10000},
            {id:"b",pessoaId:"p2",tipo:"Ações",saldoInicial:3000,meta:20000}];
const l = [{caixinhaId:"a",tipo:"Aporte",valor:500,data:"2026-10-05"},
           {caixinhaId:"b",tipo:"Aporte",valor:300,data:"2026-10-05"},
           {caixinhaId:"a",tipo:"Rendimento",valor:42.5,data:"2026-10-30"},
           {caixinhaId:"a",tipo:"Retirada",valor:100,data:"2026-11-02"}];
assert.equal(saldoCaixinha(cx[0], l).saldo, 5442.5);
assert.equal(totais(cx, l).saldo, 8742.5);
assert.deepEqual(porTipo(cx, l), {Fundos:5442.5, "Ações":3300});
const e = evolucao(cx, l, "2026-11", 3);
assert.deepEqual(e.map(x=>x.saldo), [8000, 8842.5, 8742.5]);
assert.equal(e[1].aportes, 800);
console.log("calc OK");

// ---------- rankings ----------
import { rankings, rankingPublico } from "./calc.js";
const P = [{id:"a",nome:"Ana"},{id:"b",nome:"Beto"},{id:"c",nome:"Caio"}];
const C = [{id:"ca",pessoaId:"a",saldoInicial:10000,meta:20000},
           {id:"cb",pessoaId:"b",saldoInicial:500,meta:1000},
           {id:"cc",pessoaId:"c",saldoInicial:99999,meta:0,aprovado:false}]; // pendente: saldo inicial não conta
const L = [
  {caixinhaId:"ca",tipo:"Aporte",valor:100,data:"2026-10-02"},
  {caixinhaId:"cb",tipo:"Aporte",valor:300,data:"2026-10-03"},
  {caixinhaId:"cb",tipo:"Retirada",valor:50,data:"2026-10-20"},
  {caixinhaId:"cb",tipo:"Aporte",valor:200,data:"2026-09-03"},
  {caixinhaId:"cb",tipo:"Aporte",valor:200,data:"2026-08-03"},
  {caixinhaId:"ca",tipo:"Aporte",valor:1000,data:"2026-09-10"},
  {caixinhaId:"ca",tipo:"Rendimento",valor:80,data:"2026-10-30"},
  {caixinhaId:"cc",tipo:"Aporte",valor:5000,data:"2026-10-05",aprovado:false}, // pendente: não conta
];
const R = rankings(P, C, L, "2026-10");
assert.deepEqual(R.guardouMes["2026-10"].map(x=>[x.nome,x.valor]), [["Beto",250],["Ana",100]]);
assert.deepEqual(R.guardouAno["2026"].map(x=>[x.nome,x.valor]), [["Ana",1100],["Beto",650]]);
assert.deepEqual(R.patrimonio.map(x=>[x.nome,x.valor]), [["Ana",11180],["Beto",1150]]);
assert.deepEqual(R.constancia.map(x=>[x.nome,x.valor]), [["Beto",3],["Ana",2]]);
assert.deepEqual(R.meta.map(x=>x.nome), ["Beto","Ana"]); // 115% vs 55,9%
assert.equal(R.meta[0].valor, 1.15);
// constância conta até o mês anterior se o atual ainda não teve aporte
assert.deepEqual(rankings(P, C, L, "2026-11").constancia.map(x=>[x.nome,x.valor]), [["Beto",3],["Ana",2]]);
// empate no ano: desempata quem guardou em mais meses
const R2 = rankings(P, [{id:"x",pessoaId:"a"},{id:"y",pessoaId:"b"}],
  [{caixinhaId:"x",tipo:"Aporte",valor:300,data:"2026-01-01"},
   {caixinhaId:"y",tipo:"Aporte",valor:100,data:"2026-01-01"},{caixinhaId:"y",tipo:"Aporte",valor:200,data:"2026-02-01"}], "2026-02");
assert.deepEqual(R2.guardouAno["2026"].map(x=>x.nome), ["Beto","Ana"]);
// versão pública não leva valores
const pub = rankingPublico(R);
assert.ok(!JSON.stringify(pub).includes("valor"));
assert.deepEqual(pub.guardouMes["2026-10"], [{pessoaId:"b",nome:"Beto"},{pessoaId:"a",nome:"Ana"}]);
console.log("rankings OK");
