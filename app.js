// Puter Trainer — lokale Daten, kein Server

const STORAGE_KEY = "puter_trainer_v1";

function nowTs(){ return Date.now(); }
function addDays(ts, days){ return ts + days*24*60*60*1000; }

function uid(){
  return Math.random().toString(16).slice(2) + "-" + Math.random().toString(16).slice(2);
}

// SM-2-ähnlich (vereinfacht): Meine Frage
// - richtig: Intervall wächst, Ease steigt leicht
// - falsch: Intervall zurück auf 0.01 Tage (~15 min), Ease sinkt, Repetitions zurück
function reviewUpdate(card, correct){
  const t = nowTs();
  card.lastReviewed = t;

  if(card.ease == null) card.ease = 2.5;
  if(card.repetitions == null) card.repetitions = 0;
  if(card.intervalDays == null) card.intervalDays = 0;

  if(!correct){
    card.repetitions = 0;
    card.ease = Math.max(1.3, card.ease - 0.2);
    card.intervalDays = 0.01; // ~15 min
    card.wrongCount = (card.wrongCount || 0) + 1;
    card.lastResult = "wrong";
  } else {
    card.repetitions += 1;
    card.ease = Math.min(3.0, card.ease + 0.05);
    if(card.repetitions === 1) card.intervalDays = 1;
    else if(card.repetitions === 2) card.intervalDays = 3;
    else card.intervalDays = Math.round(card.intervalDays * card.ease);
    card.lastResult = "right";
  }

  card.due = addDays(t, card.intervalDays);
}

function defaultState(){
  const listId = uid();
  return {
    lists: [
      { id: listId, name: "Romanische Grussformen", createdAt: nowTs() }
    ],
    pairs: [
      // leer starten; Beispielbutton fügt bei Bedarf hinzu
    ],
    version: 1
  };
}

let state = loadState();

function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return defaultState();
  try{
    const s = JSON.parse(raw);
    // Minimal-Migration/Absicherung:
    if(!s.lists) s.lists = [];
    if(!s.pairs) s.pairs = [];
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
function pairsByListId(listId){
  if(listId === "ALL") return state.pairs.slice();
  return state.pairs.filter(p => p.listId === listId);
}

function ensureListOptions(){
  const selects = [
    document.getElementById("browseListSelect"),
    document.getElementById("addListSelect"),
    document.getElementById("trainListSelect")
  ];

  // Aktuelle Auswahl merken (pro Select)
  const previousValues = new Map();
  selects.forEach(sel => {
    previousValues.set(sel.id, sel.value);
  });

  // Dropdowns neu füllen
  selects.forEach(sel => {
    sel.innerHTML = "";
    // "Alle Kategorien" nur für Browse + Train sinnvoll
    if(sel.id === "browseListSelect" || sel.id === "trainListSelect"){
      const optAll = document.createElement("option");
      optAll.value = "ALL";
      optAll.textContent = "Alle Kategorien";
      sel.appendChild(optAll);
    }
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

  // Falls gar keine Listen existieren: eine Default-Liste anlegen
  if(state.lists.length === 0){
    const l = { id: uid(), name:"Neue Liste", createdAt: nowTs() };
    state.lists.push(l);
    saveState();
  }
}

function renderLists(){
  const c = document.getElementById("listsContainer");
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
          <div class="muted" style="font-size:12px;">ID: ${l.id}</div>
        </div>
        <div class="row">
          <button class="ghost" data-action="rename" data-id="${l.id}">Umbenennen</button>
          <button class="danger ghost" data-action="delete" data-id="${l.id}">Löschen</button>
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
  const listId = document.getElementById("browseListSelect").value;
  const sort = document.getElementById("browseSort").value;
  const q = (document.getElementById("browseSearch").value || "").trim().toLowerCase();

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

  const c = document.getElementById("browseContainer");
  c.innerHTML = "";

  items.forEach(p=>{
    const div = document.createElement("div");
    div.className = "pair";
    const dueStr = p.due ? new Date(p.due).toLocaleString() : "—";
    div.innerHTML = `
      <div class="top">
        <div class="badge">Fällig: ${escapeHtml(dueStr)}</div>
        <div class="row">
          <button class="ghost" data-action="edit" data-id="${p.id}">Bearbeiten</button>
          <button class="danger" data-action="delete" data-id="${p.id}">Löschen</button>
        </div>
      </div>
      <div class="cols">
        <div><strong>DE</strong><div>${escapeHtml(p.de||"")}</div></div>
        <div><strong>PUTER</strong><div>${escapeHtml(p.rm||"")}</div></div>
      </div>
      <div class="muted" style="font-size:12px; margin-top:8px;">
        reps: ${p.repetitions||0} • ease: ${(p.ease||2.5).toFixed(2)} • interval(d): ${(p.intervalDays||0).toFixed(2)} • wrong: ${p.wrongCount||0}
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

function addList(){
  const inp = document.getElementById("newListName");
  const name = (inp.value || "").trim();
  if(!name) return;
  state.lists.push({ id: uid(), name, createdAt: nowTs() });
  inp.value = "";
  saveState();
}

function addPair(listId, de, rm){
  const p = {
    id: uid(),
    listId,
    de: (de||"").trim(),
    rm: (rm||"").trim(),
    createdAt: nowTs(),
    // SRS Felder:
    ease: 2.5,
    repetitions: 0,
    intervalDays: 0,
    due: nowTs(), // sofort fällig
    wrongCount: 0,
    lastResult: null,
    lastReviewed: null
  };
  state.pairs.push(p);
}

function handleAddPair(){
  const listId = document.getElementById("addListSelect").value;
  const de = document.getElementById("inputDe").value;
  const rm = document.getElementById("inputRm").value;
  if(!de.trim() || !rm.trim()){
    alert("Bitte Deutsch und Puter ausfüllen.");
    return;
  }
  addPair(listId, de, rm);
  document.getElementById("inputDe").value = "";
  document.getElementById("inputRm").value = "";
  saveState();
}

// TRAINING
let currentCardId = null;

function selectTrainingPool(){
  const listId = document.getElementById("trainListSelect").value;
  const mode = document.getElementById("trainMode").value;

  const all = pairsByListId(listId).slice();
  const t = nowTs();

  const due = all.filter(p => (p.due || 0) <= t);
  const recentWrong = all
    .filter(p => p.lastResult === "wrong")
    .sort((a,b)=>(b.lastReviewed||0)-(a.lastReviewed||0))
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
  const pool = selectTrainingPool();
  const listId = document.getElementById("trainListSelect").value;
  const list = getListById(listId);

  const stats = computeTrainStats(listId);
  document.getElementById("trainStats").textContent =
    `Einträge: ${stats.total} • fällig: ${stats.due} • falsch zuletzt: ${stats.wrongLast}`;

  document.getElementById("fcListName").textContent = list?.name || "";

  if(pool.length === 0){
    currentCardId = null;
    document.getElementById("fcPrompt").textContent =
      "Keine passenden Karten (im gewählten Modus).";
    document.getElementById("fcMeta").textContent = "";
    document.getElementById("btnShowAnswer").disabled = true;
    document.getElementById("fcAnswerArea").classList.add("hidden");
    return;
  }

  // Einfach: fällige zuerst, dann random innerhalb
  pool.sort((a,b)=>(a.due||0)-(b.due||0));
  const top = pool.slice(0, Math.min(15, pool.length));
  const card = top[Math.floor(Math.random()*top.length)];

  currentCardId = card.id;

  const direction = document.getElementById("trainDirection").value;
  const prompt = direction === "de2rm" ? card.de : card.rm;
  const answer = direction === "de2rm" ? card.rm : card.de;

  document.getElementById("fcPrompt").textContent = prompt || "(leer)";
  document.getElementById("fcAnswer").textContent = answer || "(leer)";
  document.getElementById("fcMeta").textContent =
    `reps ${card.repetitions||0} • ease ${(card.ease||2.5).toFixed(2)} • fällig ${card.due ? new Date(card.due).toLocaleString() : "—"}`;

  document.getElementById("btnShowAnswer").disabled = false;
  document.getElementById("fcAnswerArea").classList.add("hidden");
  document.querySelector(".flashcard")?.classList.remove("revealed");
}

function computeTrainStats(listId){
  const all = pairsByListId(listId);
  const t = nowTs();
  return {
    total: all.length,
    due: all.filter(p=>(p.due||0)<=t).length,
    wrongLast: all.filter(p=>p.lastResult==="wrong").length
  };
}

function showAnswer(){
  document.getElementById("fcAnswerArea").classList.remove("hidden");
  document.querySelector(".flashcard")?.classList.add("revealed");
}

function markAnswer(correct){
  if(!currentCardId) return;
  const card = state.pairs.find(p=>p.id===currentCardId);
  if(!card) return;
  reviewUpdate(card, correct);
  saveState();
  pickNextCard();
}

// DATA: Export/Import/Reset
function exportJson(){
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "puter-trainer-export.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function normalizeImportedState(s){
  const t = nowTs();

  // Listen absichern
  s.lists = (s.lists || []).map(l => ({
    id: l.id || uid(),
    name: l.name || "Unbenannte Liste",
    createdAt: l.createdAt || t
  }));

  // Paare absichern
  s.pairs = (s.pairs || []).map(p => {
    const createdAt = p.createdAt || t;
    const due = p.due || t;

    return {
      id: p.id || uid(),
      listId: p.listId,          // muss vorhanden sein
      de: (p.de || "").trim(),
      rm: (p.rm || "").trim(),
      createdAt,

      // SRS Defaults, falls nicht vorhanden
      ease: (p.ease ?? 2.5),
      repetitions: (p.repetitions ?? 0),
      intervalDays: (p.intervalDays ?? 0),
      due,
      wrongCount: (p.wrongCount ?? 0),
      lastResult: (p.lastResult ?? null),
      lastReviewed: (p.lastReviewed ?? null)
    };
  });

  return s;
}

function importJsonFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const s = JSON.parse(reader.result);
      if(!s || !Array.isArray(s.lists) || !Array.isArray(s.pairs)){
        alert("Ungültige Datei.");
        return;
      }
      state = normalizeImportedState(s);
      saveState();
      alert("Import erfolgreich.");
    }catch{
      alert("Konnte JSON nicht lesen.");
    }
  };
  reader.readAsText(file);
}

function resetAll(){
  if(confirm("Wirklich alles löschen?")){
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    saveState();
  }
}

function renderDataPreview(){
  const pre = document.getElementById("dataPreview");
  pre.textContent = JSON.stringify(state, null, 2);
}

// UI / Tabs
function setupTabs(){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.querySelectorAll(".panel").forEach(p=>p.classList.add("hidden"));
      document.getElementById("tab-" + tab).classList.remove("hidden");
      renderAll();
    });
  });
}

function renderAll(){
  ensureListOptions();
  renderLists();
  renderBrowse();
  renderDataPreview();
}

function escapeHtml(s){
  return (s ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// Wire up
document.addEventListener("DOMContentLoaded", ()=>{
  setupTabs();

  document.getElementById("btnAddList").addEventListener("click", addList);
  document.getElementById("browseListSelect").addEventListener("change", renderBrowse);
  document.getElementById("browseSort").addEventListener("change", renderBrowse);
  document.getElementById("browseSearch").addEventListener("input", renderBrowse);

  document.getElementById("btnAddPair").addEventListener("click", handleAddPair);
  document.getElementById("btnClearInputs").addEventListener("click", ()=>{
    document.getElementById("inputDe").value = "";
    document.getElementById("inputRm").value = "";
  });

  document.getElementById("btnNext").addEventListener("click", pickNextCard);
  document.getElementById("btnShowAnswer").addEventListener("click", showAnswer);
  document.getElementById("btnMarkWrong").addEventListener("click", ()=>markAnswer(false));
  document.getElementById("btnMarkRight").addEventListener("click", ()=>markAnswer(true));

  document.getElementById("trainListSelect").addEventListener("change", pickNextCard);
  document.getElementById("trainMode").addEventListener("change", pickNextCard);
  document.getElementById("trainDirection").addEventListener("change", pickNextCard);

  document.getElementById("btnExport").addEventListener("click", exportJson);
  document.getElementById("btnImport").addEventListener("click", ()=>{
    document.getElementById("importFile").click();
  });
  document.getElementById("importFile").addEventListener("change", (e)=>{
    const f = e.target.files?.[0];
    if(f) importJsonFile(f);
    e.target.value = "";
  });
  document.getElementById("btnReset").addEventListener("click", resetAll);

  renderAll();
  // Start im Lernmodus: erste Karte laden, falls dort gelandet
  pickNextCard();
});

// PWA Offline: Service Worker registrieren
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  });
}