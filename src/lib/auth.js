// src/lib/auth.js
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { app } from "./firebase"; // <-- Your firebase.js config

const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export async function loginWithGoogle() {
  return await signInWithPopup(auth, provider);
}

export async function logout() {
  await signOut(auth);
}

export function requireAdmin(user) {
  if (!user) return false;
  const allowed = ["triggaj51@gmail.com"]; // List of admin emails
  return allowed.includes(user.email);
}
