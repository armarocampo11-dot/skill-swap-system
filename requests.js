import { app } from "./firebase-config.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let allRequests = [];
let allRatings = [];
let activeFilter = "needs_action";
let pendingRatingRequest = null;

function safeText(value, fallback = "Not provided") {
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

function formatDate(value) {
  if (!value) return "No date";
  if (typeof value === "object" && typeof value.toDate === "function") {
    try {
      return value.toDate().toLocaleString();
    } catch {
      return "Unknown date";
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Unknown date" : parsed.toLocaleString();
}

function getOtherPerson(request) {
  if (!currentUser) return { id: "", name: "Student" };

  if (request.requesterId === currentUser.uid) {
    return {
      id: request.receiverId || "",
      name: safeText(request.receiverName, "Student")
    };
  }

  return {
    id: request.requesterId || "",
    name: safeText(request.requesterName, "Student")
  };
}

function hasUserRatedRequest(requestId) {
  if (!currentUser) return false;
  return allRatings.some(r => r.requestId === requestId && r.raterId === currentUser.uid);
}

function getRequestGroup(request) {
  const incomingPending =
    request.receiverId === currentUser.uid &&
    request.status === "pending";

  const outgoingPending =
    request.requesterId === currentUser.uid &&
    request.status === "pending";

  if (incomingPending) return "needs_action";
  if (request.status === "accepted") return "active";
  if (request.status === "completed") return "completed";
  if (outgoingPending || request.status === "rejected" || request.status === "failed") return "sent";
  return "sent";
}

function sortRequests(list) {
  return [...list].sort((a, b) => normalizeDate(b.createdAt) - normalizeDate(a.createdAt));
}

function getCounts() {
  const counts = {
    needs_action: 0,
    active: 0,
    completed: 0,
    sent: 0
  };

  allRequests.forEach(r => {
    const group = getRequestGroup(r);
    counts[group] += 1;
  });

  return counts;
}

function getFilterMeta(filter) {
  if (filter === "needs_action") {
    return {
      title: "Needs Action",
      subtitle: "Incoming requests waiting for your response."
    };
  }

  if (filter === "active") {
    return {
      title: "Active Swaps",
      subtitle: "Accepted exchanges that are still in progress."
    };
  }

  if (filter === "completed") {
    return {
      title: "Completed Requests",
      subtitle: "Finished exchanges. You can rate each completed request here."
    };
  }

  return {
    title: "Sent Requests",
    subtitle: "Requests you sent that are still pending or no longer active."
  };
}

function statusClass(status) {
  const value = safeText(status, "pending").toLowerCase();
  if (value === "accepted") return "status-accepted";
  if (value === "completed") return "status-completed";
  if (value === "rejected" || value === "failed") return "status-rejected";
  return "status-pending";
}

function compactMethodLabel(request) {
  return safeText(request.transactionType || request.mode, "Swap");
}

function compactSkillLabel(request) {
  return safeText(request.skillName || request.skill || request.requestTitle, "Skill exchange");
}

function compactAmountLabel(request) {
  return request.amount ? `₱${request.amount}` : "No amount";
}

function buildActionArea(request) {
  const isIncomingPending =
    request.receiverId === currentUser.uid &&
    request.status === "pending";

  const isActive = request.status === "accepted";
  const canRate =
    request.status === "completed" &&
    !hasUserRatedRequest(request.id);

  if (isIncomingPending) {
    return `
      <div class="request-modern-actions">
        <button onclick="acceptRequest('${request.id}')">Accept</button>
        <button class="secondary-btn" onclick="rejectRequest('${request.id}')">Reject</button>
      </div>
    `;
  }

  if (isActive) {
    return `
      <div class="request-modern-actions">
        <button onclick="markRequestCompleted('${request.id}')">Mark Completed</button>
      </div>
    `;
  }

  if (canRate) {
    return `
      <div class="request-modern-actions">
        <button onclick="openRatingModal('${request.id}')">Rate This Request</button>
      </div>
    `;
  }

  if (request.status === "completed" && hasUserRatedRequest(request.id)) {
    return `<p class="request-inline-note success-note">You already rated this completed request.</p>`;
  }

  if (request.status === "pending" && request.requesterId === currentUser.uid) {
    return `<p class="request-inline-note muted-note">Waiting for the other person to respond.</p>`;
  }

  if (request.status === "rejected") {
    return `<p class="request-inline-note muted-note">This request was declined.</p>`;
  }

  if (request.status === "failed") {
    return `<p class="request-inline-note muted-note">This request did not continue.</p>`;
  }

  return "";
}

function buildRequestCard(request) {
  const other = getOtherPerson(request);
  const statusText = safeText(request.status, "pending");
  const method = compactMethodLabel(request);
  const skill = compactSkillLabel(request);
  const amount = compactAmountLabel(request);
  const message = safeText(request.message, "No message");
  const dateText = formatDate(request.createdAt);

  return `
    <article class="request-modern-card">
      <div class="request-modern-top">
        <div>
          <h3>${other.name}</h3>
          <p class="request-modern-date">${dateText}</p>
        </div>
        <span class="request-modern-status ${statusClass(statusText)}">${statusText}</span>
      </div>

      <div class="request-modern-tags">
        <span class="request-modern-tag">${method}</span>
        <span class="request-modern-tag">${skill}</span>
        <span class="request-modern-tag">${amount}</span>
      </div>

      <p class="request-modern-message">${message}</p>

      ${buildActionArea(request)}
    </article>
  `;
}

function renderCounts() {
  const counts = getCounts();
  document.getElementById("needsActionCount").innerText = counts.needs_action;
  document.getElementById("activeCount").innerText = counts.active;
  document.getElementById("completedCount").innerText = counts.completed;
  document.getElementById("sentCount").innerText = counts.sent;
}

function renderFilterState() {
  document.querySelectorAll(".request-filter-card").forEach(card => {
    card.classList.toggle("active-filter", card.dataset.filter === activeFilter);
  });

  const meta = getFilterMeta(activeFilter);
  document.getElementById("requestBoardTitle").innerText = meta.title;
  document.getElementById("requestBoardSubtitle").innerText = meta.subtitle;
}

function renderRequests() {
  const container = document.getElementById("requestsList");
  const filtered = sortRequests(allRequests.filter(r => getRequestGroup(r) === activeFilter));

  if (!filtered.length) {
    container.innerHTML = `
      <div class="requests-empty-state polished-empty">
        <div class="reviews-empty-icon">📭</div>
        <h4>No requests here right now</h4>
        <p>This section is clear for now.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(buildRequestCard).join("");
}

async function reloadData() {
  const [userSnap, requestSnap, ratingsSnap] = await Promise.all([
    getDoc(doc(db, "users", currentUser.uid)),
    getDocs(collection(db, "swapRequests")),
    getDocs(collection(db, "ratings"))
  ]);

  const me = userSnap.exists() ? userSnap.data() : {};
  document.getElementById("requestsWelcome").innerText =
    `${safeText(me.name, "Student")}, this page keeps your requests organized and easier to manage.`;

  allRequests = requestSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(r => r.requesterId === currentUser.uid || r.receiverId === currentUser.uid);

  allRatings = ratingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  renderCounts();
  renderFilterState();
  renderRequests();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;
  await reloadData();
});

document.addEventListener("click", (e) => {
  const filterCard = e.target.closest(".request-filter-card");
  if (!filterCard) return;

  activeFilter = filterCard.dataset.filter;
  renderFilterState();
  renderRequests();
});

window.acceptRequest = async function (requestId) {
  await updateDoc(doc(db, "swapRequests", requestId), {
    status: "accepted"
  });
  await reloadData();
};

window.rejectRequest = async function (requestId) {
  await updateDoc(doc(db, "swapRequests", requestId), {
    status: "rejected"
  });
  await reloadData();
};

window.markRequestCompleted = async function (requestId) {
  await updateDoc(doc(db, "swapRequests", requestId), {
    status: "completed"
  });
  await reloadData();
};

window.openRatingModal = function (requestId) {
  pendingRatingRequest = allRequests.find(r => r.id === requestId) || null;
  if (!pendingRatingRequest) return;

  const other = getOtherPerson(pendingRatingRequest);
  document.getElementById("ratingModalTarget").innerText =
    `You are rating this completed request with ${other.name}.`;

  document.getElementById("ratingStars").value = "5";
  document.getElementById("ratingComment").value = "";
  document.getElementById("ratingModal").classList.remove("hidden");
};

window.closeRatingModal = function () {
  pendingRatingRequest = null;
  document.getElementById("ratingModal").classList.add("hidden");
};

window.submitRating = async function () {
  if (!pendingRatingRequest || !currentUser) return;
  if (hasUserRatedRequest(pendingRatingRequest.id)) {
    closeRatingModal();
    return;
  }

  const other = getOtherPerson(pendingRatingRequest);
  const stars = Number(document.getElementById("ratingStars").value);
  const comment = document.getElementById("ratingComment").value.trim();

  const meSnap = await getDoc(doc(db, "users", currentUser.uid));
  const me = meSnap.exists() ? meSnap.data() : {};

  await addDoc(collection(db, "ratings"), {
    requestId: pendingRatingRequest.id,
    raterId: currentUser.uid,
    raterName: safeText(me.name, "Student"),
    rateeId: other.id,
    stars,
    comment,
    createdAt: new Date().toISOString()
  });

  closeRatingModal();
  await reloadData();
};

window.goToDashboard = function () {
  window.location.href = "dashboard.html";
};

window.goToBrowse = function () {
  window.location.href = "browse.html";
};

window.goToConnections = function () {
  window.location.href = "connections.html";
};