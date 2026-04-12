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
  addDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let requestId = null;
let currentRequest = null;

const urlParams = new URLSearchParams(window.location.search);
requestId = urlParams.get("requestId");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;
  await loadRequestInfo();
});

async function loadRequestInfo() {
  const statusEl = document.getElementById("ratingStatus");
  const submitBtn = document.getElementById("submitRatingBtn");

  try {
    if (!requestId) {
      statusEl.innerText = "Missing request ID.";
      return;
    }

    const requestRef = doc(db, "swapRequests", requestId);
    const requestSnap = await getDoc(requestRef);

    if (!requestSnap.exists()) {
      statusEl.innerText = "Request not found.";
      return;
    }

    currentRequest = requestSnap.data();

    const partnerName =
      currentRequest.requesterId === currentUser.uid
        ? currentRequest.receiverName
        : currentRequest.requesterName;

    document.getElementById("partnerName").innerText = partnerName || "Unknown Partner";
    document.getElementById("requestStatus").innerText = currentRequest.status || "Unknown";

    if (currentRequest.status !== "completed") {
      statusEl.innerText = "You can only rate completed transactions.";
      submitBtn.disabled = true;
      return;
    }

    const q = query(
      collection(db, "ratings"),
      where("requestId", "==", requestId),
      where("raterId", "==", currentUser.uid)
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      statusEl.innerText = "You already rated this transaction.";
      submitBtn.disabled = true;
      return;
    }

    statusEl.innerText = "";
  } catch (error) {
    console.error("Load rating info error:", error);
    statusEl.innerText = "Error loading rating page.";
  }
}

window.submitRating = async function () {
  const statusEl = document.getElementById("ratingStatus");

  if (!currentUser || !currentRequest) {
    statusEl.innerText = "Missing user or request data.";
    return;
  }

  const stars = document.getElementById("stars").value;
  const feedback = document.getElementById("feedback").value.trim();

  const rateeId =
    currentRequest.requesterId === currentUser.uid
      ? currentRequest.receiverId
      : currentRequest.requesterId;

  const rateeName =
    currentRequest.requesterId === currentUser.uid
      ? currentRequest.receiverName
      : currentRequest.requesterName;

  try {
   await addDoc(collection(db, "ratings"), {
  requestId: requestId,
  raterId: currentUser.uid,
  raterName: currentUser.email,
  rateeId: rateeId,
  rateeName: rateeName,
  stars: Number(stars),
  feedback: feedback,
  createdAt: new Date().toISOString()
});
    statusEl.innerText = "Rating submitted successfully!";
    document.getElementById("submitRatingBtn").disabled = true;
  } catch (error) {
    console.error("Submit rating error:", error);
    statusEl.innerText = "Error submitting rating.";
  }
};

window.goBack = function () {
  window.location.href = "connections.html";
};
