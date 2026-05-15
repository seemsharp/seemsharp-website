// Firebase SDK (ESM) – remplacer les valeurs par votre config Firebase
import { initializeApp }              from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, addDoc, serverTimestamp }
                                       from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';

// ⚠️  Remplacez ci-dessous par votre propre configuration Firebase
//     (Firebase Console → Paramètres du projet → Vos applications → SDK)
const firebaseConfig = {
  apiKey:            "VOTRE_API_KEY",
  authDomain:        "VOTRE_PROJECT.firebaseapp.com",
  projectId:         "VOTRE_PROJECT_ID",
  storageBucket:     "VOTRE_PROJECT.appspot.com",
  messagingSenderId: "VOTRE_SENDER_ID",
  appId:             "VOTRE_APP_ID",
};

let db, functions;

try {
  const app = initializeApp(firebaseConfig);
  db         = getFirestore(app);
  functions  = getFunctions(app, 'europe-west1');
} catch (err) {
  console.warn('[Firebase] Init skipped (config not set):', err.message);
}

/**
 * Sauvegarde la soumission dans Firestore (collection "contacts")
 * et tente d'appeler une Cloud Function "sendContactEmail" si disponible.
 */
window.submitContact = async function submitContact(payload) {
  if (!db) throw new Error('Firebase non configuré');

  // 1. Persister dans Firestore
  await addDoc(collection(db, 'contacts'), {
    ...payload,
    createdAt: serverTimestamp(),
  });

  // 2. Notification email via Cloud Function (optionnel – dé-commenter quand la fonction est déployée)
  // if (functions) {
  //   const sendEmail = httpsCallable(functions, 'sendContactEmail');
  //   await sendEmail(payload);
  // }
};
