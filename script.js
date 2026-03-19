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

let blitzEnabled = false;

window.addEventListener("load", async () => {

  sessionStorage.removeItem("selectedMatchMaker");

  try {

    await loadInitialData();

    document.getElementById("loadingScreen").style.display = "none";
    document.getElementById("app").classList.remove("hidden");

    document.querySelectorAll('input[name="gapFilter"]').forEach(radio => {
      radio.addEventListener("change", applyGapFilter);
    });

const blitzToggle = document.getElementById("blitzToggle");

if(blitzToggle){

  blitzToggle.addEventListener("change", () => {

    blitzEnabled = blitzToggle.checked;

    applyGapFilter();

  });

}

    startMatchAutoRefresh();

  } catch (err) {

    console.error(err);
    alert("Startup error. Open console (F12).");

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

if(!match){

  el.innerHTML=`

  <div class="matchCard">
    <div class="matchHeader">
      NO CURRENT MATCHUP
    </div>
  </div>

  `;

  countdown.innerHTML="";
  return;

}

el.innerHTML=`

<div class="matchCard">

  <div class="matchHeader">
    Match Maker: <strong>${match.matchMaker}</strong>
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

  el.innerHTML=`

  <div class="matchCard">
    <div class="matchHeader">
      NO CURRENT MATCHUP
    </div>
  </div>

  `;

  countdown.innerHTML="";
  return;

}

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
  alert("Select Match Maker first.");
  return;
}

  document.querySelectorAll("#playersCheckboxes input:checked").forEach(x=>{
    selectedPlayers.push(x.value);
  });

  document.getElementById("generatingOverlay").style.display = "flex";
  
  if(selectedPlayers.length < 2){
    alert("Select at least 2 players.");
    return;
  }

  const gap = document.querySelector('input[name="gapFilter"]:checked').value;

const matchups = generateMatchupsLocal(selectedPlayers, gap);

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
Picked ${m.pickCount} times
</span>

<button class="selectMatch">SELECT MATCHUP</button>

</div>

</div>

`;
    
const btn = div.querySelector(".selectMatch");

const key = m.redTeam.map(p=>p.name).join("|") + "-" + m.blueTeam.map(p=>p.name).join("|");

if(selectedMatchKey === key){
  btn.classList.add("selected");
  btn.innerText = "SELECTED";
}

btn.onclick = () => {

  const maker = document.getElementById("matchMakerSelect").value;

  if(!maker){
    alert("Select Match Maker first.");
    return;
  }

  selectedMatchKey = key;

  document.querySelectorAll(".selectMatch").forEach(b=>{
    b.classList.remove("selected");
    b.innerText = "SELECT MATCHUP";
  });

  btn.classList.add("selected");
  btn.innerText = "SELECTED";

  selectMatchup(m);

};

container.appendChild(div);

  });

}

async function selectMatchup(match){

  const maker=document.getElementById("matchMakerSelect").value;

  if(!maker){
    alert("Select Match Maker first.");
    return;
  }

  const pin=prompt("Enter PIN (or create one if first time)");

  if(!pin) return;

  document.getElementById("savingMatchOverlay").style.display = "flex";
  
  const data = await api({

  action:"verifyOrCreatePinAndSave",

  matchMaker:maker,

  pin:pin,

  redTeam:match.redTeam.map(p=>p.name),

  blueTeam:match.blueTeam.map(p=>p.name)

  });

  if(!data.ok){

  document.getElementById("savingMatchOverlay").style.display = "none";

  alert(data.error);

  return;

}

/* CHANGE OVERLAY TEXT TO SAVED */

const overlay = document.getElementById("savingMatchOverlay");

overlay.querySelector(".generatingText").innerHTML = "SAVED ✓";

/* WAIT 1 SECOND THEN REDIRECT */

setTimeout(() => {

  overlay.style.display = "none";

  const matchupBtn = document.querySelector('.tabButton[onclick*="matchupTab"]');
  showTab("matchupTab", matchupBtn);

  loadInitialData();

  /* RESET TEXT BACK TO SAVING FOR NEXT TIME */

  overlay.querySelector(".generatingText").innerHTML = "SAVING<span class='dots'></span>";

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

      el.innerHTML="MATCHUP EXPIRED";

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
  const list = document.getElementById("playersCheckboxes");

  maker.innerHTML="";
  list.innerHTML="";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select Match Maker";
  placeholder.selected = true;
  placeholder.disabled = true;
  maker.appendChild(placeholder);

players.forEach(p=>{

  const opt=document.createElement("option");

  opt.value=p.name;
  opt.innerText=p.name;

  maker.appendChild(opt);

  const div=document.createElement("div");

  div.innerHTML=`
  <label>
  <input type="checkbox" checked value="${p.name}">
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

  });

  list.appendChild(div);

});

/* 🔥 ADD THIS BLOCK */

const savedMaker = sessionStorage.getItem("selectedMatchMaker");

if(savedMaker){
  maker.value = savedMaker;
}

/* 🔥 AND THIS BLOCK */

maker.onchange = function(){
  sessionStorage.setItem("selectedMatchMaker", this.value);
};

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
    alert("Failed loading players");
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

    <td><button class="btn btn-orange resetPin">RESET PIN</button></td>

    <td class="${p.pinStatus === 'ACTIVE' ? 'status-active' : ''}">${p.pinStatus}</td>

    `;

    row.querySelector(".remove").onclick=()=>{

      row.remove();
      updatePlayerCount();

    };

    row.querySelector(".resetPin").onclick=()=>{

      resetPin(p.name);

    };

    table.appendChild(row);

  });

  updatePlayerCount();

}

async function resetPin(player){

  const pass = prompt("Enter Admin Password");

  if(!pass) return;

  const data = await api({

    action:"resetPlayerPin",

    playerName:player,

    password:pass

  });

  if(!data.ok){

    alert(data.error);
    return;

  }

  alert("PIN reset");

  openAdminTab();

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

  <td></td>

  <td>NOT CREATED</td>

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

  const pass = prompt("Enter Admin Password");

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

    alert(data.error);
    return;

  }

  alert("Players saved successfully");

  openAdminTab();

}

async function openHistoryTab(btn){

  showTab("historyTab", btn);

  document.getElementById("historyLoadingOverlay").style.display = "flex";

  const data = await api({
    action:"getHistory"
  });

  if(!data.ok){

    alert("Could not load history");
    return;

  }

  renderHistory(data.history);

  document.getElementById("historyLoadingOverlay").style.display = "none";

}

function renderHistory(history){

  const container = document.getElementById("historyList");

  container.innerHTML = "";

  const sortType = document.getElementById("historySort").value;

if(sortType === "maker"){

  history.sort((a,b)=>a.matchMaker.localeCompare(b.matchMaker));

}else{

  history.sort((a,b)=>new Date(b.selectedAt) - new Date(a.selectedAt));

}

  if(!history || history.length === 0){

    container.innerHTML = "No match history yet.";

    return;

  }

  history.forEach(match=>{

    const div = document.createElement("div");

    div.className = "historyItem";

div.innerHTML = `

<div class="historyLine1">
${formatDate(match.selectedAt)} | Match Maker: ${match.matchMaker} | Difference: ${match.skillGap}
</div>

<div class="historyLine2">
<span class="skillMedal">${match.redSkill}</span>
<span class="historyRedLabel">RED TEAM:</span>
${match.redTeam}
</div>

<div class="historyLine3">
<span class="skillMedal">${match.blueSkill}</span>
<span class="historyBlueLabel">BLUE TEAM:</span>
${match.blueTeam}
</div>

`;

    container.appendChild(div);

  });

}

function formatDate(date){

  const d = new Date(date);

  return d.toLocaleString();

}

document.getElementById("clearHistoryBtn").onclick = clearHistory;

async function clearHistory(){

  const pass = prompt("Enter Admin Password");

  if(!pass) return;

  /* SHOW CLEARING OVERLAY */

  document.getElementById("clearHistoryOverlay").style.display = "flex";

  const data = await api({

    action:"clearHistory",

    password:pass

  });

if(!data.ok){

  document.getElementById("clearHistoryOverlay").style.display = "none";

  alert(data.error);
  return;

}

/* CHANGE OVERLAY TEXT TO CLEARED */

const overlay = document.getElementById("clearHistoryOverlay");

overlay.querySelector("div:last-child").innerHTML = "CLEARED ✓";

/* WAIT THEN RESET UI */

setTimeout(() => {

  overlay.style.display = "none";

  document.getElementById("historyList").innerHTML = "No match history yet.";

  /* RESET TEXT BACK */

  overlay.querySelector("div:last-child").innerHTML = "CLEARING HISTORY<span class='dots'></span>";

}, 1000);

}

document.getElementById("historySort").onchange = function(){

  openHistoryTab();

};

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

  /* BLITZ ADVANTAGE SORT */

  if(blitzEnabled && filtered.length){

    const totalPlayers =
      filtered[0].redTeam.length + filtered[0].blueTeam.length;

    /* Only apply BLITZ if uneven players */

    if(totalPlayers % 2 !== 0){

      filtered.sort((a,b)=>{

        const aSmall =
          a.redTeam.length < a.blueTeam.length ? a.redTeam : a.blueTeam;

        const aLarge =
          a.redTeam.length > a.blueTeam.length ? a.redTeam : a.blueTeam;

        const bSmall =
          b.redTeam.length < b.blueTeam.length ? b.redTeam : b.blueTeam;

        const bLarge =
          b.redTeam.length > b.blueTeam.length ? b.redTeam : b.blueTeam;

        const aSmallSkill =
          aSmall.reduce((s,p)=>s+p.skill,0);

        const aLargeSkill =
          aLarge.reduce((s,p)=>s+p.skill,0);

        const bSmallSkill =
          bSmall.reduce((s,p)=>s+p.skill,0);

        const bLargeSkill =
          bLarge.reduce((s,p)=>s+p.skill,0);

        const aType =
          aSmallSkill > aLargeSkill ? 0 :
          aSmallSkill === aLargeSkill ? 1 : 2;

        const bType =
          bSmallSkill > bLargeSkill ? 0 :
          bSmallSkill === bLargeSkill ? 1 : 2;

        return aType - bType;

      });

    }

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

  const blitzToggle = document.getElementById("blitzToggle");
  const blitzContainer = document.querySelector(".blitzToggle");

  if(blitzToggle){

    if(count % 2 === 0){

      blitzToggle.checked = false;
      blitzToggle.disabled = true;
      blitzEnabled = false;

      if(blitzContainer){
        blitzContainer.classList.add("disabled");
      }

    }else{

      blitzToggle.disabled = false;

      if(blitzContainer){
        blitzContainer.classList.remove("disabled");
      }

    }

  }

}

function updateGapCounts(){

  const radios = document.querySelectorAll('input[name="gapFilter"]');

  const counts = {
    all: lastGeneratedMatchups.length,
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 0
  };

  lastGeneratedMatchups.forEach(m=>{
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

}
