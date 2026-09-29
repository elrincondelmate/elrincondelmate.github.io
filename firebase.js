import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// La configuración web es pública. La seguridad depende de Authentication y Rules.
const firebaseConfig = {
  apiKey: "AIzaSyC5WVdBCR29CceFJth6uomzrfzNE8m-7sQ",
  authDomain: "elrincondelmate-f1fa9.firebaseapp.com",
  projectId: "elrincondelmate-f1fa9",
  appId: "1:510023497337:web:0605cc44d9f6521c2e46a8",
};

export const adminEmail = "elrincondelmatesm@gmail.com";
export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  (value) => value && !value.startsWith("REPLACE_WITH_"),
);

export const firebaseApp = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;

// Se usa únicamente si el administrador inicia la importación desde el panel.
const previousProjectConfig = {
  apiKey: "AIzaSyDuocCLsrC3hHA3AyLGMX4QMWVa4UvncYw",
  authDomain: "elrincondelmate.firebaseapp.com",
  projectId: "elrincondelmate",
  appId: "1:264331784068:web:6d8f779f863299f82db7d1",
};
const previousApp = isFirebaseConfigured
  ? initializeApp(previousProjectConfig, "previous-project-read")
  : null;
export const previousDb = previousApp ? getFirestore(previousApp) : null;

if (auth) auth.languageCode = "es";
