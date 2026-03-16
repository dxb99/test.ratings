const API_URL = "https://script.google.com/macros/s/AKfycbzIyBeXAVeSLtxW8jR9OnQL_Iz6cawGiaZSlkoZ2hTYy5dwo-0n_GH6F15H7tfXojIl/exec";

let allPlayers = [];
let adminLoaded = false;

window.addEventListener("load", async () => {

  try {

    await loadInitialData();

    document.getElementById("loadingScreen").style.display = "none";
    document.getElementById("app").classList.remove("hidden");

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

  renderMatchup(data.currentMatchup);

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

    el.innerHTML="NO MATCHUP YET<br><br>CLICK GENERATOR TO GET STARTED";
    countdown.innerHTML="";
    return;

  }

  el.innerHTML=`

  MATCH MAKER: ${match.matchMaker}<br><br>

  RED TEAM: ${match.redTeam.join(", ")}<br>

  BLUE TEAM: ${match.blueTeam.join(", ")}

  `;

  const expiry=new Date(match.expiresAt);

  startCountdown(expiry);

}

document.getElementById("generateButton").onclick = generateMatchups;

async function generateMatchups(){

  const selectedPlayers=[];

  document.querySelectorAll("#playersCheckboxes input:checked").forEach(x=>{
    selectedPlayers.push(x.value);
  });

  if(selectedPlayers.length < 2){
    alert("Select at least 2 players.");
    return;
  }

  const gap = document.querySelector('input[name="gapFilter"]:checked').value;

  const data = await api({
    action:"generateMatchups",
    selectedPlayers:selectedPlayers,
    filterGap:gap
  });

  if(!data.ok){
    alert(data.error || "Could not generate matchups.");
    return;
  }

  renderGeneratedMatchups(data.matchups);

}

function renderGeneratedMatchups(matchups){

  const container=document.getElementById("generatedMatchups");

  container.innerHTML="";

  matchups.forEach(m=>{

    const div=document.createElement("div");

    div.className="matchOption";

div.innerHTML=`

<div class="teamRow">

  <div class="redTeam">

    <strong>RED TEAM</strong><br><br>

    ${m.redTeam.map(p=>p.name).join("<br>")}

    <br><br>

    <small>
    Players: ${m.redTeam.length}<br>
    Skill Total: ${m.redSkill}
    </small>

  </div>

  <div class="vs">VS</div>

  <div class="blueTeam">

    <strong>BLUE TEAM</strong><br><br>

    ${m.blueTeam.map(p=>p.name).join("<br>")}

    <br><br>

    <small>
    Players: ${m.blueTeam.length}<br>
    Skill Total: ${m.blueSkill}
    </small>

  </div>

</div>

<div class="badges">

  <span class="badge gap-${m.skillGap}">
  Skill Gap ${m.skillGap}
  </span>

  <span class="badge picks">
  Picked ${m.pickCount} times
  </span>

</div>

<button class="selectMatch">SELECT MATCHUP</button>

`;

div.querySelector(".selectMatch").onclick = () => selectMatchup(m);

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

  const data = await api({

    action:"verifyOrCreatePinAndSave",

    matchMaker:maker,

    pin:pin,

    redTeam:match.redTeam.map(p=>p.name),

    blueTeam:match.blueTeam.map(p=>p.name)

  });

  if(!data.ok){

    alert(data.error);

    return;

  }

  alert("MATCHUP SAVED");

  loadInitialData();

}

function startCountdown(expiry){

  const el=document.getElementById("matchCountdown");

  setInterval(()=>{

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

  players.forEach(p=>{

    const opt=document.createElement("option");

    opt.value=p.name;
    opt.innerText=p.name;

    maker.appendChild(opt);

    const div=document.createElement("div");

    div.innerHTML=`
    <label>
    <input type="checkbox" checked value="${p.name}">
    ${p.name} (${p.skill})
    </label>
    `;

    list.appendChild(div);

  });

}

async function openAdminTab(btn){

  showTab("adminTab", btn);

  const data = await api({
    action:"getPlayersAdmin"
  });

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

    <td><button class="admin-inline-btn remove">Remove</button></td>

    <td><button class="admin-inline-btn resetPin">RESET PIN</button></td>

    <td>${p.pinStatus}</td>

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

  <td><button class="admin-inline-btn remove">Remove</button></td>

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

  if(!data.ok){

    alert(data.error);
    return;

  }

  alert("Players saved successfully");

  openAdminTab();

}

async function openHistoryTab(btn){

  showTab("historyTab", btn);

  const data = await api({
    action:"getMatchHistory"
  });

  if(!data.ok){

    alert("Could not load history");
    return;

  }

  renderHistory(data.history);

}
