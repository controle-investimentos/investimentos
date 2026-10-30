// Funções puras de cálculo (sem Firebase/DOM) — testáveis em Node.
export const TIPOS_INV = ["Ações", "Fundos", "Renda Fixa", "Reserva", "Outros"];

export function sinal(tipo) { return tipo === "Retirada" ? -1 : 1; }

/** Saldo de cada caixinha = saldo inicial + aportes − retiradas + rendimentos. */
export function saldoCaixinha(cx, lancs) {
  let aportes = 0, retiradas = 0, rend = 0;
  for (const l of lancs) {
    if (l.caixinhaId !== cx.id) continue;
    if (l.tipo === "Aporte") aportes += l.valor;
    else if (l.tipo === "Retirada") retiradas += l.valor;
    else if (l.tipo === "Rendimento") rend += l.valor;
  }
  const inicial = cx.saldoInicial || 0;
  const saldo = inicial + aportes - retiradas + rend;
  const meta = cx.meta || 0;
  return { inicial, aportes, retiradas, rend, saldo, meta,
           pct: meta > 0 ? saldo / meta : null, falta: meta > 0 ? Math.max(meta - saldo, 0) : null };
}

export function totais(caixinhas, lancs) {
  const t = { inicial: 0, aportes: 0, retiradas: 0, rend: 0, saldo: 0, meta: 0 };
  for (const cx of caixinhas) {
    const s = saldoCaixinha(cx, lancs);
    for (const k of Object.keys(t)) t[k] += s[k];
  }
  t.pct = t.meta > 0 ? t.saldo / t.meta : null;
  return t;
}

export function porTipo(caixinhas, lancs) {
  const out = {};
  for (const cx of caixinhas) out[cx.tipo] = (out[cx.tipo] || 0) + saldoCaixinha(cx, lancs).saldo;
  return out;
}

const ym = (d) => d.slice(0, 7); // "2026-10-05" -> "2026-10"

/** Saldo no fim de cada um dos últimos n meses (inclui o mês de `ref`, "YYYY-MM"). */
export function evolucao(caixinhas, lancs, ref, n = 12) {
  const ids = new Set(caixinhas.map(c => c.id));
  const base = caixinhas.reduce((a, c) => a + (c.saldoInicial || 0), 0);
  const [ry, rm] = ref.split("-").map(Number);
  const meses = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ry, rm - 1 - i, 1));
    meses.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return meses.map(m => {
    let s = base, aportes = 0;
    for (const l of lancs) {
      if (!ids.has(l.caixinhaId) || !l.data) continue;
      const lm = ym(l.data);
      if (lm <= m) s += sinal(l.tipo) * l.valor;
      if (lm === m && l.tipo === "Aporte") aportes += l.valor;
    }
    return { mes: m, saldo: s, aportes };
  });
}

// ---------- Rankings ----------
// Só entram itens aprovados (itens antigos, sem o campo, contam como aprovados).
export const aprovado = (x) => x.aprovado !== false;

const mesAnterior = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/**
 * Calcula os rankings. Retorna listas ordenadas de { pessoaId, nome, valor }.
 * - guardouMes[ym] / guardouAno[aaaa]: aportes − retiradas aprovados no período (rendimento não conta).
 *   No ano, desempata quem guardou em mais meses.
 * - patrimonio: saldo inicial das caixinhas aprovadas + lançamentos aprovados (inclui rendimentos).
 * - constancia: meses seguidos guardando (> 0) até o mês atual (ou até o anterior, se o atual ainda não teve aporte).
 * - meta: patrimônio ÷ soma das metas das caixinhas da pessoa.
 */
export function rankings(pessoas, caixinhas, lancs, mesAtual) {
  const cxPessoa = new Map(caixinhas.map(c => [c.id, c.pessoaId]));
  const net = {}, rend = {};
  for (const l of lancs) {
    if (!aprovado(l) || !l.data) continue;
    const pid = cxPessoa.get(l.caixinhaId) ?? l.pessoaId;
    if (!pid) continue;
    const ym = l.data.slice(0, 7), v = Number(l.valor) || 0;
    if (l.tipo === "Rendimento") { rend[pid] = (rend[pid] || 0) + v; continue; }
    const s = l.tipo === "Aporte" ? 1 : l.tipo === "Retirada" ? -1 : 0;
    if (!s) continue;
    (net[pid] ||= {})[ym] = (net[pid][ym] || 0) + s * v;
  }
  const ord = (arr) => arr.filter(x => x.valor > 0)
    .sort((a, b) => b.valor - a.valor || (b.desempate || 0) - (a.desempate || 0) || a.nome.localeCompare(b.nome, "pt-BR"))
    .map(({ pessoaId, nome, valor }) => ({ pessoaId, nome, valor }));
  const meses = new Set(), anos = new Set();
  for (const p in net) for (const ym in net[p]) { meses.add(ym); anos.add(ym.slice(0, 4)); }

  const guardouMes = {}, guardouAno = {};
  for (const m of meses) guardouMes[m] = ord(pessoas.map(p => ({ pessoaId: p.id, nome: p.nome, valor: net[p.id]?.[m] || 0 })));
  for (const a of anos) guardouAno[a] = ord(pessoas.map(p => {
    const ms = Object.entries(net[p.id] || {}).filter(([m]) => m.startsWith(a));
    return { pessoaId: p.id, nome: p.nome, valor: ms.reduce((s, [, v]) => s + v, 0), desempate: ms.filter(([, v]) => v > 0).length };
  }));

  const pat = {}, metaTot = {};
  for (const c of caixinhas) {
    if (aprovado(c)) pat[c.pessoaId] = (pat[c.pessoaId] || 0) + (Number(c.saldoInicial) || 0);
    metaTot[c.pessoaId] = (metaTot[c.pessoaId] || 0) + (Number(c.meta) || 0);
  }
  for (const pid in net) for (const ym in net[pid]) pat[pid] = (pat[pid] || 0) + net[pid][ym];
  for (const pid in rend) pat[pid] = (pat[pid] || 0) + rend[pid];
  const patrimonio = ord(pessoas.map(p => ({ pessoaId: p.id, nome: p.nome, valor: pat[p.id] || 0 })));
  const meta = ord(pessoas.filter(p => metaTot[p.id] > 0)
    .map(p => ({ pessoaId: p.id, nome: p.nome, valor: Math.max(pat[p.id] || 0, 0) / metaTot[p.id] })));

  const anoAtual = mesAtual.slice(0, 4);
  const constancia = ord(pessoas.map(p => {
    const n = net[p.id] || {};
    let m = (n[mesAtual] || 0) > 0 ? mesAtual : mesAnterior(mesAtual), seq = 0;
    while ((n[m] || 0) > 0) { seq++; m = mesAnterior(m); }
    const noAno = Object.entries(n).filter(([k]) => k.startsWith(anoAtual)).reduce((s, [, v]) => s + v, 0);
    return { pessoaId: p.id, nome: p.nome, valor: seq, desempate: noAno };
  }));
  return { guardouMes, guardouAno, patrimonio, constancia, meta };
}

/** Versão pública do ranking (só posição e nome, sem valores) para os usuários. */
export function rankingPublico(r) {
  const tira = (l) => l.map(({ pessoaId, nome }) => ({ pessoaId, nome }));
  const mapa = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, tira(v)]));
  return { guardouMes: mapa(r.guardouMes), guardouAno: mapa(r.guardouAno),
           patrimonio: tira(r.patrimonio), constancia: tira(r.constancia), meta: tira(r.meta) };
}

export const brl = (v) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const pct = (v) => v == null ? "—" : (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
