function getMessageElement() {
  return document.getElementById("formMessage");
}

function clearMessage() {
  const element = getMessageElement();
  if (!element) return;
  element.hidden = true;
  element.textContent = "";
}

function showMessage(message, type = "error") {
  const element = getMessageElement();
  if (!element) return;
  element.textContent = message;
  element.className = `form-message ${type}`;
  element.hidden = false;
}

function setBusy(button, busy, label) {
  if (!button) return;

  if (!button.dataset.label) {
    button.dataset.label = button.textContent;
  }

  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.label;
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { response, data };
}

function redirectToVerify(email) {
  window.location.href = `/verify?email=${encodeURIComponent(email)}`;
}

function setupRegisterForm() {
  const form = document.getElementById("registerForm");
  if (!form) return;

  const button = document.getElementById("submitBtn");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    const data = new FormData(form);
    setBusy(button, true, "Bezig...");

    try {
      const result = await postJson("/api/register", {
        username: data.get("username"),
        email: data.get("email"),
        password: data.get("password"),
      });

      if (!result.response.ok) {
        showMessage(result.data?.error || "Registreren is mislukt.");

        if (result.data?.verify && result.data?.email) {
          window.setTimeout(() => redirectToVerify(result.data.email), 1500);
        }
        return;
      }

      redirectToVerify(result.data.email);
    } catch {
      showMessage("Kan geen verbinding maken met de server.");
    } finally {
      setBusy(button, false, "");
    }
  });
}

function setupLoginForm() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  const button = document.getElementById("submitBtn");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    const data = new FormData(form);
    setBusy(button, true, "Bezig...");

    try {
      const result = await postJson("/api/login", {
        email: data.get("email"),
        password: data.get("password"),
      });

      if (!result.response.ok) {
        showMessage(result.data?.error || "Inloggen is mislukt.");

        if (result.data?.verify && result.data?.email) {
          window.setTimeout(() => redirectToVerify(result.data.email), 1500);
        }
        return;
      }

      window.location.href = result.data?.redirect || "/chat";
    } catch {
      showMessage("Kan geen verbinding maken met de server.");
    } finally {
      setBusy(button, false, "");
    }
  });
}

function setupForgotPasswordForm() {
  const form = document.getElementById("forgotPasswordForm");
  if (!form) return;

  const button = document.getElementById("submitBtn");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    const data = new FormData(form);
    setBusy(button, true, "Bezig...");

    try {
      const result = await postJson("/api/forgot-password", {
        email: data.get("email"),
      });

      if (!result.response.ok) {
        showMessage(result.data?.error || "Versturen is mislukt.");
        return;
      }

      showMessage(
        result.data?.message ||
          "Als dit e-mailadres bij ons bekend is, ontvang je een resetlink.",
        "success",
      );
      form.reset();
    } catch {
      showMessage("Kan geen verbinding maken met de server.");
    } finally {
      setBusy(button, false, "");
    }
  });
}

function setupResetPasswordForm() {
  const form = document.getElementById("resetPasswordForm");
  if (!form) return;

  const button = document.getElementById("submitBtn");
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";

  if (!token) {
    showMessage(
      "Deze resetlink is ongeldig of verlopen. Vraag een nieuwe resetlink aan.",
    );
    button.disabled = true;
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    const data = new FormData(form);
    const password = String(data.get("password") || "");
    const confirmPassword = String(data.get("confirmPassword") || "");

    if (password.length < 8 || password.length > 128) {
      showMessage("Gebruik een wachtwoord van 8 tot 128 tekens.");
      return;
    }

    if (password !== confirmPassword) {
      showMessage("De wachtwoorden zijn niet gelijk.");
      return;
    }

    setBusy(button, true, "Bezig...");

    try {
      const result = await postJson("/api/reset-password", {
        token,
        password,
      });

      if (!result.response.ok) {
        showMessage(result.data?.error || "Resetten is mislukt.");
        return;
      }

      showMessage(
        result.data?.message || "Je wachtwoord is gewijzigd.",
        "success",
      );
      window.location.href = result.data?.redirect || "/chat";
    } catch {
      showMessage("Kan geen verbinding maken met de server.");
    } finally {
      setBusy(button, false, "");
    }
  });
}

function setupVerifyForm() {
  const form = document.getElementById("verifyForm");
  if (!form) return;

  const button = document.getElementById("submitBtn");
  const resendButton = document.getElementById("resendBtn");
  const emailInput = document.getElementById("email");
  const params = new URLSearchParams(window.location.search);
  const emailFromQuery = params.get("email");

  if (emailFromQuery) {
    emailInput.value = emailFromQuery;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    const data = new FormData(form);
    const code = String(data.get("code") || "").replace(/\D/g, "");

    if (!/^\d{6}$/.test(code)) {
      showMessage("Vul de 6-cijferige code uit je e-mail in.");
      return;
    }

    setBusy(button, true, "Bezig...");

    try {
      const result = await postJson("/api/verify", {
        email: data.get("email"),
        code,
      });

      if (!result.response.ok) {
        showMessage(result.data?.error || "Verifiëren is mislukt.");
        return;
      }

      showMessage(
        result.data?.message || "Je account is geverifieerd.",
        "success",
      );
      window.location.href = result.data?.redirect || "/chat";
    } catch {
      showMessage("Kan geen verbinding maken met de server.");
    } finally {
      setBusy(button, false, "");
    }
  });

  if (!resendButton) return;

  resendButton.addEventListener("click", async () => {
    clearMessage();

    const email = emailInput.value.trim();
    if (!email) {
      showMessage("Vul eerst je school-e-mailadres in.");
      emailInput.focus();
      return;
    }

    resendButton.disabled = true;
    resendButton.textContent = "Versturen...";

    try {
      const result = await postJson("/api/verify/resend", { email });

      if (!result.response.ok) {
        showMessage(result.data?.error || "De code kon niet worden verstuurd.");
        resendButton.disabled = false;
        resendButton.textContent = "Opnieuw sturen";
        return;
      }

      showMessage(
        result.data?.message || "We hebben een nieuwe code gestuurd.",
        "success",
      );

      let remaining = 60;
      resendButton.textContent = `Opnieuw over ${remaining}s`;

      const timer = window.setInterval(() => {
        remaining -= 1;

        if (remaining <= 0) {
          window.clearInterval(timer);
          resendButton.disabled = false;
          resendButton.textContent = "Opnieuw sturen";
          return;
        }

        resendButton.textContent = `Opnieuw over ${remaining}s`;
      }, 1000);
    } catch {
      showMessage("Kan geen verbinding maken met de server.");
      resendButton.disabled = false;
      resendButton.textContent = "Opnieuw sturen";
    }
  });
}

setupRegisterForm();
setupLoginForm();
setupForgotPasswordForm();
setupResetPasswordForm();
setupVerifyForm();
