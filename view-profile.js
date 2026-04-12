import { app } from "./firebase-config.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentUserData = {};
let targetUserId = null;
let targetUserData = null;

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text === "" ? fallback : text;
}

function parseSkills(text) {
  return safeText(text, "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

async function getUserStats(uid) {
  const [swapSnap, ratingSnap] = await Promise.all([
    getDocs(collection(db, "swapRequests")),
    getDocs(collection(db, "ratings"))
  ]);

  let completedSwaps = 0;
  let totalStars = 0;
  let ratingCount = 0;

  swapSnap.forEach(d => {
    const r = d.data();
    if ((r.requesterId === uid || r.receiverId === uid) && r.status === "completed") {
      completedSwaps++;
    }
  });

  ratingSnap.forEach(d => {
    const r = d.data();
    if (r.rateeId === uid) {
      totalStars += Number(r.stars || 0);
      ratingCount++;
    }
  });

  const avgRating = ratingCount > 0 ? (totalStars / ratingCount).toFixed(1) : "0.0";
  const xp = (completedSwaps * 50) + (ratingCount * 10);
  const level = Math.floor(xp / 100) + 1;

  return {
    completedSwaps,
    avgRating,
    level
  };
}

function renderSkillWrap(id, skills) {
  const wrap = document.getElementById(id);
  if (!wrap) return;

  if (!skills.length) {
    wrap.innerHTML = `<span class="profile-preview-skill muted-preview-skill">No skills listed yet</span>`;
    return;
  }

  wrap.innerHTML = skills.map(skill => `<span class="profile-preview-skill">${skill}</span>`).join("");
}

function renderProfile(data, stats) {
  const avatar = safeText(data.profilePic, "avatars/avatar1.png");

  document.getElementById("publicAvatar").src = avatar;
  document.getElementById("publicName").innerText = safeText(data.name, "Student");
  document.getElementById("publicMeta").innerText =
    `${safeText(data.course, "Course")} • ${safeText(data.yearLevel, "Year")} • ${safeText(data.section, "Section")}`;

  document.getElementById("publicRating").innerText = `${stats.avgRating}★`;
  document.getElementById("publicSwaps").innerText = `${stats.completedSwaps} swaps`;
  document.getElementById("publicMode").innerText = safeText(data.transactionPreference, "Either");

  document.getElementById("publicBio").innerText =
    safeText(data.bio, "This student has not added a bio yet.");

  renderSkillWrap("publicOfferedSkills", parseSkills(data.offeredSkills));
  renderSkillWrap("publicWantedSkills", parseSkills(data.wantedSkills));

  document.getElementById("publicStudentId").innerText = safeText(data.studentId, "Not set");
  document.getElementById("publicSection").innerText = safeText(data.section, "Not set");
  document.getElementById("publicModeSide").innerText = safeText(data.transactionPreference, "Either");
  document.getElementById("publicRatingSide").innerText = `${stats.avgRating}★`;
  document.getElementById("publicSwapsSide").innerText = stats.completedSwaps;
  document.getElementById("publicLevelSide").innerText = stats.level;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  const params = new URLSearchParams(window.location.search);
  targetUserId = params.get("uid");

  if (!targetUserId) {
    alert("No profile selected.");
    window.location.href = "browse.html";
    return;
  }

  const [meSnap, targetSnap] = await Promise.all([
    getDoc(doc(db, "users", user.uid)),
    getDoc(doc(db, "users", targetUserId))
  ]);

  currentUserData = meSnap.exists() ? meSnap.data() : {};

  if (!targetSnap.exists()) {
    alert("Profile not found.");
    window.location.href = "browse.html";
    return;
  }

  targetUserData = targetSnap.data();

  const stats = await getUserStats(targetUserId);
  renderProfile(targetUserData, stats);
});

window.openPublicRequestModal = function () {
  if (!targetUserData) return;

  document.getElementById("publicRequestTarget").innerText =
    `You are sending a request to ${safeText(targetUserData.name, "Student")}.`;

  document.getElementById("publicRequestMode").value = "swap";
  document.getElementById("publicRequestSkill").value = "";
  document.getElementById("publicRequestAmount").value = "";
  document.getElementById("publicRequestMessage").value = "";

  document.getElementById("publicRequestModal").classList.remove("hidden");
};

window.closePublicRequestModal = function () {
  document.getElementById("publicRequestModal").classList.add("hidden");
};

window.submitPublicRequest = async function () {
  if (!currentUser || !targetUserId || !targetUserData) return;

  const mode = document.getElementById("publicRequestMode").value;
  const skill = safeText(document.getElementById("publicRequestSkill").value, "");
  const amountValue = safeText(document.getElementById("publicRequestAmount").value, "");
  const message = safeText(document.getElementById("publicRequestMessage").value, "");

  if (!skill) {
    alert("Please enter the skill or request title first.");
    return;
  }

  await addDoc(collection(db, "swapRequests"), {
    requesterId: currentUser.uid,
    requesterName: safeText(currentUserData.name, "Student"),
    receiverId: targetUserId,
    receiverName: safeText(targetUserData.name, "Student"),
    status: "pending",
    transactionType: mode,
    skillName: skill,
    amount: amountValue === "" ? "" : Number(amountValue),
    message,
    createdAt: new Date().toISOString()
  });

  closePublicRequestModal();
  alert("Request sent successfully.");
};

window.goToDashboard = function () {
  window.location.href = "dashboard.html";
};

window.goToBrowse = function () {
  window.location.href = "browse.html";
};

window.goToRequests = function () {
  window.location.href = "requests.html";
};

window.goToConnections = function () {
  window.location.href = "connections.html";
};