// Formulaire public de contact NVG.
// Envoie le message à l'Edge Function `contact-message`, qui l'enregistre
// dans nvg_contact_messages (lisible uniquement par les admins) et prévient
// les administrateurs par notification push. Aucun e-mail n'est envoyé.
(function () {
  'use strict';

  const form = document.getElementById('contactForm');
  if (!form) return;

  const API = `${SUPABASE_URL}/functions/v1/contact-message`;
  const anonHeaders = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`
  };

  const firstName = document.getElementById('contactFirstName');
  const lastName = document.getElementById('contactLastName');
  const pseudo = document.getElementById('contactPseudo');
  const email = document.getElementById('contactEmail');
  const subject = document.getElementById('contactSubject');
  const recruitFields = document.getElementById('recruitFields');
  const twitch = document.getElementById('contactTwitch');
  const instagram = document.getElementById('contactInstagram');
  const xAccount = document.getElementById('contactX');
  const discord = document.getElementById('contactDiscord');
  const youtube = document.getElementById('contactYoutube');
  const message = document.getElementById('contactMessage');
  const messageLabel = document.getElementById('contactMessageLabel');
  const messageHint = document.getElementById('contactMessageHint');
  const website = document.getElementById('contactWebsite');
  const captchaQuestion = document.getElementById('contactCaptchaQuestion');
  const captchaAnswer = document.getElementById('contactCaptchaAnswer');
  const captchaRefresh = document.getElementById('contactCaptchaRefresh');
  const submitBtn = document.getElementById('contactSubmit');
  const status = document.getElementById('contactStatus');
  const success = document.getElementById('contactSuccess');

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const RECRUIT_SUBJECT = 'Recrutement streameur';

  let captchaToken = '';
  let submitting = false;

  function showStatus(text, kind) {
    status.textContent = text;
    status.className = `status ${kind === 'info' ? 'info' : 'error'}`;
  }

  function hideStatus() {
    status.textContent = '';
    status.className = 'status';
  }

  function applySubject() {
    const recruit = subject.value === RECRUIT_SUBJECT;
    recruitFields.style.display = recruit ? '' : 'none';
    twitch.required = recruit;
    message.required = !recruit;

    if (recruit) {
      messageLabel.innerHTML = 'Présentation / message (facultatif)';
      messageHint.textContent = 'Présente-toi en quelques mots (facultatif).';
    } else {
      messageLabel.innerHTML = 'Message <span class="req">*</span>';
      messageHint.textContent = 'Aucune limite de caractères (dans la limite de 50 000).';
    }
    hideStatus();
  }

  async function loadCaptcha() {
    captchaToken = '';
    captchaQuestion.textContent = 'Chargement de la question…';
    captchaAnswer.value = '';
    captchaRefresh.disabled = true;

    try {
      const res = await fetch(API, { headers: anonHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || !data.token || !data.question) throw new Error('réponse invalide');
      captchaToken = data.token;
      captchaQuestion.textContent = data.question;
    } catch (err) {
      captchaQuestion.textContent = 'Vérification indisponible';
      showStatus("Impossible de charger la vérification anti-robot. Clique sur « ↻ Nouvelle question ».", 'error');
    } finally {
      captchaRefresh.disabled = false;
    }
  }

  function validate() {
    if (!firstName.value.trim()) return 'Merci d’indiquer ton prénom.';
    if (!lastName.value.trim()) return 'Merci d’indiquer ton nom.';
    if (!email.value.trim()) return 'Merci d’indiquer une adresse e-mail de contact.';
    if (!EMAIL_RE.test(email.value.trim())) return 'L’adresse e-mail n’est pas valide.';
    if (!subject.value) return 'Merci de choisir un objet.';

    if (subject.value === RECRUIT_SUBJECT) {
      if (!twitch.value.trim()) return 'Le nom de la chaîne Twitch est obligatoire.';
    } else if (!message.value.trim()) {
      return 'Le message est obligatoire.';
    }

    if (!captchaToken) return 'La vérification anti-robot n’est pas prête. Réessaie dans un instant.';
    if (!/^\d+$/.test(captchaAnswer.value.trim())) return 'Réponds à la vérification anti-robot (nombre entier).';
    return '';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return;

    hideStatus();
    const problem = validate();
    if (problem) {
      showStatus(problem, 'error');
      return;
    }

    const recruit = subject.value === RECRUIT_SUBJECT;
    const payload = {
      first_name: firstName.value.trim(),
      last_name: lastName.value.trim(),
      pseudo: pseudo.value.trim(),
      email: email.value.trim(),
      subject: subject.value,
      message: message.value.trim(),
      website: website.value,
      captcha_token: captchaToken,
      captcha_answer: captchaAnswer.value.trim()
    };

    // Réseaux sociaux uniquement pour une candidature streameur.
    if (recruit) {
      payload.twitch_channel = twitch.value.trim();
      payload.instagram = instagram.value.trim();
      payload.x_account = xAccount.value.trim();
      payload.discord = discord.value.trim();
      payload.youtube = youtube.value.trim();
    }

    submitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Envoi en cours…';

    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { ...anonHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      let data = null;
      try { data = await res.json(); } catch (_err) { /* réponse non JSON */ }

      if (!res.ok) {
        throw new Error((data && data.error) || `L’envoi a échoué (HTTP ${res.status}).`);
      }

      form.style.display = 'none';
      success.style.display = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      showStatus(err.message || 'L’envoi a échoué. Vérifie ta connexion et réessaie.', 'error');
      await loadCaptcha();
      submitting = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Envoyer le message';
    }
  });

  subject.addEventListener('change', applySubject);
  captchaRefresh.addEventListener('click', loadCaptcha);

  applySubject();
  loadCaptcha();
})();
