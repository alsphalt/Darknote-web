// Copy-to-clipboard helper.
// - Uses the async Clipboard API when available (secure contexts).
// - Falls back to the legacy hidden-textarea + execCommand approach.
// - Returns true ONLY after a confirmed successful copy.

export async function copyText(text) {
  if (typeof navigator === 'undefined') return false;
  try {
    if (navigator.clipboard && window.isSecureContext !== false) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    area.style.top = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
