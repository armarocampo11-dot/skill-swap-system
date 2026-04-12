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

function formatDateText(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    const [userSnap, swapSnapshot, ratingSnapshot] = await Promise.all([
      getDoc(doc(db, "users", user.uid)),
      getDocs(collection(db, "swapRequests")),
      getDocs(collection(db, "ratings"))
    ]);

    const me = userSnap.exists() ? userSnap.data() : {};
    const statsWelcome = document.getElementById("statsWelcome");
    if (statsWelcome) {
      statsWelcome.innerText = `${me.name || "Student"}, here is your swap performance overview.`;
    }

    let totalRequests = 0;
    let completedSwaps = 0;
    let acceptedRequests = 0;
    let rejectedFailed = 0;

    const historyItems = [];

    swapSnapshot.forEach((docSnap) => {
      const request = docSnap.data();

      const isMine =
        request.requesterId === user.uid ||
        request.receiverId === user.uid;

      if (!isMine) return;

      totalRequests++;

      if (request.status === "completed") completedSwaps++;
      if (request.status === "accepted") acceptedRequests++;
      if (request.status === "rejected" || request.status === "failed") rejectedFailed++;

      const otherPerson =
        request.requesterId === user.uid
          ? (request.receiverName || "Other Student")
          : (request.requesterName || "Other Student");

      historyItems.push({
        type: request.status || "pending",
        title: `${(request.transactionType || "Swap")} request with ${otherPerson}`,
        message: request.message || "No message",
        date: request.createdAt || "",
        person: otherPerson
      });
    });

    let ratingTotal = 0;
    let ratingCount = 0;

    ratingSnapshot.forEach((docSnap) => {
      const rating = docSnap.data();
      if (rating.rateeId === user.uid) {
        ratingTotal += Number(rating.stars);
        ratingCount++;
      }
    });

    const ratingAverage = ratingCount > 0
      ? (ratingTotal / ratingCount).toFixed(1)
      : "0.0";

    const successRate = totalRequests > 0
      ? Math.round((completedSwaps / totalRequests) * 100)
      : 0;

    document.getElementById("totalRequests").innerText = totalRequests;
    document.getElementById("completedSwaps").innerText = completedSwaps;
    document.getElementById("acceptedRequests").innerText = acceptedRequests;
    document.getElementById("rejectedFailed").innerText = rejectedFailed;
    document.getElementById("successRate").innerText = `${successRate}%`;
    document.getElementById("ratingAverage").innerText = `${ratingAverage}★`;
    document.getElementById("historyCount").innerText = historyItems.length;

    const historyList = document.getElementById("historyList");
    if (historyList) {
      if (!historyItems.length) {
        historyList.innerHTML = `<p class="small-text">No history yet.</p>`;
      } else {
        historyItems.sort((a, b) => new Date(b.date) - new Date(a.date));

        historyList.innerHTML = historyItems.map(item => `
          <div class="stats-history-item">
            <div class="stats-history-top">
              <span class="stats-history-status ${item.type}">${item.type}</span>
              <span class="stats-history-date">${formatDateText(item.date)}</span>
            </div>

            <h4>${item.title}</h4>
            <p>${item.message}</p>
          </div>
        `).join("");
      }
    }

  } catch (error) {
    console.error("Stats page error:", error);
  }
});

window.goToDashboard = function () {
  window.location.href = "dashboard.html";
};

window.goToProfile = function () {
  window.location.href = "profile.html";
};