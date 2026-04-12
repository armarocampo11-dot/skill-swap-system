import { app } from "./firebase-config.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let selectedAvatar = "avatars/avatar1.png";

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text === "" ? fallback : text;
}

function parseSkills(text, limit = null) {
  const arr = safeText(text, "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  return limit ? arr.slice(0, limit) : arr;
}

function computeProfileStrength(data) {
  const fields = [
    data.name,
    data.studentId,
    data.course,
    data.yearLevel,
    data.section,
    data.bio,
    data.offeredSkills,
    data.wantedSkills,
    data.transactionPreference,
    data.profilePic
  ];

  let filled = 0;
  fields.forEach(value => {
    if (safeText(value, "") !== "") filled++;
  });

  return Math.round((filled / fields.length) * 100);
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

function fillInput(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = safeText(value, "");
}

function updateAvatarSelection() {
  document.querySelectorAll(".profile-avatar-option").forEach(btn => {
    btn.classList.toggle("active-avatar-option", btn.dataset.avatar === selectedAvatar);
  });
}

function updatePreview(data, stats) {
  const name = safeText(data.name, "Your Name");
  const course = safeText(data.course, "Course");
  const year = safeText(data.yearLevel, "Year");
  const bio = safeText(data.bio, "Your bio preview will appear here.");
  const mode = safeText(data.transactionPreference, "Either");
  const avatar = safeText(data.profilePic, "avatars/avatar1.png");
  const skills = parseSkills(data.offeredSkills, 4);

  document.getElementById("profileHeroAvatar").src = avatar;
  document.getElementById("profileHeroName").innerText = name;
  document.getElementById("profileHeroMeta").innerText = `${course} • ${year}`;
  document.getElementById("profileHeroRating").innerText = `${stats.avgRating}★`;
  document.getElementById("profileHeroSwaps").innerText = `${stats.completedSwaps} swaps`;
  document.getElementById("profileHeroLevel").innerText = `Level ${stats.level}`;

  document.getElementById("profileMiniAvatar").src = avatar;
  document.getElementById("profileMiniName").innerText = name;
  document.getElementById("profileMiniMeta").innerText = `${course} • ${year}`;
  document.getElementById("profilePreviewMode").innerText = mode;
  document.getElementById("profilePreviewRating").innerText = `${stats.avgRating}★`;
  document.getElementById("profilePreviewBio").innerText = bio;

  const skillWrap = document.getElementById("profilePreviewSkills");
  if (skills.length) {
    skillWrap.innerHTML = skills.map(skill => `<span class="profile-preview-skill">${skill}</span>`).join("");
  } else {
    skillWrap.innerHTML = `<span class="profile-preview-skill muted-preview-skill">Add offered skills</span>`;
  }

  const strength = computeProfileStrength(data);
  document.getElementById("profileStrengthFill").style.width = `${strength}%`;
  document.getElementById("profileStrengthText").innerText = `${strength}% complete`;
}

function collectProfileData() {
  return {
    name: safeText(document.getElementById("name").value, ""),
    studentId: safeText(document.getElementById("studentId").value, ""),
    course: safeText(document.getElementById("course").value, ""),
    yearLevel: safeText(document.getElementById("yearLevel").value, ""),
    section: safeText(document.getElementById("section").value, ""),
    transactionPreference: safeText(document.getElementById("transactionPreference").value, ""),
    bio: safeText(document.getElementById("bio").value, ""),
    offeredSkills: safeText(document.getElementById("offeredSkills").value, ""),
    wantedSkills: safeText(document.getElementById("wantedSkills").value, ""),
    profilePic: selectedAvatar
  };
}

function bindLivePreview() {
  [
    "name",
    "studentId",
    "course",
    "yearLevel",
    "section",
    "transactionPreference",
    "bio",
    "offeredSkills",
    "wantedSkills"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", async () => {
      const data = collectProfileData();
      const stats = await getUserStats(currentUser.uid);
      updatePreview(data, stats);
    });
  });
}

function bindAvatarPicker() {
  const grid = document.getElementById("avatarGrid");
  if (!grid) return;

  grid.addEventListener("click", async (e) => {
    const btn = e.target.closest(".profile-avatar-option");
    if (!btn) return;

    selectedAvatar = btn.dataset.avatar || "avatars/avatar1.png";
    updateAvatarSelection();

    const data = collectProfileData();
    data.profilePic = selectedAvatar;
    const stats = await getUserStats(currentUser.uid);
    updatePreview(data, stats);
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  let data = {};
  if (userSnap.exists()) {
    data = userSnap.data();
  }

  fillInput("name", data.name);
  fillInput("studentId", data.studentId);
  fillInput("course", data.course);
  fillInput("yearLevel", data.yearLevel);
  fillInput("section", data.section);
  fillInput("transactionPreference", data.transactionPreference);
  fillInput("bio", data.bio);
  fillInput("offeredSkills", data.offeredSkills);
  fillInput("wantedSkills", data.wantedSkills);

  selectedAvatar = safeText(data.profilePic, "avatars/avatar1.png");
  updateAvatarSelection();

  const stats = await getUserStats(user.uid);
  updatePreview({ ...data, profilePic: selectedAvatar }, stats);

  bindLivePreview();
  bindAvatarPicker();
});

window.saveProfile = async function () {
  if (!currentUser) return;

  const data = collectProfileData();

  if (!data.studentId) {
    alert("Please complete your student ID first before saving your profile.");
    return;
  }

  await setDoc(doc(db, "users", currentUser.uid), data, { merge: true });

  const stats = await getUserStats(currentUser.uid);
  updatePreview(data, stats);

  alert("Profile saved successfully.");
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