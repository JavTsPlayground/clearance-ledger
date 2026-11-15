// Full-screen barcode scanner. Always cancellable (button or Escape) and always releases the camera.
import { h, replace } from './dom.js';

export function openScanner({ layer, camera, onCode, onPhoto, onClose }) {
  let stopCamera = null, closed = false;

  const video = h('video', { playsinline: '', muted: true, 'aria-label': 'Camera view' });
  const msg = h('p', { class: 'msg', role: 'status' }, 'Starting the camera...');
  const photoBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => { close(); onPhoto(); } }, 'Photo instead');
  const cancelBtn = h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel');

  function onKey(e) { if (e.key === 'Escape') close(); }

  function close() {
    if (closed) return;
    closed = true;
    if (stopCamera) stopCamera();
    document.removeEventListener('keydown', onKey);
    layer.hidden = true;
    replace(layer);
    onClose();
  }

  replace(layer,
    h('div', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Scan a barcode', class: 'contents' },
      video,
      h('div', { class: 'guide', 'aria-hidden': 'true' }),
      h('div', { class: 'bar' }, msg, h('div', { class: 'row' }, cancelBtn, photoBtn))));
  layer.hidden = false;
  document.addEventListener('keydown', onKey);
  cancelBtn.focus();

  camera.startLive(video, (code) => { if (!closed) { close(); onCode(code); } })
    .then((stop) => {
      if (closed) { stop(); return; }
      stopCamera = stop;
      msg.textContent = 'Line the barcode up inside the box.';
    })
    .catch((e) => {
      msg.textContent = e && e.message ? e.message : 'The camera could not start.';
      msg.classList.add('err');
    });

  return close;
}
