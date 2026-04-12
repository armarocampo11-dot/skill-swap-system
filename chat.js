import { app } from "./firebase-config.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  doc,
  updateDoc,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let requestId = null;
let refreshInterval = null;
let currentRequest = null;
let userCache = {};

const urlParams = new URLSearchParams(window.location.search);
requestId = urlParams.get("requestId");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  await loadChatHeader();
  await loadMessages();

  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(loadMessages, 2000);

  const input = document.getElementById("messageInput");
  if (input) {
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        sendMessage();
      }
    });
  }
});

async function getUserData(userId) {
  if (userCache[userId]) return userCache[userId];

  try {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      userCache[userId] = userSnap.data();
      return userCache[userId];
    }
  } catch (error) {
    console.error("User load error:", error);
  }

  return null;
}

function getAvatarSrc(profilePic) {
  if (profilePic && profilePic.trim() !== "") {
    return profilePic;
  }
  return "avatars/avatar1.png";
}

async function loadChatHeader() {
  try {
    const requestRef = doc(db, "swapRequests", requestId);
    const requestSnap = await getDoc(requestRef);

    if (!requestSnap.exists()) {
      document.getElementById("chatPartner").innerText = "Unknown Connection";
      document.getElementById("chatStatus").innerHTML = `<span class="status status-pending">Unknown</span>`;
      document.getElementById("chatMeta").innerText = "Request not found.";
      return;
    }

    currentRequest = requestSnap.data();

    const isRequester = currentRequest.requesterId === currentUser.uid;
    const partnerId = isRequester
      ? currentRequest.receiverId
      : currentRequest.requesterId;

    const partnerName = isRequester
      ? currentRequest.receiverName
      : currentRequest.requesterName;

    const partnerData = await getUserData(partnerId);
    const partnerPhoto = getAvatarSrc(partnerData?.profilePic);

    document.getElementById("chatPartner").innerHTML = `
      <div class="chat-header-flex">
        <img src="${partnerPhoto}" class="avatar" alt="Avatar">
        <span>${partnerName || "Skill Partner"}</span>
      </div>
    `;

    document.getElementById("chatStatus").innerHTML = `
      <span class="status status-${currentRequest.status}">
        ${currentRequest.status}
      </span>
    `;

    const course = partnerData?.course || "";
    const yearLevel = partnerData?.yearLevel || "";
    document.getElementById("chatMeta").innerText =
      [course, yearLevel].filter(Boolean).join(" • ") || "Skill Swap Partner";
  } catch (error) {
    console.error("Header load error:", error);
    document.getElementById("chatPartner").innerText = "Connection";
    document.getElementById("chatMeta").innerText = "Error loading chat info.";
  }
}

async function loadMessages() {
  try {
    const q = query(
      collection(db, "messages"),
      where("requestId", "==", requestId)
    );

    const snapshot = await getDocs(q);

    const box = document.getElementById("messagesBox");
    box.innerHTML = "";

    let messages = [];
    let unseenDocs = [];

    snapshot.forEach((docSnap) => {
      const msg = docSnap.data();
      messages.push({ id: docSnap.id, ...msg });

      const seenBy = msg.seenBy || [];
      const isUnread = msg.senderId !== currentUser.uid && !seenBy.includes(currentUser.uid);

      if (isUnread) {
        unseenDocs.push(docSnap.id);
      }
    });

    messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    if (messages.length === 0) {
      box.innerHTML = `<p class="empty-state">No messages yet. Start the conversation.</p>`;
    } else {
      for (const msg of messages) {
        const senderData = await getUserData(msg.senderId);
        const avatar = getAvatarSrc(senderData?.profilePic);
        const isMe = msg.senderId === currentUser.uid;

        const row = document.createElement("div");
        row.className = `message-row ${isMe ? "me" : "other"}`;

        row.innerHTML = `
          ${!isMe ? `<img src="${avatar}" class="chat-avatar" alt="Avatar">` : ""}
          <div class="chat-bubble ${isMe ? "me" : "other"}">
            <div>${msg.text}</div>
            <span>${new Date(msg.createdAt).toLocaleTimeString()}</span>
          </div>
          ${isMe ? `<img src="${avatar}" class="chat-avatar" alt="Avatar">` : ""}
        `;

        box.appendChild(row);
      }

      box.scrollTop = box.scrollHeight;
    }

    for (const msgId of unseenDocs) {
      await updateDoc(doc(db, "messages", msgId), {
        seenBy: arrayUnion(currentUser.uid)
      });
    }
  } catch (error) {
    console.error("Load messages error:", error);
    document.getElementById("messagesBox").innerHTML = `<p class="empty-state">Error loading messages.</p>`;
  }
}

window.sendMessage = async function () {
  const input = document.getElementById("messageInput");
  const text = input?.value.trim();

  if (!text) return;

  try {
    await addDoc(collection(db, "messages"), {
      requestId: requestId,
      senderId: currentUser.uid,
      senderName: currentUser.email,
      text: text,
      createdAt: new Date().toISOString(),
      seenBy: [currentUser.uid]
    });

    input.value = "";
    loadMessages();
  } catch (error) {
    console.error("Send message error:", error);
    alert("Error sending message.");
  }
};

window.goBack = function () {
  if (refreshInterval) clearInterval(refreshInterval);
  window.location.href = "connections.html";
};
