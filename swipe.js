import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null, currentUserData = {}, swipeUsers = [], ratingsMap = {}, currentIndex = 0;
let selectedReceiver = null, selectedReceiverName = "", selectedCard = null, selectedType = "Swap";

function esc(t){return String(t||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
function safe(v,f=""){if(v===null||v===undefined)return f;const t=String(v).trim();return t===""?f:t;}
function tags(text,limit=3){const arr=safe(text,"").split(",").map(s=>s.trim()).filter(Boolean).slice(0,limit);return arr.length?arr.map(s=>`<span class="skill-tag">${esc(s)}</span>`).join(""):`<span class="skill-tag">No skills</span>`;}
function rating(id){const r=ratingsMap[id];if(!r||!r.count)return"New";return`${(r.totalStars/r.count).toFixed(1)}★`;}
async function loadRatings(){ratingsMap={};const snap=await getDocs(collection(db,"ratings"));snap.forEach(d=>{const r=d.data();const id=r.rateeId;if(!id)return;if(!ratingsMap[id])ratingsMap[id]={totalStars:0,count:0};ratingsMap[id].totalStars+=Number(r.stars||0);ratingsMap[id].count++;});}
async function loadUsers(uid){const snap=await getDocs(collection(db,"users"));swipeUsers=[];currentUserData={};snap.forEach(d=>{const data=d.data();if(d.id===uid){currentUserData=data||{};return;}swipeUsers.push({id:d.id,...data});});swipeUsers=swipeUsers.sort(()=>Math.random()-.5);currentIndex=0;}
function renderSwipeStack(){const stack=document.getElementById("swipeStack");const empty=document.getElementById("swipeEmptyState");if(!stack||!empty){console.error("Missing swipe elements");return;}stack.innerHTML="";if(currentIndex>=swipeUsers.length){empty.style.display="block";return;}empty.style.display="none";const visible=swipeUsers.slice(currentIndex,currentIndex+3);visible.reverse().forEach((u,ri)=>{const layer=visible.length-1-ri;stack.appendChild(createCard(u,layer));});}
function createCard(u,layer){const card=document.createElement("div");card.className="swipe-card";card.style.zIndex=String(20-layer);card.style.transform=`scale(${1-layer*.035}) translateY(${layer*10}px)`;card.innerHTML=`<div class="swipe-card-inner"><div class="swipe-card-top"><img src="${esc(safe(u.profilePic,"avatars/avatar1.png"))}" class="swipe-avatar" alt="Profile"><div><p class="rating-text">${esc(rating(u.id))}</p><h2>${esc(safe(u.name,"Student"))}</h2><p class="muted-text">${esc(safe(u.course,"Course"))} • ${esc(safe(u.yearLevel,"Year"))}</p></div></div><div class="preference-pill">${esc(safe(u.transactionPreference,"Either"))}</div><div class="skill-tags">${tags(u.offeredSkills)}</div><p class="bio-text">${esc(safe(u.bio,"No bio yet."))}</p><div class="swipe-actions"><button type="button" data-action="skip" class="secondary-btn">Skip</button><button type="button" data-action="profile">View</button><button type="button" data-action="like">Request</button></div></div>`;
card.querySelector('[data-action="skip"]').onclick=e=>{e.stopPropagation();swipeLeft(card);};
card.querySelector('[data-action="profile"]').onclick=e=>{e.stopPropagation();location.href=`view-profile.html?uid=${u.id}`;};
card.querySelector('[data-action="like"]').onclick=e=>{e.stopPropagation();openRequestModal(card,u.id,safe(u.name,"Student"));};
if(layer===0) enableSwipe(card,u); else card.classList.add("swipe-card-back");
return card;}
function enableSwipe(card,u){let sx=0,sy=0,cx=0,cy=0,drag=false,moved=false;
function begin(x,y){drag=true;moved=false;sx=x;sy=y;cx=0;cy=0;card.classList.add("dragging");}
function move(x,y,e){if(!drag)return;cx=x-sx;cy=y-sy;if(Math.abs(cx)>6){moved=true;if(e&&e.cancelable)e.preventDefault();}card.style.transform=`translate(${cx}px, ${Math.max(-35,Math.min(35,cy*.25))}px) rotate(${cx*.045}deg)`;card.style.opacity=String(Math.max(.68,1-Math.abs(cx)/430));}
function end(){if(!drag)return;drag=false;card.classList.remove("dragging");if(cx>96){swipeRight(card,u.id);return;}if(cx<-96){swipeLeft(card);return;}cx=0;cy=0;card.style.transform="";card.style.opacity="1";}
card.addEventListener("pointerdown",e=>{if(e.target.closest("button"))return;begin(e.clientX,e.clientY);try{card.setPointerCapture(e.pointerId)}catch{}});
card.addEventListener("pointermove",e=>move(e.clientX,e.clientY,e),{passive:false});
card.addEventListener("pointerup",end);card.addEventListener("pointercancel",end);
card.addEventListener("touchstart",e=>{if(e.target.closest("button"))return;const t=e.touches[0];begin(t.clientX,t.clientY);},{passive:true});
card.addEventListener("touchmove",e=>{if(!drag)return;const t=e.touches[0];move(t.clientX,t.clientY,e);},{passive:false});
card.addEventListener("touchend",end);card.addEventListener("touchcancel",end);
card.addEventListener("click",e=>{if(e.target.closest("button"))return;if(moved){moved=false;return;}location.href=`view-profile.html?uid=${u.id}`;});}
function swipeLeft(card){card.style.transform="translateX(-130%) rotate(-18deg)";card.style.opacity="0";setTimeout(()=>{currentIndex++;renderSwipeStack();},210);}
function swipeRight(card,id){card.style.transform="translateX(130%) rotate(18deg)";card.style.opacity="0";setTimeout(()=>{currentIndex++;renderSwipeStack();location.href=`view-profile.html?uid=${id}`;},210);}
function removeAfterRequest(card){card.style.transform="translateX(130%) rotate(18deg)";card.style.opacity="0";setTimeout(()=>{currentIndex++;renderSwipeStack();},210);}
function openRequestModal(card,id,name){selectedReceiver=id;selectedReceiverName=name;selectedCard=card;selectedType="Swap";const modal=document.getElementById("requestModal");if(modal)modal.style.display="flex";const amount=document.getElementById("amountInput");const msg=document.getElementById("messageInput");const amountSec=document.getElementById("amountSection");if(amount)amount.value="";if(msg)msg.value="Hi! I'm interested in your skills. Let's connect.";if(amountSec)amountSec.style.display="none";setTimeout(()=>window.selectType("Swap"),30);}
window.selectType=function(type){selectedType=type;document.querySelectorAll(".modal-options button").forEach(b=>b.classList.toggle("active",b.dataset.type===type));const sec=document.getElementById("amountSection");if(sec)sec.style.display=type==="Payment"?"block":"none";};
window.closeModal=function(){const modal=document.getElementById("requestModal");if(modal)modal.style.display="none";selectedReceiver=null;selectedReceiverName="";selectedCard=null;selectedType="Swap";};
window.submitRequest=async function(){const msg=document.getElementById("messageInput")?.value.trim();const amount=document.getElementById("amountInput")?.value.trim()||"";if(!selectedReceiver){alert("No selected user.");return;}if(!msg){alert("Please enter a message.");return;}if(selectedType==="Payment"&&!amount){alert("Please enter the amount.");return;}try{await addDoc(collection(db,"swapRequests"),{requesterId:currentUser.uid,requesterName:safe(currentUserData?.name,"Unknown User"),receiverId:selectedReceiver,receiverName:selectedReceiverName,message:msg,status:"pending",createdAt:new Date().toISOString(),transactionType:selectedType,proposedAmount:selectedType==="Payment"?amount:""});const c=selectedCard;window.closeModal();if(c)removeAfterRequest(c);}catch(e){console.error("Swipe request error:",e);alert("Error sending request.");}};
window.resetSwipeStack=function(){currentIndex=0;renderSwipeStack();};
onAuthStateChanged(auth,async user=>{if(!user){location.href="index.html";return;}currentUser=user;try{await loadRatings();await loadUsers(user.uid);renderSwipeStack();}catch(e){console.error("Swipe load error:",e);const stack=document.getElementById("swipeStack");if(stack)stack.innerHTML=`<div class="swipe-empty"><h3>Swipe could not load</h3><p>Please check Firebase rules and user records.</p><button onclick="location.reload()">Reload</button></div>`;}});
