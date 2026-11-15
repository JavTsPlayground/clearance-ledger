// Camera and barcode reading. Browser only. Everything it needs is injected.
import { validCode } from '../core/barcode.js';

export class CameraError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CameraError';
    this.code = code;
  }
}

const LIVE_INTERVAL_MS = 140;
const LIVE_MAX_WIDTH = 960;

export function createCamera({ zxing, mediaDevices, doc }) {
  let reader = null;

  function getReader() {
    if (!zxing) throw new CameraError('no_decoder', 'The barcode reader did not load. Reload the app.');
    if (!reader) {
      const hints = new Map();
      hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [zxing.BarcodeFormat.EAN_13, zxing.BarcodeFormat.UPC_A, zxing.BarcodeFormat.EAN_8]);
      hints.set(zxing.DecodeHintType.TRY_HARDER, true);
      reader = new zxing.MultiFormatReader();
      reader.setHints(hints);
    }
    return reader;
  }

  /** Reads one canvas. Returns a checksum-valid code or ''. */
  function decodeCanvas(canvas) {
    try {
      const source = new zxing.HTMLCanvasElementLuminanceSource(canvas);
      const bitmap = new zxing.BinaryBitmap(new zxing.HybridBinarizer(source));
      return validCode(getReader().decode(bitmap).getText());
    } catch (e) {
      if (e instanceof CameraError) throw e;
      return ''; // nothing found in this frame
    }
  }

  function drawTo(canvas, source, w, h, maxSide) {
    const k = Math.min(1, maxSide / Math.max(w, h));
    canvas.width = Math.max(1, Math.round(w * k));
    canvas.height = Math.max(1, Math.round(h * k));
    canvas.getContext('2d', { willReadFrequently: true }).drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  const toBlob = (canvas, type, q) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new CameraError('encode', 'Could not process the photo.'))), type, q));

  function toBase64(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1] || '');
      fr.onerror = () => rej(new CameraError('encode', 'Could not process the photo.'));
      fr.readAsDataURL(blob);
    });
  }

  return {
    /**
     * Takes a photo file. Reads a barcode from the full-size picture, and makes a smaller JPEG
     * (base64) for the vision model. Never throws for "no barcode"; code is just ''.
     */
    async readPhoto(file) {
      let bitmap;
      try { bitmap = await createImageBitmap(file); } catch { throw new CameraError('bad_image', 'That photo could not be opened.'); }
      try {
        const code = decodeCanvas(drawTo(doc.createElement('canvas'), bitmap, bitmap.width, bitmap.height, 1800));
        const small = drawTo(doc.createElement('canvas'), bitmap, bitmap.width, bitmap.height, 1024);
        const b64 = await toBase64(await toBlob(small, 'image/jpeg', 0.85));
        return { code, b64 };
      } finally {
        if (bitmap.close) bitmap.close();
      }
    },

    /**
     * Opens the camera in `video` and calls onCode once with the first valid barcode.
     * Returns a stop() function that always releases the camera. Throws CameraError.
     */
    async startLive(video, onCode) {
      if (!mediaDevices || !mediaDevices.getUserMedia) throw new CameraError('unsupported', 'This browser cannot open the camera here. Use Photo instead.');
      getReader();
      let stream;
      try {
        stream = await mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (e) {
        const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        throw new CameraError(denied ? 'denied' : 'unavailable',
          denied ? 'Camera access is off. Allow it in Settings, or use Photo instead.' : 'No camera was found. Use Photo instead.');
      }
      video.srcObject = stream;
      video.setAttribute('playsinline', '');
      video.muted = true;
      try { await video.play(); } catch { /* shows a still frame at worst */ }

      const canvas = doc.createElement('canvas');
      let stopped = false, timer = 0;
      const stop = () => {
        stopped = true;
        clearTimeout(timer);
        stream.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      };
      const tick = () => {
        if (stopped) return;
        if (video.videoWidth > 0) {
          const code = decodeCanvas(drawTo(canvas, video, video.videoWidth, video.videoHeight, LIVE_MAX_WIDTH));
          if (code) { stop(); onCode(code); return; }
        }
        timer = setTimeout(tick, LIVE_INTERVAL_MS);
      };
      tick();
      return stop;
    },
  };
}
