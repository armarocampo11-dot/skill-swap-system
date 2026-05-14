import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

function completion(me) {
  const fields = [me.name,me.course,me.yearLevel,me.studentId,me.section,me.bio,me.offeredSkills,me.wantedSkills,me.transactionPreference];
  return Math.round((fields.filter(v => v && String(v).trim() !== "").length / fields.length) * 100);
}
function rank(xp) { if (xp >= 200) return "Skill Master"; if (xp >= 120) return "Trusted Swapper"; if (xp >= 60) return "Active Learner"; if (xp >= 20) return "Rising Student"; return "Starter"; }
function renderMissionList(id, missions) {
  const box = document.getElementById(id);
  if (!box) return;
  box.innerHTML = missions.map(m => {
    const p = Math.min(100, Math.round((m.current / m.target) * 100));
    return `<article class="mission-card v8-mission-card ${m.done ? "mission-done" : ""}"><div class="v8-mission-top"><div class="v8-mission-icon">${m.icon}</div><div class="v8-mission-copy"><h3>${m.title}</h3><p>${m.description}</p></div><strong class="v8-mission-percent">${p}%</strong></div><div class="v8-mission-bar"><div style="width:${p}%"></div></div><div class="v8-mission-bottom"><span>${m.done ? "Completed" : `${m.current}/${m.target}`} • ${m.reward}</span><button onclick="${m.action}">${m.done ? "View" : m.button}</button></div></article>`;
  }).join("");
}
onAuthStateChanged(auth, async user => {
  if (!user) { location.href = "index.html"; return; }
  try {
    const [userSnap, swapSnap, ratingSnap, messageSnap] = await Promise.all([getDoc(doc(db,"users",user.uid)), getDocs(collection(db,"swapRequests")), getDocs(collection(db,"ratings")), getDocs(collection(db,"messages"))]);
    const me = userSnap.exists() ? userSnap.data() : {};
    let completed=0, accepted=0, sent=0, received=0, ratings=0, messages=0;
    swapSnap.forEach(d => { const r=d.data(); const mine=r.requesterId===user.uid||r.receiverId===user.uid; if(!mine) return; if(r.requesterId===user.uid) sent++; if(r.receiverId===user.uid) received++; if(r.status==="accepted") accepted++; if(r.status==="completed") completed++; });
    ratingSnap.forEach(d => { if(d.data().rateeId===user.uid) ratings++; });
    messageSnap.forEach(d => { const m=d.data(); if(m.senderId===user.uid||m.receiverId===user.uid) messages++; });
    const pc = completion(me);
    const daily = [
      {icon:"📨",title:"Send First Request",description:"Start connecting with another student.",reward:"+5 XP",xp:5,current:Math.min(sent,1),target:1,done:sent>=1,button:"Browse",action:"goToBrowse()"},
      {icon:"🔥",title:"Make 3 Requests",description:"Reach out to more students.",reward:"+15 XP",xp:15,current:Math.min(sent,3),target:3,done:sent>=3,button:"Swipe",action:"goToSwipe()"},
      {icon:"💬",title:"Start Chat",description:"Send or receive one message.",reward:"+10 XP",xp:10,current:Math.min(messages,1),target:1,done:messages>=1,button:"Chats",action:"goToConnections()"}
    ];
    const milestone = [
      {icon:"👤",title:"Complete Profile",description:"Add details, bio, skills, and mode.",reward:"+20 XP",xp:20,current:pc,target:100,done:pc>=100,button:"Edit",action:"goToProfile()"},
      {icon:"🤝",title:"Get Accepted",description:"Have one request accepted.",reward:"+25 XP",xp:25,current:Math.min(accepted,1),target:1,done:accepted>=1,button:"Requests",action:"goToRequests()"},
      {icon:"✅",title:"Complete Swap",description:"Finish one successful exchange.",reward:"+50 XP",xp:50,current:Math.min(completed,1),target:1,done:completed>=1,button:"Stats",action:"goToStats()"}
    ];
    const reputation = [
      {icon:"⭐",title:"Receive Ratings",description:"Collect 3 reviews from swaps.",reward:"+30 XP",xp:30,current:Math.min(ratings,3),target:3,done:ratings>=3,button:"Ratings",action:"goToRatings()"},
      {icon:"📥",title:"Receive Requests",description:"Make your profile attractive.",reward:"+35 XP",xp:35,current:Math.min(received,3),target:3,done:received>=3,button:"Profile",action:"goToProfile()"},
      {icon:"🚀",title:"Complete 5 Swaps",description:"Become an active skill partner.",reward:"+100 XP",xp:100,current:Math.min(completed,5),target:5,done:completed>=5,button:"Stats",action:"goToStats()"}
    ];
    const all = [...daily,...milestone,...reputation];
    const done = all.filter(m => m.done);
    const xp = done.reduce((s,m)=>s+m.xp,0);
    document.getElementById("missionsWelcome").innerText = `${me.name || "Student"}, your tasks are organized below.`;
    document.getElementById("totalXp").innerText = `${xp} XP`;
    document.getElementById("missionRank").innerText = rank(xp);
    document.getElementById("completedMissions").innerText = done.length;
    document.getElementById("activeMissions").innerText = all.length-done.length;
    document.getElementById("profilePercent").innerText = `${pc}%`;
    renderMissionList("dailyMissionsList", daily); renderMissionList("milestoneMissionsList", milestone); renderMissionList("reputationMissionsList", reputation);
  } catch(e) { console.error("Missions error:", e); const w=document.getElementById("missionsWelcome"); if(w) w.innerText="Error loading missions."; }
});
