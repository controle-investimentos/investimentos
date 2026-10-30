import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc,
  addDoc, setDoc, deleteDoc, onSnapshot, writeBatch }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { TIPOS_INV, saldoCaixinha, totais, porTipo, evolucao, brl, pct } from "./calc.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtData = (d) => d ? d.split("-").reverse().join("/") : "";
const hoje = () => new Date().toISOString().slice(0, 10);

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

let uid = null, unsubs = [];
const state = { pessoas: [], caixinhas: [], lancamentos: [] };
const col = (name) => collection(db, "users", uid, name);

$("#btn-login").onclick = async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { $("#login-msg").textContent = "Não foi possível entrar: " + e.code; }
};
$("#btn-logout").onclick = () => signOut(auth);

onAuthStateChanged(auth, (user) => {
  unsubs.forEach(u => u()); unsubs = [];
  if (!user) {
    uid = null; $("#app").classList.add("hidden"); $("#login").classList.remove("hidden"); return;
  }
  uid = user.uid;
  $("#user-name").textContent = user.displayName || user.email || "";
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
  for (const name of ["pessoas", "caixinhas", "lancamentos"]) {
    unsubs.push(onSnapshot(col(name), (snap) => {
      state[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAll();
    }, (err) => console.error(name, err)));
  }
});

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
    : `<div class="empty">Cadastre as pessoas na aba “Pessoas”.</div>`;
}

function renderCaixinhas() {
  const rows = [...state.caixinhas].sort((a, b) => nomePessoa(a.pessoaId).localeCompare(nomePessoa(b.pessoaId), "pt-BR") || byNome(a, b)).map(c => {
    const s = saldoCaixinha(c, state.lancamentos);
    return `<tr><td>${esc(nomePessoa(c.pessoaId))}</td><td>${esc(c.nome)}</td><td>${esc(c.tipo)}</td>
      <td class="n">${brl(s.inicial)}</td><td class="n">${brl(s.aportes)}</td><td class="n">${brl(s.retiradas)}</td><td class="n">${brl(s.rend)}</td>
      <td class="n"><b>${brl(s.saldo)}</b></td><td class="n">${brl(s.meta)}</td><td class="n">${pct(s.pct)}</td><td>${fmtData(c.prazo)}</td>
      <td><button class="link" data-edit="${esc(c.id)}">Editar</button><button class="link del" data-del="${esc(c.id)}">Excluir</button></td></tr>`;
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
    return `<tr><td>${fmtData(l.data)}</td><td>${esc(nomePessoa(cx?.pessoaId))}</td><td>${esc(cx?.nome ?? "—")}</td><td>${esc(l.tipo)}</td>
      <td class="n ${cls}">${brl(l.valor)}</td><td>${esc(l.obs)}</td>
      <td><button class="link" data-edit="${esc(l.id)}">Editar</button><button class="link del" data-del="${esc(l.id)}">Excluir</button></td></tr>`;
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
    return `<tr><td>${esc(p.nome)}</td><td class="n">${cp.length}</td><td class="n">${brl(x.saldo)}</td>
      <td><button class="link" data-edit="${esc(p.id)}">Editar</button><button class="link del" data-del="${esc(p.id)}">Excluir</button></td></tr>`;
  }).join("");
  $("#tb-p").innerHTML = rows
    ? `<table><thead><tr><th>Nome</th><th class="n">Caixinhas</th><th class="n">Saldo atual</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
    : `<div class="empty">Comece cadastrando as pessoas (os dois amigos).</div>`;
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

// Pessoas
let editP = null;
$("#btn-new-p").onclick = () => { editP = null; openDialog($("#dlg-p"), $("#form-p")); };
onSubmit($("#dlg-p"), $("#form-p"), async (d) => {
  const data = { nome: d.nome.trim() };
  if (editP) await setDoc(doc(col("pessoas"), editP), data, { merge: true }); else await addDoc(col("pessoas"), data);
});
$("#tb-p").onclick = async (e) => {
  const id = e.target.dataset.edit, del = e.target.dataset.del;
  if (id) { editP = id; openDialog($("#dlg-p"), $("#form-p"), { nome: nomePessoa(id) }); }
  if (del) {
    if (state.caixinhas.some(c => c.pessoaId === del)) return alert("Exclua ou mude as caixinhas dessa pessoa antes.");
    if (confirm("Excluir esta pessoa?")) await deleteDoc(doc(col("pessoas"), del));
  }
};

// Caixinhas
let editCx = null;
$("#btn-new-cx").onclick = () => {
  if (!state.pessoas.length) return alert("Cadastre uma pessoa primeiro.");
  editCx = null; fillCxSelects(); openDialog($("#dlg-cx"), $("#form-cx"), { tipo: TIPOS_INV[0], saldoInicial: 0, meta: 0, dataInicial: hoje() });
};
function fillCxSelects() {
  $("#form-cx").elements.pessoaId.innerHTML = optsPessoas();
  $("#form-cx").elements.tipo.innerHTML = TIPOS_INV.map(t => `<option>${t}</option>`).join("");
}
onSubmit($("#dlg-cx"), $("#form-cx"), async (d) => {
  const data = { pessoaId: d.pessoaId, nome: d.nome.trim(), tipo: d.tipo, saldoInicial: num(d.saldoInicial),
                 dataInicial: d.dataInicial || "", meta: num(d.meta), prazo: d.prazo || "" };
  if (editCx) await setDoc(doc(col("caixinhas"), editCx), data, { merge: true }); else await addDoc(col("caixinhas"), data);
});
$("#tb-cx").onclick = async (e) => {
  const id = e.target.dataset.edit, del = e.target.dataset.del;
  if (id) { editCx = id; fillCxSelects(); openDialog($("#dlg-cx"), $("#form-cx"), state.caixinhas.find(c => c.id === id)); }
  if (del) {
    const n = state.lancamentos.filter(l => l.caixinhaId === del).length;
    if (!confirm(`Excluir esta caixinha${n ? ` e seus ${n} lançamento(s)` : ""}?`)) return;
    const b = writeBatch(db);
    state.lancamentos.filter(l => l.caixinhaId === del).forEach(l => b.delete(doc(col("lancamentos"), l.id)));
    b.delete(doc(col("caixinhas"), del));
    await b.commit();
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
  const data = { data: d.data, caixinhaId: d.caixinhaId, tipo: d.tipo, valor: num(d.valor), obs: (d.obs || "").trim() };
  if (!data.caixinhaId) return alert("Escolha uma caixinha.");
  if (data.tipo !== "Rendimento" && data.valor < 0) return alert("Aporte e retirada devem ter valor positivo.");
  if (editL) await setDoc(doc(col("lancamentos"), editL), data, { merge: true }); else await addDoc(col("lancamentos"), data);
});
$("#tb-l").onclick = async (e) => {
  const id = e.target.dataset.edit, del = e.target.dataset.del;
  if (id) {
    const l = state.lancamentos.find(x => x.id === id), cx = state.caixinhas.find(c => c.id === l.caixinhaId);
    editL = id; formL.elements.pessoaId.innerHTML = optsPessoas();
    openDialog($("#dlg-l"), formL, { ...l, pessoaId: cx?.pessoaId });
    fillCxDoLanc(cx?.pessoaId, l.caixinhaId);
  }
  if (del && confirm("Excluir este lançamento?")) await deleteDoc(doc(col("lancamentos"), del));
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
