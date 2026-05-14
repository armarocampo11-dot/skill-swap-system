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

  const filled = checks.filter(value => value && String(value).trim() !== "").length;
  return Math.round((filled / checks.length) * 100);
}

function getRank(totalXp) {
  if (totalXp >= 200) return "Skill Master";
  if (totalXp >= 120) return "Trusted Swapper";
  if (totalXp >= 60) return "Active Learner";
  if (totalXp >= 20) return "Rising Student";
  return "Starter";
}

function renderMissionList(containerId, missions) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = missions.map(mission => {
    const progress = Math.min(100, Math.round((mission.current / mission.target) * 100));

    return `
      <div class="mission-card ${mission.done ? "mission-done" : ""}">
        <div class="mission-top">
          <div class="mission-icon">${mission.icon}</div>
          <span class="mission-badge">${mission.done ? "Completed" : "In Progress"}</span>
        </div>

        <h3>${mission.title}</h3>
        <p>${mission.description}</p>

        <div class="mission-progress-row">
          <span>${mission.current}/${mission.target}</span>
          <strong>${progress}%</strong>
        </div>

        <div class="mission-bar">
          <div style="width:${progress}%"></div>
        </div>

        <div class="mission-reward">
          Reward: <strong>${mission.reward}</strong>
        </div>

        <button onclick="${mission.action}">
          ${mission.done ? "View" : mission.button}
        </button>
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
    const [userSnap, swapSnapshot, ratingSnapshot, messageSnapshot] = await Promise.all([
      getDoc(doc(db, "users", user.uid)),
      getDocs(collection(db, "swapRequests")),
      getDocs(collection(db, "ratings")),
      getDocs(collection(db, "messages"))
    ]);

    const me = userSnap.exists() ? userSnap.data() : {};

    let completedCount = 0;
    let acceptedCount = 0;
    let sentCount = 0;
    let receivedCount = 0;
    let ratingCount = 0;
    let messageCount = 0;

    swapSnapshot.forEach((docSnap) => {
      const request = docSnap.data();
      const isMine = request.requesterId === user.uid || request.receiverId === user.uid;

      if (!isMine) return;

      if (request.requesterId === user.uid) sentCount++;
      if (request.receiverId === user.uid) receivedCount++;
      if (request.status === "accepted") acceptedCount++;
      if (request.status === "completed") completedCount++;
    });

    ratingSnapshot.forEach((docSnap) => {
      const rating = docSnap.data();

      if (rating.rateeId === user.uid) {
        ratingCount++;
      }
    });

    messageSnapshot.forEach((docSnap) => {
      const message = docSnap.data();

      if (message.senderId === user.uid || message.receiverId === user.uid) {
        messageCount++;
      }
    });

    const profileCompletion = getProfileCompletion(me);

    const dailyMissions = [
      {
        icon: "📨",
        title: "Send Your First Request",
        description: "Start connecting with another student by sending a swap request.",
        reward: "+5 XP",
        xp: 5,
        current: Math.min(sentCount, 1),
        target: 1,
        done: sentCount >= 1,
        button: "Browse Students",
        action: "goToBrowse()"
      },
      {
        icon: "🔥",
        title: "Make 3 Requests",
        description: "Be active and reach out to more students.",
        reward: "+15 XP",
        xp: 15,
        current: Math.min(sentCount, 3),
        target: 3,
        done: sentCount >= 3,
        button: "Go to Swipe",
        action: "goToSwipe()"
      },
      {
        icon: "💬",
        title: "Start a Conversation",
        description: "Send or receive at least one message.",
        reward: "+10 XP",
        xp: 10,
        current: Math.min(messageCount, 1),
        target: 1,
        done: messageCount >= 1,
        button: "Open Messages",
        action: "goToConnections()"
      }
    ];

    const milestoneMissions = [
      {
        icon: "👤",
        title: "Complete Your Profile",
        description: "Add your details, skills, bio, and transaction preference.",
        reward: "+20 XP",
        xp: 20,
        current: profileCompletion,
        target: 100,
        done: profileCompletion >= 100,
        button: "Edit Profile",
        action: "goToProfile()"
      },
      {
        icon: "🤝",
        title: "Get One Accepted Request",
        description: "Have another student accept your swap or payment request.",
        reward: "+25 XP",
        xp: 25,
        current: Math.min(acceptedCount, 1),
        target: 1,
        done: acceptedCount >= 1,
        button: "View Requests",
        action: "goToRequests()"
      },
      {
        icon: "🏆",
        title: "Complete One Swap",
        description: "Finish a successful skill exchange.",
        reward: "+50 XP",
        xp: 50,
        current: Math.min(completedCount, 1),
        target: 1,
        done: completedCount >= 1,
        button: "View Progress",
        action: "goToProgress()"
      }
    ];

    const reputationMissions = [
      {
        icon: "⭐",
        title: "Receive 3 Ratings",
        description: "Build trust by getting rated by students you worked with.",
        reward: "+30 XP",
        xp: 30,
        current: Math.min(ratingCount, 3),
        target: 3,
        done: ratingCount >= 3,
        button: "View Ratings",
        action: "goToRatings()"
      },
      {
        icon: "📥",
        title: "Receive 3 Requests",
        description: "Make your profile attractive enough for others to contact you.",
        reward: "+35 XP",
        xp: 35,
        current: Math.min(receivedCount, 3),
        target: 3,
        done: receivedCount >= 3,
        button: "Improve Profile",
        action: "goToProfile()"
      },
      {
        icon: "🚀",
        title: "Complete 5 Swaps",
        description: "Become one of the most active students in the platform.",
        reward: "+100 XP",
        xp: 100,
        current: Math.min(completedCount, 5),
        target: 5,
        done: completedCount >= 5,
        button: "View Progress",
        action: "goToProgress()"
      }
    ];

    const allMissions = [
      ...dailyMissions,
      ...milestoneMissions,
      ...reputationMissions
    ];

    const completedMissions = allMissions.filter(mission => mission.done);
    const totalXp = completedMissions.reduce((sum, mission) => sum + mission.xp, 0);

    document.getElementById("missionsWelcome").innerText =
      `${me.name || "Student"}, complete missions to earn XP and build your reputation.`;

    document.getElementById("totalXp").innerText = `${totalXp} XP`;
    document.getElementById("missionRank").innerText = getRank(totalXp);
    document.getElementById("completedMissions").innerText = completedMissions.length;
    document.getElementById("activeMissions").innerText = allMissions.length - completedMissions.length;
    document.getElementById("profilePercent").innerText = `${profileCompletion}%`;

    renderMissionList("dailyMissionsList", dailyMissions);
    renderMissionList("milestoneMissionsList", milestoneMissions);
    renderMissionList("reputationMissionsList", reputationMissions);

  } catch (error) {
    console.error("Missions page error:", error);
    document.getElementById("missionsWelcome").innerText =
      "Error loading missions. Please check your Firebase rules.";
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

window.goToBrowse = function () {
  window.location.href = "browse.html";
};

window.goToSwipe = function () {
  window.location.href = "swipe.html";
};

window.goToRequests = function () {
  window.location.href = "requests.html";
};

window.goToRatings = function () {
  window.location.href = "ratings.html";
};

window.goToConnections = function () {
  window.location.href = "connections.html";
};