import { initializeApp }              from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAnalytics }               from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js';
import { getFirestore, collection, addDoc, serverTimestamp }
                                       from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
const db        = getFirestore(app);
// Région Firestore : europe-west9 (Paris)

window.submitContact = async function submitContact(payload) {
  await addDoc(collection(db, 'contacts'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
};
