'use strict';
(() => {
  const checkbox = document.getElementById('consent');
  const button = document.getElementById('continue');
  const status = document.getElementById('consent-status');
  // Verified public Ver1.1.0 Release destination.
  const destination = new URL('https://github.com/rx7nana/MGS_MascotPlayer/releases/tag/v1.1.0');
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
