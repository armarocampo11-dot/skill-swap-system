import { app } from "./firebase-config.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const auth = getAuth(app);

function go(page) {
  window.location.href = page;
}

window.goToDashboard = function () { go("dashboard.html"); };
window.goToBrowse = function () { go("browse.html"); };
window.goToRequests = function () { go("requests.html"); };
window.goToConnections = function () { go("connections.html"); };
window.goToProfile = function () { go("profile.html"); };
window.goToMissions = function () { go("missions.html"); };
window.goToProgress = function () { go("progress.html"); };
window.goToRatings = function () { go("ratings.html"); };
window.goToStats = function () { go("stats.html"); };
window.goToSwipe = function () { go("swipe.html"); };
window.goBack = function () {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    go("dashboard.html");
  }
};

window.logout = async function () {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout error:", error);
  }
  window.location.href = "index.html";
};

window.focusDashboardSearch = function () {
  const searchInput = document.getElementById("dashboardQuickSearch");
  if (!searchInput) return;
  searchInput.focus();
  try {
    searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch {
    searchInput.scrollIntoView();
  }
};

window.openDashboardFilter = function () {
  window.focusDashboardSearch();
};

window.handleDashboardSearchKey = function (event) {
  if (event.key !== "Enter") return;
  const value = event.target.value.trim();
  if (value) sessionStorage.setItem("dashboardSearch", value);
  window.location.href = "browse.html";
};

function routeName() {
  const file = (window.location.pathname.split("/").pop() || "dashboard.html").toLowerCase();
  if (file === "" || file === "index.html" || file.includes("dashboard")) return "home";
  if (file.includes("browse") || file.includes("swipe") || file.includes("view-profile")) return "discover";
  if (file.includes("request") || file === "rating.html") return "requests";
  if (file.includes("connection") || file.includes("chat")) return "connections";
  if (file.includes("profile") || file.includes("mission") || file.includes("progress") || file.includes("ratings") || file.includes("stats")) return "profile";
  return "home";
}

function buttonRoute(button) {
  const explicit = button.dataset.route;
  if (explicit) return explicit;
  const raw = ((button.getAttribute("onclick") || "") + " " + button.textContent).toLowerCase();
  if (raw.includes("gotodashboard") || raw.includes("dashboard") || raw.includes("home")) return "home";
  if (raw.includes("gotobrowse") || raw.includes("browse") || raw.includes("discover") || raw.includes("swipe")) return "discover";
  if (raw.includes("gotorequests") || raw.includes("requests")) return "requests";
  if (raw.includes("gotoconnections") || raw.includes("connections") || raw.includes("chat")) return "connections";
  if (raw.includes("gotoprofile") || raw.includes("profile") || raw.includes("mission") || raw.includes("rating") || raw.includes("stats") || raw.includes("progress")) return "profile";
  return "";
}

function setActiveButtons() {
  const current = routeName();
  document.querySelectorAll(".app-tabs button, .nav-links button, .app-bottom-nav button, .bottom-nav button").forEach((button) => {
    const route = buttonRoute(button);
    button.classList.toggle("active", route === current);
  });
}

function applyDashboardSearchToBrowse() {
  const input = document.getElementById("browseSearchInput");
  if (!input) return;

  const stored = sessionStorage.getItem("dashboardSearch");
  if (!stored) return;

  const apply = () => {
    input.value = stored;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  setTimeout(apply, 150);
  setTimeout(apply, 500);
  setTimeout(() => sessionStorage.removeItem("dashboardSearch"), 800);
}

function protectTapTargets() {
  document.querySelectorAll("button, a, input, textarea, select").forEach((el) => {
    el.style.pointerEvents = "auto";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setActiveButtons();
  applyDashboardSearchToBrowse();
  protectTapTargets();
});
