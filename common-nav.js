import { app } from "./firebase-config.js";

import {
  getAuth,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const auth = getAuth(app);

function go(page) {
  window.location.href = page;
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
  if (window.history.length > 1) window.history.back();
  else go("dashboard.html");
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
  const panel = document.getElementById("notificationPanel");
  if (!panel) return;
  panel.classList.toggle("show");
};

window.closeNotifications = function () {
  const panel = document.getElementById("notificationPanel");
  if (!panel) return;
  panel.classList.remove("show");
};

window.openNotificationTarget = function (target) {
  if (!target) return;
  window.location.href = target;
};

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

  document.addEventListener("click", event => {
    const panel = document.getElementById("notificationPanel");
    const bell = event.target.closest("[data-notification-button]");
    if (!panel || bell) return;
    if (!event.target.closest("#notificationPanel")) {
      panel.classList.remove("show");
    }
  });
});
