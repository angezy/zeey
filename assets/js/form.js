

function navigateSection(currentSectionId, targetSectionId) {
  const $currentSection = $(`#section-${currentSectionId}`);
  const $targetSection = $(`#section-${targetSectionId}`);

  if (targetSectionId > currentSectionId) {
    // Moving forward: validate required fields
    if (!validateSection($currentSection)) {
      Swal.fire({
        title: "Please fill out all required fields before proceeding.",
        icon: "error",
        confirmButtonText: "OK",
      });
      return;
    }
  }

  // Switch sections
  $currentSection.addClass('hidden-section');
  $targetSection.removeClass('hidden-section');
}

function validateSection($section) {
  let isValid = true;
  $section.find('input[required], select[required]').each(function () {
    if (!$(this).val()) {
      isValid = false;
      $(this).addClass('is-invalid'); // Add a class for invalid fields (optional for styling)
    } else {
      $(this).removeClass('is-invalid'); // Remove invalid class if corrected
    }
  });
  return isValid;
};




function handlePageLoad() {
  const urlParams = new URLSearchParams(window.location.search);

  // Try to restore any server-saved form values (one-time). This makes restoration work
  // immediately after redirects no matter which page the form partial is embedded on.
  try {
    fetch('/api/fastSell/restore', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(payload => {
        if (payload && payload.values) {
          try {
            const fv = payload.values;
            Object.keys(fv).forEach(function (key) {
              const val = fv[key];
              if (typeof val === 'undefined' || val === null) return;
              if (Array.isArray(val)) {
                val.forEach(function (v) {
                  const els = document.querySelectorAll('[name="' + key + '"]');
                  els.forEach(function (el) {
                    if ((el.type === 'checkbox' || el.type === 'radio') && String(el.value) === String(v)) el.checked = true;
                  });
                });
                return;
              }
              const elements = document.querySelectorAll('[name="' + key + '"]');
              if (!elements || !elements.length) return;
              elements.forEach(function (el) {
                const tag = el.tagName.toLowerCase();
                const type = el.type ? el.type.toLowerCase() : '';
                if (type === 'radio') {
                  if (String(el.value) === String(val)) el.checked = true;
                } else if (type === 'checkbox') {
                  if (String(el.value) === String(val)) el.checked = true;
                } else if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                  el.value = val;
                }
              });
            });
          } catch (e) {
            console.error('Error restoring fastSell server-saved form values:', e);
          }
        }
        // If the server returned errors, expose them via the query param so existing alert logic shows them
        if (payload && payload.errors && payload.errors.length) {
          try {
            const qs = new URLSearchParams(window.location.search);
            qs.set('errors', encodeURIComponent(JSON.stringify(payload.errors.map(e => e.msg || e))));
            history.replaceState({}, '', window.location.pathname + '?' + qs.toString());
          } catch (e) {}
          try { showInlineErrors(payload.errors); } catch (e) { /* ignore */ }
        }
      })
      .catch(err => { /* ignore network errors */ });
  } catch (e) { /* ignore */ }

  // Handle validation errors from query
  const errors = urlParams.get('errors');
  if (errors) {
    try {
      const errorMessages = JSON.parse(decodeURIComponent(errors));
      const errorText = errorMessages.map(msg => `• ${msg}`).join("\n");
      Swal.fire({ title: "Please try again!", text: errorText, icon: "error", confirmButtonText: "OK" });
    } catch (e) { console.error('Error parsing validation errors:', e); }
  }

  // Handle success message
  const success = urlParams.get('success');
  if (success) {
    Swal.fire({ title: "Success!", text: success, icon: "success", confirmButtonText: "OK" });
  }

  // Clear the query string after processing so reloads don't re-trigger alerts
  try { const cleanUrl = window.location.pathname + (window.location.hash || ''); history.replaceState({}, '', cleanUrl); } catch (e) {}

};
window.onload = handlePageLoad;

// Show inline validation errors next to fields for fastSell form
function showInlineErrors(errors) {
  if (!errors || !errors.length) return;
  try {
    const form = document.getElementById('Preview-form') || document.querySelector('form');
    if (!form) return;

    function findFeedback(el) {
      let node = el;
      for (let i = 0; i < 5 && node; i++) {
        if (node.querySelector) {
          const fb = node.querySelector('.invalid-feedback');
          if (fb) return fb;
        }
        node = node.parentElement;
      }
      return null;
    }

    errors.forEach(function (err) {
      const param = err && err.param ? err.param : null;
      const msg = (err && (err.msg || err.message)) ? (err.msg || err.message) : (typeof err === 'string' ? err : String(err));

      if (!param) {
        let general = form.querySelector('.server-errors');
        if (!general) {
          general = document.createElement('div');
          general.className = 'server-errors alert alert-danger';
          form.insertBefore(general, form.firstChild);
        }
        general.innerText = msg;
        return;
      }

      const els = form.querySelectorAll('[name="' + param + '"]');
      if (!els || !els.length) {
        let general = form.querySelector('.server-errors');
        if (!general) {
          general = document.createElement('div');
          general.className = 'server-errors alert alert-danger';
          form.insertBefore(general, form.firstChild);
        }
        general.innerText = (general.innerText ? general.innerText + '\n' : '') + msg;
        return;
      }

      els.forEach(function (el) {
        try {
          el.classList.add('is-invalid');
          let fb = findFeedback(el);
          if (!fb) {
            fb = document.createElement('div');
            fb.className = 'invalid-feedback';
            if (el.nextSibling) el.parentNode.insertBefore(fb, el.nextSibling); else el.parentNode.appendChild(fb);
          }
          fb.innerText = msg;
        } catch (e) { console.error('showInlineErrors per-field error', e); }
      });
    });
  } catch (e) { console.error('showInlineErrors error', e); }
}
