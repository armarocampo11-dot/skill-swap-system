import { app } from "./firebase-config.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  addDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentUserData = {};
let allUsers = [];
let ratingMap = {};
let activeCategory = "all";
let searchTerm = "";
let selectedReceiver = null;

const DEFAULT_CATEGORIES = [
  { key: "all", icon: "🎯", title: "All", subtitle: "Everyone" },
  { key: "editing", icon: "🎬", title: "Editing", subtitle: "Video & Canva" },
  { key: "design", icon: "🎨", title: "Design", subtitle: "Graphics & UI" },
  { key: "coding", icon: "💻", title: "Coding", subtitle: "Web & apps" },
  { key: "math", icon: "📐", title: "Math", subtitle: "Tutoring" },
  { key: "writing", icon: "✍️", title: "Writing", subtitle: "Scripts" },
  { key: "presentation", icon: "🎤", title: "Speaking", subtitle: "Reports" }
];

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text === "" ? fallback : text;
}

function escapeHTML(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeDate(value) {
  if (!value) return 0;
  if (typeof value === "object" && typeof value.toDate === "function") {
    try {
      return value.toDate().getTime();
    } catch {
      return 0;
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function parseSkills(text) {
  return safeText(text, "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function lowerSkills(text) {
  return parseSkills(text).map(s => s.toLowerCase());
}

function getAvatar(user) {
  return safeText(user.profilePic, "avatars/avatar1.png");
}

function buildRatingMap(ratingDocs) {
  const map = {};
  ratingDocs.forEach(docSnap => {
    const rating = docSnap.data();
    const rateeId = rating.rateeId;
    const stars = Number(rating.stars || 0);
    if (!rateeId || !Number.isFinite(stars) || stars <= 0) return;
    if (!map[rateeId]) map[rateeId] = { total: 0, count: 0 };
    map[rateeId].total += stars;
    map[rateeId].count += 1;
  });
  return map;
}

function getUserRating(userId) {
  const info = ratingMap[userId];
  if (!info || info.count === 0) return { label: "New", avg: 0, count: 0 };
  const avg = info.total / info.count;
  return { label: `${avg.toFixed(1)}★`, avg, count: info.count };
}

function getUserCategories(user) {
  const source = [
    safeText(user.category, ""),
    safeText(user.categories, ""),
    safeText(user.offeredSkills, ""),
    safeText(user.wantedSkills, ""),
    safeText(user.bio, "")
  ].join(" ").toLowerCase();

  const tags = new Set();

  if (source.includes("canva") || source.includes("edit") || source.includes("video")) tags.add("editing");
  if (source.includes("design") || source.includes("graphic") || source.includes("ui")) tags.add("design");
  if (source.includes("code") || source.includes("program") || source.includes("web") || source.includes("java") || source.includes("python")) tags.add("coding");
  if (source.includes("math") || source.includes("calculus") || source.includes("algebra")) tags.add("math");
  if (source.includes("write") || source.includes("script") || source.includes("caption")) tags.add("writing");
  if (source.includes("presentation") || source.includes("report") || source.includes("public speaking")) tags.add("presentation");

  return [...tags];
}

function computeMatch(user) {
  const myWanted = lowerSkills(currentUserData.wantedSkills);
  const myOffered = lowerSkills(currentUserData.offeredSkills);
  const theirWanted = lowerSkills(user.wantedSkills);
  const theirOffered = lowerSkills(user.offeredSkills);

  let score = 0;
  theirOffered.forEach(skill => {
    if (myWanted.includes(skill)) score += 2;
  });
  theirWanted.forEach(skill => {
    if (myOffered.includes(skill)) score += 1;
  });

  if (safeText(currentUserData.course, "") && currentUserData.course === user.course) score += 1;
  if (safeText(currentUserData.yearLevel, "") && currentUserData.yearLevel === user.yearLevel) score += 1;

  const rating = getUserRating(user.id);
  if (rating.count > 0) score += Math.min(2, rating.avg / 2.5);

  const overlap = theirOffered.filter(skill => myWanted.includes(skill));
  const percent = Math.min(99, Math.max(35, Math.floor(score * 18)));

  return { score, percent, overlap };
}

function matchesCategory(user) {
  if (activeCategory === "all") return true;
  return getUserCategories(user).includes(activeCategory);
}

function matchesSearch(user) {
  if (!searchTerm) return true;
  const haystack = [
    safeText(user.name, ""),
    safeText(user.course, ""),
    safeText(user.bio, ""),
    safeText(user.offeredSkills, ""),
    safeText(user.wantedSkills, "")
  ].join(" ").toLowerCase();

  return haystack.includes(searchTerm.toLowerCase());
}

function getFilteredUsers() {
  if (!currentUser) return [];

  return allUsers
    .filter(user => user.id !== currentUser.uid)
    .filter(matchesCategory)
    .filter(matchesSearch)
    .map(user => ({
      ...user,
      match: computeMatch(user),
      rating: getUserRating(user.id),
      categoriesResolved: getUserCategories(user)
    }))
    .sort((a, b) => {
      if (b.match.score !== a.match.score) return b.match.score - a.match.score;
      return normalizeDate(b.createdAt) - normalizeDate(a.createdAt);
    });
}

function renderCategoryCards() {
  const container = document.getElementById("categoryCards");
  if (!container) return;

  container.innerHTML = DEFAULT_CATEGORIES.map(category => `
    <button class="browse-category-card ${activeCategory === category.key ? "active-category-card" : ""}" data-category="${category.key}">
      <div class="browse-category-icon">${category.icon}</div>
      <strong>${category.title}</strong>
      <span>${category.subtitle}</span>
    </button>
  `).join("");
}

function renderUsers() {
  const grid = document.getElementById("browseUsersGrid");
  const countEl = document.getElementById("browseResultCount");
  const titleEl = document.getElementById("browseSectionTitle");
  const subtitleEl = document.getElementById("browseSectionSubtitle");
  if (!grid) return;

  const users = getFilteredUsers();

  if (countEl) countEl.innerText = `${users.length}`;
  if (titleEl) titleEl.innerText = activeCategory === "all" ? "Recommended For You" : DEFAULT_CATEGORIES.find(c => c.key === activeCategory)?.title || "Students";
  if (subtitleEl) subtitleEl.innerText = activeCategory === "all" ? "Students who may match your skills." : "Filtered students based on this skill.";

  if (!users.length) {
    grid.innerHTML = `
      <article class="v7-person-card browse-user-card">
        <div class="v7-person-main">
          <div class="v7-person-avatar" style="display:grid;place-items:center;background:#eef3ff;">🔎</div>
          <div class="v7-person-info">
            <h3>No students found</h3>
            <p>Try another search or category.</p>
          </div>
          <div class="v7-match-ring">0%</div>
        </div>
      </article>
    `;
    return;
  }

  grid.innerHTML = users.map(user => {
    const skills = parseSkills(user.offeredSkills).slice(0, 2);
    const matchReason = user.match.overlap.length
      ? user.match.overlap.slice(0, 2).join(", ")
      : "Skill partner";

    return `
      <article class="v7-person-card browse-user-card" onclick="openStudentProfile('${user.id}')">
        <div class="v7-person-main">
          <img class="v7-person-avatar" src="${escapeHTML(getAvatar(user))}" alt="Avatar">

          <div class="v7-person-info">
            <h3>${escapeHTML(safeText(user.name, "Student"))}</h3>
            <p>${escapeHTML(safeText(user.course, "Course"))} • ${escapeHTML(safeText(user.yearLevel, "Year"))}</p>
            <p>${escapeHTML(matchReason)}</p>
          </div>

          <div class="v7-match-ring">${user.match.percent}%</div>
        </div>

        <div class="v7-person-tags">
          <span>${escapeHTML(safeText(user.transactionPreference, "Either"))}</span>
          <span>${escapeHTML(user.rating.label)}</span>
          ${skills.map(skill => `<span>${escapeHTML(skill)}</span>`).join("")}
        </div>

        <div class="v7-person-actions">
          <button onclick="event.stopPropagation(); openQuickRequestModal('${user.id}')">Request</button>
          <button class="secondary-btn" onclick="event.stopPropagation(); openStudentProfile('${user.id}')">View</button>
        </div>
      </article>
    `;
  }).join("");
}

function bindSearch() {
  const input = document.getElementById("browseSearchInput");
  if (!input) return;

  const params = new URLSearchParams(window.location.search);
  const initialSearch = params.get("search");

  if (initialSearch) {
    input.value = initialSearch;
    searchTerm = initialSearch;
  }

  input.addEventListener("input", event => {
    searchTerm = event.target.value.trim();
    renderUsers();
  });
}

function bindCategoryClicks() {
  const container = document.getElementById("categoryCards");
  if (!container) return;

  container.addEventListener("click", event => {
    const card = event.target.closest(".browse-category-card");
    if (!card) return;
    activeCategory = card.dataset.category || "all";
    renderCategoryCards();
    renderUsers();
  });
}

async function reloadBrowseData() {
  const [meSnap, usersSnap, ratingsSnap] = await Promise.all([
    getDoc(doc(db, "users", currentUser.uid)),
    getDocs(collection(db, "users")),
    getDocs(collection(db, "ratings"))
  ]);

  currentUserData = meSnap.exists() ? meSnap.data() : {};

  const welcome = document.getElementById("browseWelcome");
  if (welcome) {
    welcome.innerText = `${safeText(currentUserData.name, "Student")}, discover skill partners matched to your profile.`;
  }

  allUsers = usersSnap.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  ratingMap = buildRatingMap(ratingsSnap.docs);

  renderCategoryCards();
  renderUsers();
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  try {
    bindSearch();
    bindCategoryClicks();
    await reloadBrowseData();
  } catch (error) {
    console.error("Browse error:", error);
    const welcome = document.getElementById("browseWelcome");
    if (welcome) welcome.innerText = "Error loading browse page.";
  }
});

window.openQuickRequestModal = function (receiverId) {
  selectedReceiver = allUsers.find(user => user.id === receiverId) || null;
  if (!selectedReceiver) return;

  document.getElementById("quickRequestTarget").innerText =
    `Request to ${safeText(selectedReceiver.name, "Student")}`;

  document.getElementById("requestMode").value = "swap";
  document.getElementById("requestSkill").value = "";
  document.getElementById("requestAmount").value = "";
  document.getElementById("requestMessage").value = "";

  document.getElementById("quickRequestModal").classList.remove("hidden");
};

window.closeQuickRequestModal = function () {
  selectedReceiver = null;
  document.getElementById("quickRequestModal").classList.add("hidden");
};

window.submitQuickRequest = async function () {
  if (!selectedReceiver || !currentUser) return;

  const mode = document.getElementById("requestMode").value;
  const skill = document.getElementById("requestSkill").value.trim();
  const amountValue = document.getElementById("requestAmount").value.trim();
  const message = document.getElementById("requestMessage").value.trim();

  if (!skill) {
    alert("Please enter the skill or request title first.");
    return;
  }

  const meSnap = await getDoc(doc(db, "users", currentUser.uid));
  const me = meSnap.exists() ? meSnap.data() : {};

  await addDoc(collection(db, "swapRequests"), {
    requesterId: currentUser.uid,
    requesterName: safeText(me.name, "Student"),
    receiverId: selectedReceiver.id,
    receiverName: safeText(selectedReceiver.name, "Student"),
    status: "pending",
    transactionType: mode,
    skillName: skill,
    amount: amountValue === "" ? "" : Number(amountValue),
    message,
    createdAt: new Date().toISOString()
  });

  closeQuickRequestModal();
  alert("Request sent successfully.");
};

window.openStudentProfile = function (uid) {
  window.location.href = `view-profile.html?uid=${uid}`;
};
