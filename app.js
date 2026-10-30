import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc,
  getDoc, deleteDoc, onSnapshot, writeBatch, query, where }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { TIPOS_INV, saldoCaixinha, totais, porTipo, evolucao, brl, pct, aprovado, rankings, rankingPublico } from "./calc.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtData = (d) => d ? d.split("-").reverse().join("/") : "";
const fmtMes = (ym) => ym ? ym.split("-").reverse().join("/") : "";
const hoje = () => new Date().toISOString().slice(0, 10);
const emailKey = (e) => String(e ?? "").trim().toLowerCase();

// ---------- Firebase ----------
if (firebaseConfig.apiKey === "COLE_AQUI") {
  $("#login").classList.remove("hidden");
  $("#login-msg").textContent = "Configure o firebase-config.js (veja o README).";
  $("#btn-login").disabled = true;
  throw new Error("Firebase não configurado");
}
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

// modo "dono": administra tudo e aprova. modo "membro": usuário que lança só os próprios dados.
let uid = null, modo = "dono", minhaPessoaId = null, unsubs = [];
const state = { pessoas: [], caixinhas: [], lancamentos: [], rankPub: null };
const col = (name) => collection(db, "users", uid, name);
const ehMembro = () => modo === "membro";

$("#btn-login").onclick = async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { $("#login-msg").textContent = "Não foi possível entrar: " + e.code; }
};
$("#btn-logout").onclick = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
  unsubs.forEach(u => u()); unsubs = [];
  state.pessoas = []; state.caixinhas = []; state.lancamentos = []; state.rankPub = null;
  if (!user) {
    uid = null; $("#app").classList.add("hidden"); $("#login").classList.remove("hidden"); return;
  }
  // Se o e-mail estiver cadastrado numa pessoa de alguém, entra como usuário (membro) desse dono.
  let acesso = null;
  try {
    const s = await getDoc(doc(db, "acessos", emailKey(user.email)));
    if (s.exists()) acesso = s.data();
  } catch (e) { console.warn("acesso", e); }
  if (acesso && acesso.ownerUid !== user.uid) { modo = "membro"; uid = acesso.ownerUid; minhaPessoaId = acesso.pessoaId; }
  else { modo = "dono"; uid = user.uid; minhaPessoaId = null; }
  document.body.classList.toggle("leitor", ehMembro());
  if (ehMembro() && view === "pessoas") $('#tabs button[data-view="dash"]').click();

  $("#user-name").textContent = user.displayName || user.email || "";
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
  const erro = (name) => (err) => console.error(name, err);

  if (ehMembro()) {
    const pid = minhaPessoaId;
    unsubs.push(onSnapshot(doc(col("pessoas"), pid), (s) => {
      state.pessoas = s.exists() ? [{ id: s.id, ...s.data() }] : [];
      renderAll();
    }, erro("pessoas")));
    for (const name of ["caixinhas", "lancamentos"]) {
      unsubs.push(onSnapshot(query(col(name), where("pessoaId", "==", pid)), (snap) => {
        state[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAll();
      }, erro(name)));
    }
    unsubs.push(onSnapshot(doc(col("ranking"), "geral"), (s) => {
      state.rankPub = s.exists() ? s.data() : null;
      renderAll();
    }, erro("ranking")));
    return;
  }
  for (const name of ["pessoas", "caixinhas", "lancamentos"]) {
    unsubs.push(onSnapshot(col(name), (snap) => {
      state[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAll();
      sincronizarPessoaIds();
      agendarRanking();
    }, erro(name)));
  }
});

// Cada lançamento guarda o pessoaId da caixinha (é o que permite ao usuário ver só os dele).
// Corrige lançamentos antigos e os de caixinhas que mudaram de pessoa.
let sincronizando = false;
async function sincronizarPessoaIds() {
  if (ehMembro() || sincronizando) return;
  const dono = new Map(state.caixinhas.map(c => [c.id, c.pessoaId]));
  const fix = state.lancamentos.filter(l => dono.has(l.caixinhaId) && l.pessoaId !== dono.get(l.caixinhaId));
  if (!fix.length) return;
  sincronizando = true;
  try {
    for (let i = 0; i < fix.length; i += 400) {
      const b = writeBatch(db);
      fix.slice(i, i + 400).forEach(l => b.update(doc(col("lancamentos"), l.id), { pessoaId: dono.get(l.caixinhaId) }));
      await b.commit();
    }
  } catch (e) { console.error("sincronizar", e); }
  finally { sincronizando = false; }
}

// O app do dono publica o ranking (só posições e nomes) para os usuários verem.
let timerRank = null, ultimoRank = "";
function agendarRanking() {
  clearTimeout(timerRank);
  timerRank = setTimeout(async () => {
    if (ehMembro() || !uid) return;
    const pub = rankingPublico(rankings(state.pessoas, state.caixinhas, state.lancamentos, hoje().slice(0, 7), hoje()));
    const json = JSON.stringify(pub);
    if (json === ultimoRank) return;
    try {
      const b = writeBatch(db);
      b.set(doc(col("ranking"), "geral"), { ...pub, atualizadoEm: new Date().toISOString() });
      await b.commit();
      ultimoRank = json;
    } catch (e) { console.error("ranking", e); }
  }, 1500);
}

// ---------- Navegação ----------
let view = "dash";
$("#tabs").onclick = (e) => {
  const b = e.target.closest("button[data-view]"); if (!b) return;
  view = b.dataset.view;
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("active", x === b));
  for (const v of ["dash", "caixinhas", "lanc", "pessoas"]) $("#view-" + v).classList.toggle("hidden", v !== view);
  renderAll();
};
$("#f-pessoa").onchange = renderAll;
$("#f-mes").onchange = renderAll;
$("#rk-mes").onchange = renderRanking;
$("#rk-ano").onchange = renderRanking;

// ---------- Helpers de dados ----------
const nomePessoa = (id) => state.pessoas.find(p => p.id === id)?.nome ?? "—";
const nomeCx = (id) => state.caixinhas.find(c => c.id === id)?.nome ?? "—";
const byNome = (a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR");
function filtrados() {
  const pid = $("#f-pessoa").value;
  const cxs = state.caixinhas.filter(c => !pid || c.pessoaId === pid);
  const ids = new Set(cxs.map(c => c.id));
  return { cxs, lancs: state.lancamentos.filter(l => ids.has(l.caixinhaId)) };
}
const tagPendente = (x) => aprovado(x) ? "" : ` <span class="badge warn">${ehMembro() ? "aguardando aprovação" : "pendente"}</span>`;

// ---------- Render ----------
function renderAll() {
  fillPessoaFilter();
  if (view === "dash") renderDash();
  if (view === "caixinhas") renderCaixinhas();
  if (view === "lanc") renderLanc();
  if (view === "pessoas") renderPessoas();
}

function fillPessoaFilter() {
  const sel = $("#f-pessoa"), cur = sel.value;
  sel.innerHTML = `<option value="">Todos</option>` + [...state.pessoas].sort(byNome)
    .map(p => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join("");
  sel.value = state.pessoas.some(p => p.id === cur) ? cur : "";
}

let chEvo, chTipo;
function renderDash() {
  const { cxs, lancs } = filtrados();
  const t = totais(cxs, lancs);
  const mesAtual = hoje().slice(0, 7);
  const aportesMes = lancs.filter(l => l.tipo === "Aporte" && (l.data || "").startsWith(mesAtual)).reduce((a, l) => a + l.valor, 0);
  const kpi = (l, v, cls = "") => `<div class="kpi"><div class="l">${l}</div><div class="v ${cls}">${v}</div></div>`;
  $("#kpis").innerHTML =
    kpi("Saldo atual", brl(t.saldo)) +
    kpi("Aportes no mês", brl(aportesMes)) +
    kpi("Rendimentos acumulados", brl(t.rend), t.rend < 0 ? "neg" : "pos") +
    kpi("Progresso das metas", pct(t.pct));

  renderPendentes();
  renderRanking();

  const css = getComputedStyle(document.documentElement);
  const brand = css.getPropertyValue("--brand").trim(), txt = css.getPropertyValue("--muted").trim(), line = css.getPropertyValue("--line").trim();
  Chart.defaults.color = txt; Chart.defaults.borderColor = line;

  const ev = evolucao(cxs, lancs, mesAtual, 12);
  chEvo?.destroy();
  chEvo = new Chart($("#ch-evo"), {
    type: "line",
    data: { labels: ev.map(e => e.mes.split("-").reverse().join("/")),
            datasets: [{ label: "Saldo", data: ev.map(e => e.saldo), borderColor: brand, backgroundColor: brand + "22", fill: true, tension: .25 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => brl(c.parsed.y) } } },
               scales: { y: { ticks: { callback: v => brl(v) } } } }
  });

  const pt = porTipo(cxs, lancs), tipos = Object.keys(pt).filter(k => pt[k] > 0);
  chTipo?.destroy();
  chTipo = new Chart($("#ch-tipo"), {
    type: "doughnut",
    data: { labels: tipos, datasets: [{ data: tipos.map(k => pt[k]), backgroundColor: ["#4c8dff", "#3ccb7f", "#f5a524", "#a06cf0", "#8a96a3"], borderWidth: 0 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: c => `${c.label}: ${brl(c.parsed)}` } } } }
  });

  const comMeta = cxs.filter(c => (c.meta || 0) > 0);
  $("#metas").innerHTML = comMeta.length ? comMeta.map(c => {
    const s = saldoCaixinha(c, lancs), w = Math.min((s.pct || 0) * 100, 100);
    return `<div class="meta"><div class="top"><span><b>${esc(c.nome)}</b> <span class="muted">· ${esc(nomePessoa(c.pessoaId))}${c.prazo ? " · até " + fmtData(c.prazo) : ""}</span></span>
      <span>${brl(s.saldo)} / ${brl(s.meta)} (${pct(s.pct)})</span></div>
      <div class="bar"><i class="${s.pct >= 1 ? "done" : ""}" style="width:${w}%"></i></div></div>`;
  }).join("") : `<div class="empty">Nenhuma meta cadastrada.</div>`;

  const linhas = [...state.pessoas].sort(byNome).filter(p => !$("#f-pessoa").value || p.id === $("#f-pessoa").value).map(p => {
    const cp = state.caixinhas.filter(c => c.pessoaId === p.id);
    const ids = new Set(cp.map(c => c.id));
    const x = totais(cp, state.lancamentos.filter(l => ids.has(l.caixinhaId)));
    return `<tr><td>${esc(p.nome)}</td><td class="n">${brl(x.inicial)}</td><td class="n">${brl(x.aportes)}</td><td class="n">${brl(x.retiradas)}</td><td class="n">${brl(x.rend)}</td><td class="n"><b>${brl(x.saldo)}</b></td><td class="n">${pct(x.pct)}</td></tr>`;
  }).join("");
  $("#por-pessoa").innerHTML = linhas
    ? `<table><thead><tr><th>Pessoa</th><th class="n">Saldo inicial</th><th class="n">Aportes</th><th class="n">Retiradas</th><th class="n">Rendimentos</th><th class="n">Saldo atual</th><th class="n">% da meta</th></tr></thead><tbody>${linhas}</tbody></table>`
    : `<div class="empty">${ehMembro() ? "Nenhum dado ainda." : "Cadastre as pessoas na aba “Pessoas”."}</div>`;
}

// ---------- Aprovações ----------
function renderPendentes() {
  const cxs = state.caixinhas.filter(c => !aprovado(c));
  const ls = state.lancamentos.filter(l => !aprovado(l));
  const box = $("#pendentes"), n = cxs.length + ls.length;
  box.classList.toggle("hidden", n === 0);
  if (!n) return;
  if (ehMembro()) {
    box.innerHTML = `<h2>Aguardando aprovação</h2><p class="muted small" style="margin:0">Você tem ${n} item(ns) aguardando a aprovação do administrador. Eles já aparecem no seu saldo, mas só contam no ranking depois de aprovados.</p>`;
    return;
  }
  const linhaCx = (c) => `<tr><td>${esc(nomePessoa(c.pessoaId))}</td><td>Caixinha</td><td>${esc(c.nome)} <span class="muted">(${esc(c.tipo)})</span></td><td class="n">${brl(c.saldoInicial)} inicial</td>
    <td><button class="link" data-aprovar="caixinhas:${esc(c.id)}">Aprovar</button></td></tr>`;
  const linhaL = (l) => `<tr><td>${esc(nomePessoa(l.pessoaId))}</td><td>${esc(l.tipo)}</td><td>${esc(nomeCx(l.caixinhaId))} · ${fmtData(l.data)}${l.obs ? " · " + esc(l.obs) : ""}</td><td class="n">${brl(l.valor)}</td>
    <td><button class="link" data-aprovar="lancamentos:${esc(l.id)}">Aprovar</button></td></tr>`;
  box.innerHTML = `<div class="toolbar"><h2>Aguardando sua aprovação (${n})</h2><button class="primary" data-aprovar-todos="1">Aprovar todos</button></div>
    <p class="muted small">Só entram no ranking depois de aprovados. Para corrigir ou recusar, use Editar/Excluir nas abas Caixinhas e Lançamentos.</p>
    <div class="table-wrap"><table><tbody>${cxs.map(linhaCx).join("")}${ls.map(linhaL).join("")}</tbody></table></div>`;
}
document.addEventListener("click", async (e) => {
  const um = e.target.closest("[data-aprovar]"), todos = e.target.closest("[data-aprovar-todos]");
  if (!um && !todos) return;
  if (ehMembro()) return;
  const alvos = um ? [um.dataset.aprovar.split(":")]
    : [...state.caixinhas.filter(c => !aprovado(c)).map(c => ["caixinhas", c.id]),
       ...state.lancamentos.filter(l => !aprovado(l)).map(l => ["lancamentos", l.id])];
  try {
    for (let i = 0; i < alvos.length; i += 400) {
      const b = writeBatch(db);
      alvos.slice(i, i + 400).forEach(([c, id]) => b.update(doc(col(c), id), { aprovado: true, aprovadoEm: new Date().toISOString() }));
      await b.commit();
    }
  } catch (err) { alert("Erro ao aprovar: " + (err.code || err.message)); }
});

// ---------- Ranking ----------
const RANKS = [
  { id: "mes", titulo: "Quem mais guardou no mês", fmt: brl },
  { id: "ano", titulo: "Quem mais guardou no ano", fmt: brl },
  { id: "patrimonio", titulo: "Maior patrimônio", fmt: brl },
  { id: "constancia", titulo: "Constância (meses seguidos guardando)", fmt: (v) => `${v} ${v === 1 ? "mês" : "meses"}` },
  { id: "meta", titulo: "Meta no prazo (ritmo)", fmt: (v) => `${pct(v)} do ritmo` },
];
const INFO_META = "Meta no prazo: quanto já juntou do que faltava para a meta, comparado com o tempo que já passou até o prazo (100% = no ritmo; acima = adiantado). Só entram caixinhas com meta maior que o saldo inicial e com prazo.";
function renderRanking() {
  const mesAtual = hoje().slice(0, 7);
  const selMes = $("#rk-mes"), selAno = $("#rk-ano");
  if (!selMes.value) selMes.value = mesAtual;
  const mes = selMes.value, anoCur = selAno.value || mesAtual.slice(0, 4);
  // Dono: calcula com valores. Usuário: posições do ranking publicado + o próprio valor.
  const completo = ehMembro() ? null : rankings(state.pessoas, state.caixinhas, state.lancamentos, mesAtual, hoje());
  const meu = ehMembro() ? rankings(state.pessoas, state.caixinhas, state.lancamentos, mesAtual, hoje()) : null;
  const fonte = completo || state.rankPub || { guardouMes: {}, guardouAno: {}, patrimonio: [], constancia: [], meta: [] };
  const anos = [...new Set([mesAtual.slice(0, 4), ...Object.keys(fonte.guardouAno || {})])].sort().reverse();
  selAno.innerHTML = anos.map(a => `<option ${a === anoCur ? "selected" : ""}>${a}</option>`).join("");
  const ano = selAno.value;
  const pega = (r, id) => id === "mes" ? (r.guardouMes?.[mes] || []) : id === "ano" ? (r.guardouAno?.[ano] || []) : (r[id] || []);

  $("#rk-info").textContent = ehMembro()
    ? (state.rankPub?.atualizadoEm ? `Atualizado em ${new Date(state.rankPub.atualizadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}. ` : "Ainda não publicado. ") + "Só contam lançamentos aprovados. " + INFO_META
    : "Só contam lançamentos e caixinhas aprovados. Os usuários veem as posições e os nomes, sem os valores dos outros. " + INFO_META;

  $("#rk-listas").innerHTML = RANKS.map(rk => {
    const lista = pega(fonte, rk.id);
    const medalha = (i) => ["🥇", "🥈", "🥉"][i] || `${i + 1}º`;
    const itens = lista.slice(0, 10).map((x, i) => {
      const eu = ehMembro() && x.pessoaId === minhaPessoaId;
      const valor = completo ? `<span class="v">${rk.fmt(x.valor)}</span>` : "";
      return `<li class="${eu ? "eu" : ""}"><span class="pos">${medalha(i)}</span><span class="nm">${esc(x.nome)}${eu ? " (você)" : ""}</span>${valor}</li>`;
    }).join("");
    let rodape = "";
    if (ehMembro()) {
      const pos = lista.findIndex(x => x.pessoaId === minhaPessoaId);
      const v = pega(meu, rk.id).find(x => x.pessoaId === minhaPessoaId)?.valor;
      rodape = `<div class="rk-eu">Você: ${pos >= 0 ? `<b>${pos + 1}º lugar</b>` : "fora do ranking"}${v != null ? ` · ${rk.fmt(v)}` : ""}</div>`;
    }
    return `<div class="rk"><h3>${rk.titulo}</h3>${itens ? `<ol>${itens}</ol>` : `<div class="empty small">Ninguém ainda.</div>`}${rodape}</div>`;
  }).join("");
}

// ---------- Tabelas ----------
// Dono: edita e exclui tudo. Usuário: edita o que é dele (volta para aprovação) e só exclui o que está pendente.
const acoes = (id, item) => {
  const del = !ehMembro() || !aprovado(item);
  const apr = !ehMembro() && !aprovado(item);
  return `<td class="acoes">${apr ? `<button class="link" data-aprovar="${item.caixinhaId ? "lancamentos" : "caixinhas"}:${esc(id)}">Aprovar</button>` : ""}<button class="link" data-edit="${esc(id)}">Editar</button>${del ? `<button class="link del" data-del="${esc(id)}">Excluir</button>` : ""}</td>`;
};

function renderCaixinhas() {
  const rows = [...state.caixinhas].sort((a, b) => nomePessoa(a.pessoaId).localeCompare(nomePessoa(b.pessoaId), "pt-BR") || byNome(a, b)).map(c => {
    const s = saldoCaixinha(c, state.lancamentos);
    return `<tr><td>${esc(nomePessoa(c.pessoaId))}</td><td>${esc(c.nome)}${tagPendente(c)}</td><td>${esc(c.tipo)}</td>
      <td class="n">${brl(s.inicial)}</td><td class="n">${brl(s.aportes)}</td><td class="n">${brl(s.retiradas)}</td><td class="n">${brl(s.rend)}</td>
      <td class="n"><b>${brl(s.saldo)}</b></td><td class="n">${brl(s.meta)}</td><td class="n">${pct(s.pct)}</td><td>${fmtData(c.prazo)}</td>
      ${acoes(c.id, c)}</tr>`;
  }).join("");
  $("#tb-cx").innerHTML = rows
    ? `<table><thead><tr><th>Pessoa</th><th>Caixinha</th><th>Tipo</th><th class="n">Inicial</th><th class="n">Aportes</th><th class="n">Retiradas</th><th class="n">Rendimentos</th><th class="n">Saldo atual</th><th class="n">Meta</th><th class="n">%</th><th>Prazo</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
    : `<div class="empty">Nenhuma caixinha. Clique em “+ Nova caixinha”.</div>`;
}

function renderLanc() {
  const mes = $("#f-mes").value;
  const ls = state.lancamentos.filter(l => !mes || (l.data || "").startsWith(mes)).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const rows = ls.map(l => {
    const cx = state.caixinhas.find(c => c.id === l.caixinhaId);
    const cls = l.tipo === "Retirada" ? "neg" : (l.tipo === "Rendimento" && l.valor < 0 ? "neg" : "pos");
    return `<tr><td>${fmtData(l.data)}</td><td>${esc(nomePessoa(cx?.pessoaId))}</td><td>${esc(cx?.nome ?? "—")}</td><td>${esc(l.tipo)}${tagPendente(l)}</td>
      <td class="n ${cls}">${brl(l.valor)}</td><td>${esc(l.obs)}</td>
      ${acoes(l.id, l)}</tr>`;
  }).join("");
  $("#tb-l").innerHTML = rows
    ? `<table><thead><tr><th>Data</th><th>Pessoa</th><th>Caixinha</th><th>Tipo</th><th class="n">Valor</th><th>Obs.</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
    : `<div class="empty">Nenhum lançamento${mes ? " neste mês" : ""}.</div>`;
}

function renderPessoas() {
  const rows = [...state.pessoas].sort(byNome).map(p => {
    const cp = state.caixinhas.filter(c => c.pessoaId === p.id);
    const ids = new Set(cp.map(c => c.id));
    const x = totais(cp, state.lancamentos.filter(l => ids.has(l.caixinhaId)));
    const acesso = p.email ? `<span class="badge">${esc(p.email)}</span>` : `<span class="muted small">sem acesso</span>`;
    return `<tr><td>${esc(p.nome)}</td><td>${acesso}</td><td class="n">${cp.length}</td><td class="n">${brl(x.saldo)}</td>
      ${acoes(p.id, p)}</tr>`;
  }).join("");
  $("#tb-p").innerHTML = rows
    ? `<table><thead><tr><th>Nome</th><th>Acesso (e-mail Google)</th><th class="n">Caixinhas</th><th class="n">Saldo atual</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
    : `<div class="empty">Comece cadastrando as pessoas. Quem tiver e-mail Google preenchido entra e lança os próprios investimentos.</div>`;
}

// ---------- Diálogos / CRUD ----------
function openDialog(dlg, form, values) {
  form.reset(); dlg.returnValue = "";
  for (const [k, v] of Object.entries(values || {})) if (form.elements[k]) form.elements[k].value = v ?? "";
  dlg.showModal();
}
function onSubmit(dlg, form, handler) {
  dlg.addEventListener("close", async () => {
    if (dlg.returnValue !== "ok") return;
    try { await handler(Object.fromEntries(new FormData(form))); }
    catch (e) { alert("Erro ao salvar: " + (e.code || e.message)); }
  });
}
const num = (v) => Number(String(v).replace(",", ".")) || 0;
const optsPessoas = () => [...state.pessoas].sort(byNome).map(p => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join("");
// O que o dono grava já sai aprovado; o que o usuário grava fica pendente.
const salvar = async (ref, data) => {
  const b = writeBatch(db);
  b.set(ref, { ...data, aprovado: !ehMembro() }, { merge: true });
  await b.commit();
};
const avisoMembro = () => { if (ehMembro()) alert("Salvo! Fica aguardando a aprovação do administrador para contar no ranking."); };

// Pessoas (o e-mail Google libera o acesso da pessoa)
let editP = null;
$("#btn-new-p").onclick = () => { editP = null; openDialog($("#dlg-p"), $("#form-p")); };
onSubmit($("#dlg-p"), $("#form-p"), async (d) => {
  const nome = d.nome.trim(), email = emailKey(d.email);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return alert("E-mail inválido.");
  if (email && state.pessoas.some(p => p.id !== editP && emailKey(p.email) === email)) return alert("Esse e-mail já está em outra pessoa.");
  const antigo = editP ? emailKey(state.pessoas.find(p => p.id === editP)?.email) : "";
  const ref = editP ? doc(col("pessoas"), editP) : doc(col("pessoas"));
  const b = writeBatch(db);
  b.set(ref, { nome, email }, { merge: true });
  if (antigo && antigo !== email) b.delete(doc(db, "acessos", antigo));
  if (email) b.set(doc(db, "acessos", email), { ownerUid: uid, pessoaId: ref.id, nome });
  await b.commit();
});
$("#tb-p").onclick = async (e) => {
  const id = e.target.dataset.edit, del = e.target.dataset.del;
  if (id) { editP = id; const p = state.pessoas.find(x => x.id === id); openDialog($("#dlg-p"), $("#form-p"), { nome: p?.nome, email: p?.email }); }
  if (del) {
    if (state.caixinhas.some(c => c.pessoaId === del)) return alert("Exclua ou mude as caixinhas dessa pessoa antes.");
    if (!confirm("Excluir esta pessoa? O acesso dela também é removido.")) return;
    const email = emailKey(state.pessoas.find(p => p.id === del)?.email);
    const b = writeBatch(db);
    b.delete(doc(col("pessoas"), del));
    if (email) b.delete(doc(db, "acessos", email));
    await b.commit();
  }
};

// Caixinhas
let editCx = null;
$("#btn-new-cx").onclick = () => {
  if (!state.pessoas.length) return alert(ehMembro() ? "Seu cadastro ainda está carregando, tente de novo." : "Cadastre uma pessoa primeiro.");
  editCx = null; fillCxSelects(); openDialog($("#dlg-cx"), $("#form-cx"), { tipo: TIPOS_INV[0], saldoInicial: 0, meta: 0, dataInicial: hoje() });
};
function fillCxSelects() {
  $("#form-cx").elements.pessoaId.innerHTML = optsPessoas();
  $("#form-cx").elements.tipo.innerHTML = TIPOS_INV.map(t => `<option>${t}</option>`).join("");
}
onSubmit($("#dlg-cx"), $("#form-cx"), async (d) => {
  const data = { pessoaId: ehMembro() ? minhaPessoaId : d.pessoaId, nome: d.nome.trim(), tipo: d.tipo, saldoInicial: num(d.saldoInicial),
                 dataInicial: d.dataInicial || "", meta: num(d.meta), prazo: d.prazo || "" };
  await salvar(editCx ? doc(col("caixinhas"), editCx) : doc(col("caixinhas")), data);
  avisoMembro();
});
$("#tb-cx").onclick = async (e) => {
  const id = e.target.dataset.edit, del = e.target.dataset.del;
  if (id) { editCx = id; fillCxSelects(); openDialog($("#dlg-cx"), $("#form-cx"), state.caixinhas.find(c => c.id === id)); }
  if (del) {
    const ls = state.lancamentos.filter(l => l.caixinhaId === del);
    if (ehMembro() && ls.some(aprovado)) return alert("Essa caixinha tem lançamentos aprovados. Peça ao administrador para excluí-la.");
    if (!confirm(`Excluir esta caixinha${ls.length ? ` e seus ${ls.length} lançamento(s)` : ""}?`)) return;
    const b = writeBatch(db);
    ls.forEach(l => b.delete(doc(col("lancamentos"), l.id)));
    b.delete(doc(col("caixinhas"), del));
    try { await b.commit(); } catch (err) { alert("Não foi possível excluir: " + (err.code || err.message)); }
  }
};

// Lançamentos
let editL = null;
const formL = $("#form-l");
function fillCxDoLanc(pessoaId, sel) {
  const list = state.caixinhas.filter(c => c.pessoaId === pessoaId).sort(byNome);
  formL.elements.caixinhaId.innerHTML = list.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join("");
  if (sel) formL.elements.caixinhaId.value = sel;
}
formL.elements.pessoaId.onchange = () => fillCxDoLanc(formL.elements.pessoaId.value);
$("#btn-new-l").onclick = () => {
  if (!state.caixinhas.length) return alert("Cadastre uma caixinha primeiro.");
  editL = null;
  formL.elements.pessoaId.innerHTML = optsPessoas();
  openDialog($("#dlg-l"), formL, { data: hoje(), tipo: "Aporte" });
  fillCxDoLanc(formL.elements.pessoaId.value);
};
onSubmit($("#dlg-l"), formL, async (d) => {
  const cx = state.caixinhas.find(c => c.id === d.caixinhaId);
  const data = { data: d.data, caixinhaId: d.caixinhaId, pessoaId: cx?.pessoaId || "", tipo: d.tipo, valor: num(d.valor), obs: (d.obs || "").trim() };
  if (!data.caixinhaId) return alert("Escolha uma caixinha.");
  if (data.tipo !== "Rendimento" && data.valor < 0) return alert("Aporte e retirada devem ter valor positivo.");
  await salvar(editL ? doc(col("lancamentos"), editL) : doc(col("lancamentos")), data);
  avisoMembro();
});
$("#tb-l").onclick = async (e) => {
  const id = e.target.dataset.edit, del = e.target.dataset.del;
  if (id) {
    const l = state.lancamentos.find(x => x.id === id), cx = state.caixinhas.find(c => c.id === l.caixinhaId);
    editL = id; formL.elements.pessoaId.innerHTML = optsPessoas();
    openDialog($("#dlg-l"), formL, { ...l, pessoaId: cx?.pessoaId });
    fillCxDoLanc(cx?.pessoaId, l.caixinhaId);
  }
  if (del && confirm("Excluir este lançamento?")) {
    try { await deleteDoc(doc(col("lancamentos"), del)); } catch (err) { alert("Não foi possível excluir: " + (err.code || err.message)); }
  }
};

// ---------- Exportar CSV ----------
$("#btn-export").onclick = () => {
  const { cxs, lancs } = filtrados();
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const linhas = [["Pessoa", "Caixinha", "Tipo", "Saldo inicial", "Aportes", "Retiradas", "Rendimentos", "Saldo atual", "Meta", "% meta"]];
  for (const c of cxs) {
    const s = saldoCaixinha(c, lancs);
    linhas.push([nomePessoa(c.pessoaId), c.nome, c.tipo, s.inicial, s.aportes, s.retiradas, s.rend, s.saldo, s.meta, s.pct == null ? "" : s.pct]);
  }
  const csv = "﻿" + linhas.map(r => r.map(v => typeof v === "number" ? String(v).replace(".", ",") : cell(v)).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `investimentos-${hoje()}.csv`; a.click(); URL.revokeObjectURL(a.href);
};
