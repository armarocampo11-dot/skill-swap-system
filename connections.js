import { app } from "./firebase-config.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  setDoc,
  getDoc,
  doc,
  onSnapshot,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let selectedConversation = null;

let partnerMap = {};
let conversationsCache = [];
let messagesCache = [];
let typingTimer = null;
let typingWriteTimer = null;
let conversationUnsubscribe = null;
let messagesUnsubscribe = null;

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

function getAvatarForUser(userId) {
  const user = partnerMap[userId] || {};
  const pic = safeText(user.profilePic, "");
  return pic || "avatars/avatar1.png";
}

function getConversationDoc(convoId) {
  return conversationsCache.find(c => c.id === convoId) || null;
}

function getMessagesForConversation(convoId) {
  return messagesCache
    .filter(msg => msg.conversationId === convoId)
    .sort((a, b) => normalizeDate(a.timestamp) - normalizeDate(b.timestamp));
}

function getLastMineMessage(convoId) {
  const thread = getMessagesForConversation(convoId);
  const mine = [...thread].reverse().find(msg => msg.senderId === currentUser.uid);
  return mine || null;
}

function isLastMineMessageSeen(convoId) {
  const convo = getConversationDoc(convoId);
  if (!convo || !selectedConversation) return false;
  const unreadForOther = Number(convo.unreadCounts?.[selectedConversation.otherId] || 0);
  return unreadForOther === 0;
}

async function ensureConversationsExist() {
  const reqSnap = await getDocs(collection(db, "swapRequests"));

  for (const d of reqSnap.docs) {
    const r = d.data();

    if (r.status !== "accepted" && r.status !== "completed") continue;
    if (!r.requesterId || !r.receiverId) continue;

    const ids = [r.requesterId, r.receiverId].sort();
    const convoId = ids.join("_");

    const convoRef = doc(db, "conversations", convoId);
    const convoSnap = await getDoc(convoRef);

    if (!convoSnap.exists()) {
      await setDoc(convoRef, {
        participants: ids,
        participantNames: {
          [r.requesterId]: safeText(r.requesterName, "Student"),
          [r.receiverId]: safeText(r.receiverName, "Student")
        },
        lastMessage: "",
        lastTimestamp: new Date().toISOString(),
        unreadCounts: {
          [r.requesterId]: 0,
          [r.receiverId]: 0
        },
        typingStatus: {
          [r.requesterId]: false,
          [r.receiverId]: false
        }
      });
    } else {
      await updateDoc(convoRef, {
        [`participantNames.${r.requesterId}`]: safeText(r.requesterName, "Student"),
        [`participantNames.${r.receiverId}`]: safeText(r.receiverName, "Student"),
        [`typingStatus.${r.requesterId}`]: convoSnap.data()?.typingStatus?.[r.requesterId] ?? false,
        [`typingStatus.${r.receiverId}`]: convoSnap.data()?.typingStatus?.[r.receiverId] ?? false
      });
    }
  }
}

async function loadUsersAndWelcome() {
  const [meSnap, usersSnap] = await Promise.all([
    getDoc(doc(db, "users", currentUser.uid)),
    getDocs(collection(db, "users"))
  ]);

  const me = meSnap.exists() ? meSnap.data() : {};
  const welcome = document.getElementById("connectionsWelcome");

  if (welcome) {
    welcome.innerText =
      `${safeText(me.name, "Student")}, your conversations are grouped by person so messages stay cleaner and easier to use.`;
  }

  partnerMap = {};
  usersSnap.forEach(d => {
    partnerMap[d.id] = d.data();
  });
}

function buildConversationItems() {
  return conversationsCache
    .filter(c => Array.isArray(c.participants) && c.participants.includes(currentUser.uid))
    .map(c => {
      const otherId = c.participants.find(id => id !== currentUser.uid);
      return {
        convoId: c.id,
        otherId,
        name: safeText(c.participantNames?.[otherId], "Student"),
        avatar: getAvatarForUser(otherId),
        lastMessage: safeText(c.lastMessage, "Start conversation..."),
        lastTimestamp: c.lastTimestamp || "",
        unread: Number(c.unreadCounts?.[currentUser.uid] || 0)
      };
    })
    .sort((a, b) => {
      if (b.unread !== a.unread) return b.unread - a.unread;
      return normalizeDate(b.lastTimestamp) - normalizeDate(a.lastTimestamp);
    });
}

function renderConversationList() {
  const container = document.getElementById("conversationList");
  if (!container) return;

  const items = buildConversationItems();

  if (!items.length) {
    container.innerHTML = `
      <div class="chat-empty-state small-chat-empty">
        <div class="chat-empty-icon">💬</div>
        <h4>No chats yet</h4>
        <p>Your accepted swaps will open conversations here.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(item => `
    <article class="chat-list-item ${selectedConversation?.convoId === item.convoId ? "active-chat-item" : ""}" data-convo-id="${item.convoId}">
      <img class="chat-list-avatar" src="${item.avatar}" alt="Avatar">
      <div class="chat-list-content">
        <div class="chat-list-top">
          <h4>${item.name}</h4>
          ${item.unread > 0 ? `<span class="chat-unread-badge">${item.unread}</span>` : ""}
        </div>
        <p class="chat-list-preview">${item.lastMessage}</p>
        <span class="chat-list-date">${formatDate(item.lastTimestamp)}</span>
      </div>
    </article>
  `).join("");
}

function renderThreadHeader(otherId) {
  const user = partnerMap[otherId] || {};
  const avatar = document.getElementById("threadAvatar");
  const name = document.getElementById("threadName");
  const subtext = document.getElementById("threadSubtext");

  if (avatar) avatar.src = getAvatarForUser(otherId);
  if (name) name.innerText = safeText(user.name, "Student");
  if (subtext) subtext.innerText = "Your full conversation history with this person.";
}

function renderTypingStatus() {
  const el = document.getElementById("typingStatus");
  if (!el) return;

  if (!selectedConversation) {
    el.innerText = "";
    return;
  }

  const convo = getConversationDoc(selectedConversation.convoId);
  if (!convo) {
    el.innerText = "";
    return;
  }

  const isOtherTyping = Boolean(convo.typingStatus?.[selectedConversation.otherId]);
  const otherName = safeText(partnerMap[selectedConversation.otherId]?.name, "Student");

  el.innerText = isOtherTyping ? `${otherName} is typing...` : "";
}

function renderThreadMessages() {
  const container = document.getElementById("threadMessages");
  if (!container) return;

  if (!selectedConversation) {
    container.innerHTML = `
      <div class="chat-empty-state">
        <div class="chat-empty-icon">💬</div>
        <h4>No conversation selected</h4>
        <p>Choose a chat from the left side to start messaging.</p>
      </div>
    `;
    renderTypingStatus();
    return;
  }

  const messages = getMessagesForConversation(selectedConversation.convoId);

  if (!messages.length) {
    container.innerHTML = `
      <div class="chat-empty-state">
        <div class="chat-empty-icon">💬</div>
        <h4>No messages yet</h4>
        <p>Send the first message below.</p>
      </div>
    `;
    renderTypingStatus();
    return;
  }

  const lastMineMessage = getLastMineMessage(selectedConversation.convoId);
  const lastMineSeen = isLastMineMessageSeen(selectedConversation.convoId);

  container.innerHTML = messages.map(msg => {
    const isMine = msg.senderId === currentUser.uid;
    const isLastMine =
      isMine &&
      lastMineMessage &&
      msg.id === lastMineMessage.id;

    return `
      <div class="chat-bubble-row ${isMine ? "mine-row" : "theirs-row"}">
        ${!isMine ? `<img class="chat-bubble-avatar" src="${getAvatarForUser(msg.senderId)}" alt="Avatar">` : ""}
        <div class="chat-bubble ${isMine ? "mine-bubble" : "theirs-bubble"}">
          <p>${safeText(msg.text, "")}</p>
          <span>${formatDate(msg.timestamp)}</span>
          ${isLastMine ? `<div class="chat-seen-status">${lastMineSeen ? "Seen" : "Sent"}</div>` : ""}
        </div>
      </div>
    `;
  }).join("");

  container.scrollTop = container.scrollHeight;
  renderTypingStatus();
}

async function markConversationSeen(convoId) {
  if (!currentUser || !convoId) return;

  try {
    await updateDoc(doc(db, "conversations", convoId), {
      [`unreadCounts.${currentUser.uid}`]: 0
    });
  } catch (error) {
    console.error("Failed to mark conversation seen:", error);
  }
}

function openConversationById(convoId) {
  const convo = conversationsCache.find(c => c.id === convoId);
  if (!convo) return;

  const otherId = Array.isArray(convo.participants)
    ? convo.participants.find(id => id !== currentUser.uid)
    : null;

  if (!otherId) return;

  selectedConversation = {
    convoId,
    otherId
  };

  renderConversationList();
  renderThreadHeader(otherId);
  renderThreadMessages();
  markConversationSeen(convoId);
}

async function setTypingState(isTyping) {
  if (!selectedConversation || !currentUser) return;

  try {
    await updateDoc(doc(db, "conversations", selectedConversation.convoId), {
      [`typingStatus.${currentUser.uid}`]: isTyping
    });
  } catch (error) {
    console.error("Failed to update typing state:", error);
  }
}

function autoGrowTextarea() {
  const input = document.getElementById("threadInput");
  if (!input) return;

  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 130)}px`;
}

function bindConversationClicks() {
  const container = document.getElementById("conversationList");
  if (!container) return;

  container.addEventListener("click", (e) => {
    const item = e.target.closest(".chat-list-item");
    if (!item) return;

    const convoId = item.dataset.convoId;
    if (!convoId) return;

    openConversationById(convoId);
  });
}

function bindComposerEvents() {
  const input = document.getElementById("threadInput");
  if (!input) return;

  input.addEventListener("input", () => {
    autoGrowTextarea();

    if (!selectedConversation) return;

    setTypingState(true);

    clearTimeout(typingWriteTimer);
    typingWriteTimer = setTimeout(() => {
      setTypingState(false);
    }, 1200);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      window.sendThreadMessage();
    }
  });
}

function listenToConversations() {
  if (conversationUnsubscribe) conversationUnsubscribe();

  conversationUnsubscribe = onSnapshot(collection(db, "conversations"), (snap) => {
    conversationsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderConversationList();

    if (selectedConversation) {
      const stillExists = conversationsCache.some(c => c.id === selectedConversation.convoId);
      if (!stillExists) {
        selectedConversation = null;
      }
    }

    if (selectedConversation) {
      renderThreadHeader(selectedConversation.otherId);
      renderThreadMessages();
    }
  }, (error) => {
    console.error("Conversation listener error:", error);
  });
}

function listenToMessages() {
  if (messagesUnsubscribe) messagesUnsubscribe();

  messagesUnsubscribe = onSnapshot(collection(db, "messages"), (snap) => {
    messagesCache = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(msg => msg.senderId === currentUser.uid || msg.receiverId === currentUser.uid);

    renderThreadMessages();
  }, (error) => {
    console.error("Message listener error:", error);
  });
}

async function sendCurrentMessage() {
  if (!currentUser || !selectedConversation) return;

  const input = document.getElementById("threadInput");
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  const now = new Date().toISOString();

  try {
    await addDoc(collection(db, "messages"), {
      conversationId: selectedConversation.convoId,
      senderId: currentUser.uid,
      receiverId: selectedConversation.otherId,
      text,
      timestamp: now
    });

    await updateDoc(doc(db, "conversations", selectedConversation.convoId), {
      lastMessage: text,
      lastTimestamp: now,
      [`unreadCounts.${selectedConversation.otherId}`]: increment(1),
      [`typingStatus.${currentUser.uid}`]: false
    });

    input.value = "";
    input.style.height = "auto";
  } catch (error) {
    console.error("Failed to send message:", error);
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  try {
    await ensureConversationsExist();
    await loadUsersAndWelcome();
    bindConversationClicks();
    bindComposerEvents();
    listenToConversations();
    listenToMessages();
  } catch (error) {
    console.error("Connections initialization error:", error);
  }
});

window.sendThreadMessage = sendCurrentMessage;

window.goToDashboard = function () {
  window.location.href = "dashboard.html";
};

window.goToRequests = function () {
  window.location.href = "requests.html";
};

window.goToBrowse = function () {
  window.location.href = "browse.html";
};