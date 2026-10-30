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
assert.deepEqual(R.meta, []); // nenhuma caixinha com prazo
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

// ---------- ritmo da meta (prazo) ----------
const PM = [{id:"a",nome:"Ana"},{id:"b",nome:"Beto"},{id:"c",nome:"Caio"},{id:"d",nome:"Duda"}];
const CM = [
  {id:"m1",pessoaId:"a",saldoInicial:1000,meta:13000,dataInicial:"2026-01-01",prazo:"2027-01-01"}, // falta 12.000 em 1 ano
  {id:"m2",pessoaId:"b",saldoInicial:5000,meta:4000,dataInicial:"2026-01-01",prazo:"2026-12-31"},  // meta fácil: não conta
  {id:"m3",pessoaId:"c",saldoInicial:0,meta:1000,dataInicial:"2026-07-01",prazo:"2026-12-31"},     // recém-criada
  {id:"m4",pessoaId:"d",saldoInicial:0,meta:2000,dataInicial:"2026-01-01",prazo:"2026-12-31",aprovado:false}, // pendente
];
const LM = [
  {caixinhaId:"m1",tipo:"Aporte",valor:6000,data:"2026-03-01"},
  {caixinhaId:"m2",tipo:"Aporte",valor:100,data:"2026-03-01"},
  {caixinhaId:"m3",tipo:"Aporte",valor:100,data:"2026-07-01"},
  {caixinhaId:"m4",tipo:"Aporte",valor:2000,data:"2026-03-01"},
];
const RM = rankings(PM, CM, LM, "2026-07", "2026-07-02").meta;
assert.deepEqual(RM.map(x=>x.nome), ["Ana","Caio"]);
assert.ok(Math.abs(RM[0].valor - 6000/(12000*182/365)) < 1e-9);   // ~100%: no ritmo
assert.ok(Math.abs(RM[1].valor - 100/(1000*30/183)) < 1e-9);      // mínimo de 30 dias
// meta já batida: limita em 100% do objetivo
const RM2 = rankings(PM, CM, [...LM, {caixinhaId:"m1",tipo:"Aporte",valor:50000,data:"2026-04-01"}], "2026-07", "2026-07-02").meta;
assert.ok(Math.abs(RM2[0].valor - 12000/(12000*182/365)) < 1e-9);
// depois do prazo, o esperado é a meta inteira
const RM3 = rankings(PM, CM, LM, "2027-03", "2027-03-01").meta;
assert.equal(RM3.find(x=>x.nome==="Ana").valor, 0.5);
console.log("ritmo da meta OK");
