'use strict';
(() => {
  const checkbox = document.getElementById('consent');
  const button = document.getElementById('continue');
  const status = document.getElementById('consent-status');
  // Release is not public yet. Set only its verified final URL after approval.
  const destination = null;
  function resetConsent() {
    checkbox.checked = false;
    button.disabled = true;
    status.textContent = '同意にチェックすると、案内ボタンを操作できます。';
  }
  checkbox.addEventListener('change', () => {
    button.disabled = !checkbox.checked;
    status.textContent = checkbox.checked
      ? '同意が選択されました。案内ボタンを操作できます。'
      : '同意にチェックすると、案内ボタンを操作できます。';
  });
  button.addEventListener('click', () => {
    if (!checkbox.checked || button.disabled) return;
    if (!destination) {
      status.textContent = 'Ver1.1.0の配布先は準備中です。公開の案内をお待ちください。';
      return;
    }
    window.location.assign(destination.href);
  });
  window.addEventListener('pageshow', resetConsent);
  resetConsent();
})();
