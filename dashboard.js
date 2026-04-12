import { app } from "./firebase-config.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
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

function getRank(level) {
  if (level <= 1) return "Beginner";
  if (level === 2) return "Explorer";
  if (level === 3) return "Skilled";
  if (level === 4) return "Pro";
  if (level === 5) return "Expert";
  if (level === 6) return "Elite";
  return "Master";
}

function parseSkills(text) {
  return (text || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}

function topSkills(text, limit = 3) {
  return (text || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, limit);
}

function safeText(value, fallback = "Student") {
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

function getProfileCompletion(me) {
  let filled = 0;
  const checks = [
    me.name, me.course, me.yearLevel, me.studentId, me.section,
    me.bio, me.offeredSkills, me.wantedSkills, me.transactionPreference
  ];
  checks.forEach(value => {
    if (value && String(value).trim() !== "") filled++;
  });
  return { percent: Math.round((filled / checks.length) * 100) };
}

function getNextGoalText(stats) {
  if (stats.profileCompletion < 100) return `Complete profile (${stats.profileCompletion}%)`;
  if (stats.completedCount < 1) return "Complete your first swap";
  if (stats.ratingCount < 3) return `Earn ${3 - stats.ratingCount} more rating${3 - stats.ratingCount === 1 ? "" : "s"}`;
  if (stats.acceptedCount < 3) return `Get ${3 - stats.acceptedCount} more accepted connection${3 - stats.acceptedCount === 1 ? "" : "s"}`;
  return "Keep climbing toward the next level";
}

function getPriorityActionText(stats) {
  if (stats.profileCompletion < 100) return "Finish your profile to unlock better matches";
  if (stats.sentCount < 1) return "Send your first request";
  if (stats.acceptedCount < 1) return "Get one request accepted";
  if (stats.completedCount < 1) return "Complete one swap";
  if (stats.ratingCount < 1) return "Earn your first rating";
  return "Keep building your campus reputation";
}

function buildMissions(stats) {
  return [
    {
      icon: "🪪",
      title: "Complete your profile",
      reward: "+15 XP",
      current: stats.profileCompletion,
      target: 100,
      done: stats.profileCompletion >= 100
    },
    {
      icon: "📨",
      title: "Send your first request",
      reward: "+5 XP",
      current: Math.min(stats.sentCount, 1),
      target: 1,
      done: stats.sentCount >= 1
    },
    {
      icon: "🤝",
      title: "Get one accepted request",
      reward: "+10 XP",
      current: Math.min(stats.acceptedCount, 1),
      target: 1,
      done: stats.acceptedCount >= 1
    },
    {
      icon: "✅",
      title: "Complete one swap",
      reward: "+50 XP",
      current: Math.min(stats.completedCount, 1),
      target: 1,
      done: stats.completedCount >= 1
    }
  ];
}

function renderMissionPreview(stats) {
  const container = document.getElementById("missionsPreviewList");
  if (!container) return;

  const missions = buildMissions(stats).slice(0, 2);
  container.innerHTML = missions.map(mission => {
    const progress = Math.min(100, Math.round((mission.current / mission.target) * 100));
    return `
      <div class="mission-row ${mission.done ? "done" : ""}">
        <div class="mission-left">
          <span class="mission-icon">${mission.icon}</span>
          <div>
            <p class="mission-title">${mission.title}</p>
            <p class="mission-reward">${mission.reward}</p>
          </div>
        </div>
        <div class="mission-right">
          <div class="mission-status ${mission.done ? "done" : ""}">
            ${mission.done ? "Done" : `${mission.current}/${mission.target}`}
          </div>
          <div class="mission-progress-track">
            <div class="mission-progress-fill" style="width:${progress}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function buildBadgeProgress(stats) {
  return [
    {
      name: "First Request",
      description: "Sent your first skill request",
      unlocked: stats.sentCount >= 1,
      progressText: `${Math.min(stats.sentCount, 1)}/1 request`
    },
    {
      name: "Swap Starter",
      description: "Completed your first swap",
      unlocked: stats.completedCount >= 1,
      progressText: `${Math.min(stats.completedCount, 1)}/1 completed`
    },
    {
      name: "Trusted Partner",
      description: "Earned strong ratings from students",
      unlocked: stats.ratingCount >= 3 && stats.avgRatingNumber >= 4.5,
      progressText: `${Math.min(stats.ratingCount, 3)}/3 ratings`
    },
    {
      name: "Campus Connector",
      description: "Built multiple accepted connections",
      unlocked: stats.acceptedCount >= 3,
      progressText: `${Math.min(stats.acceptedCount, 3)}/3 accepted`
    }
  ];
}

function renderBadgePreview(stats) {
  const container = document.getElementById("badgesPreviewList");
  if (!container) return;

  const badges = buildBadgeProgress(stats)
    .sort((a, b) => Number(b.unlocked) - Number(a.unlocked))
    .slice(0, 2);

  container.innerHTML = badges.map(badge => `
    <div class="achievement-badge ${badge.unlocked ? "unlocked" : "locked"}">
      <div class="achievement-badge-top">
        <span class="achievement-badge-icon">${badge.unlocked ? "🏅" : "🔒"}</span>
        <span class="achievement-badge-state">${badge.unlocked ? "Unlocked" : badge.progressText}</span>
      </div>
      <h4>${badge.name}</h4>
      <p>${badge.description}</p>
    </div>
  `).join("");
}

function getRatingMap(ratingDocs) {
  const map = {};
  ratingDocs.forEach((docSnap) => {
    const rating = docSnap.data();
    const rateeId = rating.rateeId;
    if (!map[rateeId]) map[rateeId] = { total: 0, count: 0 };
    map[rateeId].total += Number(rating.stars);
    map[rateeId].count += 1;
  });
  return map;
}

function ratingDisplay(ratingMap, userId) {
  const info = ratingMap[userId];
  if (!info || info.count === 0) return "No ratings";
  return `${(info.total / info.count).toFixed(1)}★`;
}

function computeMatchDetails(me, other, ratingMap) {
  const myWanted = parseSkills(me.wantedSkills);
  const myOffered = parseSkills(me.offeredSkills);
  const otherWanted = parseSkills(other.wantedSkills);
  const otherOffered = parseSkills(other.offeredSkills);

  let score = 0;
  otherOffered.forEach(skill => {
    if (myWanted.includes(skill)) score += 2;
  });
  otherWanted.forEach(skill => {
    if (myOffered.includes(skill)) score += 1;
  });

  if (me.course && other.course && me.course === other.course) score += 1;
  if (me.yearLevel && other.yearLevel && me.yearLevel === other.yearLevel) score += 1;

  const ratingInfo = ratingMap[other.id];
  if (ratingInfo && ratingInfo.count > 0) {
    score += Math.min(2, (ratingInfo.total / ratingInfo.count) / 2.5);
  }

  const matchedSkills = otherOffered.filter(skill => myWanted.includes(skill));
  const matchPercent = Math.min(100, Math.max(20, Math.floor(score * 20)));

  return { score, matchPercent, matchedSkills };
}

function renderRecommended(users, ratingMap, me) {
  const container = document.getElementById("recommendedList");
  if (!container) return;

  if (!me.offeredSkills && !me.wantedSkills) {
    container.innerHTML = `
      <div class="dashboard-recommend-empty">
        <p class="empty-state">Add your offered and wanted skills in your profile to get smart recommendations.</p>
      </div>
    `;
    return;
  }

  if (!users.length) {
    container.innerHTML = `
      <div class="dashboard-recommend-empty">
        <p class="empty-state">No recommendations yet. Try adding more detailed skills to your profile.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = "";

  users.forEach((user, index) => {
    const avatar = user.profilePic && user.profilePic.trim() !== "" ? user.profilePic : "avatars/avatar1.png";
    const skills = topSkills(user.offeredSkills);
    const details = computeMatchDetails(me, user, ratingMap);

    const matchText = details.matchedSkills.length > 0
      ? `Matches your interest in: ${details.matchedSkills.slice(0, 2).join(", ")}`
      : "Potential skill partner";

    const topBadge = index === 0 ? `<span class="top-match-badge">Top Match</span>` : "";

    const card = document.createElement("div");
    card.className = "recommend-card recommend-card-polished";

    card.innerHTML = `
      <div class="recommend-top-row">${topBadge}</div>
      <img src="${avatar}" class="recommend-avatar" alt="Avatar">
      <h4>${safeText(user.name, "Student")}</h4>
      <p class="small-text recommend-subtitle">${safeText(user.course, "N/A")} • ${safeText(user.yearLevel, "N/A")}</p>
      <div class="recommend-meta">
        <span class="rating-badge">${ratingDisplay(ratingMap, user.id)}</span>
        <span class="match-percent">${details.matchPercent}% Match</span>
      </div>
      <p class="match-reason">${matchText}</p>
      <div class="recommend-skills">
        ${skills.length ? skills.map(skill => `<span class="skill-tag">${skill}</span>`).join("") : `<span class="small-text">No skills listed</span>`}
      </div>
      <div class="recommend-actions">
        <button onclick="event.stopPropagation(); quickRequest('${user.id}')">Quick Request</button>
        <button class="secondary-btn" onclick="event.stopPropagation(); openStudentProfile('${user.id}')">View Profile</button>
      </div>
    `;

    card.onclick = () => {
      window.location.href = `view-profile.html?uid=${user.id}`;
    };

    container.appendChild(card);
  });
}

function showXPPopup(text) {
  const popup = document.createElement("div");
  popup.className = "xp-popup";
  popup.innerText = text;
  document.body.appendChild(popup);
  requestAnimationFrame(() => popup.classList.add("show"));
  setTimeout(() => {
    popup.classList.remove("show");
    setTimeout(() => popup.remove(), 250);
  }, 1800);
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

    let me = {};
    if (userSnap.exists()) {
      me = userSnap.data();
      if (welcome) welcome.innerText = `Welcome, ${safeText(me.name, "Student")}!`;
    } else {
      if (welcome) welcome.innerText = "Welcome!";
    }

    let completedCount = 0;
    let acceptedCount = 0;
    let sentCount = 0;
    let xp = 0;
    let totalStars = 0;
    let ratingCount = 0;
    let pendingIncoming = 0;
    let unreadMessages = 0;
    const myRequestIds = new Set();

    swapSnapshot.forEach((docSnap) => {
      const request = docSnap.data();
      const requestId = docSnap.id;
      const isMine = request.requesterId === user.uid || request.receiverId === user.uid;
      if (!isMine) return;

      myRequestIds.add(requestId);

      if (request.requesterId === user.uid) {
        sentCount++;
        xp += 5;
      }
      if (request.status === "accepted") {
        acceptedCount++;
        xp += 10;
      }
      if (request.status === "completed") {
        completedCount++;
        xp += 50;
      }
      if (request.receiverId === user.uid && request.status === "pending") {
        pendingIncoming++;
      }
    });

    ratingSnapshot.forEach((docSnap) => {
      const rating = docSnap.data();
      if (rating.rateeId === user.uid) {
        totalStars += Number(rating.stars);
        ratingCount++;
        if (Number(rating.stars) === 5) xp += 20;
      }
    });

    const avg = ratingCount > 0 ? (totalStars / ratingCount).toFixed(1) : "0.0";
    const avgRatingNumber = Number(avg);

    const unreadByPartner = {};

    messageSnapshot.forEach((docSnap) => {
      const msg = docSnap.data();
      const seenBy = Array.isArray(msg.seenBy) ? msg.seenBy : [];
      const partnerId = msg.senderId === user.uid ? msg.receiverId : msg.senderId;
      if (!(msg.senderId === user.uid || msg.receiverId === user.uid)) return;

      const isUnread = msg.senderId !== user.uid && !seenBy.includes(user.uid);
      if (isUnread && partnerId) {
        unreadByPartner[partnerId] = (unreadByPartner[partnerId] || 0) + 1;
      }
    });

    unreadMessages = Object.values(unreadByPartner).reduce((sum, n) => sum + n, 0);

    const profileData = getProfileCompletion(me);
    xp += Math.floor(profileData.percent / 10) * 5;

    const hasAvatar = me.profilePic && String(me.profilePic).trim() !== "";
    if (hasAvatar) xp += 5;

    const hasSkillSet =
      (me.offeredSkills && String(me.offeredSkills).trim() !== "") &&
      (me.wantedSkills && String(me.wantedSkills).trim() !== "");
    if (hasSkillSet) xp += 10;

    const level = Math.floor(xp / 100) + 1;
    const xpIntoLevel = xp % 100;
    const nextLevelXP = 100 - xpIntoLevel;
    const rank = getRank(level);

    document.getElementById("swapCount").innerText = completedCount;
    document.getElementById("xpPoints").innerText = xp;
    document.getElementById("xpPointsMain").innerText = xp;
    document.getElementById("avgRating").innerText = `${avg}★`;
    document.getElementById("levelNumber").innerText = level;
    document.getElementById("rankTitle").innerText = rank;
    document.getElementById("xpRemaining").innerText = nextLevelXP;
    document.getElementById("profileCompletionText").innerText = `Profile completion: ${profileData.percent}%`;

    const xpBar = document.getElementById("xpBar");
    if (xpBar) {
      xpBar.style.transition = "width 0.6s ease";
      requestAnimationFrame(() => {
        xpBar.style.width = `${xpIntoLevel}%`;
      });
    }

    const stats = {
      sentCount,
      acceptedCount,
      completedCount,
      ratingCount,
      avgRatingNumber,
      profileCompletion: profileData.percent
    };

    document.getElementById("nextGoalText").innerText = getNextGoalText(stats);
    document.getElementById("priorityActionText").innerText = getPriorityActionText(stats);
    document.getElementById("priorityActionTextCard").innerText = getPriorityActionText(stats);

    const requestBadge = document.getElementById("requestBadge");
    const messageBadge = document.getElementById("messageBadge");

    if (pendingIncoming > 0) {
      requestBadge.style.display = "inline-block";
      requestBadge.innerText = pendingIncoming;
    } else {
      requestBadge.style.display = "none";
    }

    if (unreadMessages > 0) {
      messageBadge.style.display = "inline-block";
      messageBadge.innerText = unreadMessages;
    } else {
      messageBadge.style.display = "none";
    }

    renderMissionPreview(stats);
    renderBadgePreview(stats);

    const ratingMap = getRatingMap(ratingSnapshot.docs);
    const candidates = [];

    usersSnapshot.forEach((docSnap) => {
      if (docSnap.id === user.uid) return;
      const other = { id: docSnap.id, ...docSnap.data() };
      const details = computeMatchDetails(me, other, ratingMap);
      if (details.score > 0) {
        candidates.push({ ...other, ...details });
      }
    });

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return normalizeDate(b.createdAt) - normalizeDate(a.createdAt);
    });

    renderRecommended(candidates.slice(0, 8), ratingMap, me);

    const prevLevelKey = `sti_prev_level_${user.uid}`;
    const prevLevel = Number(localStorage.getItem(prevLevelKey) || 1);
    if (level > prevLevel) showXPPopup("🎉 Level Up!");
    localStorage.setItem(prevLevelKey, String(level));

  } catch (error) {
    console.error("Dashboard error:", error);
    if (welcome) welcome.innerText = "Error loading dashboard.";
  }
});

window.logout = async function () {
  await signOut(auth);
  window.location.href = "index.html";
};

window.goToProfile = function () {
  window.location.href = "profile.html";
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

window.goToProgress = function () {
  window.location.href = "progress.html";
};

window.goToMissions = function () {
  window.location.href = "missions.html";
};

window.goToStats = function () {
  window.location.href = "stats.html";
};

window.goToRatings = function () {
  window.location.href = "ratings.html";
};

window.openStudentProfile = function (uid) {
  window.location.href = `view-profile.html?uid=${uid}`;
};

window.quickRequest = function (uid) {
  window.location.href = `view-profile.html?uid=${uid}`;
};