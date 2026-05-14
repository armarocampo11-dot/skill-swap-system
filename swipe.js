import { app } from "./firebase-config.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  getDocs,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentUserData = {};
let swipeUsers = [];
let ratingsMap = {};
let currentIndex = 0;

let selectedReceiver = null;
let selectedReceiverName = "";
let selectedCard = null;
let selectedType = "Swap";

function escapeHTML(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text === "" ? fallback : text;
}

function makeSkillTags(skillsText, limit = 3) {
  const skills = safeText(skillsText, "")
    .split(",")
    .map(skill => skill.trim())
    .filter(Boolean)
    .slice(0, limit);

  if (!skills.length) return `<span class="skill-tag">No skills</span>`;
  return skills.map(skill => `<span class="skill-tag">${escapeHTML(skill)}</span>`).join("");
}

function getRatingDisplay(userId) {
  const info = ratingsMap[userId];
  if (!info || info.count === 0) return "New";
  const average = (info.totalStars / info.count).toFixed(1);
  return `${average}★`;
}

async function loadRatings() {
  ratingsMap = {};
  const ratingSnapshot = await getDocs(collection(db, "ratings"));

  ratingSnapshot.forEach(docSnap => {
    const rating = docSnap.data();
    const rateeId = rating.rateeId;
    if (!rateeId) return;

    if (!ratingsMap[rateeId]) {
      ratingsMap[rateeId] = { totalStars: 0, count: 0 };
    }

    ratingsMap[rateeId].totalStars += Number(rating.stars || 0);
    ratingsMap[rateeId].count += 1;
  });
}

async function loadSwipeUsers(currentUid) {
  const querySnapshot = await getDocs(collection(db, "users"));
  swipeUsers = [];
  currentUserData = {};

  querySnapshot.forEach(docSnap => {
    const data = docSnap.data();

    if (docSnap.id === currentUid) {
      currentUserData = data;
    } else {
      swipeUsers.push({
        id: docSnap.id,
        ...data
      });
    }
  });

  currentIndex = 0;
}

function renderSwipeStack() {
  const stack = document.getElementById("swipeStack");
  const empty = document.getElementById("swipeEmptyState");

  if (!stack || !empty) {
    console.error("Missing swipeStack or swipeEmptyState in swipe.html");
    return;
  }

  stack.innerHTML = "";

  if (currentIndex >= swipeUsers.length) {
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";

  const visibleUsers = swipeUsers.slice(currentIndex, currentIndex + 3);

  visibleUsers.reverse().forEach((userData, reverseIndex) => {
    const layer = visibleUsers.length - 1 - reverseIndex;
    const card = createSwipeCard(userData, layer);
    stack.appendChild(card);
  });
}

function createSwipeCard(userData, layer) {
  const avatar = safeText(userData.profilePic, "avatars/avatar1.png");

  const card = document.createElement("div");
  card.className = "swipe-card";
  card.style.zIndex = String(20 - layer);
  card.style.transform = `scale(${1 - layer * 0.035}) translateY(${layer * 10}px)`;

  card.innerHTML = `
    <div class="swipe-card-inner">
      <div class="swipe-card-top">
        <img src="${escapeHTML(avatar)}" alt="Profile picture" class="swipe-avatar">

        <div>
          <p class="rating-text">${escapeHTML(getRatingDisplay(userData.id))}</p>
          <h2>${escapeHTML(safeText(userData.name, "Student"))}</h2>
          <p class="muted-text">${escapeHTML(safeText(userData.course, "Course"))} • ${escapeHTML(safeText(userData.yearLevel, "Year"))}</p>
        </div>
      </div>

      <div class="preference-pill">${escapeHTML(safeText(userData.transactionPreference, "Either"))}</div>

      <div class="skill-tags">${makeSkillTags(userData.offeredSkills)}</div>

      <p class="bio-text">${escapeHTML(safeText(userData.bio, "No bio yet."))}</p>

      <div class="swipe-actions">
        <button type="button" data-action="skip" class="secondary-btn">Skip</button>
        <button type="button" data-action="profile">View</button>
        <button type="button" data-action="like">Request</button>
      </div>
    </div>
  `;

  card.querySelector('[data-action="skip"]').addEventListener("click", event => {
    event.stopPropagation();
    swipeLeft(card);
  });

  card.querySelector('[data-action="profile"]').addEventListener("click", event => {
    event.stopPropagation();
    window.location.href = `view-profile.html?uid=${userData.id}`;
  });

  card.querySelector('[data-action="like"]').addEventListener("click", event => {
    event.stopPropagation();
    openRequestModal(card, userData.id, safeText(userData.name, "Student"));
  });

  if (layer === 0) enableSwipe(card, userData);
  else card.classList.add("swipe-card-back");

  return card;
}

function enableSwipe(card, userData) {
  let startX = 0;
  let currentX = 0;
  let dragging = false;
  let moved = false;

  function start(clientX, pointerId = null) {
    dragging = true;
    moved = false;
    startX = clientX;
    currentX = 0;
    card.classList.add("dragging");
    if (pointerId !== null && card.setPointerCapture) {
      try { card.setPointerCapture(pointerId); } catch {}
    }
  }

  function move(clientX) {
    if (!dragging) return;
    currentX = clientX - startX;
    if (Math.abs(currentX) > 8) moved = true;
    const rotate = currentX * 0.045;
    card.style.transform = `translateX(${currentX}px) rotate(${rotate}deg)`;
    card.style.opacity = String(Math.max(0.72, 1 - Math.abs(currentX) / 460));
  }

  function end() {
    if (!dragging) return;
    dragging = false;
    card.classList.remove("dragging");

    if (currentX > 110) {
      swipeRightToProfile(card, userData.id);
    } else if (currentX < -110) {
      swipeLeft(card);
    } else {
      currentX = 0;
      card.style.transform = "";
      card.style.opacity = "1";
    }
  }

  card.addEventListener("pointerdown", event => {
    if (event.target.closest("button")) return;
    start(event.clientX, event.pointerId);
  });

  card.addEventListener("pointermove", event => move(event.clientX));
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);

  card.addEventListener("touchstart", event => {
    if (event.target.closest("button")) return;
    start(event.touches[0].clientX);
  }, { passive: true });

  card.addEventListener("touchmove", event => {
    if (!dragging) return;
    move(event.touches[0].clientX);
  }, { passive: true });

  card.addEventListener("touchend", end);

  card.addEventListener("click", event => {
    if (event.target.closest("button")) return;
    if (moved) {
      moved = false;
      return;
    }
    window.location.href = `view-profile.html?uid=${userData.id}`;
  });
}

function swipeLeft(card) {
  card.style.transform = "translateX(-140%) rotate(-18deg)";
  card.style.opacity = "0";
  setTimeout(() => {
    currentIndex++;
    renderSwipeStack();
  }, 220);
}

function swipeRightToProfile(card, userId) {
  card.style.transform = "translateX(140%) rotate(18deg)";
  card.style.opacity = "0";
  setTimeout(() => {
    currentIndex++;
    renderSwipeStack();
    window.location.href = `view-profile.html?uid=${userId}`;
  }, 220);
}

function removeTopCardAfterLike(card) {
  card.style.transform = "translateX(140%) rotate(18deg)";
  card.style.opacity = "0";
  setTimeout(() => {
    currentIndex++;
    renderSwipeStack();
  }, 220);
}

function openRequestModal(card, receiverId, receiverName) {
  selectedReceiver = receiverId;
  selectedReceiverName = receiverName;
  selectedCard = card;
  selectedType = "Swap";

  const modal = document.getElementById("requestModal");
  const amountInput = document.getElementById("amountInput");
  const messageInput = document.getElementById("messageInput");
  const amountSection = document.getElementById("amountSection");

  if (modal) modal.style.display = "flex";
  if (amountInput) amountInput.value = "";
  if (messageInput) messageInput.value = "Hi! I'm interested in your skills. Let's connect.";
  if (amountSection) amountSection.style.display = "none";

  setTimeout(() => window.selectType("Swap"), 30);
}

window.selectType = function (type) {
  selectedType = type;
  document.querySelectorAll(".modal-options button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.type === type);
  });

  const amountSection = document.getElementById("amountSection");
  if (amountSection) amountSection.style.display = type === "Payment" ? "block" : "none";
};

window.closeModal = function () {
  const modal = document.getElementById("requestModal");
  if (modal) modal.style.display = "none";

  selectedReceiver = null;
  selectedReceiverName = "";
  selectedCard = null;
  selectedType = "Swap";
};

window.submitRequest = async function () {
  const message = document.getElementById("messageInput")?.value.trim();
  const amount = document.getElementById("amountInput")?.value.trim() || "";

  if (!selectedReceiver) {
    alert("No selected user.");
    return;
  }

  if (!message) {
    alert("Please enter a message.");
    return;
  }

  if (selectedType === "Payment" && !amount) {
    alert("Please enter the amount for a payment request.");
    return;
  }

  try {
    await addDoc(collection(db, "swapRequests"), {
      requesterId: currentUser.uid,
      requesterName: safeText(currentUserData?.name, "Unknown User"),
      receiverId: selectedReceiver,
      receiverName: selectedReceiverName,
      message,
      status: "pending",
      createdAt: new Date().toISOString(),
      transactionType: selectedType,
      proposedAmount: selectedType === "Payment" ? amount : ""
    });

    const cardToRemove = selectedCard;
    window.closeModal();

    if (cardToRemove) removeTopCardAfterLike(cardToRemove);
  } catch (error) {
    console.error("Swipe request error:", error);
    alert("Error sending request.");
  }
};

window.resetSwipeStack = function () {
  currentIndex = 0;
  renderSwipeStack();
};

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  try {
    await loadRatings();
    await loadSwipeUsers(user.uid);
    renderSwipeStack();
  } catch (error) {
    console.error("Swipe load error:", error);
    alert("Error loading swipe page. Check Firebase rules.");
  }
});
