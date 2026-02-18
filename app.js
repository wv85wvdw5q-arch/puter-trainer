// Puter Trainer — lokale Daten, kein Server
// V1.06 — SRS pro Lernrichtung + sofortiges Stats-Update
// Puter Trainer - V1.06, 2026-02-18 10:16

const STORAGE_KEY = "puter_trainer_v1";

function nowTs(){ return Date.now(); }
function addDays(ts, days){ return ts + days*24*60*60*1000; }


function uid(){
  return Math.random().toString(16).slice(2) + "-" + Math.random().toString(16).slice(2);
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// --- SRS pro Lernrichtung ---
// Richtung-Schlüssel entsprechen den Select-Werten: "de2rm" und "rm2de"
function defaultSrs(t){
  const now = t ?? nowTs();
  return {
    ease: 2.5,
    repetitions: 0,
    intervalDays: 0,
    due: now,          // sofort fällig
    wrongCount: 0,
    lastResult: null,
    lastReviewed: null
  };
}

// Migration: falls ein Paar noch alte SRS-Felder direkt am Objekt hat,
// werden diese als rm2de (Puter -> Deutsch) übernommen.
// Gegenrichtung de2rm wird initialisiert.
function ensurePairSrs(p){
  const t = nowTs();

  // Falls srs existiert, aber unvollständig ist → auffüllen.
  if(p.srs){
    if(!p.srs.rm2de) p.srs.rm2de = defaultSrs(t);
    if(!p.srs.de2rm) p.srs.de2rm = defaultSrs(t);
    // Mindestfelder absichern:
    if(p.srs.rm2de.due == null) p.srs.rm2de.due = t;
    if(p.srs.de2rm.due == null) p.srs.de2rm.due = t;
    return;
  }

  // Legacy-Felder?
  const hasLegacy =
    (p.ease != null) || (p.repetitions != null) || (p.intervalDays != null) ||
    (p.due != null) || (p.wrongCount != null) || (p.lastResult != null) || (p.lastReviewed != null);

  const legacy = {
    ease: (p.ease ?? 2.5),
    repetitions: (p.repetitions ?? 0),
    intervalDays: (p.intervalDays ?? 0),
    due: (p.due ?? t),
    wrongCount: (p.wrongCount ?? 0),
    lastResult: (p.lastResult ?? null),
    lastReviewed: (p.lastReviewed ?? null)
  };

  // Wichtig: vorhandene Werte gelten als rm2de (P->D)
  p.srs = {
    rm2de: hasLegacy ? legacy : defaultSrs(t),
    de2rm: defaultSrs(t)
  };

  // Alte Felder entfernen, um Verwechslungen zu vermeiden
  delete p.ease; delete p.repetitions; delete p.intervalDays; delete p.due;
  delete p.wrongCount; delete p.lastResult; delete p.lastReviewed;
}

// SM-2-ähnlich (vereinfacht) — arbeitet auf einem SRS-Objekt (pro Richtung)
function reviewUpdate(srs, correct){
  const t = nowTs();
  srs.lastReviewed = t;

  if(srs.ease == null) srs.ease = 2.5;
  if(srs.repetitions == null) srs.repetitions = 0;
  if(srs.intervalDays == null) srs.intervalDays = 0;

  if(!correct){
    srs.repetitions = 0;
    srs.ease = Math.max(1.3, srs.ease - 0.2);
    srs.intervalDays = 0.01; // ~15 min
    srs.wrongCount = (srs.wrongCount || 0) + 1;
    srs.lastResult = "wrong";
  } else {
    srs.repetitions += 1;
    srs.ease = Math.min(3.0, srs.ease + 0.05);
    if(srs.repetitions === 1) srs.intervalDays = 1;
    else if(srs.repetitions === 2) srs.intervalDays = 3;
    else srs.intervalDays = Math.round(srs.intervalDays * srs.ease);
    srs.lastResult = "right";
  }

  srs.due = addDays(t, srs.intervalDays);
}

function defaultState(){
  const listId = uid();
  return {
    lists: [
      { id: listId, name: "Romanische Grussformen", createdAt: nowTs() }
    ],
    pairs: [],
    version: 2
  };
}

let state = loadState();

function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return defaultState();
  try{
    const s = JSON.parse(raw);
    if(!s.lists) s.lists = [];
    if(!s.pairs) s.pairs = [];
    // Migration / Absicherung:
    s.pairs.forEach(ensurePairSrs);
    if(!s.version) s.version = 2;
    return s;
  }catch{
    return defaultState();
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
}

function getListById(id){ return state.lists.find(l => l.id === id); }
function pairsByListId(listId){ return state.pairs.filter(p => p.listId === listId); }

function ensureListOptions(){
  const selects = [
    document.getElementById("browseListSelect"),
    document.getElementById("addListSelect"),
    document.getElementById("trainListSelect")
  ].filter(Boolean);

  // Falls gar keine Listen existieren: eine Default-Liste anlegen
  if(state.lists.length === 0){
    const l = { id: uid(), name:"Neue Liste", createdAt: nowTs() };
    state.lists.push(l);
  }

  // Aktuelle Auswahl merken (pro Select)
  const previousValues = new Map();
  selects.forEach(sel => previousValues.set(sel.id, sel.value));

  // Dropdowns neu füllen
  selects.forEach(sel => {
    sel.innerHTML = "";
    state.lists.forEach(l => {
      const opt = document.createElement("option");
      opt.value = l.id;
      opt.textContent = l.name;
      sel.appendChild(opt);
    });

    // Auswahl wiederherstellen, falls möglich
    const prev = previousValues.get(sel.id);
    if(prev && state.lists.some(l => l.id === prev)){
      sel.value = prev;
    }
  });
}

function renderLists(){
  const c = document.getElementById("listsContainer");
  if(!c) return;
  c.innerHTML = "";

  state.lists
    .slice()
    .sort((a,b)=>a.name.localeCompare(b.name, "de", {sensitivity:"base"}))
    .forEach(l => {
      const count = pairsByListId(l.id).length;
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div>
          <div><strong>${escapeHtml(l.name)}</strong> <span class="badge">${count} Einträge</span></div>
          <div class="muted" style="font-size:12px;">ID: ${escapeHtml(l.id)}</div>
        </div>
        <div class="row">
          <button class="ghost" data-action="rename" data-id="${escapeHtml(l.id)}">Umbenennen</button>
          <button class="danger ghost" data-action="delete" data-id="${escapeHtml(l.id)}">Löschen</button>
        </div>
      `;
      c.appendChild(div);
    });

  c.querySelectorAll("button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if(action === "rename"){
        const l = getListById(id);
        const name = prompt("Neuer Listenname:", l?.name || "");
        if(name && name.trim()){
          l.name = name.trim();
          saveState();
        }
      }
      if(action === "delete"){
        const l = getListById(id);
        if(!l) return;
        if(confirm(`Liste "${l.name}" löschen? (Einträge werden auch gelöscht)`)){
          state.pairs = state.pairs.filter(p=>p.listId !== id);
          state.lists = state.lists.filter(x=>x.id !== id);
          saveState();
        }
      }
    });
  });
}

function renderBrowse(){
  ensureListOptions();
  const listSel = document.getElementById("browseListSelect");
  const sortSel = document.getElementById("browseSort");
  const qInp = document.getElementById("browseSearch");
  const c = document.getElementById("browseContainer");
  if(!listSel || !sortSel || !qInp || !c) return;

  const listId = listSel.value;
  const sort = sortSel.value;
  const q = (qInp.value || "").trim().toLowerCase();

  let items = pairsByListId(listId).slice();

  if(q){
    items = items.filter(p =>
      (p.de || "").toLowerCase().includes(q) || (p.rm || "").toLowerCase().includes(q)
    );
  }

  items.sort((a,b)=>{
    if(sort === "created") return (a.createdAt||0) - (b.createdAt||0);
    if(sort === "rm") return (a.rm||"").localeCompare(b.rm||"", "rm", {sensitivity:"base"});
    return (a.de||"").localeCompare(b.de||"", "de", {sensitivity:"base"});
  });

  c.innerHTML = "";

  items.forEach(p=>{
    ensurePairSrs(p);
    const dueStr = p.srs.rm2de.due ? new Date(p.srs.rm2de.due).toLocaleString() : "—";
    const div = document.createElement("div");
    div.className = "pair";
    div.innerHTML = `
      <div class="top">
        <div class="badge">P→D fällig: ${escapeHtml(dueStr)}</div>
        <div class="row">
          <button class="ghost" data-action="edit" data-id="${escapeHtml(p.id)}">Bearbeiten</button>
          <button class="danger" data-action="delete" data-id="${escapeHtml(p.id)}">Löschen</button>
        </div>
      </div>
      <div class="cols">
        <div><strong>DE</strong><div>${escapeHtml(p.de||"")}</div></div>
        <div><strong>PUTER</strong><div>${escapeHtml(p.rm||"")}</div></div>
      </div>
      <div class="muted" style="font-size:12px; margin-top:8px;">
        rm→de reps: ${p.srs.rm2de.repetitions||0} • ease: ${(p.srs.rm2de.ease||2.5).toFixed(2)} • interval(d): ${(p.srs.rm2de.intervalDays||0).toFixed(2)} • wrong: ${p.srs.rm2de.wrongCount||0}
      </div>
    `;
    c.appendChild(div);
  });

  c.querySelectorAll("button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const p = state.pairs.find(x=>x.id===id);
      if(!p) return;

      if(action === "delete"){
        if(confirm("Eintrag löschen?")){
          state.pairs = state.pairs.filter(x=>x.id!==id);
          saveState();
        }
      }

      if(action === "edit"){
        const de = prompt("Deutsch:", p.de || "");
        if(de == null) return;
        const rm = prompt("Puter:", p.rm || "");
        if(rm == null) return;
        p.de = de.trim();
        p.rm = rm.trim();
        saveState();
      }
    });
  });
}

function renderDataPreview(){
  const pre = document.getElementById("dataPreview");
  if(!pre) return;
  // Nur eine kurze Vorschau; nicht zu gross
  const summary = {
    version: state.version,
    lists: state.lists.length,
    pairs: state.pairs.length,
    samplePair: state.pairs[0] ? {
      id: state.pairs[0].id,
      listId: state.pairs[0].listId,
      de: state.pairs[0].de,
      rm: state.pairs[0].rm,
      srsKeys: Object.keys(state.pairs[0].srs || {})
    } : null
  };
  pre.textContent = JSON.stringify(summary, null, 2);
}

function renderAll(){
  ensureListOptions();
  renderLists();
  renderBrowse();
  // Falls wir im Lern-Tab sind, Stats sauber halten
  if(isTrainTabVisible()) updateTrainStats();
  renderDataPreview();
}

function addList(){
  const inp = document.getElementById("newListName");
  if(!inp) return;
  const name = (inp.value || "").trim();
  if(!name) return;
  state.lists.push({ id: uid(), name, createdAt: nowTs() });
  inp.value = "";
  saveState();
}

function addPair(listId, de, rm){
  const t = nowTs();
  const p = {
    id: uid(),
    listId,
    de: (de||"").trim(),
    rm: (rm||"").trim(),
    createdAt: t,
    srs: {
      rm2de: defaultSrs(t), // Puter -> Deutsch (P->D)
      de2rm: defaultSrs(t)  // Deutsch -> Puter (D->P)
    }
  };
  state.pairs.push(p);
}

function handleAddPair(){
  const listSel = document.getElementById("addListSelect");
  const deEl = document.getElementById("inputDe");
  const rmEl = document.getElementById("inputRm");
  if(!listSel || !deEl || !rmEl) return;

  const listId = listSel.value;
  const de = deEl.value;
  const rm = rmEl.value;

  if(!de.trim() || !rm.trim()){
    alert("Bitte Deutsch und Puter ausfüllen.");
    return;
  }
  addPair(listId, de, rm);
  deEl.value = "";
  rmEl.value = "";
  saveState();
}

// TRAINING
let currentCardId = null;

function isTrainTabVisible(){
  const el = document.getElementById("tab-train");
  if(!el) return false;
  return !el.classList.contains("hidden");
}

function computeTrainStats(listId){
  const all = pairsByListId(listId);
  const t = nowTs();
  const direction = document.getElementById("trainDirection").value; // "rm2de" oder "de2rm"
  all.forEach(ensurePairSrs);

  return {
    total: all.length,
    due: all.filter(p => ((p.srs?.[direction]?.due) || 0) <= t).length,
    wrongLast: all.filter(p => p.srs?.[direction]?.lastResult === "wrong").length
  };
}

function updateTrainStats(){
  // UI (Stats) sofort nachführen, ohne zwingend eine neue Karte zu ziehen.
  ensureListOptions();
  const listIdEl = document.getElementById("trainListSelect");
  if(!listIdEl) return;
  const listId = listIdEl.value;
  const list = getListById(listId);

  const stats = computeTrainStats(listId);
  const trainStatsEl = document.getElementById("trainStats");
  if(trainStatsEl){
    trainStatsEl.textContent = `Einträge: ${stats.total} • fällig: ${stats.due} • falsch zuletzt: ${stats.wrongLast}`;
  }

  const fcListNameEl = document.getElementById("fcListName");
  if(fcListNameEl){
    fcListNameEl.textContent = list?.name || "";
  }
}

function selectTrainingPool(){
  const listId = document.getElementById("trainListSelect").value;
  const mode = document.getElementById("trainMode").value;
  const direction = document.getElementById("trainDirection").value; // "de2rm" oder "rm2de"

  const all = pairsByListId(listId).slice();
  const t = nowTs();

  all.forEach(ensurePairSrs);

  const due = all.filter(p => ((p.srs?.[direction]?.due) || 0) <= t);
  const recentWrong = all
    .filter(p => p.srs?.[direction]?.lastResult === "wrong")
    .sort((a,b)=>((b.srs?.[direction]?.lastReviewed)||0)-((a.srs?.[direction]?.lastReviewed)||0))
    .slice(0, 20);

  if(mode === "all") return all;
  if(mode === "dueAndRecentWrong"){
    const map = new Map();
    [...due, ...recentWrong].forEach(p=>map.set(p.id,p));
    return [...map.values()];
  }
  return due;
}

function pickNextCard(){
  updateTrainStats();

  const pool = selectTrainingPool();
  const listId = document.getElementById("trainListSelect").value;
  const list = getListById(listId);

  const fcListNameEl = document.getElementById("fcListName");
  if(fcListNameEl) fcListNameEl.textContent = list?.name || "";

  const btnShow = document.getElementById("btnShowAnswer");
  const ansArea = document.getElementById("fcAnswerArea");
  const fcPrompt = document.getElementById("fcPrompt");
  const fcMeta = document.getElementById("fcMeta");

  if(pool.length === 0){
    currentCardId = null;
    if(fcPrompt) fcPrompt.textContent = "Keine passenden Karten (im gewählten Modus).";
    if(fcMeta) fcMeta.textContent = "";
    if(btnShow) btnShow.disabled = true;
    if(ansArea) ansArea.classList.add("hidden");
    return;
  }

  if(btnShow) btnShow.disabled = false;

  // fällige zuerst, dann random innerhalb der ersten N
  const direction = document.getElementById("trainDirection").value;
  pool.sort((a,b)=>((a.srs?.[direction]?.due)||0)-((b.srs?.[direction]?.due)||0));
  const top = pool.slice(0, Math.min(15, pool.length));
  const card = top[Math.floor(Math.random()*top.length)];

  ensurePairSrs(card);
  const srs = card.srs[direction];

  currentCardId = card.id;

  const prompt = direction === "de2rm" ? card.de : card.rm;
  const answer = direction === "de2rm" ? card.rm : card.de;

  document.getElementById("fcPrompt").textContent = prompt || "(leer)";
  document.getElementById("fcAnswer").textContent = answer || "(leer)";
  document.getElementById("fcMeta").textContent =
    `reps ${srs.repetitions||0} • ease ${(srs.ease||2.5).toFixed(2)} • interval(d): ${(srs.intervalDays||0).toFixed(2)} • wrong: ${srs.wrongCount||0}`;

  // Antwort verstecken beim Kartenwechsel
  document.getElementById("fcAnswerArea").classList.add("hidden");
}

function showAnswer(){
  const area = document.getElementById("fcAnswerArea");
  if(area) area.classList.remove("hidden");
}

function markAnswer(correct){
  if(!currentCardId) return;
  const card = state.pairs.find(p=>p.id===currentCardId);
  if(!card) return;

  ensurePairSrs(card);

  const direction = document.getElementById("trainDirection").value;
  const srs = card.srs[direction];
  if(!srs) return;

  reviewUpdate(srs, correct);
  saveState();
  pickNextCard();
}

// Vollbild: Karte als Overlay (kein Layout-Umbau)
function getFlashcardEl(){
  return document.querySelector("#tab-train .flashcard");
}

function enterTrainFullscreen(){
  const fc = getFlashcardEl();
  if(!fc) return;

  fc.classList.add("fullscreen");
  document.getElementById("btnEnterFullscreen")?.classList.add("hidden");
  document.getElementById("btnExitFullscreen")?.classList.remove("hidden");

  // Optional: echtes Browser-Fullscreen (Desktop/Chrome meist OK; iOS Safari oft eingeschränkt)
  const el = document.documentElement;
  if(el.requestFullscreen){
    el.requestFullscreen().catch(()=>{});
  }
}

function exitTrainFullscreen(){
  const fc = getFlashcardEl();
  if(fc) fc.classList.remove("fullscreen");

  document.getElementById("btnEnterFullscreen")?.classList.remove("hidden");
  document.getElementById("btnExitFullscreen")?.classList.add("hidden");

  if(document.fullscreenElement && document.exitFullscreen){
    document.exitFullscreen().catch(()=>{});
  }
}

// Tabs
function setupTabs(){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      exitTrainFullscreen(); // Vollbild immer beenden beim Tab-Wechsel

      document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;

      document.querySelectorAll(".panel").forEach(p=>p.classList.add("hidden"));
      document.getElementById("tab-" + tab).classList.remove("hidden");

      renderAll();

      if(tab === "train"){
        updateTrainStats();
        pickNextCard();
      }
    });
  });
}

// Export / Import
function exportJson(){
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "puter-trainer-export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function normalizeImportedState(s){
  const t = nowTs();

  // Listen absichern
  s.lists = (s.lists || []).map(l => ({
    id: l.id || uid(),
    name: l.name || "Unbenannte Liste",
    createdAt: l.createdAt || t
  }));

  // Wenn keine Listen da sind, eine Default-Liste erstellen
  if(s.lists.length === 0){
    s.lists.push({ id: uid(), name:"Neue Liste", createdAt: t });
  }

  const validListIds = new Set(s.lists.map(l=>l.id));
  const fallbackListId = s.lists[0].id;

  // Paare absichern + SRS pro Richtung:
  s.pairs = (s.pairs || []).map(p => {
    const createdAt = p.createdAt || t;

    const basePair = {
      id: p.id || uid(),
      listId: validListIds.has(p.listId) ? p.listId : fallbackListId,
      de: (p.de || "").trim(),
      rm: (p.rm || "").trim(),
      createdAt
    };

    // Neue Struktur vorhanden?
    if(p.srs && (p.srs.rm2de || p.srs.de2rm)){
      basePair.srs = {
        rm2de: { ...defaultSrs(t), ...(p.srs.rm2de || {}) },
        de2rm: { ...defaultSrs(t), ...(p.srs.de2rm || {}) }
      };
      if(basePair.srs.rm2de.due == null) basePair.srs.rm2de.due = t;
      if(basePair.srs.de2rm.due == null) basePair.srs.de2rm.due = t;
      return basePair;
    }

    // Legacy-Import (ohne Richtung):
    // → vorhandene Werte gelten als rm2de (P->D)
    const legacy = {
      ease: (p.ease ?? 2.5),
      repetitions: (p.repetitions ?? 0),
      intervalDays: (p.intervalDays ?? 0),
      due: (p.due ?? t),
      wrongCount: (p.wrongCount ?? 0),
      lastResult: (p.lastResult ?? null),
      lastReviewed: (p.lastReviewed ?? null)
    };

    basePair.srs = {
      rm2de: legacy,
      de2rm: defaultSrs(t) // Gegenrichtung initialisieren (fällig ab Import)
    };

    return basePair;
  });

  // sicherstellen
  s.pairs.forEach(ensurePairSrs);

  s.version = 2;
  return s;
}

function importJsonFile(file){
  const r = new FileReader();
  r.onload = ()=>{
    try{
      const parsed = JSON.parse(String(r.result || "{}"));
      const normalized = normalizeImportedState(parsed);
      state = normalized;
      saveState();
      alert("Import erfolgreich.");
      // Nach Import im Lernmodus: Stats/Next vorbereiten
      if(isTrainTabVisible()){
        updateTrainStats();
        pickNextCard();
      }
    }catch(e){
      console.error(e);
      alert("Import fehlgeschlagen. Bitte eine gültige JSON-Datei wählen.");
    }
  };
  r.readAsText(file);
}

function resetAll(){
  if(confirm("Wirklich ALLE Daten löschen?")){
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    saveState();
  }
}

// Wire up
document.addEventListener("DOMContentLoaded", ()=>{
  setupTabs();

  document.getElementById("btnAddList")?.addEventListener("click", addList);

  document.getElementById("browseListSelect")?.addEventListener("change", renderBrowse);
  document.getElementById("browseSort")?.addEventListener("change", renderBrowse);
  document.getElementById("browseSearch")?.addEventListener("input", renderBrowse);

  document.getElementById("btnAddPair")?.addEventListener("click", handleAddPair);
  document.getElementById("btnClearInputs")?.addEventListener("click", ()=>{
    document.getElementById("inputDe").value = "";
    document.getElementById("inputRm").value = "";
  });

  document.getElementById("btnNext")?.addEventListener("click", pickNextCard);
  document.getElementById("btnShowAnswer")?.addEventListener("click", showAnswer);
  document.getElementById("btnMarkWrong")?.addEventListener("click", ()=>markAnswer(false));
  document.getElementById("btnMarkRight")?.addEventListener("click", ()=>markAnswer(true));

  // Sofort neue Karte ziehen (und damit Stats aktualisieren) bei Auswahlwechsel:
  document.getElementById("trainListSelect")?.addEventListener("change", pickNextCard);
  document.getElementById("trainMode")?.addEventListener("change", pickNextCard);
  document.getElementById("trainDirection")?.addEventListener("change", pickNextCard);

  // Zusätzlich: sofortige Stats-Aktualisierung (ohne Kartenwechsel), wenn das UI "input" feuert
  // (je nach Browser kann select nur "change" feuern – schadet aber nicht)
  document.getElementById("trainListSelect")?.addEventListener("input", updateTrainStats);
  document.getElementById("trainMode")?.addEventListener("input", updateTrainStats);
  document.getElementById("trainDirection")?.addEventListener("input", updateTrainStats);

  // Vollbild (Overlay)
  document.getElementById("btnEnterFullscreen")?.addEventListener("click", enterTrainFullscreen);
  document.getElementById("btnExitFullscreen")?.addEventListener("click", exitTrainFullscreen);

  // ESC beendet Vollbild (optional, Desktop)
  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") exitTrainFullscreen();
  });

  document.getElementById("btnExport")?.addEventListener("click", exportJson);
  document.getElementById("btnImport")?.addEventListener("click", ()=>{
    document.getElementById("importFile").click();
  });
  document.getElementById("importFile")?.addEventListener("change", (e)=>{
    const f = e.target.files?.[0];
    if(f) importJsonFile(f);
    e.target.value = "";
  });
  document.getElementById("btnReset")?.addEventListener("click", resetAll);

  renderAll();
  // Wenn Lernmodus standardmässig nicht aktiv ist, ist das ok. Karte wird beim Wechsel in den Tab gezogen.
  if(isTrainTabVisible()) pickNextCard();
});
