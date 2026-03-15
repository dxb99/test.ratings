
let API_URL = "PASTE_YOUR_APPS_SCRIPT_URL_HERE";

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
