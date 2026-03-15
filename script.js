
let API_URL = "https://script.google.com/macros/s/AKfycbzIyBeXAVeSLtxW8jR9OnQL_Iz6cawGiaZSlkoZ2hTYy5dwo-0n_GH6F15H7tfXojIl/exec";

window.onload = function(){

setTimeout(()=>{

document.getElementById("loadingScreen").style.display="none";

document.getElementById("app").classList.remove("hidden");

loadInitialData();

},2000);

}

function showTab(tab){

document.querySelectorAll(".tabContent").forEach(x=>x.classList.remove("active"));

document.querySelectorAll(".tabButton").forEach(x=>x.classList.remove("active"));

document.getElementById(tab).classList.add("active");

event.target.classList.add("active");

}

async function api(data){

let res = await fetch(API_URL,{

method:"POST",

body:JSON.stringify(data)

});

return await res.json();

}

async function loadInitialData(){

let data = await api({

action:"getInitialData"

});

populatePlayers(data.players);

renderMatchup(data.currentMatchup);

}

function populatePlayers(players){

let select = document.getElementById("matchMakerSelect");

let list = document.getElementById("playersCheckboxes");

select.innerHTML="";

list.innerHTML="";

players.forEach(p=>{

let opt=document.createElement("option");

opt.value=p.name;

opt.innerText=p.name;

select.appendChild(opt);

let div=document.createElement("div");

div.innerHTML=`<label>

<input type="checkbox" checked value="${p.name}">

${p.name} (${p.skill})

</label>`;

list.appendChild(div);

});

}

document.getElementById("generateButton").onclick = async function(){

let selectedPlayers=[];

document.querySelectorAll("#playersCheckboxes input:checked").forEach(x=>{
selectedPlayers.push(x.value);
});

let gap=document.querySelector('input[name="gapFilter"]:checked').value;

let data=await api({

action:"generateMatchups",
selectedPlayers:selectedPlayers,
filterGap:gap

});

renderGeneratedMatchups(data.matchups);

};

function renderMatchup(match){

let el=document.getElementById("matchupContent");

if(!match){

el.innerHTML="NO MATCHUP YET<br><br>CLICK GENERATOR TO GET STARTED";

return;

}

el.innerHTML=`

MATCH MAKER: ${match.matchMaker}<br><br>

RED TEAM: ${match.redTeam.join(", ")}<br>

BLUE TEAM: ${match.blueTeam.join(", ")}<br><br>

Skill Gap: ${match.skillGap}

`;

}

async function selectMatchup(match){

let maker=document.getElementById("matchMakerSelect").value;

let pin=prompt("Enter PIN or create one:");

if(!pin)return;

let data=await api({

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

alert("MATCHUP SAVED!");

loadInitialData();

}

function renderGeneratedMatchups(matchups){

let container=document.getElementById("generatedMatchups");

container.innerHTML="";

matchups.forEach(m=>{

let div=document.createElement("div");

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

<span class="badge gap">Gap ${m.skillGap}</span>

<span class="badge picks">${m.pickCount} Picks</span>

</div>

<button class="selectMatch">SELECT</button>

`;

div.querySelector(".selectMatch").onclick=()=>selectMatchup(m);

container.appendChild(div);

});

}

document.getElementById("historySort").onchange=loadHistory;

document.getElementById("clearHistory").onclick=clearHistory;

async function loadHistory(){

let sort=document.getElementById("historySort").value;

let data=await api({

action:"getHistory",
sortBy:sort

});

let list=document.getElementById("historyList");

list.innerHTML="";

data.history.forEach(h=>{

let div=document.createElement("div");

div.className="historyItem";

div.innerHTML=`

<strong>${h.matchMaker}</strong>

<br>

RED: ${h.redTeam}

<br>

BLUE: ${h.blueTeam}

<br>

Gap: ${h.skillGap}

<br>

${new Date(h.selectedAt).toLocaleString()}

<hr>

`;

list.appendChild(div);

});

}

async function clearHistory(){

let pass=prompt("Enter Admin Password");

if(!pass)return;

let data=await api({

action:"clearHistory",

password:pass

});

alert(data.message);

loadHistory();

}

document.getElementById("addPlayer").onclick=function(){

let table=document.querySelector("#adminTable tbody");

let row=document.createElement("tr");

row.innerHTML=`

<td contenteditable="true"></td>

<td contenteditable="true"></td>

<td><button class="removeRow">Remove</button></td>

<td></td>

<td>NOT CREATED</td>

`;

row.querySelector(".removeRow").onclick=()=>row.remove();

table.appendChild(row);

};
