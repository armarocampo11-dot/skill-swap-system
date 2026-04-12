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
  { key: "all", icon: "🎯", title: "All Students", subtitle: "Show everyone available right now" },
  { key: "editing", icon: "🎬", title: "Editing", subtitle: "Canva, video edits, posters, layouts" },
  { key: "design", icon: "🎨", title: "Design", subtitle: "Graphics, UI, visual content" },
  { key: "coding", icon: "💻", title: "Coding", subtitle: "Programming, web, app building" },
  { key: "math", icon: "📐", title: "Math Tutoring", subtitle: "Calculus, algebra, problem solving" },
  { key: "writing", icon: "✍️", title: "Writing", subtitle: "Scripts, captions, communication help" },
  { key: "tourism", icon: "🌍", title: "Tourism", subtitle: "Travel planning and guiding" },
  { key: "hospitality", icon: "🏨", title: "Hotel Management", subtitle: "Hospitality and service skills" },
  { key: "presentation", icon: "🎤", title: "Presentation", subtitle: "Slides, public speaking, reports" }
];

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text === "" ? fallback : text;
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
  const pic = safeText(user.profilePic, "");
  return pic || "avatars/avatar1.png";
}

function getUserRating(userId) {
  const info = ratingMap[userId];
  if (!info || info.count === 0) {
    return {
      label: "No ratings",
      avg: 0,
      count: 0
    };
  }

  const avg = info.total / info.count;
  return {
    label: `${avg.toFixed(1)}★`,
    avg,
    count: info.count
  };
}

function buildRatingMap(ratingDocs) {
  const map = {};
  ratingDocs.forEach(docSnap => {
    const rating = docSnap.data();
    const rateeId = rating.rateeId;
    const stars = Number(rating.stars || 0);

    if (!rateeId || !Number.isFinite(stars) || stars <= 0) return;

    if (!map[rateeId]) {
      map[rateeId] = { total: 0, count: 0 };
    }

    map[rateeId].total += stars;
    map[rateeId].count += 1;
  });

  return map;
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
  if (source.includes("code") || source.includes("program") || source.includes("web")) tags.add("coding");
  if (source.includes("math") || source.includes("calculus") || source.includes("algebra")) tags.add("math");
  if (source.includes("write") || source.includes("script") || source.includes("caption")) tags.add("writing");
  if (source.includes("tourism") || source.includes("travel")) tags.add("tourism");
  if (source.includes("hotel") || source.includes("hospitality")) tags.add("hospitality");
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

  if (safeText(currentUserData.course, "") && currentUserData.course === user.course) {
    score += 1;
  }

  if (safeText(currentUserData.yearLevel, "") && currentUserData.yearLevel === user.yearLevel) {
    score += 1;
  }

  const rating = getUserRating(user.id);
  if (rating.count > 0) {
    score += Math.min(2, rating.avg / 2.5);
  }

  const overlap = theirOffered.filter(skill => myWanted.includes(skill));
  const percent = Math.min(100, Math.max(22, Math.floor(score * 18)));

  return {
    score,
    percent,
    overlap
  };
}

function matchesCategory(user) {
  if (activeCategory === "all") return true;
  const categories = getUserCategories(user);
  return categories.includes(activeCategory);
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

  container.innerHTML = DEFAULT_CATEGORIES.map(cat => `
    <button class="browse-category-card ${activeCategory === cat.key ? "active-category-card" : ""}" data-category="${cat.key}">
      <div class="browse-category-icon">${cat.icon}</div>
      <strong>${cat.title}</strong>
      <span>${cat.subtitle}</span>
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

  countEl.innerText = `${users.length} student${users.length === 1 ? "" : "s"}`;

  const activeCategoryMeta = DEFAULT_CATEGORIES.find(c => c.key === activeCategory);
  if (activeCategory === "all") {
    titleEl.innerText = "Recommended Students";
    subtitleEl.innerText = "Students who may match your interests and offered skills.";
  } else {
    titleEl.innerText = activeCategoryMeta?.title || "Filtered Students";
    subtitleEl.innerText = activeCategoryMeta?.subtitle || "Showing filtered results.";
  }

  if (!users.length) {
    grid.innerHTML = `
      <div class="browse-empty-state">
        <div class="reviews-empty-icon">🔎</div>
        <h4>No students found</h4>
        <p>Try another search or switch to a different category.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = users.map((user, index) => {
    const skills = parseSkills(user.offeredSkills).slice(0, 3);
    const matchReason = user.match.overlap.length
      ? `Matches your interest in ${user.match.overlap.slice(0, 2).join(", ")}`
      : "Potential skill partner";

    const topBadge = index === 0 ? `<span class="browse-top-badge">Top Match</span>` : "";

    return `
      <article class="browse-user-card">
        <div class="browse-user-top-row">
          <div>${topBadge}</div>
          <span class="browse-match-pill">${user.match.percent}% Match</span>
        </div>

        <div class="browse-user-main">
          <img class="browse-user-avatar" src="${getAvatar(user)}" alt="Avatar">
          <div class="browse-user-text">
            <h3>${safeText(user.name, "Student")}</h3>
            <p class="browse-user-meta">${safeText(user.course, "Course not set")} • ${safeText(user.yearLevel, "Year not set")}</p>

            <div class="browse-user-badges">
              <span class="browse-rating-pill">${user.rating.label}</span>
              <span class="browse-soft-pill">${safeText(user.transactionPreference, "Either")}</span>
            </div>
          </div>
        </div>

        <p class="browse-user-reason">${matchReason}</p>

        <div class="browse-skill-tags">
          ${
            skills.length
              ? skills.map(skill => `<span class="browse-skill-tag">${skill}</span>`).join("")
              : `<span class="browse-skill-tag muted-skill-tag">No listed skills yet</span>`
          }
        </div>

        <div class="browse-user-actions">
          <button onclick="openQuickRequestModal('${user.id}')">Quick Request</button>
          <button class="secondary-btn" onclick="openStudentProfile('${user.id}')">View Profile</button>
        </div>
      </article>
    `;
  }).join("");
}

function bindSearch() {
  const input = document.getElementById("browseSearchInput");
  if (!input) return;

  input.addEventListener("input", (e) => {
    searchTerm = e.target.value.trim();
    renderUsers();
  });
}

function bindCategoryClicks() {
  const container = document.getElementById("categoryCards");
  if (!container) return;

  container.addEventListener("click", (e) => {
    const card = e.target.closest(".browse-category-card");
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
    welcome.innerText =
      `${safeText(currentUserData.name, "Student")}, browse skill partners based on shared interests and profile relevance.`;
  }

  allUsers = usersSnap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  ratingMap = buildRatingMap(ratingsSnap.docs);

  renderCategoryCards();
  renderUsers();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;
  await reloadBrowseData();
  bindSearch();
  bindCategoryClicks();
});

window.openQuickRequestModal = function (receiverId) {
  selectedReceiver = allUsers.find(user => user.id === receiverId) || null;
  if (!selectedReceiver) return;

  document.getElementById("quickRequestTarget").innerText =
    `You are sending a request to ${safeText(selectedReceiver.name, "Student")}.`;

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

window.goToDashboard = function () {
  window.location.href = "dashboard.html";
};

window.goToRequests = function () {
  window.location.href = "requests.html";
};

window.goToConnections = function () {
  window.location.href = "connections.html";
};