

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

  // Update progress bar based on data-step attributes or index
  try {
    const $steps = $('.form-section');
    const total = $steps.length || 1;
    // Try to derive the step index from data-step or from the id
    const stepAttr = $targetSection.attr('data-step');
    let stepIndex = stepAttr ? parseInt(stepAttr, 10) : null;
    if (!stepIndex) {
      // fallback: compute index based on position among visible sections
      stepIndex = $steps.index($targetSection) + 1;
    }
    const percent = Math.round(((stepIndex) / total) * 100);
    $('#form-progress').css('width', percent + '%').attr('aria-valuenow', percent);
  } catch (e) {
    console.warn('Could not update progress bar', e);
  }

  // Focus the first input inside the target for accessibility
  const $firstInput = $targetSection.find('input, select, textarea').filter(':visible').first();
  if ($firstInput && $firstInput.length) {
    $firstInput.focus();
  }
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

function toggleOtherInput() {
  const otherCheckbox = document.getElementById('OtherFinancing');
  const otherInputContainer = document.getElementById('otherInputContainer');
  const otherInput = document.getElementById('otherInput');

  if (otherCheckbox.checked) {
    otherInputContainer.style.display = 'block';
    otherInput.setAttribute('required', 'required'); // Make the input field required
  } else {
    otherInputContainer.style.display = 'none';
    otherInput.removeAttribute('required'); // Remove the required attribute
    otherInput.value = ''; // Optionally clear the input field
  }
};
function toggleProofUpload(isVisible) {
  const uploadContainer = document.getElementById('proofUploadContainer');
  if (isVisible) {
    uploadContainer.style.display = 'inline';
  } else {
    uploadContainer.style.display = 'none';
  }
};
function toggleOtherQuicklyInput() {
  const otherQuicklyRadio = document.getElementById('OtherQuickly');
  const otherInputContainer = document.getElementById('otherQuicklyInputContainer');
  const otherInput = document.getElementById('otherQuicklyInput');

  if (otherQuicklyRadio.checked) {
    otherInputContainer.style.display = 'block';
    otherInput.setAttribute('required', 'required'); // Make the input field required
  } else {
    otherInputContainer.style.display = 'none';
    otherInput.removeAttribute('required'); // Remove the required attribute
    otherInput.value = ''; // Optionally clear the input field
  }
}

// Attach event listeners to all radio buttons in the "Quickly" group
document.querySelectorAll('input[name="Quickly"]').forEach((radio) => {
  radio.addEventListener('change', toggleOtherQuicklyInput);
});

function toggleOtherPropertyInput() {
  const checkbox = document.getElementById('PropertyOther');
  const inputContainer = document.getElementById('propertyOtherInputContainer');

  if (checkbox.checked) {
    inputContainer.style.display = 'block';
  } else {
    inputContainer.style.display = 'none';
  }
}

// Function to toggle the visibility of the "Other" work type input
function toggleWorkTypeInput() {
  const checkbox = document.getElementById('WorkTypeOther');
  const inputContainer = document.getElementById('workTypeOtherInputContainer');

  if (checkbox.checked) {
    inputContainer.style.display = 'block';
  } else {
    inputContainer.style.display = 'none';
  }
};


const readinessDescriptions = {
  1: "Just browsing",
  2: "Thinking about it",
  3: "Researching options",
  4: "Getting prepared",
  5: "Somewhat ready",
  6: "Fairly ready",
  7: "Very ready",
  8: "Extremely ready",
  9: "Almost closing",
  10: "Ready to close today"
};

function updateReadinessLabel(value) {
  const label = readinessDescriptions[value];
  document.getElementById("purchaseReadinessLabel").innerText = label;
  document.getElementById("purchaseReadinessSlider").setAttribute("data-readiness-description", label);
}

// Price range dual-slider helpers
function formatCurrency(num) {
  if (num === '' || num === null || isNaN(Number(num))) return '$0';
  return '$' + Number(num).toLocaleString();
}

function syncPriceRangeUI(source) {
  const minInput = document.getElementById('PriceRangesMin');
  const maxInput = document.getElementById('PriceRangesMax');
  const minSlider = document.getElementById('priceRangeMinSlider');
  const maxSlider = document.getElementById('priceRangeMaxSlider');
  const summary = document.getElementById('priceRangeSummary');

  if (!minInput || !maxInput || !minSlider || !maxSlider || !summary) {
    console.debug('syncPriceRangeUI: one or more elements missing', { minInput: !!minInput, maxInput: !!maxInput, minSlider: !!minSlider, maxSlider: !!maxSlider, summary: !!summary });
    return;
  }

  // Determine values depending on what triggered the sync.
  // If a slider triggered the sync, prefer the slider's value for that side.
  // If an input triggered the sync, prefer the input's value. If no source provided, use slider values by default.
  let minVal, maxVal;
  try {
    if (source === 'minInput') {
      minVal = parseInt(minInput.value, 10);
    } else if (source === 'minSlider') {
      minVal = parseInt(minSlider.value, 10);
    }
    if (source === 'maxInput') {
      maxVal = parseInt(maxInput.value, 10);
    } else if (source === 'maxSlider') {
      maxVal = parseInt(maxSlider.value, 10);
    }
  } catch (e) {
    // fall through
  }
  // If still undefined, prefer slider values, then input values
  if (typeof minVal === 'undefined' || isNaN(minVal)) {
    minVal = parseInt(minSlider.value || minInput.value, 10);
  }
  if (typeof maxVal === 'undefined' || isNaN(maxVal)) {
    maxVal = parseInt(maxSlider.value || maxInput.value, 10);
  }

  // Clamp
  if (isNaN(minVal)) minVal = Number(minSlider.min) || 0;
  if (isNaN(maxVal)) maxVal = Number(maxSlider.max) || 0;
  if (minVal < Number(minSlider.min)) minVal = Number(minSlider.min);
  if (maxVal > Number(maxSlider.max)) maxVal = Number(maxSlider.max);
  if (minVal > maxVal) {
    // swap to keep min <= max
    const t = minVal; minVal = maxVal; maxVal = t;
  }

  // Reflect back to inputs and sliders
  minInput.value = minVal;
  maxInput.value = maxVal;
  minSlider.value = minVal;
  maxSlider.value = maxVal;
  summary.innerText = formatCurrency(minVal) + ' - ' + formatCurrency(maxVal);
  // update highlight track
  try {
    const highlight = document.getElementById('priceRangeHighlight');
    if (highlight) {
      const min = Number(minSlider.min) || 0;
      const max = Number(minSlider.max) || 1;
      const leftPct = ((minVal - min) / (max - min)) * 100;
      const rightPct = 100 - ((maxVal - min) / (max - min)) * 100;
      highlight.style.left = leftPct + '%';
      highlight.style.right = rightPct + '%';
    }
  } catch (e) {
    console.debug('could not update highlight', e);
  }
  console.debug('syncPriceRangeUI:', { minVal, maxVal, summary: summary.innerText });

  // Update hidden PriceRanges so validations/submission see correct value
  try {
    const form = document.getElementById('cash-buyer-form');
    if (!form) return;
    let hidden = form.querySelector('input[name="PriceRanges"]');
    if (!hidden) {
      hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'PriceRanges';
      form.appendChild(hidden);
    }
    hidden.value = `${minVal} - ${maxVal}`;
  } catch (e) {
    console.warn('syncPriceRangeUI error', e);
  }
}

// Wire up events
function initPriceRangeControls() {
  console.debug('initPriceRangeControls: initializing');
  const minInput = document.getElementById('PriceRangesMin');
  const maxInput = document.getElementById('PriceRangesMax');
  const minSlider = document.getElementById('priceRangeMinSlider');
  const maxSlider = document.getElementById('priceRangeMaxSlider');

  if (!minInput || !maxInput || !minSlider || !maxSlider) return;

  // Keep sliders and inputs in sync
  ['input', 'change'].forEach(evt => {
    minInput.addEventListener(evt, () => { console.debug('minInput event', evt); syncPriceRangeUI('minInput'); });
    maxInput.addEventListener(evt, () => { console.debug('maxInput event', evt); syncPriceRangeUI('maxInput'); });
    minSlider.addEventListener(evt, () => {
      console.debug('minSlider event', evt, { minSlider: minSlider.value, maxSlider: maxSlider.value });
      // Prevent min slider surpassing max slider
      if (Number(minSlider.value) > Number(maxSlider.value)) {
        minSlider.value = maxSlider.value;
      }
      syncPriceRangeUI('minSlider');
    });
    maxSlider.addEventListener(evt, () => {
      console.debug('maxSlider event', evt, { minSlider: minSlider.value, maxSlider: maxSlider.value });
      if (Number(maxSlider.value) < Number(minSlider.value)) {
        maxSlider.value = minSlider.value;
      }
      syncPriceRangeUI('maxSlider');
    });
  });

  // Make overlapping sliders interactive: toggle z-index and pointer-events while dragging/touching
  const clearActive = () => {
    try {
      minSlider.style.zIndex = '';
      maxSlider.style.zIndex = '';
      minSlider.style.pointerEvents = 'auto';
      maxSlider.style.pointerEvents = 'auto';
    } catch (e) {}
  };

  minSlider.addEventListener('mousedown', () => {
    minSlider.style.zIndex = 4;
    maxSlider.style.zIndex = 3;
    minSlider.style.pointerEvents = 'auto';
    maxSlider.style.pointerEvents = 'auto';
  });
  maxSlider.addEventListener('mousedown', () => {
    maxSlider.style.zIndex = 4;
    minSlider.style.zIndex = 3;
    minSlider.style.pointerEvents = 'auto';
    maxSlider.style.pointerEvents = 'auto';
  });

  // Touch events for mobile
  minSlider.addEventListener('touchstart', () => {
    minSlider.style.zIndex = 4;
    maxSlider.style.zIndex = 3;
  }, { passive: true });
  maxSlider.addEventListener('touchstart', () => {
    maxSlider.style.zIndex = 4;
    minSlider.style.zIndex = 3;
  }, { passive: true });

  // Clear active state on document up/end
  document.addEventListener('mouseup', clearActive);
  document.addEventListener('touchend', clearActive);

  // Initialize once
  syncPriceRangeUI();
}

function handlePageLoad() {
  const params = new URLSearchParams(window.location.search);

  // Try to restore any server-saved form values (one-time). This makes restoration work
  // immediately after redirects no matter which page the form partial is embedded on.
  try {
    // Helper to apply restored values (server payload or inline window.__formValues)
    function applyPayload(payload) {
      if (!payload || !payload.values) return;
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

        // After restoring raw values, ensure price-range UI syncs to reflect restored min/max
        try {
          if (typeof syncPriceRangeUI === 'function') syncPriceRangeUI();
          if (typeof initPriceRangeControls === 'function') initPriceRangeControls();
        } catch (e) { /* ignore */ }

        // If server saved a previously uploaded proof file, show a small preview or link
        try {
          const proofPath = fv.ProofOfFundsFile || (payload && payload.values && payload.values.ProofOfFundsFile);
          if (proofPath) {
            const uploadInput = document.getElementById('proofUpload');
            if (uploadInput) {
              let preview = document.getElementById('proof-upload-preview');
              if (!preview) {
                preview = document.createElement('div');
                preview.id = 'proof-upload-preview';
                preview.className = 'mt-2 small text-muted';
                uploadInput.parentNode.insertBefore(preview, uploadInput.nextSibling);
              }
              // proofPath is stored like 'public/uploaded/filename.ext' — serve via /public
              const url = '/' + proofPath.replace(/^\/+/, '');
              const ext = (proofPath.split('.').pop() || '').toLowerCase();
              if (['jpg','jpeg','png','gif','webp'].includes(ext)) {
                preview.innerHTML = `<div>Previously uploaded: <a href="${url}" target="_blank">view</a><br/><img src="${url}" style="max-width:200px;display:block;margin-top:6px;" alt="uploaded proof" /></div>`;
              } else {
                preview.innerHTML = `Previously uploaded: <a href="${url}" target="_blank">view file</a>`;
              }
            }
          }
        } catch (e) { console.error('proof preview error', e); }
      } catch (e) {
        console.error('Error restoring server-saved form values:', e);
      }
    }

    // First try inline server-rendered values (set by server during GET render)
    try {
      if (window.__formValues && Object.keys(window.__formValues).length) {
        applyPayload({ values: window.__formValues });
      }
    } catch (e) {}

    // Then try the restore endpoint (if session still available)
    fetch('/api/cbForm/restore', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(payload => {
        applyPayload(payload);
        if (payload && payload.errors && payload.errors.length) {
          try {
            const qs = new URLSearchParams(window.location.search);
            qs.set('errors', encodeURIComponent(JSON.stringify(payload.errors.map(e => e.msg || e))));
            history.replaceState({}, '', window.location.pathname + '?' + qs.toString());
          } catch (e) {}
          try { showInlineErrors(payload.errors); } catch (e) {}
        }
      })
      .catch(err => { /* ignore network errors */ })
      .finally(() => {
        // Clean the URL after restore processing so subsequent reloads don't re-trigger alerts
        try {
          const cleanUrl = window.location.pathname + (window.location.hash || '');
          history.replaceState({}, '', cleanUrl);
        } catch (e) { /* ignore */ }
      });
  } catch (e) { /* ignore */ }

  // Handle validation errors
  const errors = params.get('errors');
  if (errors) {
    try {
      // Parse the JSON string to get error messages
      const errorMessages = JSON.parse(decodeURIComponent(errors));

      // Combine all errors into a single string with each error on a new line
      const errorText = errorMessages.map(msg => `• ${msg}`).join("\n");

      // Also show a persistent inline banner asking the user to re-check price and proof photo
      try {
        const form = document.getElementById('cash-buyer-form') || document.querySelector('form');
        if (form) {
          let banner = document.getElementById('recheck-alert');
          if (!banner) {
            banner = document.createElement('div');
            banner.id = 'recheck-alert';
            banner.className = 'alert alert-warning';
            banner.style.marginBottom = '1rem';
            // English message: ask user to verify price and proof photo
            banner.innerText = 'Form submission failed — please re-check the price and proof-of-funds (photo) before resubmitting.';
            form.insertBefore(banner, form.firstChild);
          } else {
            banner.style.display = '';
          }
        }
      } catch (e) { /* ignore banner insertion errors */ }

      // Display using SweetAlert2
      Swal.fire({
        title: "Please try again!",
        text: errorText,
        icon: "error",
        confirmButtonText: "OK",
      });
    } catch (e) {
      console.error('Error parsing validation errors:', e);
    }
  }
  // Handle success message
  const success = params.get('success');
  if (success) {
    Swal.fire({
      title: "<h3 class='fw-bold text-secondary' style='font-size: 18px; margin: 0;'>Thank you for submitting the Cash Buyer Form. Our team will get back to you shortly!</h3>", // Smaller title
      html: "<p class='fw-bold text-primary' style='font-size: 26px;'>Draw your dream with us</p>", // Larger text
      icon: "success",
      confirmButtonText: "OK",
      confirmButtonColor: "#28a745", // Green color for the OK button
      //  footer: `<a  href="/blogs">Refer to the blog page for guidance</a>`,

    }).then((result) => {
      if (result.isConfirmed) {
        window.location.href = "/forms/Cash-Buyer"; // Redirect to blogs on confirmation
      }
    });
  }

  // Populate form fields with data from query parameters
  const formElements = document.querySelectorAll("form#Preview-form [name]");
  formElements.forEach(element => {
    const value = params.get(element.name);
    if (value) {
      element.value = decodeURIComponent(value);
    }
  });

  // Initialize form sections and progress
  if (typeof initFormSections === 'function') {
    initFormSections();
  }

  // Clear query string after we've processed errors/success and restored values so
  // a subsequent reload won't re-trigger alerts or restore behavior.
  try {
    const cleanUrl = window.location.pathname + (window.location.hash || '');
    history.replaceState({}, '', cleanUrl);
  } catch (e) {
    // ignore
  }

  // Hide the recheck banner when the user interacts with price inputs or the file input
  try {
    const hideBanner = () => {
      const b = document.getElementById('recheck-alert'); if (b) b.style.display = 'none';
    };
    ['PriceRangesMin', 'PriceRangesMax', 'proofUpload'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', hideBanner);
    });
  } catch (e) {}
}

// Show inline validation errors next to fields.
function showInlineErrors(errors) {
  if (!errors || !errors.length) return;
  try {
    const form = document.getElementById('cash-buyer-form') || document.querySelector('form');
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
        // General form-level error: place an alert at top of form
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
        // no matching field; add to general errors
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
        } catch (e) {
          console.error('showInlineErrors per-field error', e);
        }
      });
    });
  } catch (e) {
    console.error('showInlineErrors error', e);
  }
}

// Run on page load
window.onload = handlePageLoad;

/**
 * Submit form helper used by inline onclick handlers.
 * Usage: submitForm() or submitForm('Preview-form')
 */
function submitForm(formId) {
  const form = formId ? document.getElementById(formId) : (document.getElementById('cash-buyer-form') || document.getElementById('Preview-form') || document.querySelector('form'));
  if (!form) {
    console.warn('submitForm: no form found to submit');
    return false;
  }

  // Build a combined PriceRanges value from the two number inputs (if present)
  try {
    const minEl = form.querySelector('input[name="PriceRangesMin"]');
    const maxEl = form.querySelector('input[name="PriceRangesMax"]');
    let priceRangesValue = '';
    if (minEl && minEl.value) priceRangesValue += minEl.value.trim();
    if (maxEl && maxEl.value) priceRangesValue += (priceRangesValue ? ' - ' : '') + maxEl.value.trim();

    let hidden = form.querySelector('input[name="PriceRanges"]');
    if (!hidden) {
      hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'PriceRanges';
      form.appendChild(hidden);
    }
    hidden.value = priceRangesValue;
  } catch (e) {
    console.warn('Could not build PriceRanges hidden field', e);
  }

  // Use HTML5 validation
  if (!form.checkValidity()) {
    // Mark fields as touched so browser shows validation UI
    form.classList.add('was-validated');
    Swal.fire({
      title: 'Please complete the required fields',
      text: 'Some required fields are missing or invalid. Please check and try again.',
      icon: 'error',
      confirmButtonText: 'OK'
    });
    return false;
  }

  // Disable submit buttons to prevent double submit
  const submitButtons = form.querySelectorAll('button[type="submit"], input[type="submit"]');
  submitButtons.forEach(btn => btn.disabled = true);

  // Submit the form (will follow the form's action/method)
  form.submit();
  return true;
}

// Initialize visibility of form sections and progress bar
function initFormSections() {
  try {
    const $sections = $('.form-section');
    if (!$sections.length) return;

    // Hide all sections, then show first step (data-step=1)
    $sections.addClass('hidden-section').attr('aria-hidden', 'true');
    const $first = $sections.filter('[data-step="1"]').first() || $sections.first();
    $first.removeClass('hidden-section').attr('aria-hidden', 'false');

    // Set initial progress
    const total = $sections.length;
    const percent = Math.round((1 / total) * 100);
    $('#form-progress').css('width', percent + '%').attr('aria-valuenow', percent);

    // Remove invalid marker and clear server feedback when user fixes a field
    $('form#cash-buyer-form').on('input change', 'input, select, textarea', function () {
      try {
        if (this.checkValidity && this.checkValidity()) {
          $(this).removeClass('is-invalid');
          // clear nearest .invalid-feedback text if it was added by server
          let $fb = $(this).closest('.form-outline, .mb-3, .col-md-6, .form-group').find('.invalid-feedback').first();
          if ($fb && $fb.length) $fb.text('');
          // clear general server-errors alert if present and there are no remaining invalid fields
          const $form = $(this).closest('form');
          if ($form.find('.is-invalid').length === 0) {
            $form.find('.server-errors').remove();
          }
        }
      } catch (e) {
        // ignore
      }
    });

    // initialize price range controls if present
    if (typeof initPriceRangeControls === 'function') {
      initPriceRangeControls();
    }
  } catch (e) {
    console.warn('initFormSections failed', e);
  }
}