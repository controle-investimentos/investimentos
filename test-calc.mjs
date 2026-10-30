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
