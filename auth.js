import { app } from "./firebase-config.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

// REGISTER
window.register = async function () {
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const offeredSkills = document.getElementById("registerOfferedSkills").value.trim();
  const wantedSkills = document.getElementById("registerWantedSkills").value.trim();

  if (!name || !email || !password) {
    alert("Please complete name, email, and password.");
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await setDoc(doc(db, "users", user.uid), {
      name,
      email,
      offeredSkills,
      wantedSkills,
      course: "",
      yearLevel: "",
      studentId: "",
      section: "",
      bio: "",
      transactionPreference: "Either",
      profilePic: ""
    });

    alert("Registered successfully!");
  } catch (error) {
    console.error("Register error:", error);
    alert("Register error: " + error.message);
  }
};

// LOGIN
window.login = async function () {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  try {
    await signInWithEmailAndPassword(auth, email, password);
    alert("Login successful!");
    window.location.href = "dashboard.html";
  } catch (error) {
    console.error("Login error:", error);
    alert("Login error: " + error.message);
  }
};
