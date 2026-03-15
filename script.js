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
  <strong>RED TEAM</strong><br>
  ${m.redTeam.map(p=>p.name).join(", ")}
  </div>

  <div class="vs">VS</div>

  <div class="blueTeam">
  <strong>BLUE TEAM</strong><br>
  ${m.blueTeam.map(p=>p.name).join(", ")}
  </div>

</div>

<div class="badges">

  <span class="badge">Gap ${m.skillGap}</span>

  <span class="badge">${m.pickCount} Picks</span>

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
