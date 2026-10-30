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

export const brl = (v) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const pct = (v) => v == null ? "—" : (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
