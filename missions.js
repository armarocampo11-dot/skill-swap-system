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

function getProfileCompletion(me) {
  let filled = 0;
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

  checks.forEach(value => {
    if (value && String(value).trim() !== "") filled++;
  });

  return Math.round((filled / checks.length) * 100);
}

function renderMissionList(containerId, missions) {
  const container = document.getElementById(containerId);
  if (!container) return;

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
    document.getElementById("missionsWelcome").innerText = `${me.name || "Student"}, here are your active missions.`;

    let completedCount = 0;
    let acceptedCount = 0;
    let sentCount = 0;
    let ratingCount = 0;

    swapSnapshot.forEach((docSnap) => {
      const request = docSnap.data();

      const isMine =
        request.requesterId === user.uid ||
        request.receiverId === user.uid;

      if (!isMine) return;

      if (request.requesterId === user.uid) sentCount++;
      if (request.status === "accepted") acceptedCount++;
      if (request.status === "completed") completedCount++;
    });

    ratingSnapshot.forEach((docSnap) => {
      const rating = docSnap.data();
      if (rating.rateeId === user.uid) ratingCount++;
    });

    const profileCompletion = getProfileCompletion(me);

    const dailyMissions = [
      {
        icon: "📨",
        title: "Send your first request",
        reward: "+5 XP",
        current: Math.min(sentCount, 1),
        target: 1,
        done: sentCount >= 1
      },
      {
        icon: "🤝",
        title: "Get one accepted request",
        reward: "+10 XP",
        current: Math.min(acceptedCount, 1),
        target: 1,
        done: acceptedCount >= 1
      },
      {
        icon: "✅",
        title: "Complete one swap",
        reward: "+50 XP",
        current: Math.min(completedCount, 1),
        target: 1,
        done: completedCount >= 1
      }
    ];

    const milestoneMissions = [
      {
        icon: "🪪",
        title: "Complete your profile",
        reward: "+15 XP",
        current: profileCompletion,
        target: 100,
        done: profileCompletion >= 100
      },
      {
        icon: "⭐",
        title: "Receive 3 ratings",
        reward: "+20 XP",
        current: Math.min(ratingCount, 3),
        target: 3,
        done: ratingCount >= 3
      },
      {
        icon: "🌐",
        title: "Build 3 accepted connections",
        reward: "+30 XP",
        current: Math.min(acceptedCount, 3),
        target: 3,
        done: acceptedCount >= 3
      }
    ];

    renderMissionList("dailyMissionsList", dailyMissions);
    renderMissionList("milestoneMissionsList", milestoneMissions);

  } catch (error) {
    console.error("Missions page error:", error);
  }
});

window.goToDashboard = function () {
  window.location.href = "dashboard.html";
};

window.goToProgress = function () {
  window.location.href = "progress.html";
};

window.goToProfile = function () {
  window.location.href = "profile.html";
};