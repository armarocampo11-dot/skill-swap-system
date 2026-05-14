import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

function safeText(value, fallback = "Student") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text === "" ? fallback : text;
}
function esc(value) {
  return String(value || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function parseSkills(text) {
  return safeText(text, "").split(",").map(s => s.trim()).filter(Boolean);
}
function lowerSkills(text) {
  return parseSkills(text).map(s => s.toLowerCase());
}
function profileCompletion(me) {
  const fields = [me.name, me.course, me.yearLevel, me.studentId, me.section, me.bio, me.offeredSkills, me.wantedSkills, me.transactionPreference];
  return Math.round((fields.filter(v => safeText(v, "") !== "").length / fields.length) * 100);
}
function buildRatingMap(docs) {
  const map = {};
  docs.forEach(d => {
    const r = d.data();
    const id = r.rateeId;
    const stars = Number(r.stars || 0);
    if (!id || !stars) return;
    if (!map[id]) map[id] = { total: 0, count: 0 };
    map[id].total += stars;
    map[id].count += 1;
  });
  return map;
}
function ratingLabel(map, id) {
  const r = map[id];
  if (!r || !r.count) return "New";
  return `${(r.total / r.count).toFixed(1)}★`;
}
function matchScore(me, other, ratingMap) {
  const myWanted = lowerSkills(me.wantedSkills);
  const myOffered = lowerSkills(me.offeredSkills);
  const theirWanted = lowerSkills(other.wantedSkills);
  const theirOffered = lowerSkills(other.offeredSkills);
  let score = 0;
  theirOffered.forEach(s => { if (myWanted.includes(s)) score += 2; });
  theirWanted.forEach(s => { if (myOffered.includes(s)) score += 1; });
  if (me.course && other.course && me.course === other.course) score += 1;
  if (me.yearLevel && other.yearLevel && me.yearLevel === other.yearLevel) score += 1;
  const rate = ratingMap[other.id];
  if (rate && rate.count) score += Math.min(2, (rate.total / rate.count) / 2.5);
  const overlap = theirOffered.filter(s => myWanted.includes(s));
  return { score, percent: Math.min(99, Math.max(35, Math.floor(score * 18))), overlap };
}
function renderRecommended(items, ratingMap) {
  const box = document.getElementById("recommendedList");
  if (!box) return;
  if (!items.length) {
    box.innerHTML = `<article class="v8-person-card"><div class="v8-person-main"><div class="v8-avatar" style="display:grid;place-items:center;background:#eef3ff;">🔎</div><div class="v8-info"><h4>No matches yet</h4><p>Add more skills to your profile.</p><p>Then come back here.</p></div><div class="v8-match">0%</div></div></article>`;
    return;
  }
  box.innerHTML = items.map(({ user, match }) => {
    const avatar = safeText(user.profilePic, "avatars/avatar1.png");
    const skills = parseSkills(user.offeredSkills).slice(0, 2);
    const matchText = match.overlap.length ? match.overlap.slice(0, 2).join(", ") : "Skill partner";
    return `
      <article class="v8-person-card" onclick="openStudentProfile('${user.id}')">
        <div class="v8-person-main">
          <img class="v8-avatar" src="${esc(avatar)}" alt="Avatar">
          <div class="v8-info">
            <h4>${esc(safeText(user.name, "Student"))}</h4>
            <p>${esc(safeText(user.course, "Course"))} • ${esc(safeText(user.yearLevel, "Year"))}</p>
            <p>${esc(matchText)}</p>
          </div>
          <div class="v8-match">${match.percent}%</div>
        </div>
        <div class="v8-tags">
          <span>${esc(safeText(user.transactionPreference, "Either"))}</span>
          <span>${esc(ratingLabel(ratingMap, user.id))}</span>
          ${skills.map(s => `<span>${esc(s)}</span>`).join("")}
        </div>
        <div class="v8-actions">
          <button onclick="event.stopPropagation(); quickRequest('${user.id}')">Request</button>
          <button class="secondary-btn" onclick="event.stopPropagation(); openStudentProfile('${user.id}')">View</button>
        </div>
      </article>`;
  }).join("");
}
function renderNotifications(items) {
  const list = document.getElementById("notificationList");
  if (!list) return;
  list.innerHTML = items.map(item => `
    <div class="notification-item" onclick="openNotificationTarget('${item.target}')">
      <div class="notification-icon">${item.icon}</div>
      <div><h4>${esc(item.title)}</h4><p>${esc(item.message)}</p></div>
      <div class="notification-chevron">›</div>
    </div>`).join("");
}
onAuthStateChanged(auth, async user => {
  const welcome = document.getElementById("welcome");
  if (!user) {
    location.href = "index.html";
    return;
  }
  try {
    const [userSnap, swapSnap, ratingSnap, messageSnap, usersSnap] = await Promise.all([
      getDoc(doc(db, "users", user.uid)),
      getDocs(collection(db, "swapRequests")),
      getDocs(collection(db, "ratings")),
      getDocs(collection(db, "messages")),
      getDocs(collection(db, "users"))
    ]);
    const me = userSnap.exists() ? userSnap.data() : {};
    if (welcome) welcome.innerText = `Welcome, ${safeText(me.name, "Student")}!`;
    let completed = 0, pending = 0, active = 0, sent = 0, totalStars = 0, ratingCount = 0, unread = 0;
    const pendingItems = [], activeItems = [], unreadBySender = {};
    swapSnap.forEach(d => {
      const r = d.data();
      const mine = r.requesterId === user.uid || r.receiverId === user.uid;
      if (!mine) return;
      if (r.status === "completed") completed++;
      if (r.status === "accepted") { active++; activeItems.push({ id: d.id, ...r }); }
      if (r.requesterId === user.uid) sent++;
      if (r.receiverId === user.uid && r.status === "pending") { pending++; pendingItems.push({ id: d.id, ...r }); }
    });
    ratingSnap.forEach(d => {
      const r = d.data();
      if (r.rateeId === user.uid) { totalStars += Number(r.stars || 0); ratingCount++; }
    });
    messageSnap.forEach(d => {
      const m = d.data();
      const seenBy = Array.isArray(m.seenBy) ? m.seenBy : [];
      const addressedToMe = m.receiverId === user.uid || (Array.isArray(m.participants) && m.participants.includes(user.uid));
      if (m.senderId !== user.uid && addressedToMe && !seenBy.includes(user.uid)) {
        unread++;
        const sender = m.senderName || m.senderId || "Student";
        unreadBySender[sender] = (unreadBySender[sender] || 0) + 1;
      }
    });
    const avg = ratingCount ? (totalStars / ratingCount).toFixed(1) : "0.0";
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    set("swapCount", completed);
    set("pendingCount", pending);
    set("messageCount", unread);
    set("avgRating", `${avg}★`);
    set("xpPoints", sent + active + completed);
    set("levelNumber", active + completed);
    const badge = document.getElementById("requestBadge");
    const badgeCount = pending + unread;
    if (badge) { badge.style.display = badgeCount ? "inline-grid" : "none"; badge.innerText = badgeCount > 9 ? "9+" : badgeCount; }
    const notifs = [];
    pendingItems.slice(0, 4).forEach(r => notifs.push({ icon: "📨", title: `New request from ${safeText(r.requesterName, "Student")}`, message: safeText(r.message, "Tap to review this skill request."), target: "requests.html" }));
    Object.entries(unreadBySender).slice(0, 4).forEach(([sender, count]) => notifs.push({ icon: "💬", title: `${count} unread message${count === 1 ? "" : "s"}`, message: `Tap to open messages from ${sender}.`, target: "connections.html" }));
    activeItems.slice(0, 3).forEach(r => notifs.push({ icon: "🤝", title: `Active swap with ${r.requesterId === user.uid ? safeText(r.receiverName, "Student") : safeText(r.requesterName, "Student")}`, message: "Tap to manage this exchange.", target: "requests.html" }));
    const pc = profileCompletion(me);
    if (pc < 100) notifs.push({ icon: "👤", title: `Profile ${pc}% complete`, message: "Complete your profile to improve matches.", target: "profile.html" });
    if (!notifs.length) notifs.push({ icon: "✨", title: "No urgent alerts", message: "Discover students, swipe matches, or update your profile.", target: "browse.html" });
    renderNotifications(notifs);
    const ratingMap = buildRatingMap(ratingSnap.docs);
    const candidates = [];
    usersSnap.forEach(d => {
      if (d.id === user.uid) return;
      const other = { id: d.id, ...d.data() };
      const match = matchScore(me, other, ratingMap);
      candidates.push({ user: other, match });
    });
    candidates.sort((a, b) => b.match.score - a.match.score);
    renderRecommended(candidates.slice(0, 8), ratingMap);
  } catch (err) {
    console.error("Dashboard error:", err);
    if (welcome) welcome.innerText = "Error loading dashboard.";
  }
});
window.openStudentProfile = uid => { location.href = `view-profile.html?uid=${uid}`; };
window.quickRequest = uid => { location.href = `view-profile.html?uid=${uid}`; };
