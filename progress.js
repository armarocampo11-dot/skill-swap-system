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

function getRank(level) {
  if (level <= 1) return "Beginner";
  if (level === 2) return "Explorer";
  if (level === 3) return "Skilled";
  if (level === 4) return "Pro";
  if (level === 5) return "Expert";
  if (level === 6) return "Elite";
  return "Master";
}

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

  checks.forEach((value) => {
    if (value && String(value).trim() !== "") filled++;
  });

  const percent = Math.round((filled / checks.length) * 100);
  return { percent };
}

function getNextGoalText(stats) {
  if (stats.profileCompletion < 100) {
    return `Complete your profile first (${stats.profileCompletion}%)`;
  }

  if (stats.completedCount < 1) {
    return "Finish your first skill swap";
  }

  if (stats.ratingCount < 3) {
    return `Earn ${3 - stats.ratingCount} more rating${3 - stats.ratingCount === 1 ? "" : "s"}`;
  }

  if (stats.acceptedCount < 3) {
    return `Build ${3 - stats.acceptedCount} more accepted connection${3 - stats.acceptedCount === 1 ? "" : "s"}`;
  }

  return "Keep growing toward the next level";
}

function buildBadgeProgress(stats) {
  return [
    {
      name: "First Request",
      description: "You sent your first skill request.",
      unlocked: stats.sentCount >= 1,
      progressText: `${Math.min(stats.sentCount, 1)}/1 request`
    },
    {
      name: "Swap Starter",
      description: "You completed your first skill swap.",
      unlocked: stats.completedCount >= 1,
      progressText: `${Math.min(stats.completedCount, 1)}/1 completed`
    },
    {
      name: "Trusted Partner",
      description: "Collect 3 ratings with strong feedback.",
      unlocked: stats.ratingCount >= 3 && stats.avgRatingNumber >= 4.5,
      progressText: `${Math.min(stats.ratingCount, 3)}/3 ratings`
    },
    {
      name: "Campus Connector",
      description: "Build 3 accepted connections with other students.",
      unlocked: stats.acceptedCount >= 3,
      progressText: `${Math.min(stats.acceptedCount, 3)}/3 accepted`
    }
  ];
}

function renderBadges(stats) {
  const container = document.getElementById("badgesList");
  if (!container) return;

  const badges = buildBadgeProgress(stats);

  container.innerHTML = badges.map((badge) => `
    <div class="achievement-badge ${badge.unlocked ? "unlocked" : "locked"}">
      <div class="achievement-badge-top">
        <span class="achievement-badge-icon">${badge.unlocked ? "🏅" : "🔒"}</span>
        <span class="achievement-badge-state">${badge.unlocked ? "Unlocked" : badge.progressText}</span>
      </div>
      <h4>${badge.name}</h4>
      <p>${badge.description}</p>
    </div>
  `).join("");
}

function renderXPBreakdown(items) {
  const container = document.getElementById("xpBreakdownList");
  if (!container) return;

  container.innerHTML = items.map((item) => `
    <div class="xp-breakdown-row">
      <div>
        <p class="xp-breakdown-title">${item.label}</p>
        <p class="xp-breakdown-sub">${item.sub}</p>
      </div>
      <strong>${item.value} XP</strong>
    </div>
  `).join("");
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
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
    setText("progressWelcome", `${me.name || "Student"}, this page shows how your account is growing over time.`);

    let completedCount = 0;
    let acceptedCount = 0;
    let sentCount = 0;
    let xp = 0;
    let totalStars = 0;
    let ratingCount = 0;
    let fiveStarCount = 0;

    swapSnapshot.forEach((docSnap) => {
      const request = docSnap.data();

      const isMine =
        request.requesterId === user.uid ||
        request.receiverId === user.uid;

      if (!isMine) return;

      if (request.requesterId === user.uid) {
        sentCount++;
        xp += 5;
      }

      if (request.status === "accepted") {
        acceptedCount++;
        xp += 10;
      }

      if (request.status === "completed") {
        completedCount++;
        xp += 50;
      }
    });

    ratingSnapshot.forEach((docSnap) => {
      const rating = docSnap.data();
      if (rating.rateeId === user.uid) {
        totalStars += Number(rating.stars);
        ratingCount++;

        if (Number(rating.stars) === 5) {
          fiveStarCount++;
          xp += 20;
        }
      }
    });

    const avg = ratingCount > 0 ? (totalStars / ratingCount).toFixed(1) : "0.0";
    const avgRatingNumber = Number(avg);

    const profileData = getProfileCompletion(me);
    const profileXP = Math.floor(profileData.percent / 10) * 5;
    xp += profileXP;

    const hasAvatar = me.profilePic && String(me.profilePic).trim() !== "";
    const avatarXP = hasAvatar ? 5 : 0;
    xp += avatarXP;

    const hasSkillSet =
      (me.offeredSkills && String(me.offeredSkills).trim() !== "") &&
      (me.wantedSkills && String(me.wantedSkills).trim() !== "");
    const skillXP = hasSkillSet ? 10 : 0;
    xp += skillXP;

    const level = Math.floor(xp / 100) + 1;
    const xpIntoLevel = xp % 100;
    const nextLevelXP = 100 - xpIntoLevel;
    const rank = getRank(level);

    const stats = {
      sentCount,
      acceptedCount,
      completedCount,
      ratingCount,
      avgRatingNumber,
      profileCompletion: profileData.percent
    };

    setText("levelNumber", level);
    setText("rankTitle", rank);
    setText("xpPointsMain", xp);
    setText("xpPoints", xp);
    setText("xpRemaining", nextLevelXP);
    setText("profilePercent", `${profileData.percent}%`);
    setText("avgRating", `${avg}★`);
    setText("profileCompletionText", `Profile completion: ${profileData.percent}%`);
    setText("nextGoalText", getNextGoalText(stats));

    const xpBar = document.getElementById("xpBar");
    if (xpBar) {
      xpBar.style.transition = "width 0.6s ease";
      requestAnimationFrame(() => {
        xpBar.style.width = `${xpIntoLevel}%`;
      });
    }

    renderBadges(stats);

    renderXPBreakdown([
      {
        label: "Requests Sent",
        sub: `${sentCount} request${sentCount === 1 ? "" : "s"} × 5 XP`,
        value: sentCount * 5
      },
      {
        label: "Accepted Requests",
        sub: `${acceptedCount} accepted × 10 XP`,
        value: acceptedCount * 10
      },
      {
        label: "Completed Swaps",
        sub: `${completedCount} completed × 50 XP`,
        value: completedCount * 50
      },
      {
        label: "5-Star Ratings",
        sub: `${fiveStarCount} top ratings × 20 XP`,
        value: fiveStarCount * 20
      },
      {
        label: "Profile Completion Bonus",
        sub: `${profileData.percent}% completed`,
        value: profileXP
      },
      {
        label: "Avatar Bonus",
        sub: hasAvatar ? "Avatar has been added" : "No avatar added yet",
        value: avatarXP
      },
      {
        label: "Skills Bonus",
        sub: hasSkillSet ? "Both offered and wanted skills are added" : "Add both offered and wanted skills",
        value: skillXP
      }
    ]);

  } catch (error) {
    console.error("Progress page error:", error);
  }
});

window.goToDashboard = function () {
  window.location.href = "dashboard.html";
};

window.goToMissions = function () {
  window.location.href = "missions.html";
};

window.goToProfile = function () {
  window.location.href = "profile.html";
};