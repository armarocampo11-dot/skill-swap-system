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
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

function safeText(value, fallback = "Student") {
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

function parseSkills(text) {
  return safeText(text, "")
    .split(",")
    .map(skill => skill.trim().toLowerCase())
    .filter(Boolean);
}

function displaySkills(text, limit = 2) {
  return safeText(text, "")
    .split(",")
    .map(skill => skill.trim())
    .filter(Boolean)
    .slice(0, limit);
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

function getProfileCompletion(me) {
  const checks = [
    me.name,
    me.course,
    me.yearLevel,
    me.studentId,
    me.section,
    me.bio,
    me.offeredSkills,
    me.wantedSkills,
    me.transactionPreference
  ];

  const filled = checks.filter(value => safeText(value, "") !== "").length;
  return Math.round((filled / checks.length) * 100);
}

function getRatingMap(ratingDocs) {
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

function getRatingLabel(ratingMap, userId) {
  const info = ratingMap[userId];
  if (!info || info.count === 0) return "New";
  return `${(info.total / info.count).toFixed(1)}★`;
}

function computeMatch(me, other, ratingMap) {
  const myWanted = parseSkills(me.wantedSkills);
  const myOffered = parseSkills(me.offeredSkills);
  const theirWanted = parseSkills(other.wantedSkills);
  const theirOffered = parseSkills(other.offeredSkills);

  let score = 0;

  theirOffered.forEach(skill => {
    if (myWanted.includes(skill)) score += 2;
  });

  theirWanted.forEach(skill => {
    if (myOffered.includes(skill)) score += 1;
  });

  if (safeText(me.course, "") && me.course === other.course) score += 1;
  if (safeText(me.yearLevel, "") && me.yearLevel === other.yearLevel) score += 1;

  const rating = ratingMap[other.id];
  if (rating && rating.count > 0) {
    score += Math.min(2, (rating.total / rating.count) / 2.5);
  }

  const overlap = theirOffered.filter(skill => myWanted.includes(skill));
  const percent = Math.min(99, Math.max(35, Math.floor(score * 18)));

  return { score, percent, overlap };
}

function renderRecommended(items, ratingMap) {
  const container = document.getElementById("recommendedList");
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `
      <article class="v7-person-card recommend-card">
        <div class="v7-person-main">
          <div class="v7-person-avatar" style="display:grid;place-items:center;background:#eef3ff;">🔎</div>
          <div class="v7-person-info">
            <h4>No matches yet</h4>
            <p>Add more skills to your profile.</p>
          </div>
          <div class="v7-match-ring">0%</div>
        </div>
      </article>
    `;
    return;
  }

  container.innerHTML = items.map(({ user, match }) => {
    const avatar = safeText(user.profilePic, "avatars/avatar1.png");
    const skills = displaySkills(user.offeredSkills, 2);
    const matchText = match.overlap.length
      ? match.overlap.slice(0, 2).join(", ")
      : "Skill partner";

    return `
      <article class="v7-person-card recommend-card" onclick="openStudentProfile('${user.id}')">
        <div class="v7-person-main">
          <img class="v7-person-avatar" src="${escapeHTML(avatar)}" alt="Avatar">

          <div class="v7-person-info">
            <h4>${escapeHTML(safeText(user.name, "Student"))}</h4>
            <p>${escapeHTML(safeText(user.course, "Course"))} • ${escapeHTML(safeText(user.yearLevel, "Year"))}</p>
            <p>${escapeHTML(matchText)}</p>
          </div>

          <div class="v7-match-ring">${match.percent}%</div>
        </div>

        <div class="v7-person-tags">
          <span>${escapeHTML(safeText(user.transactionPreference, "Either"))}</span>
          <span>${escapeHTML(getRatingLabel(ratingMap, user.id))}</span>
          ${skills.map(skill => `<span>${escapeHTML(skill)}</span>`).join("")}
        </div>

        <div class="v7-person-actions">
          <button onclick="event.stopPropagation(); quickRequest('${user.id}')">Request</button>
          <button class="secondary-btn" onclick="event.stopPropagation(); openStudentProfile('${user.id}')">View</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderNotifications(items) {
  const list = document.getElementById("notificationList");
  if (!list) return;

  if (!items.length) {
    list.innerHTML = `
      <div class="notification-item" onclick="goToBrowse()">
        <div class="notification-icon">✨</div>
        <div>
          <h4>All clear</h4>
          <p>No urgent notifications right now. Discover new skill partners.</p>
        </div>
      </div>
    `;
    return;
  }

  list.innerHTML = items.map(item => `
    <div class="notification-item" onclick="openNotificationTarget('${item.target}')">
      <div class="notification-icon">${item.icon}</div>
      <div>
        <h4>${escapeHTML(item.title)}</h4>
        <p>${escapeHTML(item.message)}</p>
      </div>
    </div>
  `).join("");
}

onAuthStateChanged(auth, async (user) => {
  const welcome = document.getElementById("welcome");

  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    const [userSnap, swapSnapshot, ratingSnapshot, messageSnapshot, usersSnapshot] = await Promise.all([
      getDoc(doc(db, "users", user.uid)),
      getDocs(collection(db, "swapRequests")),
      getDocs(collection(db, "ratings")),
      getDocs(collection(db, "messages")),
      getDocs(collection(db, "users"))
    ]);

    const me = userSnap.exists() ? userSnap.data() : {};
    const profileCompletion = getProfileCompletion(me);

    if (welcome) {
      welcome.innerText = `Welcome, ${safeText(me.name, "Student")}!`;
    }

    let completedCount = 0;
    let pendingIncoming = 0;
    let acceptedCount = 0;
    let totalStars = 0;
    let ratingCount = 0;
    const notifications = [];

    swapSnapshot.forEach(docSnap => {
      const request = docSnap.data();
      const isMine = request.requesterId === user.uid || request.receiverId === user.uid;
      if (!isMine) return;

      if (request.status === "completed") completedCount++;
      if (request.status === "accepted") acceptedCount++;

      if (request.receiverId === user.uid && request.status === "pending") {
        pendingIncoming++;
      }
    });

    ratingSnapshot.forEach(docSnap => {
      const rating = docSnap.data();
      if (rating.rateeId === user.uid) {
        totalStars += Number(rating.stars || 0);
        ratingCount++;
      }
    });

    let unreadMessages = 0;
    const unreadPartners = new Set();

    messageSnapshot.forEach(docSnap => {
      const msg = docSnap.data();
      const seenBy = Array.isArray(msg.seenBy) ? msg.seenBy : [];
      const isUnread = msg.senderId !== user.uid && !seenBy.includes(user.uid);
      if (isUnread) {
        unreadMessages++;
        if (msg.senderId) unreadPartners.add(msg.senderId);
      }
    });

    if (pendingIncoming > 0) {
      notifications.push({
        icon: "📨",
        title: `${pendingIncoming} request${pendingIncoming === 1 ? "" : "s"} need action`,
        message: "Tap to review incoming skill swap requests.",
        target: "requests.html"
      });
    }

    if (unreadMessages > 0) {
      notifications.push({
        icon: "💬",
        title: `${unreadMessages} unread message${unreadMessages === 1 ? "" : "s"}`,
        message: "Tap to open your conversations.",
        target: "connections.html"
      });
    }

    if (profileCompletion < 100) {
      notifications.push({
        icon: "👤",
        title: `Profile is ${profileCompletion}% complete`,
        message: "Complete your profile to improve your matches.",
        target: "profile.html"
      });
    }

    if (acceptedCount > 0) {
      notifications.push({
        icon: "🤝",
        title: `${acceptedCount} active swap${acceptedCount === 1 ? "" : "s"}`,
        message: "Tap to manage active exchanges.",
        target: "requests.html"
      });
    }

    const avg = ratingCount > 0 ? (totalStars / ratingCount).toFixed(1) : "0.0";
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.innerText = value;
    };

    set("swapCount", completedCount);
    set("pendingCount", pendingIncoming);
    set("messageCount", unreadMessages);
    set("avgRating", `${avg}★`);

    const badgeCount = pendingIncoming + unreadMessages;
    const requestBadge = document.getElementById("requestBadge");
    if (requestBadge) {
      requestBadge.style.display = badgeCount > 0 ? "inline-grid" : "none";
      requestBadge.innerText = badgeCount;
    }

    renderNotifications(notifications);

    const ratingMap = getRatingMap(ratingSnapshot.docs);
    const candidates = [];

    usersSnapshot.forEach(docSnap => {
      if (docSnap.id === user.uid) return;
      const other = { id: docSnap.id, ...docSnap.data() };
      const match = computeMatch(me, other, ratingMap);
      candidates.push({ user: other, match });
    });

    candidates.sort((a, b) => {
      if (b.match.score !== a.match.score) return b.match.score - a.match.score;
      return normalizeDate(b.user.createdAt) - normalizeDate(a.user.createdAt);
    });

    renderRecommended(candidates.slice(0, 8), ratingMap);
  } catch (error) {
    console.error("Dashboard error:", error);
    if (welcome) welcome.innerText = "Error loading dashboard.";
  }
});

window.openStudentProfile = function (uid) {
  window.location.href = `view-profile.html?uid=${uid}`;
};

window.quickRequest = function (uid) {
  window.location.href = `view-profile.html?uid=${uid}`;
};
