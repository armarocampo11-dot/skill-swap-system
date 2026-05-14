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

let globalNotificationItems = [];

function go(page) {
  window.location.href = page;
}

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

window.goToDashboard = function () { go("dashboard.html"); };
window.goToBrowse = function () { go("browse.html"); };
window.goToRequests = function () { go("requests.html"); };
window.goToConnections = function () { go("connections.html"); };
window.goToProfile = function () { go("profile.html"); };
window.goToProgress = function () { go("progress.html"); };
window.goToMissions = function () { go("missions.html"); };
window.goToStats = function () { go("stats.html"); };
window.goToRatings = function () { go("ratings.html"); };
window.goToSwipe = function () { go("swipe.html"); };

window.goBack = function () {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    go("dashboard.html");
  }
};

window.focusDashboardSearch = function () {
  const input = document.getElementById("dashboardSearchInput");
  if (!input) return;
  input.focus();
  input.scrollIntoView({ behavior: "smooth", block: "center" });
};

window.confirmLogout = async function () {
  const sure = window.confirm("Are you sure you want to log out?");
  if (!sure) return;

  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout error:", error);
  }

  window.location.href = "index.html";
};

window.toggleNotifications = function () {
  const panel = document.getElementById("globalNotificationOverlay");
  if (!panel) return;
  panel.classList.toggle("show");
};

window.closeNotifications = function () {
  const panel = document.getElementById("globalNotificationOverlay");
  if (!panel) return;
  panel.classList.remove("show");
};

window.openNotificationTarget = function (target) {
  if (!target) return;
  window.location.href = target;
};

function ensureGlobalTools() {
  const page = location.pathname.split("/").pop() || "dashboard.html";
  if (page === "index.html") return;

  let actions = document.querySelector(".app-header-actions");

  if (!actions) {
    const headerTop = document.querySelector(".app-header-top");
    if (headerTop) {
      actions = document.createElement("div");
      actions.className = "app-header-actions";
      headerTop.appendChild(actions);
    }
  }

  if (!actions) return;

  actions.classList.add("global-header-tools");

  const oldLogoutButtons = actions.querySelectorAll(".logout-round-btn:not([data-global-logout])");
  oldLogoutButtons.forEach(btn => btn.remove());

  const oldNotifButtons = actions.querySelectorAll("[data-notification-button]:not([data-global-notification])");
  oldNotifButtons.forEach(btn => btn.remove());

  if (!actions.querySelector("[data-global-notification]")) {
    const notif = document.createElement("button");
    notif.type = "button";
    notif.className = "global-tool-btn";
    notif.setAttribute("data-global-notification", "true");
    notif.setAttribute("aria-label", "Notifications");
    notif.innerHTML = `🔔<span id="globalNotificationBadge" class="global-notification-badge">0</span>`;
    notif.addEventListener("click", window.toggleNotifications);
    actions.prepend(notif);
  }

  if (!actions.querySelector("[data-global-profile]")) {
    const profile = document.createElement("button");
    profile.type = "button";
    profile.className = "global-tool-btn global-profile-btn";
    profile.setAttribute("data-global-profile", "true");
    profile.setAttribute("aria-label", "Profile");
    profile.innerHTML = "👤";
    profile.addEventListener("click", window.goToProfile);
    actions.appendChild(profile);
  }

  if (!actions.querySelector("[data-global-logout]")) {
    const logout = document.createElement("button");
    logout.type = "button";
    logout.className = "global-tool-btn global-logout-btn";
    logout.setAttribute("data-global-logout", "true");
    logout.setAttribute("aria-label", "Logout");
    logout.innerHTML = "↪";
    logout.addEventListener("click", window.confirmLogout);
    actions.appendChild(logout);
  }
}

function ensureNotificationOverlay() {
  if (document.getElementById("globalNotificationOverlay")) return;

  const overlay = document.createElement("section");
  overlay.id = "globalNotificationOverlay";
  overlay.className = "global-notification-overlay";

  overlay.innerHTML = `
    <div class="global-notification-sheet">
      <div class="global-notification-head">
        <h3>Notifications</h3>
        <button type="button" onclick="closeNotifications()">Close</button>
      </div>
      <div id="globalNotificationList" class="global-notification-list"></div>
    </div>
  `;

  overlay.addEventListener("click", event => {
    if (event.target.id === "globalNotificationOverlay") {
      overlay.classList.remove("show");
    }
  });

  document.body.appendChild(overlay);
}

function renderGlobalNotifications(items) {
  globalNotificationItems = items;

  const list = document.getElementById("globalNotificationList");
  const badge = document.getElementById("globalNotificationBadge");

  if (!list) return;

  list.innerHTML = items.map(item => `
    <div class="global-notification-item" onclick="openNotificationTarget('${item.target}')">
      <div class="global-notification-icon">${item.icon}</div>
      <div>
        <h4>${escapeHTML(item.title)}</h4>
        <p>${escapeHTML(item.message)}</p>
      </div>
      <div class="global-notification-arrow">›</div>
    </div>
  `).join("");

  const urgentCount = items.filter(item => item.urgent).length;

  if (badge) {
    badge.style.display = urgentCount > 0 ? "grid" : "none";
    badge.innerText = urgentCount > 9 ? "9+" : urgentCount;
  }

  const oldRequestBadge = document.getElementById("requestBadge");
  if (oldRequestBadge) {
    oldRequestBadge.style.display = urgentCount > 0 ? "inline-grid" : "none";
    oldRequestBadge.innerText = urgentCount > 9 ? "9+" : urgentCount;
  }
}

async function loadGlobalNotifications(user) {
  if (!user) return;

  try {
    const [userSnap, swapSnapshot, messageSnapshot] = await Promise.all([
      getDoc(doc(db, "users", user.uid)),
      getDocs(collection(db, "swapRequests")),
      getDocs(collection(db, "messages"))
    ]);

    const me = userSnap.exists() ? userSnap.data() : {};
    const profileCompletion = getProfileCompletion(me);
    const notifications = [];

    const pendingRequests = [];
    const activeSwaps = [];

    swapSnapshot.forEach(docSnap => {
      const request = docSnap.data();
      const isMine = request.requesterId === user.uid || request.receiverId === user.uid;
      if (!isMine) return;

      if (request.receiverId === user.uid && request.status === "pending") {
        pendingRequests.push({ id: docSnap.id, ...request });
      }

      if (request.status === "accepted") {
        activeSwaps.push({ id: docSnap.id, ...request });
      }
    });

    pendingRequests.slice(0, 5).forEach(request => {
      notifications.push({
        icon: "📨",
        title: `New request from ${safeText(request.requesterName, "Student")}`,
        message: safeText(request.message, "Tap to review this skill request."),
        target: "requests.html",
        urgent: true
      });
    });

    let unreadCount = 0;
    const unreadBySender = {};

    messageSnapshot.forEach(docSnap => {
      const msg = docSnap.data();
      const seenBy = Array.isArray(msg.seenBy) ? msg.seenBy : [];
      const isDirectForMe = msg.receiverId === user.uid;
      const isConversationForMe = Array.isArray(msg.participants) && msg.participants.includes(user.uid);
      const isUnread = msg.senderId !== user.uid && (isDirectForMe || isConversationForMe) && !seenBy.includes(user.uid);

      if (isUnread) {
        unreadCount++;
        const sender = msg.senderName || msg.senderId || "Student";
        unreadBySender[sender] = (unreadBySender[sender] || 0) + 1;
      }
    });

    Object.entries(unreadBySender).slice(0, 5).forEach(([sender, count]) => {
      notifications.push({
        icon: "💬",
        title: `${count} unread message${count === 1 ? "" : "s"}`,
        message: `Tap to open your conversation with ${sender}.`,
        target: "connections.html",
        urgent: true
      });
    });

    activeSwaps.slice(0, 4).forEach(request => {
      const partner = request.requesterId === user.uid
        ? safeText(request.receiverName, "Student")
        : safeText(request.requesterName, "Student");

      notifications.push({
        icon: "🤝",
        title: `Active swap with ${partner}`,
        message: "Tap to manage this accepted exchange.",
        target: "requests.html",
        urgent: false
      });
    });

    if (profileCompletion < 100) {
      notifications.push({
        icon: "👤",
        title: `Profile ${profileCompletion}% complete`,
        message: "Complete your profile to improve your matches.",
        target: "profile.html",
        urgent: profileCompletion < 70
      });
    }

    if (!notifications.length) {
      notifications.push({
        icon: "✨",
        title: "No urgent alerts",
        message: "Discover students, swipe matches, or update your profile.",
        target: "browse.html",
        urgent: false
      });
    }

    renderGlobalNotifications(notifications);
  } catch (error) {
    console.error("Global notification load error:", error);
    renderGlobalNotifications([
      {
        icon: "⚠️",
        title: "Notifications unavailable",
        message: "Please check Firebase rules or reload the page.",
        target: "dashboard.html",
        urgent: false
      }
    ]);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const page = location.pathname.split("/").pop() || "dashboard.html";

  document.querySelectorAll("[data-page]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });

  const dashboardSearch = document.getElementById("dashboardSearchInput");
  if (dashboardSearch) {
    dashboardSearch.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        const value = dashboardSearch.value.trim();
        window.location.href = value
          ? `browse.html?search=${encodeURIComponent(value)}`
          : "browse.html";
      }
    });
  }

  ensureGlobalTools();
  ensureNotificationOverlay();

  onAuthStateChanged(auth, user => {
    if (!user && page !== "index.html") return;
    if (user) loadGlobalNotifications(user);
  });
});
