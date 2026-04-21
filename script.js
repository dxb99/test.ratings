const API_URL = "https://script.google.com/macros/s/AKfycbzIyBeXAVeSLtxW8jR9OnQL_Iz6cawGiaZSlkoZ2hTYy5dwo-0n_GH6F15H7tfXojIl/exec";

let allPlayers = [];
let adminLoaded = false;
let countdownTimer = null;
let lastMatchTimestamp = null;
let lastGeneratedMatchups = [];
let selectedMatchKey = null;
let matchHistory = [];
let lastSelectedPlayers = [];
let lastSelectedMatchMaker = "";
let currentMatchKeyFromServer = null;
let blitzEnabled = false;
let currentHistorySort = {
  key: "date",
  direction: "desc"
};
let armedMatchKey = null; // 🔥 tracks first click before confirm

/* 🔥 GLOBAL MODAL SYSTEM */

function showModal(message, type = "alert", confirmText = "Confirm", cancelText = "Cancel", withInput = false){

  return new Promise((resolve)=>{

    const modal = document.getElementById("customModal");
    const msg = document.getElementById("modalMessage");
    const confirmBtn = document.getElementById("modalConfirm");
    const cancelBtn = document.getElementById("modalCancel");
    const input = document.getElementById("modalInput");

    msg.innerText = message;

    confirmBtn.innerHTML = confirmText === "Confirm" ? "✓" : confirmText;
    cancelBtn.innerHTML = cancelText === "Cancel" ? "✕" : cancelText;

    input.style.display = withInput ? "block" : "none";
    input.value = "";

    modal.style.display = "flex";

    if(type === "alert"){
      cancelBtn.style.display = "none";
    }else{
      cancelBtn.style.display = "inline-flex";
    }

    const cleanup = () => {
      modal.style.display = "none";
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    confirmBtn.onclick = () => {
      const value = withInput ? input.value : true;
      cleanup();
      resolve(value);
    };

    cancelBtn.onclick = () => {
      cleanup();
      resolve(null);
    };

  });

}

/* 🔓 ADMIN UNLOCK SYSTEM */

async function getAdminPassword(){

  let stored = sessionStorage.getItem("adminPass");

  // ✅ If already unlocked → reuse
  if(stored){
    return stored;
  }

  while(true){

let pass = await showModal(
  "Enter Admin Password",
  "confirm",
  "Confirm",
  "Cancel",
  true
);    

// ❌ user cancelled
if(!pass) return null;

const test = await api({
  action:"verifyAdminPassword",
  password: pass
});

if(test && test.ok){
  sessionStorage.setItem("adminPass", pass);
  updateAdminBar();
  return pass;
}

await showModal("Wrong password. Try again.", "alert");
  }
}

// 🔥 lock function (for later button)
function clearAdminSession(){
  sessionStorage.removeItem("adminPass");
  updateAdminBar();
}

function updateAdminBar(){

  const status = document.getElementById("adminStatus");
  const lockBtn = document.getElementById("adminLockBtn");

  if(!status || !lockBtn) return;

  const pass = sessionStorage.getItem("adminPass");

if(pass){
  status.textContent = "🔓 ADMIN MODE ACTIVE";
  lockBtn.style.display = "inline-flex";

  document.body.classList.remove("admin-locked");
  document.body.classList.add("admin-unlocked");

}else{
  status.textContent = "🔒 LOCKED";
  lockBtn.style.display = "none";

  document.body.classList.remove("admin-unlocked");
  document.body.classList.add("admin-locked");
}
  
// 🔥 disable session buttons when locked
const generateBtn = document.getElementById("generateSessionMapsBtn");
const saveBtn = document.getElementById("saveSessionProgressBtn");

if(generateBtn && saveBtn){

  if(pass){

    generateBtn.classList.remove("disabled");
    saveBtn.classList.remove("disabled");

    // ✅ remove tooltip when unlocked
    generateBtn.removeAttribute("data-tooltip");
    saveBtn.removeAttribute("data-tooltip");

  }else{

    generateBtn.classList.add("disabled");
    saveBtn.classList.add("disabled");

    // 🔒 tooltip when locked
    generateBtn.setAttribute("data-tooltip", "🔒 Admin mode required");
    saveBtn.setAttribute("data-tooltip", "🔒 Admin mode required");

  }

}

// 🔥 CLICK LOCK STATUS TO UNLOCK
status.onclick = async () => {

  // only allow unlock when locked
  if(sessionStorage.getItem("adminPass")) return;

  const pass = await getAdminPassword();
  if(!pass) return;

  sessionStorage.setItem("adminPass", pass);
  updateAdminBar();

};
  
}

function isAdminUnlocked(){
  return !!sessionStorage.getItem("adminPass");
}

window.addEventListener("load", async () => {

sessionStorage.removeItem("selectedMatchMaker");
sessionStorage.removeItem("selectedPlayers");
sessionStorage.removeItem("adminPass");

  try {

    await loadInitialData();

/* 🔥 HIDE BLITZ ON LOAD */

const blitzContainer = document.querySelector(".blitzToggle");
if(blitzContainer){
  blitzContainer.style.display = "none";
}

    document.getElementById("loadingScreen").style.display = "none";
    document.getElementById("app").classList.remove("hidden");
    updateAdminBar();

window.scrollTo(0, 0);

    document.querySelectorAll('input[name="gapFilter"]').forEach(radio => {
      radio.addEventListener("change", applyGapFilter);
    });

const blitzToggle = document.getElementById("blitzToggle");

if(blitzToggle){

blitzToggle.addEventListener("change", () => {

  blitzEnabled = blitzToggle.checked;

  updateGapCounts(); /* 🔥 ADD THIS */
  applyGapFilter();

});

}

    setupMapListButtons();
    await loadSessionMaps();

    document.getElementById("adminLockBtn").onclick = clearAdminSession;
    
    startMatchAutoRefresh();

  } catch (err) {

    console.error(err);
    await showModal("Startup error. Open console (F12).", "alert");

  }

});

async function api(data){

  const res = await fetch(API_URL,{
    method:"POST",
    body:JSON.stringify(data)
  });

  return await res.json();

}

async function loadInitialData(){

const data = await api({action:"getInitialData"});

if(!data.ok){
  throw new Error("Failed loading data");
}

allPlayers = data.players || [];

populatePlayers(allPlayers);

if(lastGeneratedMatchups.length === 0){

  document.querySelectorAll('input[name="gapFilter"]').forEach(r=>{
    r.disabled = true;
    r.parentElement.classList.add("disabled");
  });

}else{

  // Re-apply correct radio states based on matchups
  updateGapCounts();

  // Re-render filtered matchups
  applyGapFilter();

}

renderMatchup(data.currentMatchup);

/* LOAD MATCH HISTORY */

const historyData = await api({action:"getHistory"});
if(historyData.ok){
  matchHistory = historyData.history || [];
}

}

function populatePlayers(players){

  window.allPlayers = players;

  renderPlayers(players);

  document.getElementById("playerSort").onchange = function(){

    let type = this.value;

    let sorted = [...window.allPlayers];

    if(type === "alpha"){

      sorted.sort((a,b)=>a.name.localeCompare(b.name));

    }else{

      sorted.sort((a,b)=>{

        if(b.skill !== a.skill) return b.skill - a.skill;

        return a.name.localeCompare(b.name);

      });

    }

    renderPlayers(sorted);

  };

}

function renderMatchup(match){

  const el=document.getElementById("matchupContent");
  const countdown=document.getElementById("matchCountdown");

// 🔥 RESET server key if no matchup
currentMatchKeyFromServer = null;
  
if(!match){

  if(countdownTimer){
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  el.innerHTML=`

  <div class="matchCard">
    <div class="matchHeader">
      NO CURRENT MATCHUP
    </div>

    <button id="getStartedBtn" class="getStartedBtn">
      CLICK TO GET STARTED
    </button>

  </div>

  `;

  countdown.innerHTML="";

/* 🔥 GET STARTED BUTTON CLICK */
setTimeout(() => {
  const btn = document.getElementById("getStartedBtn");
  if(btn){
    btn.onclick = () => {
      const generatorBtn = document.querySelector('.tabButton[onclick*="generatorTab"]');
      showTab("generatorTab", generatorBtn);
    };
  }
}, 0);

return;
  return;

}

el.innerHTML=`

<div class="matchCard">

<div class="matchHeader">
  Match Maker: <strong>${match.matchMaker}</strong>

<span class="midTag">
  ${match.MID ? "MID_" + String(match.MID).replace("MID_","").padStart(4,"0") : "----"}
</span>
</div>

  <div class="teamsRow">

    <div class="team red">
  <div class="teamTitle">
    RED TEAM <span class="teamBadge">${match.redSkill}</span>
  </div>
      <div class="teamPlayers">
        ${match.redTeam.map(name => {

  const player = allPlayers.find(p => p.name === name);

  return `
    <div class="playerRow">
      ${name}
      <span class="skillMedal">${player ? player.skill : ""}</span>
    </div>
  `;

}).join("")}
      </div>
    </div>

    <div class="vs">VS</div>

    <div class="team blue">
  <div class="teamTitle">
    BLUE TEAM <span class="teamBadge">${match.blueSkill}</span>
  </div>
      <div class="teamPlayers">
        ${match.blueTeam.map(name => {

  const player = allPlayers.find(p => p.name === name);

  return `
    <div class="playerRow">
      ${name}
      <span class="skillMedal">${player ? player.skill : ""}</span>
    </div>
  `;

}).join("")}
      </div>
    </div>

  </div>

  <div class="matchFooter">
    <span class="diff diff-${match.skillGap}">
  Difference: ${match.skillGap}
</span>
  </div>

</div>

`;

const expiry = new Date(match.expiresAt);
const now = new Date();

if(expiry <= now){

  // 🔥 CLEAR SERVER MATCH KEY (THIS FIXES YOUR ISSUE)
  currentMatchKeyFromServer = null;

  el.innerHTML=`

  <div class="matchCard">
    <div class="matchHeader">
      NO CURRENT MATCHUP
    </div>

    <button id="getStartedBtn" class="getStartedBtn">
      CLICK TO GET STARTED
    </button>

  </div>

  `;

  countdown.innerHTML="";

  /* 🔥 GET STARTED BUTTON CLICK */
  setTimeout(() => {
    const btn = document.getElementById("getStartedBtn");
    if(btn){
      btn.onclick = () => {
        const generatorBtn = document.querySelector('.tabButton[onclick*="generatorTab"]');
        showTab("generatorTab", generatorBtn);
      };
    }
  }, 0);

  return;

}

// 🔥 BUILD KEY FROM SERVER MATCH (ONLY IF NOT EXPIRED)
const redKey = match.redTeam.slice().sort().join("|");
const blueKey = match.blueTeam.slice().sort().join("|");

currentMatchKeyFromServer = redKey + "-" + blueKey;

if(match.selectedAt !== lastMatchTimestamp){

  lastMatchTimestamp = match.selectedAt;

  startCountdown(expiry);

}

}

document.getElementById("generateButton").onclick = generateMatchups;

async function generateMatchups(){

  const selectedPlayers=[];

  const maker = document.getElementById("matchMakerSelect").value;

if(!maker){
  showModal("Select Match Maker first.", "alert");
  return;
}

  document.querySelectorAll("#playersCheckboxes input:checked").forEach(x=>{
    selectedPlayers.push(x.value);
  });

  document.getElementById("generatingOverlay").style.display = "flex";
  
  if(selectedPlayers.length < 2){
    showModal("Select at least 2 players.", "alert");
    return;
  }

  const gap = document.querySelector('input[name="gapFilter"]:checked').value;

const matchups = generateMatchupsLocal(selectedPlayers, gap);

/* 🔥 CONTROL BLITZ VISIBILITY AFTER GENERATE */

const blitzToggle = document.getElementById("blitzToggle");
const blitzContainer = document.querySelector(".blitzToggle");

if(blitzToggle && blitzContainer){

  if(selectedPlayers.length % 2 !== 0){

    /* SHOW with animation */
    blitzContainer.style.display = "flex";

    setTimeout(()=>{
  blitzContainer.classList.add("show");
},2000);

  }else{

    /* HIDE */
    blitzContainer.classList.remove("show");

    setTimeout(()=>{
      blitzContainer.style.display = "none";
    },300);

    blitzToggle.checked = false;
    blitzEnabled = false;

  }

}

/* Sort matchups by skill gap */

matchups.sort((a,b)=>a.skillGap - b.skillGap);

lastGeneratedMatchups = matchups;
lastSelectedPlayers = selectedPlayers.slice();

/* Force overlay to stay visible for 1 seconds */

  setTimeout(() => {

  document.querySelectorAll('input[name="gapFilter"]').forEach(r=>{
  r.disabled = false;
  r.parentElement.classList.remove("disabled");
});

  updateGapCounts();

  applyGapFilter();

  document.getElementById("generatingOverlay").style.display = "none";

}, 1000);

}

function renderGeneratedMatchups(matchups){

  const container=document.getElementById("generatedMatchups");

  armedMatchKey = null; // 🔥 reset when rendering new matchups

  container.innerHTML="";

  matchups.forEach(m=>{

    const div=document.createElement("div");

    div.className="matchOption";

div.innerHTML=`

<div class="matchCompact">

<div class="teamLine">

<span class="redTeam"><strong><span class="skillMedal">${m.redSkill}</span> RED TEAM :</strong></span>

<span class="teamPlayers">
${m.redTeam.map(p=>p.name).join(", ")}
</span>

</div>

<div class="teamLine">

<span class="blueTeam"><strong><span class="skillMedal">${m.blueSkill}</span> BLUE TEAM :</strong></span>

<span class="teamPlayers">
${m.blueTeam.map(p=>p.name).join(", ")}
</span>

</div>

<div class="badges">

<span class="badge gap-${m.skillGap}">
Difference ${m.skillGap}
</span>

<span class="badge picks">
Picked ${m.pickCount} ${m.pickCount === 1 ? "time" : "times"}
</span>

<button class="selectMatch">CLICK TO SELECT</button>

</div>

</div>

`;
    
const btn = div.querySelector(".selectMatch");

const redKey = m.redTeam.map(p=>p.name).sort().join("|");
const blueKey = m.blueTeam.map(p=>p.name).sort().join("|");

const key = redKey + "-" + blueKey;

const isServerSelected = currentMatchKeyFromServer === key;

if(isServerSelected){
  div.classList.add("selectedCard");
  btn.classList.add("selected");
  btn.innerText = "SELECTED";

  btn.style.cursor = "not-allowed";
  btn.disabled = true;
}

btn.onclick = () => {

  // 🔥 BLOCK IF THIS IS CURRENT ACTIVE MATCH
  if(currentMatchKeyFromServer === key){
    return;
  }

  const maker = document.getElementById("matchMakerSelect").value;

  if(!maker){
    showModal("Select Match Maker first.", "alert");
    return;
  }

// 🔥 CUSTOM MODAL CONFIRM
showModal("Are you sure you want to select this matchup?", "confirm")
.then(confirmSelection => {

  if(!confirmSelection){
    return;
  }

  // 🔥 SAVE DIRECTLY
  selectMatchup(m, key, btn, div);

});
};

// 🔥 MAKE ENTIRE CARD CLICKABLE (SAME AS BUTTON)
div.onclick = (e) => {

  // prevent double trigger if button itself clicked
  if(e.target.classList.contains("selectMatch")) return;

  btn.click(); // trigger same logic as button

};
    
container.appendChild(div);

  });

}

async function selectMatchup(match, key, btn, div){

  const maker=document.getElementById("matchMakerSelect").value;

  if(!maker){
    showModal("Select Match Maker first.", "alert");
    return;
  }

document.getElementById("savingMatchOverlay").style.display = "flex";

const data = await api({

  action:"saveMatchupDirect",

  matchMaker:maker,

  redTeam:match.redTeam.map(p=>p.name),

  blueTeam:match.blueTeam.map(p=>p.name)

});

  if(!data.ok){

  document.getElementById("savingMatchOverlay").style.display = "none";

  showModal(data.error, "alert");

  return;

}

// 🔥 ONLY mark selected AFTER SUCCESS
currentMatchKeyFromServer = key; // 🔥 FORCE SYNC IMMEDIATELY

document.querySelectorAll(".matchOption").forEach(card=>{
  card.classList.remove("armedCard");
  card.classList.remove("selectedCard");
});

document.querySelectorAll(".selectMatch").forEach(b=>{
  b.classList.remove("selected");
  b.classList.remove("confirming"); // 🔥 ADD
  b.innerText = "CLICK TO SELECT";
  b.disabled = false; // 🔥 reset disabled state
  b.style.cursor = "pointer";
});

div.classList.add("selectedCard");
btn.classList.add("selected");
btn.innerText = "SELECTED";
btn.disabled = true;
btn.style.cursor = "not-allowed";

/* CHANGE OVERLAY TEXT TO SAVED */

const overlay = document.getElementById("savingMatchOverlay");

overlay.querySelector(".generatingText").innerHTML = "SAVED ✓";

/* WAIT 1 SECOND THEN REDIRECT */

setTimeout(async () => {

  overlay.style.display = "none";

  // 🔥 REFRESH HISTORY
  const historyData = await api({ action: "getHistory" });
  if(historyData.ok){
    matchHistory = historyData.history || [];
  }

  // 🔥 UPDATE GENERATED MATCHUPS (so counts stay accurate)
  const updatedMatchups = generateMatchupsLocal(lastSelectedPlayers, "all");

  lastGeneratedMatchups = updatedMatchups;
  updateGapCounts();
  applyGapFilter();

  // 🔥 NOW GO TO MATCHUP TAB
  const matchupBtn = document.querySelector('.tabButton[onclick*="matchupTab"]');
  showTab("matchupTab", matchupBtn);

  // 🔥 REFRESH CURRENT MATCH DISPLAY
  await loadInitialData();

}, 1000);

}

function startCountdown(expiry){

  if(countdownTimer){
  clearInterval(countdownTimer);
}

  const el=document.getElementById("matchCountdown");

  countdownTimer = setInterval(()=>{

    const now=new Date();

    const diff=expiry-now;

    if(diff<=0){

  /* 🔥 STOP TIMER */
  clearInterval(countdownTimer);
  countdownTimer = null;

  /* 🔥 CLEAR TEXT */
  el.innerHTML="";

  return;

}

    const hours=Math.floor(diff/3600000);
    const mins=Math.floor((diff%3600000)/60000);
    const secs=Math.floor((diff%60000)/1000);

    el.innerHTML=`MATCHUP EXPIRES IN ${hours}:${mins}:${secs}`;

  },1000);

}

function renderPlayers(players){

  const maker = document.getElementById("matchMakerSelect");
  const mapMaker = document.getElementById("mapMatchMakerSelect");
  const list = document.getElementById("playersCheckboxes");

  maker.innerHTML="";
  if(mapMaker) mapMaker.innerHTML="";
  list.innerHTML="";

  // 🔥 ADD PLACEHOLDER (DEFAULT BLANK OPTION)

const placeholder = document.createElement("option");
placeholder.value = "";
placeholder.textContent = "Select Match Maker";
placeholder.disabled = true;
placeholder.selected = true;

maker.appendChild(placeholder);

if(mapMaker){
  mapMaker.appendChild(placeholder.cloneNode(true));
}
  
players.forEach(p=>{

  const opt=document.createElement("option");

  opt.value=p.name;
  opt.innerText=p.name;

  maker.appendChild(opt);

  if(mapMaker){
  const opt2 = opt.cloneNode(true);
  mapMaker.appendChild(opt2);
}

  const div=document.createElement("div");

const savedPlayers = JSON.parse(sessionStorage.getItem("selectedPlayers") || "null");

const isChecked = !savedPlayers || savedPlayers.includes(p.name);

div.innerHTML=`
  <label>
  <input type="checkbox" ${isChecked ? "checked" : ""} value="${p.name}">
  ${p.name}
  <span class="skillMedal">${p.skill}</span>
  </label>
  `;

  div.querySelector("input").addEventListener("change", () => {

    updateSelectedPlayerCount();

    const currentPlayers = Array.from(
      document.querySelectorAll("#playersCheckboxes input:checked")
    ).map(x => x.value).sort();

    const previousPlayers = [...lastSelectedPlayers].sort();

    const isSame =
      currentPlayers.length === previousPlayers.length &&
      currentPlayers.every((v,i)=>v === previousPlayers[i]);

    if(!isSame){
      resetGeneratedMatchups();
    }

/* 🔥 SAVE PLAYER SELECTION */

sessionStorage.setItem(
  "selectedPlayers",
  JSON.stringify(currentPlayers)
);

  });

  list.appendChild(div);

});

/* 🔥 ADD THIS BLOCK */

const savedMaker = sessionStorage.getItem("selectedMatchMaker");

if(savedMaker){
  maker.value = savedMaker;
  if(mapMaker) mapMaker.value = savedMaker;
}

  // 🔥 FORCE MAP LIST TO START BLANK
if(mapMaker){
  mapMaker.value = "";
}

/* 🔥 AND THIS BLOCK */

maker.onchange = function(){

  sessionStorage.setItem("selectedMatchMaker", this.value);

  if(mapMaker){
    mapMaker.value = this.value;
  }

  resetGeneratedMatchups();
  lastSelectedPlayers = [];
  selectedMatchKey = null;

};

if(mapMaker){

  mapMaker.onchange = function(){

    sessionStorage.setItem("selectedMatchMaker", this.value);

    maker.value = this.value;

  };

}

updateSelectedPlayerCount();

}

async function openAdminTab(btn){

  showTab("adminTab", btn);

  /* SHOW LOADING OVERLAY */

  document.getElementById("historyLoadingOverlay").style.display = "flex";

  const data = await api({
    action:"getPlayersAdmin"
  });

  /* HIDE LOADING OVERLAY */

  document.getElementById("historyLoadingOverlay").style.display = "none";

  if(!data.ok){
    showModal("Failed loading players", "alert");
    return;
  }

  const table = document.querySelector("#adminTable tbody");

  table.innerHTML="";

  data.players.forEach(p=>{

    const row=document.createElement("tr");

    row.innerHTML=`

    <td contenteditable="true">${p.name}</td>

    <td contenteditable="true">${p.skill}</td>

    <td><button class="btn btn-red remove">REMOVE</button></td>

    `;

    row.querySelector(".remove").onclick=()=>{

      row.remove();
      updatePlayerCount();

    };

    table.appendChild(row);

  });

  updatePlayerCount();

}

function updatePlayerCount(){

  const rows = document.querySelectorAll("#adminTable tbody tr").length;

  document.getElementById("playerCount").innerText = "Players: " + rows;

}

function addAdminPlayerRow(){

  const table = document.querySelector("#adminTable tbody");

  const row = document.createElement("tr");

  row.innerHTML = `

  <td contenteditable="true"></td>

  <td contenteditable="true">0</td>

  <td><button class="btn btn-red remove">REMOVE</button></td>

  `;

  row.querySelector(".remove").onclick = () => {

    row.remove();
    updatePlayerCount();

  };

  table.appendChild(row);

  updatePlayerCount();

}

document.getElementById("addPlayer").onclick = addAdminPlayerRow;

document.getElementById("savePlayers").onclick = savePlayers;

async function savePlayers(){

const pass = await getAdminPassword();
if(!pass) return;

  document.getElementById("savingOverlay").style.display = "flex";

  const players = [];

  document.querySelectorAll("#adminTable tbody tr").forEach(row=>{

    const name = row.cells[0].innerText.trim();
    const skill = parseInt(row.cells[1].innerText.trim());

    if(!name) return;

    players.push({
      name:name,
      skill:skill
    });

  });

  const data = await api({

    action:"savePlayersAdmin",

    password:pass,

    players:players

  });

  document.getElementById("savingOverlay").style.display = "none";

if(!data.ok){

  showModal(data.error, "alert");
  return;

}

// 🔥 ADD THIS
sessionStorage.setItem("adminPass", pass);
updateAdminBar();

showModal("Players saved successfully", "alert");

openAdminTab();

}

async function openHistoryTab(btn){

  showTab("historyTab", btn);

  document.getElementById("historyLoadingOverlay").style.display = "flex";

  const data = await api({
    action:"getHistory"
  });

  if(!data.ok){

    showModal("Could not load history", "alert");
    return;

  }

  renderHistory(data.history);

  setupHistorySorting();
  updateSortIndicators();

  document.getElementById("historyLoadingOverlay").style.display = "none";

}

function renderHistory(history){

const tbody = document.getElementById("historyTableBody");

tbody.innerHTML = "";

if(!history || history.length === 0){
  tbody.innerHTML = `<tr><td colspan="5">No match history yet.</td></tr>`;
  return;
}

/* 🔥 COUNT MATCHUP FREQUENCY */

const counts = {};

history.forEach(h => {

  const red = h.redTeam.split(", ").sort().join(",");
  const blue = h.blueTeam.split(", ").sort().join(",");

  const key1 = red + "|" + blue;
  const key2 = blue + "|" + red;

  if(counts[key1] || counts[key2]){
    counts[key1] = (counts[key1] || counts[key2]) + 1;
  }else{
    counts[key1] = 1;
  }

});

/* 🔥 DEFAULT SORT (NEWEST FIRST) */

/* 🔥 APPLY CURRENT SORT */

history.sort((a,b)=>{

  let valA, valB;

  switch(currentHistorySort.key){

    case "date":
      valA = new Date(a.selectedAt);
      valB = new Date(b.selectedAt);
      break;

    case "mid":
      valA = parseInt(a.MID || 0);
      valB = parseInt(b.MID || 0);
      break;

    case "maker":
      valA = a.matchMaker.toLowerCase();
      valB = b.matchMaker.toLowerCase();
      break;

    case "picked":

      const getCount = (m) => {
        const r = m.redTeam.split(", ").sort().join(",");
        const b = m.blueTeam.split(", ").sort().join(",");
        return counts[r+"|"+b] || counts[b+"|"+r] || 0;
      };

      valA = getCount(a);
      valB = getCount(b);
      break;

    case "gap":
      valA = a.skillGap;
      valB = b.skillGap;
      break;

    default:
      valA = 0;
      valB = 0;
  }

  if(valA < valB) return currentHistorySort.direction === "asc" ? -1 : 1;
  if(valA > valB) return currentHistorySort.direction === "asc" ? 1 : -1;
  return 0;

});

history.forEach(match => {

  const row = document.createElement("tr");

  const key1 = match.redTeam.split(", ").sort().join(",") + "|" + match.blueTeam.split(", ").sort().join(",");
  const key2 = match.blueTeam.split(", ").sort().join(",") + "|" + match.redTeam.split(", ").sort().join(",");

  const count = counts[key1] || counts[key2] || 0;

row.innerHTML = `
  <td>
    <span class="expandIcon">▶</span>
    ${formatDate(match.selectedAt)}
  </td>
  <td>${match.MID ? "MID_" + String(match.MID).replace("MID_","").padStart(4,"0") : "----"}</td>
  <td>${match.matchMaker}</td>
  <td>${count}</td>
  <td>${match.skillGap}</td>
`;

  /* 🔥 DETAIL ROW */

  const detailRow = document.createElement("tr");

  detailRow.className = "historyDetailRow";
  detailRow.style.display = "none";

detailRow.innerHTML = `
  <td colspan="5">

    <div class="matchCard">

      <div class="teamsRow">

        <div class="team red">
          <div class="teamTitle">
            RED TEAM <span class="teamBadge">${match.redSkill}</span>
          </div>

          <div class="teamPlayers">
            ${match.redTeam.split(", ").map(name => {

              const player = allPlayers.find(p => p.name === name);

              return `
                <div class="playerRow">
                  ${name}
                  <span class="skillMedal">${player ? player.skill : ""}</span>
                </div>
              `;

            }).join("")}
          </div>
        </div>

        <div class="vs">VS</div>

        <div class="team blue">
          <div class="teamTitle">
            BLUE TEAM <span class="teamBadge">${match.blueSkill}</span>
          </div>

          <div class="teamPlayers">
            ${match.blueTeam.split(", ").map(name => {

              const player = allPlayers.find(p => p.name === name);

              return `
                <div class="playerRow">
                  ${name}
                  <span class="skillMedal">${player ? player.skill : ""}</span>
                </div>
              `;

            }).join("")}
          </div>
        </div>

      </div>

      <div class="matchFooter">
        <span class="diff diff-${match.skillGap}">
          Difference: ${match.skillGap}
        </span>
      </div>

    </div>

  </td>
`;

  /* 🔥 CLICK TO TOGGLE */

row.onclick = () => {

  const isOpen = detailRow.style.display === "table-row";

  detailRow.style.display = isOpen ? "none" : "table-row";

  const icon = row.querySelector(".expandIcon");

  if(icon){
    icon.innerText = isOpen ? "▶" : "▼";
  }

};

  tbody.appendChild(row);
  tbody.appendChild(detailRow);

});
}

function setupHistorySorting(){

  const headers = document.querySelectorAll("#historyTable th");

  headers.forEach(th => {

    th.onclick = () => {

      const key = th.dataset.sort;

      if(!key) return;

      // 🔥 TOGGLE DIRECTION
      if(currentHistorySort.key === key){
        currentHistorySort.direction =
          currentHistorySort.direction === "asc" ? "desc" : "asc";
      }else{
        currentHistorySort.key = key;
        currentHistorySort.direction = "asc";
      }

      // 🔥 RE-RENDER WITH SORT
      renderHistory([...matchHistory]);

      updateSortIndicators();

    };

  });

}

function updateSortIndicators(){

  const headers = document.querySelectorAll("#historyTable th");

  headers.forEach(th => {

    const key = th.dataset.sort;

    if(!key) return;

th.innerHTML = th.innerText
  .replace(" ↑", "")
  .replace(" ↓", "")
  .replace(" ⇅", "")
  .replace(" ▴▾", "")
  .replace(" ▲", "")
  .replace(" ▼", "");

if(key === currentHistorySort.key){

  const arrow = currentHistorySort.direction === "asc" ? " ▲" : " ▼";

  th.innerHTML = th.innerText + arrow;

} else {

  th.innerHTML = th.innerText + " ▴▾";

}

  });

}

function formatDate(date){

  const d = new Date(date);

  return d.toLocaleString();

}

document.getElementById("clearHistoryBtn").onclick = clearHistory;

async function clearHistory(){

const pass = await getAdminPassword();
if(!pass) return;

  /* SHOW CLEARING OVERLAY */

  document.getElementById("clearHistoryOverlay").style.display = "flex";

  const data = await api({

    action:"clearHistory",

    password:pass

  });

if(!data.ok){

  document.getElementById("clearHistoryOverlay").style.display = "none";

  showModal(data.error, "alert");
  return;

}

// 🔥 ADD THIS
sessionStorage.setItem("adminPass", pass);
updateAdminBar();

/* CHANGE OVERLAY TEXT TO CLEARED */

const overlay = document.getElementById("clearHistoryOverlay");

overlay.querySelector("div:last-child").innerHTML = "CLEARED & SESSION RESET ✓";

/* WAIT THEN RESET UI */

setTimeout(async () => {

  overlay.style.display = "none";

  document.getElementById("historyTableBody").innerHTML = `
  <tr><td colspan="5">No match history yet.</td></tr>
`;

  /* 🔥 RESET GENERATOR STATE */
  resetGeneratedMatchups();
  lastSelectedPlayers = [];
  selectedMatchKey = null;

  /* 🔥 RESET MATCH MAKER */
  document.getElementById("matchMakerSelect").selectedIndex = 0;
  sessionStorage.removeItem("selectedMatchMaker");

  /* 🔥 RESET PLAYER CHECKBOXES (all checked) */
  document.querySelectorAll("#playersCheckboxes input").forEach(cb=>{
    cb.checked = true;
  });

  updateSelectedPlayerCount();

  /* 🔥 FORCE MATCHUP REFRESH */
  await loadInitialData();

  /* RESET TEXT BACK */

  overlay.querySelector("div:last-child").innerHTML = "CLEARING HISTORY<span class='dots'></span>";

}, 1000);

}

function startMatchAutoRefresh(){

  setInterval(async ()=>{

    try{

      const data = await api({
        action:"getInitialData"
      });

      if(data.ok){

        renderMatchup(data.currentMatchup);

      }

    }catch(e){

      console.log("Auto refresh error");

    }

  },10000);

}

function generateMatchupsLocal(selectedPlayers, filterGap){

  const players = allPlayers.filter(p => selectedPlayers.includes(p.name));

  const size = Math.floor(players.length / 2);

const combos = getCombinationsLocal(players, size);

const results = [];

const seen = new Set();

combos.forEach(red => {

const blue = players.filter(p => !red.includes(p));

const redSkill = red.reduce((s,p)=>s+p.skill,0);
const blueSkill = blue.reduce((s,p)=>s+p.skill,0);

const gap = Math.abs(redSkill - blueSkill);

/* Hide matchups with skill gap greater than 4 */

if(gap > 4) return;

/* Prevent mirrored duplicates */

const redNames = red.map(p=>p.name).sort().join(",");
const blueNames = blue.map(p=>p.name).sort().join(",");

const key1 = redNames + "|" + blueNames;
const key2 = blueNames + "|" + redNames;

if(seen.has(key1) || seen.has(key2)) return;

seen.add(key1);

/* CALCULATE PICK COUNT FROM HISTORY */

const redNamesSorted = red.map(p=>p.name).sort().join(",");
const blueNamesSorted = blue.map(p=>p.name).sort().join(",");

let pickCount = 0;

matchHistory.forEach(h=>{

  const hRed = h.redTeam.split(", ").sort().join(",");
  const hBlue = h.blueTeam.split(", ").sort().join(",");

  if(
    (hRed === redNamesSorted && hBlue === blueNamesSorted) ||
    (hRed === blueNamesSorted && hBlue === redNamesSorted)
  ){
    pickCount++;
  }

});

results.push({
  redTeam:red,
  blueTeam:blue,
  redSkill:redSkill,
  blueSkill:blueSkill,
  skillGap:gap,
  pickCount:pickCount
});

  });

  return results;

}

function getCombinationsLocal(arr,size){

  const result = [];

  function helper(start,combo){

    if(combo.length === size){
      result.push([...combo]);
      return;
    }

    for(let i=start;i<arr.length;i++){

      combo.push(arr[i]);
      helper(i+1,combo);
      combo.pop();

    }

  }

  helper(0,[]);
  return result;

}

function applyGapFilter(){

  const filter = document.querySelector('input[name="gapFilter"]:checked').value;

  let filtered = lastGeneratedMatchups;

  if(filter !== "all"){

    const gapValue = Number(filter);

    filtered = lastGeneratedMatchups.filter(m => m.skillGap === gapValue);

  }

/* 🔥 BLITZ FILTER (ONLY SHOW ADVANTAGED SMALL TEAM) */

if(blitzEnabled){

  filtered = filtered.filter(m => {

    const small =
      m.redTeam.length < m.blueTeam.length ? m.redTeam : m.blueTeam;

    const large =
      m.redTeam.length > m.blueTeam.length ? m.redTeam : m.blueTeam;

    /* if equal teams, ignore */
    if(m.redTeam.length === m.blueTeam.length) return false;

    const smallSkill = small.reduce((s,p)=>s+p.skill,0);
    const largeSkill = large.reduce((s,p)=>s+p.skill,0);

    return smallSkill > largeSkill;

  });

}

/* Restore normal sorting when BLITZ is OFF */

if(!blitzEnabled){

  filtered.sort((a,b)=>a.skillGap - b.skillGap);

}  
  
  renderGeneratedMatchups(filtered);

}

function updateSelectedPlayerCount(){

  const count = document.querySelectorAll("#playersCheckboxes input:checked").length;

  document.getElementById("selectedPlayerCount").innerText = count;

}

function updateGapCounts(){

  const radios = document.querySelectorAll('input[name="gapFilter"]');

// 🔥 USE FILTERED MATCHUPS IF BLITZ IS ENABLED
let source = lastGeneratedMatchups;

if(blitzEnabled){

  source = lastGeneratedMatchups.filter(m => {

    const small =
      m.redTeam.length < m.blueTeam.length ? m.redTeam : m.blueTeam;

    const large =
      m.redTeam.length > m.blueTeam.length ? m.redTeam : m.blueTeam;

    if(m.redTeam.length === m.blueTeam.length) return false;

    const smallSkill = small.reduce((s,p)=>s+p.skill,0);
    const largeSkill = large.reduce((s,p)=>s+p.skill,0);

    return smallSkill > largeSkill;

  });

}

const counts = {
  all: source.length,
  0: 0,
  1: 0,
  2: 0,
  3: 0,
  4: 0
};

source.forEach(m=>{
  if(counts.hasOwnProperty(m.skillGap)){
    counts[m.skillGap]++;
  }
});

  radios.forEach(radio=>{

    const value = radio.value;

    const label = radio.parentElement;

if(value === "all"){

  label.childNodes[1].nodeValue = ` All options [${counts.all}]`;

  const isDisabled = counts.all === 0;

  radio.disabled = isDisabled;

  if(isDisabled){
    label.classList.add("disabled");
  }else{
    label.classList.remove("disabled");
  }

}else{

  label.childNodes[1].nodeValue = ` Difference ${value} [${counts[value]}]`;

  const isDisabled = counts[value] === 0;

  radio.disabled = isDisabled;

  if(isDisabled){
    label.classList.add("disabled");
  }else{
    label.classList.remove("disabled");
  }

}

  });

}

function resetGeneratedMatchups(){

  // Clear UI
  document.getElementById("generatedMatchups").innerHTML = "";

  // Reset stored data
  lastGeneratedMatchups = [];
  selectedMatchKey = null;

  // Disable radio buttons again
  document.querySelectorAll('input[name="gapFilter"]').forEach(r=>{
    r.disabled = true;
    r.checked = r.value === "all"; // reset to default
    r.parentElement.classList.add("disabled");
  });

/* 🔥 RESET + HIDE BLITZ */

const blitzToggle = document.getElementById("blitzToggle");
const blitzContainer = document.querySelector(".blitzToggle");

if(blitzToggle && blitzContainer){

  blitzToggle.checked = false;
  blitzEnabled = false;

  blitzContainer.classList.remove("show");

  setTimeout(()=>{
    blitzContainer.style.display = "none";
  },300);

}

}

// 🔥 LOAD CURRENT SESSION MAPS
async function loadSessionMaps(){

const overlay = document.getElementById("mapListLoadingOverlay");

if(overlay){
  overlay.style.display = "flex";
}

  const sessionData = await api({
    action:"getSessionMaps"
  });

  if(!sessionData.ok){
    console.log("Failed loading session maps");
    return;
  }

  const initialData = await api({
  action:"getInitialData"
});

if(initialData.ok && initialData.mapList){
  renderMasterMapList(initialData.mapList);
}

// 🔥 NOW render session AFTER master exists
renderSessionMaps(sessionData);

  // 🔥 APPLY HIGHLIGHT AFTER LOAD
setTimeout(()=>{
  handleSessionHighlightUpdate();
}, 100);

// 🔥 HIDE LOADER
if(overlay){
  overlay.style.display = "none";
}

}

// 🔥 RENDER SESSION MAPS
function renderSessionMaps(data){

  // Keep legacy hidden lists updated for existing highlight logic
  renderModeSessionList("eliminationSessionList", data.elimination || [], "elimination");
  renderModeSessionList("blitzSessionList", data.blitz || [], "blitz");
  renderModeSessionList("ctfSessionList", data.ctf || [], "ctf");

  // Render new visible single-card layout
  renderUnifiedSessionMaps(data);

}

function renderUnifiedSessionMaps(data){

  const container = document.getElementById("sessionMapsUnifiedRows");

  if(!container) return;

  container.innerHTML = "";

  const sections = [
    {
      label: "Elimination",
      mode: "elimination",
      headerClass: "eliminationHeader",
      maps: data.elimination || []
    },
    {
      label: "Blitz",
      mode: "blitz",
      headerClass: "blitzHeader",
      maps: data.blitz || []
    },
    {
      label: "CTF",
      mode: "ctf",
      headerClass: "ctfHeader",
      maps: data.ctf || []
    }
  ];

  sections.forEach((section, sectionIndex) => {

    const header = document.createElement("div");
    header.className = `sessionUnifiedHeader ${section.headerClass}`;

    if(sectionIndex === 0){
      header.classList.add("firstHeader");
    }

    header.textContent = section.label;
    container.appendChild(header);

    section.maps.forEach((mapName, index) => {

      if(!mapName) return;

     const row = document.createElement("div");
     row.className = "mapMasterRow sessionUnifiedRow";
      
     const masterContainer = document.getElementById(section.mode + "MasterList");

let masterIndex = "";

if(masterContainer){
  const masterRows = Array.from(masterContainer.querySelectorAll(".mapMasterRow"));

  const foundIndex = masterRows.findIndex(r => r.innerText.trim() === mapName);

  if(foundIndex !== -1){
    masterIndex = foundIndex + 1;
  }
}

row.setAttribute("data-index", masterIndex);

     row.innerHTML = `
       <span class="sessionUnifiedName">${mapName}</span>
       <button class="mapDeleteMini">✕</button>
     `;

row.querySelector(".mapDeleteMini").onclick = async () => {

  if(!isAdminUnlocked()){
  showModal("Unlock admin mode first.", "alert");
  return;
}

  const pass = await getAdminPassword();
  if(!pass) return;

  const res = await api({
    action:"deleteSessionMap",
    mode: section.mode,
    slot: index + 1,
    password: pass
  });

  if(!res.ok){
    showModal(res.error || "Delete failed", "alert");
    return;
  }

  // 🔥 ADD THIS
  sessionStorage.setItem("adminPass", pass);
  updateAdminBar();

  renderSessionMaps(res);

  setTimeout(()=>{
    handleSessionHighlightUpdate();
  }, 50);

};
      
      container.appendChild(row);

    });

  });

}

// 🔥 RENDER ONE MODE

function renderModeSessionList(containerId, maps, mode){

  const container = document.getElementById(containerId);

  if(!container) return;

  container.innerHTML = "";

  // 🔥 Create ONE compact card
  const card = document.createElement("div");
  card.className = "mapSessionCompactCard";

  maps.forEach((mapName, index) => {

    if(!mapName) return;

    const row = document.createElement("div");
    row.className = "mapSessionCompactRow";

    const masterContainer = document.getElementById(mode + "MasterList");

let masterIndex = "";

if(masterContainer){
  const masterRows = Array.from(masterContainer.querySelectorAll(".mapMasterRow"));
  const foundIndex = masterRows.findIndex(row => row.innerText.trim() === mapName);
  
  if(foundIndex !== -1){
    masterIndex = foundIndex + 1;
  }
}
    
    row.innerHTML = `
      <span class="mapSessionName" data-index="${masterIndex}">
      ${mapName}
      </span>
      <button class="mapDeleteMini">✕</button>
    `;

row.querySelector(".mapDeleteMini").onclick = async () => {

  if(!isAdminUnlocked()){
  showModal("Unlock admin mode first.", "alert");
  return;
}

  const pass = await getAdminPassword();
  if(!pass) return;

  const res = await api({
    action:"deleteSessionMap",
    mode: mode,
    slot: index + 1,
    password: pass
  });

  if(!res.ok){
    showModal(res.error || "Delete failed", "alert");
    return;
  }

  // 🔥 ADD THIS
  sessionStorage.setItem("adminPass", pass);
  updateAdminBar();

  renderSessionMaps(res);

  setTimeout(()=>{
    handleSessionHighlightUpdate();
  }, 50);

};
    
    card.appendChild(row);

  });

  // If empty
  if(card.children.length === 0){
    card.innerHTML = `<div class="mapSessionEmpty">—</div>`;
  }

  container.appendChild(card);

}

// 🔥 RENDER FULL MASTER MAP LIST
function renderMasterMapList(mapList){

  renderMasterModeList("eliminationMasterList", mapList.elimination || []);
  renderMasterModeList("blitzMasterList", mapList.blitz || []);
  renderMasterModeList("ctfMasterList", mapList.ctf || []);

}

// 🔥 RENDER ONE MASTER MODE COLUMN
function renderMasterModeList(containerId, maps){

  const container = document.getElementById(containerId);

  if(!container) return;

  container.innerHTML = "";

  maps.forEach((mapName, index) => {

    const row = document.createElement("div");
    row.className = "mapMasterRow";
    row.textContent = mapName;
    row.setAttribute("data-index", index + 1);

    container.appendChild(row);

  });

}

// 🔥 BUTTON ACTIONS
function setupMapListButtons(){

  const generateBtn = document.getElementById("generateSessionMapsBtn");
  const saveBtn = document.getElementById("saveSessionProgressBtn");
  const copyBtn = document.getElementById("copySessionMapsBtn");

if(generateBtn){
  generateBtn.onclick = async () => {

    if(!isAdminUnlocked()){
  showModal("Unlock admin mode first.", "alert");
  return;
}

const pass = await getAdminPassword();
if(!pass) return;

    const res = await api({
      action:"generateSessionMaps",
      password: pass
    });

    if(!res.ok){
      showModal(res.error || "Generate failed", "alert");
      return;
    }

    sessionStorage.setItem("adminPass", pass);
    updateAdminBar();

renderSessionMaps(res);

/* 🔥 RE-RUN HIGHLIGHT AFTER GENERATE */
setTimeout(()=>{
  handleSessionHighlightUpdate();
}, 50);

  };
}

if(saveBtn){
saveBtn.onclick = async () => {

  if(!isAdminUnlocked()){
  showModal("Unlock admin mode first.", "alert");
  return;
}

  const pass = await getAdminPassword();
  if(!pass) return;

  const res = await api({
    action:"saveSessionProgress",
    password: pass
  });

  if(!res.ok){
    showModal(res.error || "Save failed", "alert");
    return;
  }

  // 🔥 ADD THIS
  sessionStorage.setItem("adminPass", pass);
  updateAdminBar();

  showModal("Session progress saved", "alert");

  handleSessionHighlightUpdate();

};
}

if(copyBtn){
  copyBtn.onclick = async () => {

const sessionCard = document.getElementById("sessionMapsContainer");

if(!sessionCard){
  showModal("Session maps not found", "alert");
  return;
}

// 🔥 temporarily hide delete buttons
const deleteBtns = sessionCard.querySelectorAll(".mapDeleteMini");
deleteBtns.forEach(btn => btn.style.display = "none");

// 🔥 wrap in temp container for padding
const wrapper = document.createElement("div");
wrapper.style.padding = "30px";
wrapper.style.background = "#000";

/* 🔥 FIX WIDTH */
wrapper.style.width = sessionCard.offsetWidth + "px";
wrapper.style.display = "block";

sessionCard.parentNode.insertBefore(wrapper, sessionCard);
wrapper.appendChild(sessionCard);

const canvas = await html2canvas(wrapper, {
  backgroundColor: null,
  scale: 2
});

// 🔥 move card back to original place
wrapper.parentNode.insertBefore(sessionCard, wrapper);
wrapper.remove();

    canvas.toBlob(async (blob) => {

    // 🔥 restore delete buttons after capture
    deleteBtns.forEach(btn => btn.style.display = "flex");

      try{
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob })
        ]);

        showModal("Session maps copied as image ✅", "alert");

      }catch(err){
        showModal("Copy image failed. Your browser may not support it.", "alert");
      }

    });

  };
}

}

function handleSessionHighlightUpdate(){

  processMode("elimination", "eliminationSessionList", "eliminationMasterList");
  processMode("blitz", "blitzSessionList", "blitzMasterList");
  processMode("ctf", "ctfSessionList", "ctfMasterList");

}

function processMode(mode, sessionId, masterId){

  const sessionContainer = document.getElementById(sessionId);
  const masterContainer = document.getElementById(masterId);

  if(!sessionContainer || !masterContainer) return;

  // 🔥 get session maps
const sessionMaps = Array.from(
  sessionContainer.querySelectorAll(".mapSessionName")
).map(el => el.innerText.trim());

/* 🔥 ALWAYS CLEAR OLD HIGHLIGHTS FIRST */
masterContainer.querySelectorAll(".mapMasterRow").forEach(row=>{
  row.classList.remove("lastPlayedMap");
});

/* 🔥 IF NO SESSION MAPS → STOP HERE (NO HIGHLIGHT) */
if(sessionMaps.length === 0) return;

  const firstMap = sessionMaps[0];

  // 🔥 get full map list
  const masterMaps = Array.from(
    masterContainer.querySelectorAll(".mapMasterRow")
  ).map(el => el.innerText.trim());

  const index = masterMaps.indexOf(firstMap);

  if(index === -1){
    return;
  }

  // 🔥 get previous (with wrap-around)
  const prevIndex = (index - 1 + masterMaps.length) % masterMaps.length;

  const prevMap = masterMaps[prevIndex];

  // 🔥 REMOVE OLD HIGHLIGHTS
masterContainer.querySelectorAll(".mapMasterRow").forEach(row=>{
  row.classList.remove("lastPlayedMap");
});

// 🔥 APPLY NEW HIGHLIGHT
const rows = masterContainer.querySelectorAll(".mapMasterRow");

rows.forEach(row => {
  if(row.innerText.trim() === prevMap){
    row.classList.add("lastPlayedMap");
  }
});

}
