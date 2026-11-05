import { initializeApp }              from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAnalytics }               from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';

const firebaseConfig = {
  apiKey:            "AIzaSyCy-D8LiwFGO0-iMgttYo9t0ZRsUzldIlc",
  authDomain:        "seemsharp-website.firebaseapp.com",
  projectId:         "seemsharp-website",
  storageBucket:     "seemsharp-website.firebasestorage.app",
  messagingSenderId: "292141486139",
  appId:             "1:292141486139:web:2691b20f07ce4895654c1e",
  measurementId:     "G-F1KT273Z1Y",
};

const app       = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const functions = getFunctions(app, 'europe-west1');

const fnSubmitContact = httpsCallable(functions, 'submitContact');

window.submitContact = async function submitContact(payload) {
  const token = document.querySelector('[name="cf-turnstile-response"]')?.value || '';

  // 1. Vérification Turnstile + sauvegarde Firestore via Cloud Function
  await fnSubmitContact({ ...payload, token });

  // 2. Envoi email via EmailJS
  const cfg = window.EMAILJS_CONFIG;
  if (cfg && cfg.publicKey !== 'VOTRE_PUBLIC_KEY') {
    emailjs.init({ publicKey: cfg.publicKey });
    await emailjs.send(cfg.serviceId, cfg.templateId, {
      prenom:  payload.prenom,
      nom:     payload.nom,
      email:   payload.email,
      societe: payload.societe || '–',
      sujet:   payload.sujet,
      message: payload.message,
    });
  }
};
