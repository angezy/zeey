/* global Swal */

(function () {
  'use strict';

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function getForm() {
    return document.getElementById('cash-buyer-form');
  }

  function getSections(form) {
    return qsa('.form-section', form);
  }

  function getCurrentSection(form) {
    return getSections(form).find(s => !s.classList.contains('hidden-section')) || null;
  }

  function getSectionByStep(form, step) {
    return qs(`#section-${step}`, form) || qs(`.form-section[data-step="${step}"]`, form) || null;
  }

  function setSectionVisible(section, visible) {
    if (!section) return;
    section.classList.toggle('hidden-section', !visible);
    section.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function updateStepUI(form, currentStep) {
    const sections = getSections(form);
    const total = sections.length || 1;
    const safeStep = Math.min(Math.max(Number(currentStep) || 1, 1), total);

    const percent = Math.round((safeStep / total) * 100);
    const bar = document.getElementById('form-progress');
    if (bar) {
      bar.style.width = `${percent}%`;
      bar.setAttribute('aria-valuenow', String(percent));
    }

    const steps = qsa('#cb-steps .cb-step');
    steps.forEach(el => {
      const step = Number(el.getAttribute('data-step')) || 0;
      el.classList.toggle('active', step === safeStep);
      el.classList.toggle('complete', step > 0 && step < safeStep);
    });
  }

  function showGroupFeedback(section, groupName, show) {
    const fb = qs(`[data-required-group-feedback="${groupName}"]`, section);
    if (!fb) return;
    fb.classList.toggle('is-invalid', !!show);
  }

  function validateCheckboxGroups(section) {
    let ok = true;
    const groups = qsa('[data-required-group]', section)
      .reduce((acc, el) => {
        const group = el.getAttribute('data-required-group');
        if (!group) return acc;
        acc[group] = acc[group] || [];
        acc[group].push(el);
        return acc;
      }, {});

    Object.keys(groups).forEach(groupName => {
      const inputs = groups[groupName];
      const anyChecked = inputs.some(i => i.checked);
      if (!anyChecked) ok = false;

      inputs.forEach(i => i.classList.toggle('is-invalid', !anyChecked));
      showGroupFeedback(section, groupName, !anyChecked);
    });

    return ok;
  }

  function validateRequiredFields(section) {
    let ok = true;

    // Clear previous invalid markers inside this section.
    qsa('.is-invalid', section).forEach(el => el.classList.remove('is-invalid'));
    qsa('.cb-group-feedback', section).forEach(el => el.classList.remove('is-invalid'));

    // Validate required radios by group.
    const radioNames = new Set(
      qsa('input[type="radio"][required]', section).map(r => r.name).filter(Boolean)
    );
    radioNames.forEach(name => {
      const group = qsa(`input[type="radio"][name="${CSS.escape(name)}"]`, section);
      const anyChecked = group.some(r => r.checked);
      if (!anyChecked) {
        ok = false;
        group.forEach(r => r.classList.add('is-invalid'));
      }
    });

    // Validate required inputs/textareas/selects (excluding radios handled above).
    const requiredEls = qsa('input[required], textarea[required], select[required]', section)
      .filter(el => el.type !== 'radio');

    requiredEls.forEach(el => {
      if (!el.checkValidity()) {
        ok = false;
        el.classList.add('is-invalid');
      }
    });

    // Validate required checkbox groups via data-required-group.
    if (!validateCheckboxGroups(section)) ok = false;

    return ok;
  }

  function getStepFromSection(section) {
    if (!section) return 1;
    const attr = Number(section.getAttribute('data-step'));
    if (attr) return attr;
    const id = section.id || '';
    const m = id.match(/section-(\d+)/);
    return m ? Number(m[1]) : 1;
  }

  function focusFirstField(section) {
    if (!section) return;
    const field = qs('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])', section);
    if (field && field.focus) field.focus();
  }

  window.navigateSection = function navigateSection(currentSectionId, targetSectionId) {
    const form = getForm();
    if (!form) return;

    const current = getSectionByStep(form, currentSectionId);
    const target = getSectionByStep(form, targetSectionId);
    if (!current || !target) return;

    if (Number(targetSectionId) > Number(currentSectionId)) {
      if (!validateRequiredFields(current)) {
        const firstInvalid = qs('.is-invalid', current);
        if (firstInvalid && firstInvalid.focus) firstInvalid.focus();
        if (window.Swal) {
          Swal.fire({
            title: 'Please complete required fields',
            text: 'Some fields are missing or invalid in this step.',
            icon: 'error',
            confirmButtonText: 'OK',
          });
        }
        return;
      }
    }

    setSectionVisible(current, false);
    setSectionVisible(target, true);
    updateStepUI(form, getStepFromSection(target));
    focusFirstField(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  function setHiddenPriceRanges(form) {
    const minEl = qs('input[name="PriceRangesMin"]', form);
    const maxEl = qs('input[name="PriceRangesMax"]', form);
    if (!minEl || !maxEl) return;

    const min = (minEl.value || '').trim();
    const max = (maxEl.value || '').trim();
    let hidden = qs('input[name="PriceRanges"]', form);
    if (!hidden) {
      hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'PriceRanges';
      form.appendChild(hidden);
    }
    hidden.value = (min && max) ? `${min} - ${max}` : '';
  }

  function appendDetailsToAdditionalComments(form) {
    const details = [];

    const otherFinancingChecked = !!qs('#SourceFinancingOther', form)?.checked;
    const otherFinancing = (qs('#OtherFinancingDetails', form)?.value || '').trim();
    if (otherFinancingChecked && otherFinancing) details.push(`Other financing: ${otherFinancing}`);

    const quicklyOtherChecked = !!qs('#QuicklyOther', form)?.checked;
    const quicklyOther = (qs('#QuicklyOtherTimeline', form)?.value || '').trim();
    if (quicklyOtherChecked && quicklyOther) details.push(`Other closing timeline: ${quicklyOther}`);

    const propertyOtherChecked = !!qs('#PropertyTypeOther', form)?.checked;
    const propertyOther = (qs('#PropertyTypeOtherDetails', form)?.value || '').trim();
    if (propertyOtherChecked && propertyOther) details.push(`Other property type: ${propertyOther}`);

    const workOtherChecked = !!qs('#WorkTypeOther', form)?.checked;
    const workOther = (qs('#WorkTypeOtherDetails', form)?.value || '').trim();
    if (workOtherChecked && workOther) details.push(`Other work type: ${workOther}`);

    if (!details.length) return;

    const comments = qs('#AdditionalComments', form);
    if (!comments) return;
    const existing = (comments.value || '').trim();
    const block = details.join('\n');

    // Avoid duplicating if the user submits multiple times.
    if (existing.includes(block)) return;

    comments.value = existing ? `${existing}\n\n${block}` : block;
  }

  window.submitForm = function submitForm(formId) {
    const form = formId ? document.getElementById(formId) : getForm();
    if (!form) return false;

    setHiddenPriceRanges(form);
    appendDetailsToAdditionalComments(form);

    // Validate step-by-step so we can navigate to the first failing section.
    const sections = getSections(form);
    const firstBad = sections.find(s => !validateRequiredFields(s));
    if (firstBad) {
      const badStep = getStepFromSection(firstBad);
      const current = getCurrentSection(form);
      const currentStep = getStepFromSection(current);
      if (badStep !== currentStep) {
        setSectionVisible(current, false);
        setSectionVisible(firstBad, true);
        updateStepUI(form, badStep);
      }

      const firstInvalid = qs('.is-invalid', firstBad);
      if (firstInvalid && firstInvalid.focus) firstInvalid.focus();

      if (window.Swal) {
        Swal.fire({
          title: 'Please complete required fields',
          text: 'Some required fields are missing or invalid. Please review the highlighted inputs.',
          icon: 'error',
          confirmButtonText: 'OK',
        });
      }
      return false;
    }

    if (!form.checkValidity()) {
      if (window.Swal) {
        Swal.fire({
          title: 'Please complete the form',
          text: 'Some fields are missing or invalid.',
          icon: 'error',
          confirmButtonText: 'OK',
        });
      }
      return false;
    }

    const submitButtons = qsa('button', form).filter(btn => (btn.textContent || '').toLowerCase().includes('submit'));
    submitButtons.forEach(btn => { try { btn.disabled = true; } catch (e) {} });
    form.submit();
    return true;
  };

  function toggleOtherFinancing() {
    const form = getForm();
    if (!form) return;
    const other = qs('#SourceFinancingOther', form);
    const cont = qs('#otherInputContainer', form);
    if (other && cont) cont.style.display = other.checked ? 'block' : 'none';
  }

  function toggleProofUpload() {
    const form = getForm();
    if (!form) return;
    const yes = qs('#ProofOfFundsYes', form);
    const cont = qs('#proofUploadContainer', form);
    if (yes && cont) cont.style.display = yes.checked ? 'block' : 'none';
  }

  function toggleOtherQuickly() {
    const form = getForm();
    if (!form) return;
    const other = qs('#QuicklyOther', form);
    const cont = qs('#otherQuicklyInputContainer', form);
    if (other && cont) cont.style.display = other.checked ? 'block' : 'none';
  }

  function toggleOtherPropertyType() {
    const form = getForm();
    if (!form) return;
    const other = qs('#PropertyTypeOther', form);
    const cont = qs('#propertyOtherInputContainer', form);
    if (other && cont) cont.style.display = other.checked ? 'block' : 'none';
  }

  function toggleOtherWorkType() {
    const form = getForm();
    if (!form) return;
    const other = qs('#WorkTypeOther', form);
    const cont = qs('#workTypeOtherInputContainer', form);
    if (other && cont) cont.style.display = other.checked ? 'block' : 'none';
  }

  function updateReadinessLabel(value) {
    const label = qs('#purchaseReadinessLabel');
    if (!label) return;

    const readinessDescriptions = {
      1: 'Just browsing',
      2: 'Thinking about it',
      3: 'Researching options',
      4: 'Getting prepared',
      5: 'Somewhat ready',
      6: 'Fairly ready',
      7: 'Very ready',
      8: 'Extremely ready',
      9: 'Almost closing',
      10: 'Ready to close today'
    };
    label.textContent = readinessDescriptions[Number(value)] || String(value || '');
  }

  function syncPriceRangeUI(source) {
    const form = getForm();
    if (!form) return;

    const minInput = qs('#PriceRangesMin', form);
    const maxInput = qs('#PriceRangesMax', form);
    const minSlider = qs('#priceMinSlider', form);
    const maxSlider = qs('#priceMaxSlider', form);
    const fill = qs('#priceRangeFill', form);

    if (!minInput || !maxInput || !minSlider || !maxSlider) return;

    let minVal = Number(minInput.value || minSlider.value || 0);
    let maxVal = Number(maxInput.value || maxSlider.value || 0);

    if (source === 'minSlider') minVal = Number(minSlider.value);
    if (source === 'maxSlider') maxVal = Number(maxSlider.value);
    if (source === 'minInput') minVal = Number(minInput.value);
    if (source === 'maxInput') maxVal = Number(maxInput.value);

    const sliderMin = Number(minSlider.min || 0);
    const sliderMax = Number(minSlider.max || 1);

    if (Number.isNaN(minVal)) minVal = sliderMin;
    if (Number.isNaN(maxVal)) maxVal = sliderMax;

    minVal = Math.max(sliderMin, Math.min(minVal, sliderMax));
    maxVal = Math.max(sliderMin, Math.min(maxVal, sliderMax));

    if (minVal > maxVal) {
      if (source === 'minSlider' || source === 'minInput') maxVal = minVal;
      else minVal = maxVal;
    }

    minInput.value = String(minVal);
    maxInput.value = String(maxVal);
    minSlider.value = String(minVal);
    maxSlider.value = String(maxVal);

    if (fill) {
      const range = sliderMax - sliderMin;
      const leftPct = ((minVal - sliderMin) / range) * 100;
      const rightPct = ((maxVal - sliderMin) / range) * 100;
      fill.style.left = `${leftPct}%`;
      fill.style.width = `${Math.max(0, rightPct - leftPct)}%`;
    }

    setHiddenPriceRanges(form);
  }

  function initFormUI() {
    const form = getForm();
    if (!form) return;

    const sections = getSections(form);
    sections.forEach(s => setSectionVisible(s, false));
    setSectionVisible(getSectionByStep(form, 1), true);
    updateStepUI(form, 1);

    // Wire up toggles
    qsa('input[name="SourceFinancing"]', form).forEach(el => el.addEventListener('change', toggleOtherFinancing));
    qsa('input[name="ProofOfFunds"]', form).forEach(el => el.addEventListener('change', toggleProofUpload));
    qsa('input[name="Quickly"]', form).forEach(el => el.addEventListener('change', toggleOtherQuickly));
    qsa('input[name="PropertyType"]', form).forEach(el => el.addEventListener('change', toggleOtherPropertyType));
    qsa('input[name="WorkType"]', form).forEach(el => el.addEventListener('change', toggleOtherWorkType));

    // Readiness label
    const readiness = qs('#purchaseReadinessSlider', form);
    if (readiness) {
      readiness.addEventListener('input', e => updateReadinessLabel(e.target.value));
      updateReadinessLabel(readiness.value);
    }

    // Price range
    const minInput = qs('#PriceRangesMin', form);
    const maxInput = qs('#PriceRangesMax', form);
    const minSlider = qs('#priceMinSlider', form);
    const maxSlider = qs('#priceMaxSlider', form);

    if (minInput) minInput.addEventListener('input', () => syncPriceRangeUI('minInput'));
    if (maxInput) maxInput.addEventListener('input', () => syncPriceRangeUI('maxInput'));
    if (minSlider) minSlider.addEventListener('input', () => syncPriceRangeUI('minSlider'));
    if (maxSlider) maxSlider.addEventListener('input', () => syncPriceRangeUI('maxSlider'));

    // When sliders overlap, bring the active thumb to the front so it stays draggable.
    if (minSlider && maxSlider) {
      const bringMinFront = () => {
        minSlider.style.zIndex = '5';
        maxSlider.style.zIndex = '4';
      };
      const bringMaxFront = () => {
        maxSlider.style.zIndex = '5';
        minSlider.style.zIndex = '4';
      };
      ['pointerdown', 'mousedown', 'touchstart'].forEach(evt => {
        minSlider.addEventListener(evt, bringMinFront, { passive: true });
        maxSlider.addEventListener(evt, bringMaxFront, { passive: true });
      });
    }

    // Clear per-field invalid state when edited
    form.addEventListener('input', (e) => {
      const el = e.target;
      if (!el) return;
      try {
        if (el.classList && el.classList.contains('is-invalid') && el.checkValidity && el.checkValidity()) {
          el.classList.remove('is-invalid');
        }
      } catch (err) { /* ignore */ }
    });

    // Initial toggle states
    toggleOtherFinancing();
    toggleProofUpload();
    toggleOtherQuickly();
    toggleOtherPropertyType();
    toggleOtherWorkType();
    syncPriceRangeUI();
  }

  function applyValues(values) {
    const form = getForm();
    if (!form || !values) return;

    Object.keys(values).forEach(key => {
      const val = values[key];
      if (val === undefined || val === null) return;

      const fields = qsa(`[name="${CSS.escape(key)}"]`, form);
      if (!fields.length) return;

      if (Array.isArray(val)) {
        fields.forEach(el => {
          if (el.type === 'checkbox' || el.type === 'radio') {
            el.checked = val.some(v => String(v) === String(el.value));
          }
        });
        return;
      }

      fields.forEach(el => {
        const type = (el.type || '').toLowerCase();
        if (type === 'checkbox' || type === 'radio') {
          el.checked = String(el.value) === String(val);
        } else {
          el.value = String(val);
        }
      });
    });

    // Special: if server provided PriceRangesMin/Max, sync sliders and hidden field.
    syncPriceRangeUI();
    toggleOtherFinancing();
    toggleProofUpload();
    toggleOtherQuickly();
    toggleOtherPropertyType();
    toggleOtherWorkType();

    const readiness = qs('#purchaseReadinessSlider', form);
    if (readiness) updateReadinessLabel(readiness.value);
  }

  function showInlineErrors(errors) {
    const form = getForm();
    if (!form || !Array.isArray(errors) || !errors.length) return;

    errors.forEach(err => {
      const param = (err && err.param) ? String(err.param) : '';
      const msg = (err && err.msg) ? String(err.msg) : 'Invalid value';
      if (!param) return;

      const fields = qsa(`[name="${CSS.escape(param)}"]`, form);
      if (!fields.length) return;

      fields.forEach(el => {
        el.classList.add('is-invalid');
        let fb = el.parentElement ? qs('.invalid-feedback', el.parentElement) : null;
        if (!fb) {
          fb = document.createElement('div');
          fb.className = 'invalid-feedback';
          el.insertAdjacentElement('afterend', fb);
        }
        fb.textContent = msg;
      });
    });

    // Navigate to the first section that contains an invalid element.
    const sections = getSections(form);
    const firstBad = sections.find(s => qs('.is-invalid', s));
    if (firstBad) {
      const current = getCurrentSection(form);
      setSectionVisible(current, false);
      setSectionVisible(firstBad, true);
      updateStepUI(form, getStepFromSection(firstBad));
      const firstInvalid = qs('.is-invalid', firstBad);
      if (firstInvalid && firstInvalid.focus) firstInvalid.focus();
    }
  }

  async function handlePageLoad() {
    initFormUI();

    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('errors');
    const successParam = params.get('success');

    // Restore session-saved payload (one-time)
    try {
      const resp = await fetch('/api/cbForm/restore', { credentials: 'same-origin' });
      const payload = await resp.json();
      if (payload && payload.values) applyValues(payload.values);
      if (payload && Array.isArray(payload.errors) && payload.errors.length) {
        showInlineErrors(payload.errors);
        if (window.Swal) {
          const messages = payload.errors.map(e => e.msg || e).filter(Boolean);
          Swal.fire({
            title: 'Please try again',
            text: messages.join('\n'),
            icon: 'error',
            confirmButtonText: 'OK',
          });
        }
      }
    } catch (e) {
      // ignore restore errors
    }

    // Also support inline-injected values (server render)
    try {
      if (window.__formValues) applyValues(window.__formValues);
      if (window.__formErrors && Array.isArray(window.__formErrors) && window.__formErrors.length) {
        showInlineErrors(window.__formErrors);
      }
    } catch (e) { /* ignore */ }

    // Legacy errors query string
    if (errorParam) {
      try {
        const list = JSON.parse(decodeURIComponent(errorParam));
        if (Array.isArray(list) && list.length && window.Swal) {
          Swal.fire({
            title: 'Please try again',
            text: list.join('\n'),
            icon: 'error',
            confirmButtonText: 'OK',
          });
        }
      } catch (e) { /* ignore */ }
    }

    if (successParam && window.Swal) {
      Swal.fire({
        title: 'Thanks for submitting!',
        text: 'We received your Cash Buyer Form. Our team will reach out shortly.',
        icon: 'success',
        confirmButtonText: 'OK',
        confirmButtonColor: '#28a745',
      }).then((result) => {
        if (result.isConfirmed) window.location.href = '/forms/Cash-Buyer';
      });
    }

    // Clear query string once processed (avoid re-alert on refresh)
    try {
      const cleanUrl = window.location.pathname + (window.location.hash || '');
      history.replaceState({}, '', cleanUrl);
    } catch (e) { /* ignore */ }
  }

  window.onload = function () {
    handlePageLoad().catch((e) => console.error('cb.js load error', e));
  };
})();
