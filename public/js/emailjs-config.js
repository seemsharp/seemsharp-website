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
  publicKey:  'VOTRE_PUBLIC_KEY',   // ex: 'abc123XYZ'
  serviceId:  'VOTRE_SERVICE_ID',   // ex: 'service_xxxxxxx'
  templateId: 'VOTRE_TEMPLATE_ID',  // ex: 'template_xxxxxxx'
};
