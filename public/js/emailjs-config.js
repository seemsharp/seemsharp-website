// ─── Configuration EmailJS ───────────────────────────────────────
// 1. Créez un compte sur https://www.emailjs.com (gratuit)
// 2. Ajoutez un service email (Gmail ou autre) → notez le Service ID
// 3. Créez un template (voir instructions ci-dessous) → notez le Template ID
// 4. Récupérez votre Public Key dans Account > API Keys
//
// Template EmailJS suggéré (variables à utiliser dans le template) :
//   Sujet : [Seemsharp Contact] {{sujet}} – {{prenom}} {{nom}}
//   Corps :
//     Nom : {{prenom}} {{nom}}
//     Email : {{email}}
//     Société : {{societe}}
//     Sujet : {{sujet}}
//     Message : {{message}}
//   Reply To : {{email}}
// ─────────────────────────────────────────────────────────────────

window.EMAILJS_CONFIG = {
  publicKey:  't4D2al2Hd6KtBqUsd',   // ex: 'abc123XYZ'
  serviceId:  'service_go4ei5g',   // ex: 'service_xxxxxxx'
  templateId: 'template_6zic3as',  // ex: 'template_xxxxxxx'
};
