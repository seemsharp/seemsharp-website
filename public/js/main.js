/* ═══════════════════════════════════════
   SEEMSHARP – main.js
═══════════════════════════════════════ */

/* ─── Header scroll ─── */
const header = document.getElementById('header');
const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 30);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ─── Mobile nav ─── */
const burger  = document.querySelector('.burger');
const navList = document.querySelector('.nav-list');
burger.addEventListener('click', () => {
  const open = burger.classList.toggle('open');
  navList.classList.toggle('open', open);
  burger.setAttribute('aria-expanded', open);
  document.body.style.overflow = open ? 'hidden' : '';
});
navList.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  burger.classList.remove('open');
  navList.classList.remove('open');
  burger.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}));

/* ─── Intersection observer (fade-up + service cards) ─── */
const observerOpts = { threshold: 0.12 };
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const delay = e.target.dataset.delay ?? 0;
    setTimeout(() => e.target.classList.add('visible'), Number(delay));
    io.unobserve(e.target);
  });
}, observerOpts);

document.querySelectorAll('.service-card, .fade-up').forEach(el => io.observe(el));

/* ─── Add fade-up to generic sections ─── */
document.querySelectorAll('.section-header, .step, .value-item, .contact-item').forEach(el => {
  el.classList.add('fade-up');
  io.observe(el);
});

/* ─── Footer year ─── */
document.getElementById('year').textContent = new Date().getFullYear();

/* ─── Math CAPTCHA ─── */
let captchaAnswer = 0;
function generateCaptcha() {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;
  captchaAnswer = a + b;
  document.getElementById('captcha-question').textContent = `${a} + ${b}`;
}
generateCaptcha();

/* ─── Form anti-spam & submission ─── */
const form       = document.getElementById('contact-form');
const formMsg    = document.getElementById('form-message');
const submitBtn  = document.getElementById('submit-btn');
const formStart  = Date.now();  // time-based check

function showMsg(type, text) {
  formMsg.className = `form-message ${type}`;
  formMsg.textContent = text;
  formMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function validateField(field) {
  const ok = field.checkValidity() && field.value.trim() !== '';
  field.classList.toggle('error', !ok);
  return ok;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  /* ── Anti-spam checks ── */
  // 1. Honeypot
  if (form.website.value !== '') return;

  // 2. Time-based (must take > 3 s to fill)
  if (Date.now() - formStart < 3000) return;

  // 3. Math CAPTCHA
  const userAnswer = parseInt(document.getElementById('captcha-answer').value, 10);
  if (isNaN(userAnswer) || userAnswer !== captchaAnswer) {
    showMsg('error', 'Réponse incorrecte au calcul anti-robot. Veuillez réessayer.');
    generateCaptcha();
    document.getElementById('captcha-answer').value = '';
    return;
  }

  /* ── HTML5 validation ── */
  const fields = ['prenom','nom','email','sujet','message'];
  let valid = true;
  fields.forEach(id => { if (!validateField(document.getElementById(id))) valid = false; });
  if (!form.rgpd.checked) {
    valid = false;
    form.rgpd.closest('.form-group').classList.add('error');
  }
  if (!valid) { showMsg('error', 'Veuillez remplir tous les champs obligatoires.'); return; }

  /* ── Submit ── */
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;

  const payload = {
    prenom:  form.prenom.value.trim(),
    nom:     form.nom.value.trim(),
    email:   form.email.value.trim(),
    societe: form.societe.value.trim(),
    sujet:   form.sujet.value,
    message: form.message.value.trim(),
    ts:      new Date().toISOString(),
  };

  try {
    // Try Firebase Function first, fall back to direct Firestore
    await submitContact(payload);
    showMsg('success', 'Votre message a bien été envoyé. Nous vous répondrons sous 24 h ouvrées.');
    form.reset();
    generateCaptcha();
  } catch (err) {
    console.error(err);
    showMsg('error', 'Une erreur est survenue. Veuillez nous contacter directement par email.');
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
  }
});

/* Clear error on input */
form.querySelectorAll('input, select, textarea').forEach(el => {
  el.addEventListener('input', () => el.classList.remove('error'));
});

/* ─── submitContact – called from main.js, implemented in firebase-init.js ─── */
// Defined globally via firebase-init.js module
window.submitContact = window.submitContact || async function(payload) {
  console.warn('Firebase not initialised, payload:', payload);
};
