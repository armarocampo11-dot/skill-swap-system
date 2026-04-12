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

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text === "" ? fallback : text;
}

function clampStars(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(1, Math.min(5, Math.round(num)));
}

function formatDateText(value) {
  if (!value) return "No date";

  if (typeof value === "object" && typeof value.toDate === "function") {
    try {
      return value.toDate().toLocaleString();
    } catch {
      return "Unknown date";
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString();
}

function getRatingStatus(avg, count) {
  if (count === 0) {
    return {
      title: "No reviews yet",
      subtext: "Complete more swaps and collect feedback to start building your reputation."
    };
  }

  if (avg >= 4.8 && count >= 3) {
    return {
      title: "Excellent reputation",
      subtext: "Students are consistently giving you very strong feedback."
    };
  }

  if (avg >= 4.5) {
    return {
      title: "Strong rating",
      subtext: "Your reviews show a positive and reliable experience."
    };
  }

  if (avg >= 4.0) {
    return {
      title: "Good standing",
      subtext: "You are building a solid rating history with room to grow."
    };
  }

  return {
    title: "Still growing",
    subtext: "Keep completing swaps and improving the experience for other students."
  };
}

function getReputationTier(avg, count, fiveStarCount) {
  if (count === 0) {
    return {
      title: "New Profile",
      subtext: "You have not collected enough feedback yet.",
      pill: "Starter",
      trust: "New",
      trustText: "Start collecting reviews to grow your reputation."
    };
  }

  if (avg >= 4.8 && count >= 5 && fiveStarCount >= 3) {
    return {
      title: "Elite Partner",
      subtext: "You are seen as one of the most trusted users.",
      pill: "Elite",
      trust: "High Trust",
      trustText: "Your reputation is strong and very convincing to new matches."
    };
  }

  if (avg >= 4.5 && count >= 3) {
    return {
      title: "Trusted Partner",
      subtext: "You have built a strong reputation through positive completed swaps.",
      pill: "Trusted",
      trust: "Reliable",
      trustText: "Students can already see you as a dependable skill swap partner."
    };
  }

  if (avg >= 4.0) {
    return {
      title: "Promising Profile",
      subtext: "Your feedback is moving in a good direction and your reputation is growing.",
      pill: "Growing",
      trust: "Improving",
      trustText: "Keep completing quality swaps and your trust level will rise."
    };
  }

  return {
    title: "Developing Reputation",
    subtext: "You still have room to strengthen how students experience working with you.",
    pill: "Developing",
    trust: "Early Stage",
    trustText: "Focus on smoother communication and better completed swaps."
    };
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

function renderEmptyState(messageTitle, messageText) {
  const reviewsList = document.getElementById("reviewsList");
  if (!reviewsList) return;

  reviewsList.innerHTML = `
    <div class="reviews-empty-state">
      <div class="reviews-empty-icon">⭐</div>
      <h4>${messageTitle}</h4>
      <p>${messageText}</p>
      <button class="empty-cta-btn" onclick="goToBrowse()">Find your first match</button>
    </div>
  `;
}

function renderReviews(reviews) {
  const reviewsList = document.getElementById("reviewsList");
  if (!reviewsList) return;

  if (!reviews.length) {
    renderEmptyState(
      "No reviews yet",
      "Complete your first swap to start building your reputation."
    );
    return;
  }

  reviews.sort((a, b) => b.sortTime - a.sortTime);

  reviewsList.innerHTML = reviews.map((review) => `
    <article class="review-feed-card">
      <div class="review-feed-top">
        <div>
          <h4>${review.reviewerName}</h4>
          <p class="review-feed-date">${review.dateText}</p>
        </div>
        <span class="review-stars-pill">${review.stars}★</span>
      </div>

      <div class="review-stars-row">${"★".repeat(review.stars)}${"☆".repeat(5 - review.stars)}</div>

      <p class="review-feed-comment">${review.comment}</p>
    </article>
  `).join("");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    const [userSnap, ratingSnapshot] = await Promise.all([
      getDoc(doc(db, "users", user.uid)),
      getDocs(collection(db, "ratings"))
    ]);

    const me = userSnap.exists() ? userSnap.data() : {};
    setText(
      "ratingsWelcome",
      `${safeText(me.name, "Student")}, this page shows how other students have rated their experience with you.`
    );

    const reviews = [];
    let totalStars = 0;
    let count = 0;
    let fiveStarCount = 0;

    ratingSnapshot.forEach((docSnap) => {
      const data = docSnap.data();

      if (data.rateeId !== user.uid) return;

      const stars = clampStars(data.stars);
      if (stars === 0) return;

      totalStars += stars;
      count++;

      if (stars === 5) {
        fiveStarCount++;
      }

      const rawDate = data.createdAt || data.timestamp || "";
      let sortTime = 0;

      if (typeof rawDate === "object" && typeof rawDate.toDate === "function") {
        try {
          sortTime = rawDate.toDate().getTime();
        } catch {
          sortTime = 0;
        }
      } else {
        const parsed = new Date(rawDate);
        sortTime = Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
      }

      reviews.push({
        reviewerName: safeText(data.raterName, "Student"),
        comment: safeText(data.comment, "Student left a rating but no comment."),
        stars,
        dateText: formatDateText(rawDate),
        sortTime
      });
    });

    const avg = count > 0 ? (totalStars / count).toFixed(1) : "0.0";
    const avgNumber = Number(avg);
    const status = getRatingStatus(avgNumber, count);
    const tier = getReputationTier(avgNumber, count, fiveStarCount);

    setText("ratingAverageMain", `${avg}★`);
    setText("ratingAverageSide", `${avg}★`);
    setText("ratingAverageLabel", `Average: ${avg}★`);
    setText("ratingCountMain", count);
    setText("ratingCountSide", count);
    setText("fiveStarCount", fiveStarCount);
    setText("ratingStatusText", status.title);
    setText("ratingStatusSubtext", status.subtext);
    setText("ratingStatusHero", status.title);
    setText(
      "ratingInsightMini",
      count > 0 ? `${count} review${count === 1 ? "" : "s"} collected` : "No reviews yet"
    );

    setText("reputationTierTitle", tier.title);
    setText("reputationTierSubtext", tier.subtext);
    setText("reputationTierPill", tier.pill);
    setText("trustSnapshotValue", tier.trust);
    setText("trustSnapshotText", tier.trustText);

    const meter = document.getElementById("ratingsMeterFill");
    if (meter) {
      const percent = count > 0 ? Math.max(8, Math.min(100, (avgNumber / 5) * 100)) : 0;
      meter.style.width = `${percent}%`;
    }

    renderReviews(reviews);

  } catch (error) {
    console.error("Ratings page error:", error);

    setText("ratingStatusText", "Could not load ratings");
    setText("ratingStatusSubtext", "There was a problem loading your review data.");
    setText("ratingStatusHero", "Unavailable");
    setText("reputationTierTitle", "Unavailable");
    setText("reputationTierSubtext", "Your reputation data could not be loaded right now.");
    setText("reputationTierPill", "Unavailable");
    setText("trustSnapshotValue", "Unavailable");
    setText("trustSnapshotText", "Please refresh the page and try again.");

    renderEmptyState(
      "Unable to load reviews",
      "Please refresh the page and try again."
    );
  }
});

window.goToDashboard = function () {
  window.location.href = "dashboard.html";
};

window.goToProfile = function () {
  window.location.href = "profile.html";
};

window.goToStats = function () {
  window.location.href = "stats.html";
};

window.goToBrowse = function () {
  window.location.href = "browse.html";
};