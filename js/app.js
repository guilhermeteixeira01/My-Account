(() => {
'use strict';
/* ---------- Config ---------- */
const CATS = {
  despesa: [
    ['Moradia','#7a5cc4'],['Alimentação','#d9822b'],['Transporte','#2f7fb8'],['Saúde','#d0506b'],
    ['Educação','#3a9d8f'],['Lazer','#c9a227'],['Assinaturas','#8a63d2'],['Cartão de crédito','#b8432f'],
    ['Contas de consumo','#4c8c4a'],['Impostos','#6b7280'],['Outros','#9a8f7d']
  ],
  receita: [['Salário','#2a7a4f'],['Freelance','#3f9b74'],['Investimentos','#2f7fb8'],['Outros','#9a8f7d']]
};
const catColor = (tipo, c) => (CATS[tipo].find(x => x[0] === c) || [null,'#9a8f7d'])[1];
const brl = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const fmt = v => brl.format(v || 0);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
const ymOf = d => d.getFullYear() + '-' + pad(d.getMonth()+1);
const todayStr = () => { const d = new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); };
const addMonths = (ym, n) => { let [y,m] = ym.split('-').map(Number); m += n; while(m>12){m-=12;y++} while(m<1){m+=12;y--} return y+'-'+pad(m); };
const monthDiff = (a, b) => { const [ya,ma]=a.split('-').map(Number), [yb,mb]=b.split('-').map(Number); return (yb-ya)*12 + (mb-ma); };
const daysIn = ym => { const [y,m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const monthName = (ym, opt={month:'long',year:'numeric'}) => { const [y,m]=ym.split('-').map(Number); return new Date(y,m-1,1).toLocaleDateString('pt-BR',opt); };
const shortYm = ym => monthName(ym,{month:'short'}).replace('.','') + '/' + ym.slice(0,4);
const rangeLbl = c => 'De ' + shortYm(c.data.slice(0,7)) + ' até ' + shortYm(c.fim);
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const parseMoney = s => { s = String(s).trim().replace(/[R$\s]/g,''); if (!s) return NaN; if (s.includes(',')) s = s.replace(/\./g,'').replace(',','.'); else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,''); return Number(s); };

/* ---------- State ---------- */
let contas = [];
let metas = [];
let editingMeta = null, aporteMeta = null;
let cur = ymOf(new Date());
let filt = { q:'', tipo:'all', status:'all', cat:'all' };
let sort = { key:'data', dir:1 };
let editing = null;
let formTipo = 'despesa';

/* ---------- Salvamento no navegador (localStorage) ---------- */
const LS_KEY = 'minhas-contas-v1';
function readLocal(){ try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch(e){ return null; } }
function writeLocal(){ try { localStorage.setItem(LS_KEY, JSON.stringify({ contas, metas, atualizadoEm: new Date().toISOString() })); return true; } catch(e){ return false; } }
function setSync(cls, txt){ const el = $('#sync'); el.className = 'sync ' + (cls||''); el.querySelector('span').textContent = txt; }
function applyData(d){
  contas = Array.isArray(d && d.contas) ? d.contas.map(c => ({...c, pagos:{...(c.pagos||{})}})) : [];
  metas = Array.isArray(d && d.metas) ? d.metas.map(m => ({...m})) : [];
}
function save(){
  const ok = writeLocal();
  setSync(ok ? 'ok' : 'err', ok ? 'Salvo neste navegador' : 'Não foi possível salvar (navegador bloqueou o armazenamento)');
}

/* ---------- Domain ---------- */
function occurrences(ym){
  const out = [];
  for (const c of contas){
    let date = null, parcLbl = null;
    if (c.freq === 'unica'){ if (c.data && c.data.slice(0,7) === ym) date = c.data; }
    else {
      const inicio = c.data.slice(0,7);
      const idx = monthDiff(inicio, ym);
      if (idx < 0) continue;
      if (c.fim && monthDiff(c.fim, ym) > 0) continue;
      if (c.freq === 'parcelada'){ if (idx >= c.parcelas) continue; parcLbl = (idx+1)+'/'+c.parcelas; }
      const day = Math.min(Number(c.data.slice(8,10)), daysIn(ym));
      date = ym + '-' + pad(day);
    }
    if (!date) continue;
    const pago = !!(c.pagos && c.pagos[ym]);
    out.push({ c, id:c.id, tipo:c.tipo, desc:c.desc, cat:c.cat, valor:Number(c.valor)||0, data:date, pago, parcLbl, status: statusOf(date, pago) });
  }
  return out;
}
function statusOf(date, pago){
  if (pago) return 'pago';
  const t = todayStr();
  if (date < t) return 'atrasada';
  const diff = (new Date(date+'T00:00') - new Date(t+'T00:00')) / 864e5;
  return diff <= 3 ? 'breve' : 'pendente';
}
function statusLabel(o){
  const rec = o.tipo === 'receita';
  if (o.status === 'pago') return rec ? 'Recebido' : 'Pago';
  if (o.status === 'atrasada') return rec ? 'Não recebido' : 'Atrasada';
  if (o.status === 'breve'){ const t = todayStr(); return o.data === t ? 'Vence hoje' : 'Vence em breve'; }
  return rec ? 'A receber' : 'A pagar';
}
function totals(list){
  const t = {rec:0, recOk:0, desp:0, pago:0, atr:0, atrN:0, aberto:0};
  for (const o of list){
    if (o.tipo === 'receita'){ t.rec += o.valor; if (o.pago) t.recOk += o.valor; }
    else { t.desp += o.valor; if (o.pago) t.pago += o.valor; else { t.aberto += o.valor; if (o.status === 'atrasada'){ t.atr += o.valor; t.atrN++; } } }
  }
  return t;
}

/* ---------- Render ---------- */
function render(){
  const ml = monthName(cur); $('#monthLabel').textContent = ml.charAt(0).toUpperCase()+ml.slice(1);
  const all = occurrences(cur);
  renderKpis(all);
  renderMetas();
  renderCatFilter();
  renderTable(all);
  renderCats(all);
  renderUpcoming();
  renderTrend();
}

function renderKpis(all){
  const t = totals(all);
  const saldo = t.rec - t.desp;
  const pct = t.desp ? Math.round(t.pago / t.desp * 100) : 0;
  $('#kpis').innerHTML = `
    <div class="kpi"><div class="lbl"><i class="dot" style="background:var(--green)"></i>Receitas</div><div class="val num">${fmt(t.rec)}</div><div class="sub">${fmt(t.recOk)} já recebido</div></div>
    <div class="kpi"><div class="lbl"><i class="dot" style="background:var(--red)"></i>Despesas</div><div class="val num">${fmt(t.desp)}</div><div class="sub">${all.filter(o=>o.tipo==='despesa').length} contas no mês</div></div>
    <div class="kpi"><div class="lbl">Pago</div><div class="val num">${fmt(t.pago)}</div><div class="progress"><span style="width:${pct}%"></span></div><div class="sub">${pct}% das despesas quitadas</div></div>
    <div class="kpi"><div class="lbl">A pagar</div><div class="val num">${fmt(t.aberto)}</div><div class="sub" style="${t.atrN?'color:var(--red);font-weight:600':''}">${t.atrN ? `${t.atrN} atrasada${t.atrN>1?'s':''} · ${fmt(t.atr)}` : 'Nenhuma conta atrasada'}</div></div>
    <div class="kpi saldo ${saldo<0?'neg':''}"><div class="lbl">Saldo previsto</div><div class="val num">${fmt(saldo)}</div><div class="sub">Receitas − despesas do mês</div></div>`;
}

function renderCatFilter(){
  const sel = $('#fCat'); const v = filt.cat;
  const names = [...new Set([...CATS.despesa, ...CATS.receita].map(x=>x[0]))];
  sel.innerHTML = '<option value="all">Todas categorias</option>' + names.map(n => `<option ${n===v?'selected':''}>${esc(n)}</option>`).join('');
}

function applyFilters(all){
  const q = filt.q.trim().toLowerCase();
  let list = all.filter(o =>
    (filt.tipo === 'all' || o.tipo === filt.tipo) &&
    (filt.cat === 'all' || o.cat === filt.cat) &&
    (filt.status === 'all' || (filt.status === 'pago' ? o.pago : filt.status === 'atrasada' ? o.status === 'atrasada' : !o.pago)) &&
    (!q || o.desc.toLowerCase().includes(q) || (o.cat||'').toLowerCase().includes(q) || (o.c.obs||'').toLowerCase().includes(q))
  );
  const k = sort.key, d = sort.dir;
  const order = {atrasada:0, breve:1, pendente:2, pago:3};
  list.sort((a,b) => {
    let x, y;
    if (k === 'valor'){ x = a.valor; y = b.valor; }
    else if (k === 'status'){ x = order[a.status]; y = order[b.status]; }
    else if (k === 'desc'){ return a.desc.localeCompare(b.desc,'pt-BR') * d; }
    else if (k === 'cat'){ return (a.cat||'').localeCompare(b.cat||'','pt-BR') * d; }
    else { x = a.data; y = b.data; }
    return (x < y ? -1 : x > y ? 1 : 0) * d;
  });
  return list;
}

function th(key, label, cls=''){
  const active = sort.key === key;
  const arr = active ? (sort.dir === 1 ? '↑' : '↓') : '↕';
  return `<th class="sort ${cls} ${active?'active':''}" data-sort="${key}">${label}<span class="arr">${arr}</span></th>`;
}

function renderTable(all){
  const list = applyFilters(all);
  $('#countLbl').textContent = `${list.length} de ${all.length} lançamento${all.length!==1?'s':''}`;
  const wrap = $('#tblWrap');
  if (!all.length){
    wrap.innerHTML = `<div class="empty"><b>Nenhuma conta em ${esc(monthName(cur,{month:'long'}))}</b>Clique em <strong>Nova conta</strong> para adicionar aluguel, luz, salário…</div>`;
    return;
  }
  if (!list.length){ wrap.innerHTML = `<div class="empty"><b>Nada encontrado</b>Ajuste a busca ou os filtros.</div>`; return; }
  const sum = list.reduce((s,o) => s + (o.tipo==='receita' ? o.valor : -o.valor), 0);
  wrap.innerHTML = `<table>
    <thead><tr><th style="width:44px"></th>${th('desc','Descrição')}${th('cat','Categoria')}${th('data','Vencimento')}${th('valor','Valor','r')}${th('status','Status')}<th></th></tr></thead>
    <tbody>${list.map(o => {
      const [y,m,d] = o.data.split('-');
      const freqTag = o.c.freq === 'mensal'
        ? (o.c.fim ? `<span class="tag" title="${esc(rangeLbl(o.c))}">↻ ${monthDiff(o.c.data.slice(0,7), cur)+1}/${monthDiff(o.c.data.slice(0,7), o.c.fim)+1} · até ${shortYm(o.c.fim)}</span>` : '<span class="tag">↻ Mensal</span>')
        : o.parcLbl ? `<span class="tag">Parcela ${o.parcLbl}</span>` : '';
      return `<tr class="${o.pago?'paid':''}" data-id="${o.id}">
        <td class="c-chk"><button class="chk ${o.pago?'on':''}" data-act="toggle" aria-label="Marcar como ${o.pago?'não pago':'pago'}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M5 12l5 5L20 7"/></svg></button></td>
        <td class="c-desc"><div class="desc-t">${esc(o.desc)}</div><div class="desc-s">${freqTag}${o.c.obs?`<span title="${esc(o.c.obs)}">${esc(o.c.obs.length>40?o.c.obs.slice(0,40)+'…':o.c.obs)}</span>`:''}</div></td>
        <td class="c-cat"><span class="cat"><i class="dot" style="background:${catColor(o.tipo,o.cat)}"></i>${esc(o.cat)}</span></td>
        <td class="c-date num">${d}/${m}/${y}</td>
        <td class="c-val r"><span class="amt num ${o.tipo==='receita'?'rec':''}">${o.tipo==='receita'?'+':'−'} ${fmt(o.valor)}</span></td>
        <td class="c-st"><button class="pill ${o.status}" data-act="toggle" title="Clique para alternar">${statusLabel(o)}</button></td>
        <td class="c-act"><div class="row-act">
          <button class="icon-btn" data-act="edit" aria-label="Editar" title="Editar"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
          <button class="icon-btn" data-act="dup" aria-label="Duplicar" title="Duplicar"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button>
          <button class="icon-btn del" data-act="del" aria-label="Excluir" title="Excluir"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>
        </div></td></tr>`;
    }).join('')}</tbody>
    <tfoot><tr><td colspan="4">Resultado (filtro atual)</td><td class="r num" style="color:${sum<0?'var(--red)':'var(--green)'}">${fmt(sum)}</td><td colspan="2"></td></tr></tfoot>
  </table>`;
}

function renderCats(all){
  const desp = all.filter(o => o.tipo === 'despesa');
  const total = desp.reduce((s,o)=>s+o.valor,0);
  const el = $('#cats');
  if (!total){ el.innerHTML = '<p class="muted" style="margin:0">Sem despesas neste mês.</p>'; return; }
  const by = {};
  desp.forEach(o => by[o.cat] = (by[o.cat]||0) + o.valor);
  el.innerHTML = Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([c,v]) => {
    const p = v/total*100;
    return `<div class="catbar"><div class="top"><span class="cat"><i class="dot" style="background:${catColor('despesa',c)}"></i>${esc(c)}</span><span><span class="num">${fmt(v)}</span><span class="pct">${p.toFixed(0)}%</span></span></div><div class="bar"><span style="width:${p}%;background:${catColor('despesa',c)}"></span></div></div>`;
  }).join('');
}

function renderUpcoming(){
  const t = todayStr(), thisYm = ymOf(new Date());
  const items = [...occurrences(addMonths(thisYm,-1)), ...occurrences(thisYm), ...occurrences(addMonths(thisYm,1))]
    .filter(o => o.tipo === 'despesa' && !o.pago)
    .filter(o => { const diff = (new Date(o.data+'T00:00') - new Date(t+'T00:00'))/864e5; return diff <= 15; })
    .sort((a,b) => a.data < b.data ? -1 : 1).slice(0,6);
  const el = $('#upcoming');
  if (!items.length){ el.innerHTML = '<p class="muted" style="margin:0">Tudo em dia nos próximos 15 dias. 🎉</p>'; return; }
  el.innerHTML = items.map(o => {
    const late = o.data < t;
    const [y,m,d] = o.data.split('-');
    const mes = new Date(+y, +m-1, 1).toLocaleDateString('pt-BR',{month:'short'}).replace('.','');
    return `<div class="up-item"><div class="up-date ${late?'late':''}"><b class="num">${d}</b><small>${mes}</small></div>
      <div class="up-info"><div>${esc(o.desc)}</div><small>${late?'<span style="color:var(--red);font-weight:600">Atrasada</span> · ':''}${esc(o.cat)}</small></div>
      <span class="amt num">${fmt(o.valor)}</span></div>`;
  }).join('');
}

function renderTrend(){
  const months = []; for (let i=5;i>=0;i--) months.push(addMonths(cur,-i));
  const data = months.map(m => { const t = totals(occurrences(m)); return {m, r:t.rec, d:t.desp}; });
  const max = Math.max(1, ...data.map(x => Math.max(x.r, x.d)));
  $('#trend').innerHTML = data.map(x => `<div class="col ${x.m===cur?'cur':''}" title="${esc(monthName(x.m))}\nReceitas: ${fmt(x.r)}\nDespesas: ${fmt(x.d)}">
    <div class="bars"><div class="b" style="height:${x.r/max*100}%;background:var(--green)"></div><div class="b" style="height:${x.d/max*100}%;background:var(--red)"></div></div>
    <small>${monthName(x.m,{month:'short'}).replace('.','')}</small></div>`).join('');
}

/* ---------- Metas ---------- */
const META_INFO = {
  economia: {ic:'💰', kind:'Economia no ano', hint:'Progresso = receitas recebidas − despesas pagas no ano. Atualiza sozinho conforme você marca as contas.', alvo:'Quanto quer economizar (R$)'},
  limite:   {ic:'🚦', kind:'Limite de gasto', hint:'Soma todas as despesas da categoria escolhida no ano e avisa quando estiver perto do limite.', alvo:'Gasto máximo no ano (R$)'},
  objetivo: {ic:'🎯', kind:'Objetivo', hint:'Para viagem, reserva, compra… Você registra quanto foi guardando com o botão "Guardar".', alvo:'Quanto quer juntar (R$)'}
};
function yearOcc(ano){ const out = []; for (let m = 1; m <= 12; m++) out.push(...occurrences(ano + '-' + pad(m))); return out; }
function yearFraction(ano){
  const now = new Date(), y = now.getFullYear();
  if (+ano < y) return 1; if (+ano > y) return 0;
  const start = new Date(y,0,1), end = new Date(y+1,0,1);
  return (now - start) / (end - start);
}
function metaCalc(m){
  const occ = yearOcc(m.ano);
  const frac = yearFraction(m.ano);
  if (m.tipo === 'economia'){
    let real = 0, prev = 0;
    occ.forEach(o => { const s = o.tipo === 'receita' ? 1 : -1; prev += s*o.valor; if (o.pago) real += s*o.valor; });
    const pct = m.alvo ? real / m.alvo : 0;
    let badge;
    if (real >= m.alvo) badge = ['ok','Concluída 🎉'];
    else if (frac === 0) badge = ['info','Ainda não começou'];
    else if (prev >= m.alvo) badge = real >= m.alvo*frac ? ['ok','No ritmo'] : ['info','Previsão: atinge'];
    else badge = ['warn','Previsão abaixo'];
    return { val:real, pct, frac, badge, line1:`${fmt(real)}`, line2:`de ${fmt(m.alvo)}`, foot:`Previsão até dez: <b class="num" style="color:${prev>=m.alvo?'var(--green)':'var(--amber)'}">${fmt(prev)}</b>`, color: real>=m.alvo ? 'var(--green)' : 'var(--brand-2)' };
  }
  if (m.tipo === 'limite'){
    const gasto = occ.filter(o => o.tipo === 'despesa' && o.cat === m.cat).reduce((s,o) => s+o.valor, 0);
    const pct = m.alvo ? gasto / m.alvo : 0;
    const badge = pct > 1 ? ['bad','Estourou'] : pct >= .85 ? ['warn','Perto do limite'] : ['ok','Dentro do limite'];
    const color = pct > 1 ? 'var(--red)' : pct >= .85 ? 'var(--amber)' : 'var(--green)';
    const resta = m.alvo - gasto;
    return { val:gasto, pct, frac, badge, line1:fmt(gasto), line2:`de ${fmt(m.alvo)}`, foot: resta >= 0 ? `Resta <b class="num">${fmt(resta)}</b> · ${esc(m.cat)}` : `<span style="color:var(--red)">Passou <b class="num">${fmt(-resta)}</b></span> · ${esc(m.cat)}`, color };
  }
  // objetivo
  const g = Number(m.guardado) || 0;
  const pct = m.alvo ? g / m.alvo : 0;
  const now = new Date();
  const mesesRest = +m.ano === now.getFullYear() ? 12 - now.getMonth() : +m.ano > now.getFullYear() ? 12 : 0;
  const falta = Math.max(0, m.alvo - g);
  const badge = g >= m.alvo ? ['ok','Concluída 🎉'] : frac === 0 ? ['info','Ainda não começou'] : g >= m.alvo*frac ? ['ok','No ritmo'] : ['warn','Abaixo do ritmo'];
  const foot = falta === 0 ? 'Meta atingida!' : mesesRest > 0 ? `Guarde <b class="num">${fmt(falta/mesesRest)}</b>/mês até dez` : `Faltaram <b class="num">${fmt(falta)}</b>`;
  return { val:g, pct, frac, badge, line1:fmt(g), line2:`de ${fmt(m.alvo)}`, foot, color: g>=m.alvo ? 'var(--green)' : 'var(--blue)' };
}
function renderMetas(){
  const ano = cur.slice(0,4);
  $('#metasTitle').textContent = 'Metas de ' + ano;
  const list = metas.filter(m => String(m.ano) === ano);
  const body = $('#metasBody');
  if (!list.length){
    body.innerHTML = `<div class="metas-empty"><span>Nenhuma meta para ${ano}. Defina quanto quer economizar, um limite de gastos ou um objetivo (viagem, reserva…).</span><button class="btn sm primary" data-mact="new">Criar primeira meta</button></div>`;
    return;
  }
  body.innerHTML = '<div class="metas-grid">' + list.map(m => {
    const k = metaCalc(m), info = META_INFO[m.tipo];
    const w = Math.max(0, Math.min(100, k.pct*100));
    const showPace = m.tipo !== 'limite' && k.frac > 0 && k.frac < 1;
    return `<div class="meta" data-mid="${m.id}">
      <div class="meta-top">
        <div style="display:flex;gap:10px;align-items:flex-start;min-width:0"><div class="meta-ic ${m.tipo}">${info.ic}</div>
          <div style="min-width:0"><div class="meta-name">${esc(m.nome)}</div><div class="meta-kind">${info.kind}</div></div></div>
        <div class="row-act">
          ${m.tipo==='objetivo'?`<button class="icon-btn" data-mact="aporte" title="Guardar dinheiro" aria-label="Guardar dinheiro"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg></button>`:''}
          <button class="icon-btn" data-mact="edit" title="Editar" aria-label="Editar meta"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
          <button class="icon-btn del" data-mact="del" title="Excluir" aria-label="Excluir meta"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>
        </div>
      </div>
      <div class="meta-nums"><b class="num">${k.line1}</b><span>${k.line2} · ${Math.round(k.pct*100)}%</span></div>
      <div class="mbar" title="${showPace?'Marca = onde você deveria estar hoje':''}"><span style="width:${w}%;background:${k.color}"></span>${showPace?`<i style="left:${k.frac*100}%"></i>`:''}</div>
      <div class="meta-foot"><span>${k.foot}</span><span class="badge ${k.badge[0]}">${k.badge[1]}</span></div>
    </div>`;
  }).join('') + '</div>';
}
function openMeta(m=null){
  editingMeta = m ? m.id : null;
  $('#metaTitle').textContent = m ? 'Editar meta' : 'Nova meta';
  const y0 = new Date().getFullYear(), ys = new Set([y0-1, y0, y0+1, y0+2, +cur.slice(0,4)]); if (m) ys.add(+m.ano);
  $('#mAno').innerHTML = [...ys].sort().map(y => `<option>${y}</option>`).join('');
  $('#mAno').value = m ? String(m.ano) : cur.slice(0,4);
  $('#mCat').innerHTML = CATS.despesa.map(x => `<option>${esc(x[0])}</option>`).join('');
  $('#mTipo').value = m ? m.tipo : 'economia';
  $('#mNome').value = m ? m.nome : '';
  $('#mAlvo').value = m ? m.alvo.toFixed(2).replace('.',',') : '';
  $('#mCat').value = m && m.cat ? m.cat : 'Lazer';
  $('#mGuard').value = m && m.guardado ? Number(m.guardado).toFixed(2).replace('.',',') : '';
  $('#metaErr').style.display = 'none';
  updMetaForm();
  $('#ovMeta').classList.add('open');
  setTimeout(() => $('#mNome').focus(), 50);
}
function updMetaForm(){
  const t = $('#mTipo').value, info = META_INFO[t];
  $('#mTipoHint').textContent = info.hint;
  $('#mAlvoLbl').textContent = info.alvo;
  $('#mCatBox').style.display = t === 'limite' ? '' : 'none';
  $('#mGuardBox').style.display = t === 'objetivo' ? '' : 'none';
  $('#mNome').placeholder = t === 'economia' ? 'Ex.: Economizar no ano' : t === 'limite' ? 'Ex.: Gastar menos com delivery' : 'Ex.: Viagem de férias';
}
function submitMeta(e){
  e.preventDefault();
  const err = msg => { const el=$('#metaErr'); el.textContent=msg; el.style.display='block'; };
  const tipo = $('#mTipo').value, alvo = parseMoney($('#mAlvo').value);
  let nome = $('#mNome').value.trim();
  if (!(alvo > 0)) return err('Informe o valor da meta (ex.: 10.000,00).');
  if (!nome) nome = tipo === 'limite' ? 'Limite: ' + $('#mCat').value : tipo === 'economia' ? 'Economizar no ano' : 'Meu objetivo';
  const g = $('#mGuard').value.trim() ? parseMoney($('#mGuard').value) : 0;
  if (tipo === 'objetivo' && isNaN(g)) return err('Valor "Já guardado" inválido.');
  const data = { tipo, nome, alvo:Math.round(alvo*100)/100, ano:$('#mAno').value };
  if (tipo === 'limite') data.cat = $('#mCat').value;
  if (tipo === 'objetivo') data.guardado = Math.round(g*100)/100;
  if (editingMeta){ const m = metas.find(x => x.id === editingMeta); Object.keys(m).forEach(k => { if (k !== 'id') delete m[k]; }); Object.assign(m, data); toast('Meta atualizada'); }
  else { metas.push({ id:uid(), ...data }); toast('Meta criada'); }
  if (data.ano !== cur.slice(0,4)) cur = data.ano + '-' + cur.slice(5,7);
  closeAll(); save(); render();
}
function submitAporte(e){
  e.preventDefault();
  const v = parseMoney($('#aVal').value);
  if (!v || isNaN(v)){ const el=$('#aporteErr'); el.textContent='Informe um valor.'; el.style.display='block'; return; }
  const m = metas.find(x => x.id === aporteMeta); if (!m) return closeAll();
  m.guardado = Math.round(((Number(m.guardado)||0) + v)*100)/100;
  closeAll(); save(); render();
  toast(v > 0 ? `${fmt(v)} guardado em "${m.nome}"` : `Retirada de ${fmt(-v)} registrada`);
}

/* ---------- Actions ---------- */
function toast(msg, ms=2200){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('show'),ms); }
const find = id => contas.find(c => c.id === id);

function togglePaid(id){
  const c = find(id); if (!c) return;
  c.pagos = c.pagos || {};
  if (c.pagos[cur]) delete c.pagos[cur]; else c.pagos[cur] = true;
  save(); render();
}

function openForm(c=null, dup=false){
  editing = (c && !dup) ? c.id : null;
  $('#formTitle').textContent = editing ? 'Editar conta' : dup ? 'Duplicar conta' : 'Nova conta';
  setTipo(c ? c.tipo : 'despesa');
  $('#fDesc').value = c ? c.desc + (dup ? ' (cópia)' : '') : '';
  $('#fVal').value = c ? String(c.valor.toFixed(2)).replace('.',',') : '';
  $('#fCatSel').value = c ? c.cat : CATS[formTipo][0][0];
  $('#fFreq').value = c ? c.freq : 'unica';
  const defDate = cur === ymOf(new Date()) ? todayStr() : cur + '-10';
  $('#fData').value = c ? c.data : defDate;
  $('#fParc').value = c && c.parcelas ? c.parcelas : 12;
  $('#fObs').value = c ? (c.obs||'') : '';
  fillFim(c && c.freq === 'mensal' ? c.fim : null);
  $('#formErr').style.display = 'none';
  updFreq();
  $('#ovForm').classList.add('open');
  setTimeout(() => $('#fDesc').focus(), 50);
}
function setTipo(t){
  formTipo = t;
  document.querySelectorAll('#typeSw button').forEach(b => b.classList.toggle('on', b.dataset.v === t));
  const prev = $('#fCatSel').value;
  $('#fCatSel').innerHTML = CATS[t].map(x => `<option>${esc(x[0])}</option>`).join('');
  if (CATS[t].some(x=>x[0]===prev)) $('#fCatSel').value = prev;
}
function fillFim(fim){
  const y0 = new Date().getFullYear();
  const startY = Math.min(y0 - 1, fim ? +fim.slice(0,4) : y0);
  const years = []; for (let y = startY; y <= y0 + 10; y++) years.push(y);
  $('#fFimMes').innerHTML = '<option value="">Sem data de fim</option>' + MESES.map((m,i) => `<option value="${pad(i+1)}">${m}</option>`).join('');
  $('#fFimAno').innerHTML = years.map(y => `<option>${y}</option>`).join('');
  $('#fFimMes').value = fim ? fim.slice(5,7) : '';
  $('#fFimAno').value = fim ? fim.slice(0,4) : String(y0);
}
function getFim(){ const m = $('#fFimMes').value; return m ? $('#fFimAno').value + '-' + m : null; }
function updFreq(){
  const f = $('#fFreq').value;
  $('#parcBox').style.display = f === 'parcelada' ? '' : 'none';
  $('#fimBox').style.display = f === 'mensal' ? '' : 'none';
  $('#fFimAno').disabled = !$('#fFimMes').value;
  if (f === 'mensal'){
    const d = $('#fData').value, fim = getFim(), v = parseMoney($('#fVal').value);
    if (!fim) $('#fimHint').textContent = 'Repete todo mês, sem prazo para acabar.';
    else if (d && fim < d.slice(0,7)) $('#fimHint').textContent = '⚠ O mês final é antes do primeiro vencimento.';
    else if (d){ const n = monthDiff(d.slice(0,7), fim) + 1; $('#fimHint').textContent = `De ${shortYm(d.slice(0,7))} até ${shortYm(fim)} · ${n} ${n>1?'meses':'mês'}` + (v>0 ? ` · total ${fmt(v*n)}` : ''); }
  }
  $('#fDataLbl').textContent = f === 'unica' ? (formTipo==='receita'?'Data':'Vencimento') : f === 'mensal' ? 'Começa em (1º vencimento)' : '1ª parcela';
  if (f === 'parcelada'){
    const v = parseMoney($('#fVal').value), n = Number($('#fParc').value);
    const d = $('#fData').value;
    $('#parcHint').textContent = (v>0 && n>1 && d) ? `${n}× de ${fmt(v)} = ${fmt(v*n)} · última em ${monthName(addMonths(d.slice(0,7), n-1))}` : 'Informe o valor de cada parcela.';
  }
}
function closeAll(){ document.querySelectorAll('.overlay').forEach(o => o.classList.remove('open')); }

function submitForm(e){
  e.preventDefault();
  const desc = $('#fDesc').value.trim();
  const valor = parseMoney($('#fVal').value);
  const data = $('#fData').value;
  const freq = $('#fFreq').value;
  const parcelas = Math.round(Number($('#fParc').value));
  const err = m => { const el=$('#formErr'); el.textContent=m; el.style.display='block'; };
  if (!desc) return err('Informe uma descrição.');
  if (!(valor > 0)) return err('Informe um valor válido (ex.: 150,90).');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return err('Informe a data.');
  if (freq === 'parcelada' && !(parcelas >= 2 && parcelas <= 120)) return err('Parcelas: entre 2 e 120.');
  const fim = freq === 'mensal' ? getFim() : null;
  if (fim && fim < data.slice(0,7)) return err('O mês final precisa ser igual ou depois do primeiro vencimento.');
  const base = { tipo:formTipo, desc, valor:Math.round(valor*100)/100, cat:$('#fCatSel').value, freq, data, obs:$('#fObs').value.trim() };
  if (freq === 'parcelada') base.parcelas = parcelas;
  if (fim) base.fim = fim;
  if (editing){
    const c = find(editing);
    Object.assign(c, base);
    if (freq !== 'parcelada') delete c.parcelas;
    if (!fim) delete c.fim;
    toast('Conta atualizada');
  } else {
    contas.push({ id:uid(), ...base, pagos:{} });
    toast(freq === 'unica' ? 'Conta adicionada' : freq === 'mensal' ? (fim ? `Conta fixa lançada de ${shortYm(data.slice(0,7))} a ${shortYm(fim)}` : 'Conta fixa adicionada a todos os meses') : `${parcelas} parcelas lançadas`);
    const ym = data.slice(0,7); if (ym !== cur && freq === 'unica') cur = ym;
  }
  closeAll(); save(); render();
}

function confirmBox(title, text, buttons){
  $('#cTitle').textContent = title; $('#cText').textContent = text;
  const box = $('#cBtns'); box.innerHTML = '';
  const cancel = document.createElement('button'); cancel.className='btn ghost'; cancel.textContent='Cancelar'; cancel.onclick=closeAll; box.appendChild(cancel);
  buttons.forEach(b => { const el=document.createElement('button'); el.className='btn '+(b.cls||''); el.textContent=b.label; el.onclick=()=>{ closeAll(); b.fn(); }; box.appendChild(el); });
  $('#ovConfirm').classList.add('open');
}

function delConta(id){
  const c = find(id); if (!c) return;
  const removeAll = () => { contas = contas.filter(x => x.id !== id); save(); render(); toast('Conta excluída'); };
  if (c.freq === 'unica' || c.data.slice(0,7) >= cur){
    confirmBox('Excluir conta', `Excluir "${c.desc}"${c.freq!=='unica'?' e todas as suas ocorrências':''}?`, [{label:'Excluir', cls:'danger', fn:removeAll}]);
  } else {
    confirmBox('Excluir conta recorrente', `"${c.desc}" se repete em vários meses. O que você quer fazer?`, [
      {label:'Encerrar a partir deste mês', cls:'', fn:() => { c.fim = addMonths(cur,-1); save(); render(); toast('Recorrência encerrada'); }},
      {label:'Excluir todos os meses', cls:'danger', fn:removeAll}
    ]);
  }
}

function copyCsv(){
  const list = applyFilters(occurrences(cur));
  const q = s => '"' + String(s??'').replace(/"/g,'""') + '"';
  const rows = [['Tipo','Descrição','Categoria','Vencimento','Valor','Status','Frequência','Observação'].join(';')];
  list.forEach(o => { const [y,m,d]=o.data.split('-'); rows.push([o.tipo==='receita'?'Receita':'Despesa', q(o.desc), q(o.cat), `${d}/${m}/${y}`, o.valor.toFixed(2).replace('.',','), statusLabel(o), o.parcLbl?('Parcela '+o.parcLbl):o.c.freq==='mensal'?'Mensal':'Única', q(o.c.obs)].join(';')); });
  downloadFile('\ufeff' + rows.join('\r\n'), `contas-${cur}.csv`, 'text/csv;charset=utf-8');
  toast('Planilha do mês baixada');
}
function downloadFile(text, name, type){
  const url = URL.createObjectURL(new Blob([text], {type}));
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Events ---------- */
$('#prevM').onclick = () => { cur = addMonths(cur,-1); render(); };
$('#nextM').onclick = () => { cur = addMonths(cur,1); render(); };
$('#todayM').onclick = () => { cur = ymOf(new Date()); render(); };
$('#addBtn').onclick = () => openForm();
$('#csvBtn').onclick = copyCsv;
$('#addMeta').onclick = () => openMeta();
$('#mTipo').onchange = updMetaForm;
$('#formMeta').addEventListener('submit', submitMeta);
$('#formAporte').addEventListener('submit', submitAporte);
$('#metasBody').addEventListener('click', e => {
  const b = e.target.closest('[data-mact]'); if (!b) return;
  const act = b.dataset.mact; if (act === 'new') return openMeta();
  const id = b.closest('[data-mid]').dataset.mid, m = metas.find(x => x.id === id); if (!m) return;
  if (act === 'edit') openMeta(m);
  else if (act === 'aporte'){ aporteMeta = id; $('#aporteTitle').textContent = 'Guardar em "' + m.nome + '"'; $('#aVal').value=''; $('#aporteErr').style.display='none'; $('#ovAporte').classList.add('open'); setTimeout(()=>$('#aVal').focus(),50); }
  else if (act === 'del') confirmBox('Excluir meta', `Excluir a meta "${m.nome}"?`, [{label:'Excluir', cls:'danger', fn:() => { metas = metas.filter(x => x.id !== id); save(); render(); toast('Meta excluída'); }}]);
});
$('#q').oninput = e => { filt.q = e.target.value; renderTable(occurrences(cur)); };
$('#fCat').onchange = e => { filt.cat = e.target.value; renderTable(occurrences(cur)); };
[['#fTipo','tipo'],['#fStatus','status']].forEach(([sel,key]) => {
  $(sel).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
    $(sel).querySelectorAll('button').forEach(x => x.classList.toggle('on', x===b)); filt[key] = b.dataset.v; renderTable(occurrences(cur)); });
});
$('#tblWrap').addEventListener('click', e => {
  const h = e.target.closest('th[data-sort]');
  if (h){ const k = h.dataset.sort; sort = { key:k, dir: sort.key===k ? -sort.dir : 1 }; renderTable(occurrences(cur)); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.closest('tr').dataset.id, act = b.dataset.act;
  if (act === 'toggle') togglePaid(id);
  else if (act === 'edit') openForm(find(id));
  else if (act === 'dup') openForm(find(id), true);
  else if (act === 'del') delConta(id);
});
$('#typeSw').addEventListener('click', e => { const b = e.target.closest('button'); if (b){ setTipo(b.dataset.v); updFreq(); } });
['#fFreq','#fParc','#fVal','#fData','#fFimMes','#fFimAno'].forEach(s => { $(s).addEventListener('input', updFreq); $(s).addEventListener('change', updFreq); });
$('#form').addEventListener('submit', submitForm);
document.querySelectorAll('[data-close]').forEach(b => b.onclick = closeAll);
document.querySelectorAll('.overlay').forEach(o => o.addEventListener('mousedown', e => { if (e.target === o) closeAll(); }));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAll();
  if ($('#app').hidden) return;
  if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.querySelector('.overlay.open')){ e.preventDefault(); openForm(); }
});

/* ---------- Menu: backup ---------- */
function toggleMenu(open){
  const m = $('#userMenu'); const v = open ?? m.hidden;
  m.hidden = !v; $('#userBtn').setAttribute('aria-expanded', String(v));
}
$('#userBtn').addEventListener('click', e => { e.stopPropagation(); toggleMenu(); });
document.addEventListener('click', e => { if (!e.target.closest('#userBox')) toggleMenu(false); });
$('#userMenu').addEventListener('click', e => {
  const b = e.target.closest('[data-menu]'); if (!b) return;
  toggleMenu(false);
  const act = b.dataset.menu;
  if (act === 'export'){
    const data = { app:'minhas-contas', versao:1, exportadoEm:new Date().toISOString(), contas, metas };
    downloadFile(JSON.stringify(data, null, 2), `minhas-contas-backup-${todayStr()}.json`, 'application/json');
    toast('Backup baixado — guarde esse arquivo em local seguro');
  }
  else if (act === 'import') $('#importFile').click();
  else if (act === 'csv') copyCsv();
  else if (act === 'clear') confirmBox('Apagar todos os dados', 'Isso apaga todas as contas e metas deste navegador. Recomendo baixar um backup antes. Essa ação não pode ser desfeita.', [
    {label:'Apagar tudo', cls:'danger', fn:() => { contas = []; metas = []; save(); render(); toast('Dados apagados'); }}
  ]);
});
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  let d;
  try { d = JSON.parse(await f.text()); } catch { return toast('Arquivo inválido — escolha um backup .json'); }
  const ok = d && Array.isArray(d.contas) && d.contas.every(c => c && typeof c.id === 'string' && typeof c.data === 'string' && typeof c.desc === 'string');
  if (!ok) return toast('Esse arquivo não parece um backup do Minhas Contas');
  const nm = Array.isArray(d.metas) ? d.metas.length : 0;
  confirmBox('Restaurar backup', `O backup tem ${d.contas.length} conta(s) e ${nm} meta(s). Os dados atuais serão substituídos por ele.`, [
    {label:'Substituir dados', cls:'danger', fn:() => { applyData(d); save(); render(); toast('Backup restaurado'); }}
  ]);
});

/* ---------- Início ---------- */
(function start(){
  const d = readLocal();
  applyData(d);
  let storageOk = true;
  try { localStorage.setItem('__t','1'); localStorage.removeItem('__t'); } catch(e){ storageOk = false; }
  if (!storageOk) setSync('err', 'Navegador bloqueou o armazenamento — os dados não serão salvos');
  else setSync(d ? 'ok' : '', d ? 'Salvo neste navegador' : 'Os dados ficam salvos neste navegador');
  render();
})();
})();
