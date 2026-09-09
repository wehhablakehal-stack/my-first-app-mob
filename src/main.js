// ---------- Counter ----------
export function setupCounter(element) {
  let counter = 0;
  const mirror = document.getElementById('counter-mirror');

  const adjustCounterValue = value => {
    if (value >= 100) return value - 100;
    if (value <= -100) return value + 100;
    return value;
  };

  const setCounter = value => {
    counter = adjustCounterValue(value);
    element.textContent = `${counter}`;
    if (mirror) mirror.textContent = `${counter}`;
  };

  document.getElementById('increaseByOne').addEventListener('click', () => setCounter(counter + 1));
  document.getElementById('decreaseByOne').addEventListener('click', () => setCounter(counter - 1));
  document.getElementById('increaseByTwo').addEventListener('click', () => setCounter(counter + 2));
  document.getElementById('decreaseByTwo').addEventListener('click', () => setCounter(counter - 2));

  setCounter(0);
}

setupCounter(document.getElementById('counter-value'));

// Shared hooks so navigation can start/stop the live camera feed
const cameraControls = {};

// Shared hook so the lock screen can open an app straight from its shortcuts
const navControls = {};

// Shared flag: while the home screen is in edit mode, taps must not open apps
const editState = { editing: false };

// ---------- App navigation (widgets open real pages) ----------
function setupNavigation() {
  const screen = document.querySelector('.screen');

  const openApp = name => {
    const view = document.getElementById(`app-${name}`);
    if (!view) return;
    view.classList.add('open');
    if (screen) screen.classList.add('app-open'); // hides the dock
    if (name === 'camera' && cameraControls.start) cameraControls.start();
    // tint the back button with the app's accent color
    const accent = view.dataset.accent;
    if (accent) {
      const back = view.querySelector('.back');
      if (back) back.style.color = accent;
    }
  };

  const closeAll = () => {
    document.querySelectorAll('.app-view.open').forEach(v => v.classList.remove('open'));
    if (screen) screen.classList.remove('app-open'); // brings the dock back
    if (cameraControls.stop) cameraControls.stop(); // release the webcam
  };

  navControls.open = openApp;

  // Widgets open their app (unless the home screen is in edit mode)
  document.querySelectorAll('[data-app]').forEach(el => {
    el.addEventListener('click', () => {
      if (editState.editing) return;
      openApp(el.dataset.app);
    });
  });

  // Back buttons + home indicator return to the home screen
  document.querySelectorAll('[data-back]').forEach(btn => btn.addEventListener('click', closeAll));
  const homeBtn = document.getElementById('homeBtn');
  if (homeBtn) homeBtn.addEventListener('click', closeAll);

  // Escape key closes the current app
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
}

setupNavigation();

// ---------- Photos + Camera ----------
function setupPhotos() {
  const shutter = document.querySelector('.shutter');
  const grid = document.querySelector('.ph-grid');
  const mini = document.querySelector('.ph-mini');
  const thumb = document.querySelector('.cam-thumb');
  const view = document.querySelector('.cam-view');
  const countEl = document.querySelector('.ph-count');
  const screen = document.querySelector('.screen');
  if (!grid) return;

  const gradients = [
    'linear-gradient(135deg,#ff9a3d,#ff5f6d)',
    'linear-gradient(135deg,#43cea2,#185a9d)',
    'linear-gradient(135deg,#c471f5,#fa71cd)',
    'linear-gradient(135deg,#0a84ff,#00c2ff)',
    'linear-gradient(135deg,#f6d365,#fda085)',
    'linear-gradient(135deg,#30d158,#0ac8fa)',
    'linear-gradient(135deg,#7b2dff,#0a84ff)',
    'linear-gradient(135deg,#ff2d55,#7b2dff)',
    'linear-gradient(135deg,#2b8cff,#7ec8ff)',
  ];
  const DEFAULT_MINI = gradients.slice(0, 6);

  const BASE_COUNT = 0; // gallery count reflects real photos only
  const STORAGE_KEY = 'ios-dashboard-photos';

  let seq = 0;
  const uid = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

  // load saved photos (newest first); returns null on first run (no key yet) so we can seed.
  // migrates the old string-only format to {id, g}.
  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return null; // first run — nothing stored yet
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved)) return [];
      return saved
        .map(x => (typeof x === 'string' ? { id: uid(), g: x } : x))
        .filter(p => p && typeof p.g === 'string');
    } catch {
      return null; // storage blocked — treat as first run (session-only starters)
    }
  };
  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
    } catch {
      // likely over quota (real webcam images are large) — keep only the newest 20 on disk
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(photos.slice(0, 20)));
      } catch {
        /* storage unavailable (private mode, blocked) — session-only */
      }
    }
  };

  let photos = load() || [];
  // one-time cleanup: drop non-camera color placeholders, keep only real captures
  try {
    if (!localStorage.getItem('ios-photos-purged')) {
      photos = photos.filter(p => /^url\(/i.test(String(p.g).trim()));
      localStorage.setItem('ios-photos-purged', '1');
      save();
    }
  } catch { /* storage blocked */ }

  // IndexedDB store for recorded video blobs (too big for localStorage)
  const photoDB = (() => {
    const DB = 'ios-dashboard-media';
    const STORE = 'videos';
    const open = () => new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    }));
    return {
      set: (k, v) => run('readwrite', s => s.put(v, k)).catch(() => {}),
      get: k => run('readonly', s => s.get(k)).catch(() => null),
      del: k => run('readwrite', s => s.delete(k)).catch(() => {}),
    };
  })();

  const makeTile = photo => {
    const span = document.createElement('span');
    span.className = 'ph' + (photo.type === 'video' ? ' is-video' : '');
    span.style.backgroundImage = photo.g; // backgroundImage keeps CSS `background-size: cover`
    span.dataset.id = photo.id;
    return span;
  };

  const updateCount = () => {
    if (countEl) countEl.textContent = `${BASE_COUNT + photos.length} Photos · 6 Albums`;
  };
  const refreshThumb = () => {
    if (thumb) thumb.style.backgroundImage = photos.length ? photos[0].g : '';
  };
  const renderMini = () => {
    if (!mini) return;
    mini.innerHTML = '';
    const source = photos.length ? photos.slice(0, 6) : DEFAULT_MINI.map(g => ({ g }));
    source.forEach(p => {
      const span = document.createElement('span');
      span.className = 'ph' + (p.type === 'video' ? ' is-video' : '');
      span.style.backgroundImage = p.g;
      mini.appendChild(span);
    });
  };

  // restore saved photos into the grid (oldest first so newest ends on top)
  [...photos].reverse().forEach(p => grid.prepend(makeTile(p)));
  renderMini();
  refreshThumb();
  updateCount();

  // ----- Recently Deleted (recoverable, like iOS) -----
  const DELETED_KEY = 'ios-dashboard-photos-deleted';
  let deleted = [];
  try {
    const d = JSON.parse(localStorage.getItem(DELETED_KEY));
    if (Array.isArray(d)) deleted = d.filter(p => p && typeof p.g === 'string');
  } catch { /* none */ }
  const saveDeleted = () => {
    try { localStorage.setItem(DELETED_KEY, JSON.stringify(deleted)); } catch { /* blocked */ }
  };

  const recentBtn = document.querySelector('.ph-recent');
  const recentN = document.querySelector('.ph-recent-n');
  const deletedGrid = document.querySelector('.ph-deleted');

  const restore = id => {
    const idx = deleted.findIndex(p => p.id === id);
    if (idx < 0) return;
    const [p] = deleted.splice(idx, 1);
    saveDeleted();
    photos.unshift(p);
    save();
    grid.prepend(makeTile(p));
    renderMini();
    refreshThumb();
    updateCount();
    renderDeleted();
  };

  function renderDeleted() {
    if (recentN) recentN.textContent = deleted.length;
    if (recentBtn) recentBtn.style.display = deleted.length ? '' : 'none';
    if (!deletedGrid) return;
    if (!deleted.length) deletedGrid.classList.remove('show');
    deletedGrid.innerHTML = '';
    deleted.forEach(p => {
      const span = document.createElement('span');
      span.className = 'ph' + (p.type === 'video' ? ' is-video' : '');
      span.style.backgroundImage = p.g;
      span.title = 'Tap to restore';
      span.addEventListener('click', () => restore(p.id));
      deletedGrid.appendChild(span);
    });
  }
  if (recentBtn) recentBtn.addEventListener('click', () => deletedGrid.classList.toggle('show'));
  renderDeleted();

  const deleteTile = tile => {
    const id = tile.dataset.id;
    if (id) {
      const p = photos.find(x => x.id === id);
      if (p) { deleted.unshift(p); saveDeleted(); } // move to Recently Deleted (keep video blob for restore)
      photos = photos.filter(x => x.id !== id);
      save();
      renderDeleted();
    }
    tile.remove();
    renderMini();
    refreshThumb();
    updateCount();
  };

  // ----- Action sheet (Show / Delete) -----
  const openSheet = tile => {
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.innerHTML =
      '<div class="action-sheet">' +
      '<div class="sheet-group">' +
      '<button class="sheet-btn show">Show</button>' +
      '<button class="sheet-btn delete">Delete Photo</button>' +
      '</div>' +
      '<button class="sheet-btn cancel">Cancel</button>' +
      '</div>';
    screen.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('open'));

    const close = () => {
      backdrop.classList.remove('open');
      setTimeout(() => backdrop.remove(), 260);
    };
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    backdrop.querySelector('.cancel').addEventListener('click', close);
    backdrop.querySelector('.show').addEventListener('click', () => {
      close();
      const idx = photos.findIndex(p => p.id === tile.dataset.id);
      openViewer(idx >= 0 ? idx : 0);
    });
    backdrop.querySelector('.delete').addEventListener('click', () => { close(); deleteTile(tile); });
  };

  // ----- Full-screen viewer (swipe / arrows to move between photos) -----
  const openViewer = startIndex => {
    if (startIndex < 0 || startIndex >= photos.length) return;
    let index = startIndex;

    const viewer = document.createElement('div');
    viewer.className = 'photo-viewer';
    viewer.innerHTML =
      '<span class="pv-counter"></span>' +
      '<button class="pv-nav prev" aria-label="Previous">‹</button>' +
      '<div class="pv-img"></div>' +
      '<video class="pv-video" controls playsinline></video>' +
      '<button class="pv-nav next" aria-label="Next">›</button>' +
      '<p class="pv-hint">Swipe or use arrows · tap outside to close</p>';
    const img = viewer.querySelector('.pv-img');
    const vid = viewer.querySelector('.pv-video');
    const prev = viewer.querySelector('.prev');
    const next = viewer.querySelector('.next');
    const counter = viewer.querySelector('.pv-counter');
    screen.appendChild(viewer);
    requestAnimationFrame(() => viewer.classList.add('open'));

    let videoUrl = null;
    const clearVideo = () => {
      vid.pause();
      vid.removeAttribute('src');
      vid.load?.();
      if (videoUrl) { URL.revokeObjectURL(videoUrl); videoUrl = null; }
    };

    const render = () => {
      const p = photos[index];
      counter.textContent = `${index + 1} / ${photos.length}`;
      prev.classList.toggle('hidden', index <= 0);
      next.classList.toggle('hidden', index >= photos.length - 1);
      clearVideo();
      if (p.type === 'video') {
        img.style.display = 'none';
        vid.style.display = 'block';
        photoDB.get(p.id).then(blob => {
          if (!blob || photos[index] !== p) return; // moved on
          videoUrl = URL.createObjectURL(blob);
          vid.src = videoUrl;
          vid.play?.().catch(() => {});
        });
      } else {
        vid.style.display = 'none';
        img.style.display = '';
        img.style.backgroundImage = p.g;
      }
    };
    const go = delta => {
      const ni = index + delta;
      if (ni < 0 || ni >= photos.length) return;
      index = ni;
      img.style.animation = 'none';
      void img.offsetWidth; // restart the slide animation
      img.style.animation = `${delta > 0 ? 'pvInRight' : 'pvInLeft'} 0.28s ease`;
      render();
    };
    render();

    const close = () => {
      document.removeEventListener('keydown', onKey, true);
      clearVideo();
      viewer.classList.remove('open');
      setTimeout(() => viewer.remove(), 260);
    };

    // keyboard: arrows navigate, Escape closes (capture phase so it beats the global app-close)
    const onKey = e => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'Escape') close();
      else return;
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);

    prev.addEventListener('click', e => { e.stopPropagation(); go(-1); });
    next.addEventListener('click', e => { e.stopPropagation(); go(1); });

    // swipe / drag on the photo: move if dragged, close if it was just a tap
    let startX = null;
    const onStart = x => { startX = x; };
    const onEnd = x => {
      if (startX === null) return;
      const dx = x - startX;
      startX = null;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); // swipe left → next, right → prev
      else close(); // tap
    };
    img.addEventListener('touchstart', e => onStart(e.touches[0].clientX), { passive: true });
    img.addEventListener('touchend', e => onEnd(e.changedTouches[0].clientX));
    img.addEventListener('mousedown', e => onStart(e.clientX));
    img.addEventListener('mouseup', e => onEnd(e.clientX));

    // tapping the dark area around the photo closes
    viewer.addEventListener('click', e => { if (e.target === viewer) close(); });
  };

  // ----- Tap to view, long-press for the Show/Delete menu -----
  let pressTimer = null;
  let suppressClick = false; // set when a long-press fires, so the trailing click is ignored
  const startPress = tile => {
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { suppressClick = true; openSheet(tile); }, 500);
  };
  const cancelPress = () => clearTimeout(pressTimer);

  grid.addEventListener('click', e => {
    const tile = e.target.closest('.ph');
    if (!tile) return;
    if (suppressClick) { suppressClick = false; return; } // came from a long-press
    const idx = photos.findIndex(p => p.id === tile.dataset.id);
    if (idx >= 0) openViewer(idx); // simple tap → full-screen preview
  });

  grid.addEventListener('mousedown', e => {
    const tile = e.target.closest('.ph');
    if (tile) startPress(tile);
  });
  grid.addEventListener('mouseup', cancelPress);
  grid.addEventListener('mouseleave', cancelPress);
  grid.addEventListener('touchstart', e => {
    const tile = e.target.closest('.ph');
    if (tile) startPress(tile);
  }, { passive: true });
  grid.addEventListener('touchend', cancelPress);
  grid.addEventListener('touchmove', cancelPress);
  grid.addEventListener('contextmenu', e => e.preventDefault());

  // ----- Live webcam feed -----
  const video = document.querySelector('.cam-feed');
  const flipBtn = document.querySelector('.cam-flip');
  let stream = null;
  let devices = [];        // available video inputs (populated after permission)
  let deviceIndex = 0;     // which camera is active
  let facing = 'user';     // fallback when deviceId switching isn't supported

  const updateFlipVisibility = () => {
    // always visible; greyed out & inert when there's only one camera
    if (flipBtn) flipBtn.classList.toggle('disabled', devices.length <= 1);
  };

  const startCamera = async () => {
    if (stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      if (view) view.classList.add('denied');
      return;
    }
    try {
      const constraints = devices.length
        ? { video: { deviceId: { exact: devices[deviceIndex].deviceId } }, audio: false }
        : { video: { facingMode: facing }, audio: false };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (video) {
        video.srcObject = stream;
        video.play?.().catch(() => {});
      }
      if (view) { view.classList.add('live'); view.classList.remove('denied'); }

      // now that permission is granted, enumerate cameras (labels are populated)
      if (!devices.length && navigator.mediaDevices.enumerateDevices) {
        const all = await navigator.mediaDevices.enumerateDevices();
        devices = all.filter(d => d.kind === 'videoinput');
        const activeId = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
        const idx = devices.findIndex(d => d.deviceId === activeId);
        if (idx >= 0) deviceIndex = idx;
        updateFlipVisibility();
      }
    } catch {
      if (view) view.classList.add('denied'); // permission refused or no camera
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (video) video.srcObject = null;
    if (view) view.classList.remove('live');
  };

  const flipCamera = async () => {
    if (!stream) return; // nothing running / permission not granted
    if (devices.length > 1) {
      deviceIndex = (deviceIndex + 1) % devices.length; // cycle to the next camera
    } else {
      facing = facing === 'user' ? 'environment' : 'user'; // toggle facing on mobile
    }
    stopCamera();
    await startCamera();
  };

  if (flipBtn) {
    flipBtn.classList.add('disabled'); // greyed out until we know there's more than one camera
    flipBtn.addEventListener('click', flipCamera);
  }

  cameraControls.start = startCamera;
  cameraControls.stop = stopCamera;

  // capture the current webcam frame as a JPEG data-URL background.
  // mirror=true matches the selfie preview (photos); mirror=false matches the raw recording (video poster).
  const captureFrame = (mirror = true) => {
    const w = 360;
    const h = Math.round(w * (video.videoHeight / video.videoWidth)) || 480;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    return `url("${canvas.toDataURL('image/jpeg', 0.7)}")`;
  };

  // ----- Post-capture review (shows the shot for 5s) -----
  const reviewEl = document.querySelector('.cam-review');
  let reviewTimer = null;
  const hideReview = () => {
    clearTimeout(reviewTimer);
    if (reviewEl) reviewEl.classList.remove('show');
  };
  const showReview = g => {
    if (!reviewEl) return;
    reviewEl.style.backgroundImage = g;
    reviewEl.classList.add('show');
    clearTimeout(reviewTimer);
    reviewTimer = setTimeout(hideReview, 5000); // auto-dismiss after 5 seconds
  };
  if (reviewEl) reviewEl.addEventListener('click', hideReview); // tap to dismiss early
  // make sure the review is cleared when leaving the camera
  const baseStop = stopCamera;
  cameraControls.stop = () => { hideReview(); baseStop(); };

  // ----- Portrait: capture with a depth-of-field (blurred background) effect -----
  const portraitFrame = () => {
    const w = 360;
    const h = Math.round(w * (video.videoHeight / video.videoWidth)) || 480;
    const src = document.createElement('canvas');
    src.width = w; src.height = h;
    const sctx = src.getContext('2d');
    sctx.translate(w, 0);
    sctx.scale(-1, 1);
    sctx.drawImage(video, 0, 0, w, h);

    // blurred copy, kept only toward the edges via a radial alpha mask
    const blur = document.createElement('canvas');
    blur.width = w; blur.height = h;
    const bctx = blur.getContext('2d');
    bctx.filter = 'blur(7px)';
    bctx.drawImage(src, 0, 0);
    bctx.filter = 'none';
    const grad = bctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.18, w / 2, h / 2, Math.max(w, h) * 0.62);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    bctx.globalCompositeOperation = 'destination-in';
    bctx.fillStyle = grad;
    bctx.fillRect(0, 0, w, h);

    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const octx = out.getContext('2d');
    octx.drawImage(src, 0, 0);   // sharp base
    octx.drawImage(blur, 0, 0);  // blurred edges on top
    return `url("${out.toDataURL('image/jpeg', 0.72)}")`;
  };

  // ----- Modes: photo / portrait / video -----
  const modeEls = document.querySelectorAll('.cam-modes span');
  let mode = 'photo';
  modeEls.forEach(el => el.addEventListener('click', () => {
    if (recorder) return; // don't switch mid-recording
    mode = el.textContent.trim().toLowerCase();
    modeEls.forEach(m => m.classList.toggle('active', m === el));
  }));

  // ----- Video recording (MediaRecorder → IndexedDB blob) -----
  let recorder = null;
  let recChunks = [];
  let recTimer = null;
  let micStream = null;
  const recTimeEl = document.querySelector('.cam-rec-time');
  const stopMic = () => {
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  };
  const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const startRecording = async () => {
    if (!stream || typeof MediaRecorder === 'undefined') {
      if (view) { view.classList.remove('flash'); void view.offsetWidth; view.classList.add('flash'); }
      return; // no camera → nothing to record
    }
    recChunks = [];

    // grab the PC microphone so recordings have sound (fall back to silent video if denied)
    let recStream = stream;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStream = new MediaStream([...stream.getVideoTracks(), ...micStream.getAudioTracks()]);
    } catch { micStream = null; }

    let mime = '';
    if (MediaRecorder.isTypeSupported?.('video/webm;codecs=vp9,opus')) mime = 'video/webm;codecs=vp9,opus';
    else if (MediaRecorder.isTypeSupported?.('video/webm;codecs=vp8,opus')) mime = 'video/webm;codecs=vp8,opus';
    else if (MediaRecorder.isTypeSupported?.('video/webm')) mime = 'video/webm';
    try { recorder = mime ? new MediaRecorder(recStream, { mimeType: mime }) : new MediaRecorder(recStream); }
    catch { recorder = null; stopMic(); return; }

    recorder.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
    recorder.onstop = onRecStop;
    recorder.start();

    const startT = Date.now();
    if (view) view.classList.add('recording');
    shutter.classList.add('recording');
    if (recTimeEl) recTimeEl.textContent = '0:00';
    recTimer = setInterval(() => {
      if (recTimeEl) recTimeEl.textContent = fmtTime((Date.now() - startT) / 1000);
    }, 250);
  };

  const onRecStop = () => {
    clearInterval(recTimer);
    recTimer = null;
    stopMic(); // release the microphone
    if (view) view.classList.remove('recording');
    shutter.classList.remove('recording');
    const type = recorder?.mimeType || 'video/webm';
    const blob = new Blob(recChunks, { type });
    recChunks = [];
    recorder = null;
    if (!blob.size) return;

    const poster = (stream && video && video.videoWidth) ? captureFrame(false) : gradients[0]; // un-mirrored to match the recording
    const photo = { id: uid(), g: poster, type: 'video' };
    photoDB.set(photo.id, blob); // store the video blob
    photos.unshift(photo);
    save();
    grid.prepend(makeTile(photo));
    renderMini();
    refreshThumb();
    updateCount();
    showReview(poster);
  };

  const stopRecording = () => {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  // stop any recording (and release the mic) when leaving the camera
  cameraControls.stop = () => { stopRecording(); stopMic(); hideReview(); baseStop(); };

  // ----- Shutter -----
  if (shutter) {
    shutter.addEventListener('click', () => {
      if (mode === 'video') {
        if (recorder) stopRecording(); else startRecording();
        return;
      }

      let g;
      if (stream && video && video.videoWidth) {
        g = mode === 'portrait' ? portraitFrame() : captureFrame();
      } else {
        g = gradients[Math.floor(Math.random() * gradients.length)]; // fallback color shot
      }
      const photo = { id: uid(), g };

      if (view) {
        view.classList.remove('flash');
        void view.offsetWidth; // restart the animation
        view.classList.add('flash');
      }

      photos.unshift(photo);
      save();
      grid.prepend(makeTile(photo));
      renderMini();
      refreshThumb();
      updateCount();

      showReview(g); // preview the shot for 5 seconds
    });
  }
}

setupPhotos();

// ---------- Home widgets: long-press to edit & drag to reorder ----------
function setupWidgetEditing() {
  const grid = document.querySelector('#home .grid');
  const screen = document.querySelector('.screen');
  if (!grid) return;

  const STORAGE_KEY = 'ios-dashboard-widget-order';

  const saveOrder = () => {
    const order = [...grid.querySelectorAll('.widget')].map(w => w.dataset.app);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    } catch {
      /* storage unavailable */
    }
  };

  const applyOrder = () => {
    try {
      const order = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!Array.isArray(order)) return;
      order.forEach(app => {
        const w = grid.querySelector(`.widget[data-app="${app}"]`);
        if (w) grid.appendChild(w); // re-append in saved order
      });
    } catch {
      /* ignore malformed order */
    }
  };
  applyOrder();

  // "Done" button, shown only while editing
  const doneBtn = document.createElement('button');
  doneBtn.className = 'edit-done';
  doneBtn.textContent = 'Done';
  screen.appendChild(doneBtn);

  let editing = false;
  const enterEdit = () => {
    if (editing) return;
    editing = true;
    editState.editing = true;
    grid.classList.add('editing');
    doneBtn.classList.add('show');
  };
  const exitEdit = () => {
    if (!editing) return;
    editing = false;
    editState.editing = false;
    grid.classList.remove('editing');
    doneBtn.classList.remove('show');
    saveOrder();
  };
  doneBtn.addEventListener('click', exitEdit);

  // ----- Pointer-based drag (works for mouse AND touch) -----
  let drag = null; // the widget currently being dragged

  const onMove = e => {
    if (!drag) return;
    e.preventDefault(); // stop the page from scrolling while dragging
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const target = under && under.closest('.widget');
    if (!target || target === drag || target.parentElement !== grid) return;
    const rect = target.getBoundingClientRect();
    const after = e.clientX - rect.left > rect.width / 2;
    grid.insertBefore(drag, after ? target.nextSibling : target);
  };
  const endDrag = () => {
    if (!drag) return;
    drag.classList.remove('dragging');
    drag = null;
    saveOrder();
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', endDrag);
    document.removeEventListener('pointercancel', endDrag);
  };
  const startDrag = (w, e) => {
    drag = w;
    w.classList.add('dragging');
    try { w.setPointerCapture(e.pointerId); } catch { /* capture unsupported */ }
    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
  };

  // ----- Long-press to enter edit mode / start dragging -----
  let pressTimer = null;
  let downX = 0;
  let downY = 0;
  const clearPress = () => { clearTimeout(pressTimer); pressTimer = null; };

  grid.addEventListener('pointerdown', e => {
    const w = e.target.closest('.widget');
    if (!w) return;
    if (editing) { startDrag(w, e); return; } // already editing → drag immediately
    downX = e.clientX;
    downY = e.clientY;
    pressTimer = setTimeout(enterEdit, 500);
  });
  grid.addEventListener('pointermove', e => {
    if (pressTimer && (Math.abs(e.clientX - downX) > 10 || Math.abs(e.clientY - downY) > 10)) clearPress();
  });
  grid.addEventListener('pointerup', clearPress);
  grid.addEventListener('pointercancel', clearPress);
  grid.addEventListener('pointerleave', clearPress);

  // ----- Exit edit mode -----
  const dashboard = document.getElementById('home');
  dashboard.addEventListener('pointerdown', e => {
    if (editing && !e.target.closest('.widget')) exitEdit(); // tap empty area
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && editing) { e.stopPropagation(); exitEdit(); }
  }, true);
}

setupWidgetEditing();

// ---------- Files: explore a real PC folder (File System Access API) ----------
function setupFiles() {
  const pickBtn = document.querySelector('.fx-pick');
  const list = document.querySelector('.fx-list');
  const pathEl = document.querySelector('.fx-path');
  const upBtn = document.querySelector('.fx-up');
  const msg = document.querySelector('.fx-msg');
  const screen = document.querySelector('.screen');
  if (!pickBtn) return;

  const stack = []; // directory handles; stack[0] = chosen root, last = current folder

  // sorting state (persisted across sessions)
  const SORT_KEY = 'ios-dashboard-files-sort';
  let sortKey = 'name';
  let sortAsc = true;
  try {
    const saved = JSON.parse(localStorage.getItem(SORT_KEY));
    if (saved && ['name', 'size', 'type'].includes(saved.key)) {
      sortKey = saved.key;
      sortAsc = saved.asc !== false;
    }
  } catch { /* no saved preference */ }

  const saveSort = () => {
    try { localStorage.setItem(SORT_KEY, JSON.stringify({ key: sortKey, asc: sortAsc })); } catch { /* storage blocked */ }
  };

  const sortBtns = document.querySelectorAll('.fx-sort button');
  const updateSortUI = () => {
    sortBtns.forEach(b => {
      const active = b.dataset.sort === sortKey;
      b.classList.toggle('active', active);
      b.dataset.arrow = active ? (sortAsc ? '▲' : '▼') : '';
    });
  };
  sortBtns.forEach(b => b.addEventListener('click', () => {
    const key = b.dataset.sort;
    if (key === sortKey) sortAsc = !sortAsc; // toggle direction
    else { sortKey = key; sortAsc = true; }
    saveSort();
    updateSortUI();
    if (stack.length) render();
  }));
  updateSortUI();

  if (!('showDirectoryPicker' in window)) {
    pickBtn.disabled = true;
    msg.textContent = 'Folder browsing needs a Chromium browser (Chrome or Edge) over localhost/HTTPS.';
    return;
  }

  // --- Remember the last folder: root handle in IndexedDB, sub-path in localStorage ---
  const PATH_KEY = 'ios-dashboard-files-path';
  const idb = (() => {
    const DB = 'ios-dashboard';
    const STORE = 'handles';
    const open = () => new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return {
      async get(key) {
        try {
          const db = await open();
          return await new Promise((res, rej) => {
            const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
          });
        } catch { return null; }
      },
      async set(key, val) {
        try {
          const db = await open();
          await new Promise((res, rej) => {
            const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(val, key);
            req.onsuccess = () => res();
            req.onerror = () => rej(req.error);
          });
        } catch { /* IndexedDB blocked */ }
      },
    };
  })();

  const savePath = () => {
    try { localStorage.setItem(PATH_KEY, JSON.stringify(stack.slice(1).map(h => h.name))); } catch { /* blocked */ }
  };

  // "Reopen last folder" button, shown when a saved folder needs a click to re-grant access
  const reopenBtn = document.createElement('button');
  reopenBtn.type = 'button';
  reopenBtn.className = 'fx-reopen';
  reopenBtn.style.display = 'none';
  pickBtn.parentElement.insertBefore(reopenBtn, pickBtn);

  const fmtSize = bytes => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const IMG = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];
  const iconFor = name => {
    const ext = name.split('.').pop().toLowerCase();
    if (IMG.includes(ext)) return '🖼️';
    if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) return '🎬';
    if (['mp3', 'wav', 'flac', 'm4a', 'ogg'].includes(ext)) return '🎵';
    if (ext === 'pdf') return '📕';
    if (['zip', 'rar', '7z', 'gz', 'tar'].includes(ext)) return '🗜️';
    if (['js', 'ts', 'html', 'css', 'json', 'py', 'java', 'c', 'cpp', 'md', 'xml', 'sh'].includes(ext)) return '📃';
    return '📄';
  };

  const VID = ['mp4', 'webm', 'ogv', 'm4v', 'mov'];
  const AUD = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'oga', 'ogg'];

  const previewMedia = async (handle, kind) => {
    try {
      const file = await handle.getFile();
      const url = URL.createObjectURL(file);
      const ov = document.createElement('div');
      ov.className = 'fx-preview';
      let media;
      if (kind === 'video') media = '<video class="fx-media" controls autoplay playsinline></video>';
      else if (kind === 'audio') media = '<div class="fx-audio-art">🎵</div><audio class="fx-media" controls autoplay></audio>';
      else media = '<img class="fx-media" alt="">';
      ov.innerHTML = media + '<p class="fx-pv-name"></p>';
      const el = ov.querySelector('.fx-media');
      el.src = url;
      ov.querySelector('.fx-pv-name').textContent = `${handle.name} · ${fmtSize(file.size)}`;
      screen.appendChild(ov);
      requestAnimationFrame(() => ov.classList.add('open'));
      const close = () => {
        try { el.pause?.(); } catch { /* not a media element */ }
        ov.classList.remove('open');
        setTimeout(() => { ov.remove(); URL.revokeObjectURL(url); }, 260);
      };
      // close only when tapping the dark backdrop, so video/audio controls stay usable
      ov.addEventListener('click', e => { if (e.target === ov || e.target.classList.contains('fx-pv-name')) close(); });
    } catch {
      msg.textContent = 'Cannot open this file.';
    }
  };

  const openFile = handle => {
    const ext = handle.name.split('.').pop().toLowerCase();
    if (IMG.includes(ext)) return previewMedia(handle, 'image');
    if (VID.includes(ext)) return previewMedia(handle, 'video');
    if (AUD.includes(ext)) return previewMedia(handle, 'audio');
    handle.getFile()
      .then(f => { msg.textContent = `${handle.name} · ${fmtSize(f.size)}`; })
      .catch(() => { msg.textContent = handle.name; });
  };

  const renderBreadcrumb = () => {
    pathEl.innerHTML = '';
    if (!stack.length) { pathEl.textContent = 'No folder selected'; return; }
    stack.forEach((h, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'fx-sep';
        sep.textContent = '/';
        pathEl.appendChild(sep);
      }
      const crumb = document.createElement('button');
      crumb.className = 'fx-crumb' + (i === stack.length - 1 ? ' current' : '');
      crumb.textContent = h.name;
      if (i < stack.length - 1) {
        crumb.addEventListener('click', () => { stack.length = i + 1; render(); });
      }
      pathEl.appendChild(crumb);
    });
    // keep the deepest crumb in view
    pathEl.scrollLeft = pathEl.scrollWidth;
  };

  let thumbUrls = []; // object URLs for image thumbnails, revoked on each re-render

  const render = async () => {
    const dir = stack[stack.length - 1];
    renderBreadcrumb();
    savePath();
    upBtn.classList.toggle('hidden', stack.length <= 1);
    thumbUrls.forEach(u => URL.revokeObjectURL(u));
    thumbUrls = [];
    list.innerHTML = '';
    if (!dir) return;

    msg.textContent = 'Loading…';
    const dirs = [];
    const files = [];
    try {
      for await (const [, handle] of dir.entries()) {
        (handle.kind === 'directory' ? dirs : files).push(handle);
      }
    } catch {
      msg.textContent = 'Cannot read this folder (permission denied).';
      return;
    }

    // gather file sizes upfront so we can sort by size
    const fileInfos = await Promise.all(files.map(async h => {
      let size = 0;
      let file = null;
      try { file = await h.getFile(); size = file.size; } catch { /* unreadable */ }
      return { handle: h, name: h.name, size, ext: (h.name.split('.').pop() || '').toLowerCase(), file };
    }));

    const dirMul = sortAsc ? 1 : -1;
    dirs.sort((a, b) => dirMul * a.name.localeCompare(b.name)); // folders always sorted by name
    fileInfos.sort((a, b) => {
      let cmp;
      if (sortKey === 'size') cmp = a.size - b.size;
      else if (sortKey === 'type') cmp = a.ext.localeCompare(b.ext) || a.name.localeCompare(b.name);
      else cmp = a.name.localeCompare(b.name);
      return dirMul * cmp;
    });

    msg.textContent = dirs.length + fileInfos.length ? '' : 'Empty folder';

    for (const h of dirs) {
      const li = document.createElement('li');
      li.className = 'fx-item folder';
      li.innerHTML = '<span class="fx-icon">📁</span><span class="fx-name"></span><span class="fx-chev">›</span>';
      li.querySelector('.fx-name').textContent = h.name;
      li.addEventListener('click', () => { stack.push(h); render(); });
      list.appendChild(li);
    }
    for (const info of fileInfos) {
      const li = document.createElement('li');
      li.className = 'fx-item file';
      li.innerHTML = `<span class="fx-icon">${iconFor(info.name)}</span><span class="fx-name"></span><span class="fx-size">${fmtSize(info.size)}</span>`;
      li.querySelector('.fx-name').textContent = info.name;
      li.addEventListener('click', () => openFile(info.handle));
      list.appendChild(li);

      // show a real thumbnail for image files
      if (IMG.includes(info.ext) && info.ext !== 'svg' && info.file) {
        const url = URL.createObjectURL(info.file);
        thumbUrls.push(url);
        const iconEl = li.querySelector('.fx-icon');
        iconEl.textContent = '';
        const img = document.createElement('img');
        img.className = 'fx-thumb';
        img.alt = '';
        img.loading = 'lazy';
        img.src = url;
        iconEl.appendChild(img);
      }
    }
  };

  pickBtn.addEventListener('click', async () => {
    try {
      const handle = await window.showDirectoryPicker();
      idb.set('lastFolder', handle); // remember this root for next time
      reopenBtn.style.display = 'none';
      stack.length = 0;
      stack.push(handle);
      render();
    } catch {
      /* user cancelled the picker */
    }
  });

  upBtn.addEventListener('click', () => {
    if (stack.length > 1) { stack.pop(); render(); }
  });

  // Re-open a saved root, then walk back down the saved sub-path
  const openSaved = async root => {
    const opts = { mode: 'read' };
    let perm = await root.queryPermission(opts);
    if (perm !== 'granted') perm = await root.requestPermission(opts); // needs a user gesture
    if (perm !== 'granted') { msg.textContent = 'Permission to reopen was denied.'; return; }

    reopenBtn.style.display = 'none';
    stack.length = 0;
    stack.push(root);
    let names = [];
    try { names = JSON.parse(localStorage.getItem(PATH_KEY)) || []; } catch { /* none */ }
    let dir = root;
    for (const name of names) {
      try { dir = await dir.getDirectoryHandle(name); stack.push(dir); } catch { break; } // folder moved/removed
    }
    render();
  };

  // On load: if a folder was saved, offer to reopen it (or restore silently if still permitted)
  (async () => {
    const root = await idb.get('lastFolder');
    if (!root) return;
    reopenBtn.textContent = `↻ Reopen “${root.name}”`;
    reopenBtn.style.display = 'block';
    reopenBtn.onclick = () => openSaved(root);
    try {
      if ((await root.queryPermission({ mode: 'read' })) === 'granted') openSaved(root);
    } catch { /* will need the button */ }
  })();
}

setupFiles();

// ---------- Live status-bar clock + greeting date ----------
const pad = n => String(n).padStart(2, '0');
function updateClock() {
  const now = new Date();
  const clock = document.getElementById('clock');
  const today = document.getElementById('today');
  let use24 = false;
  try { use24 = localStorage.getItem('ios-dashboard-clock24') === '1'; } catch { /* ignore */ }
  const h = use24 ? now.getHours() : (now.getHours() % 12 || 12);
  if (clock) clock.textContent = `${h}:${pad(now.getMinutes())}`;
  if (today) today.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // lock screen: big padded clock + French date, like the design
  const lockTime = document.getElementById('lockTime');
  const lockDate = document.getElementById('lockDate');
  if (lockTime) lockTime.textContent = `${use24 ? pad(now.getHours()) : h}:${pad(now.getMinutes())}`;
  if (lockDate) {
    const d = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    lockDate.textContent = d.charAt(0).toUpperCase() + d.slice(1);
  }
}
updateClock();
setInterval(updateClock, 10000);

// ---------- Settings app (wallpaper, clock, resets) ----------
function setupSettings() {
  const screen = document.querySelector('.screen');
  const wpWrap = document.querySelector('.set-wallpapers');
  if (!screen) return;

  // theme is read first so the wallpaper can respect it on load
  const THEME_KEY = 'ios-dashboard-theme';
  const LIGHT_WP = 'linear-gradient(170deg,#eaf1ff 0%, #f7f3ee 55%, #ffe9ec 100%)';
  let lightMode = false;
  try { lightMode = localStorage.getItem(THEME_KEY) === 'light'; } catch { /* ignore */ }
  screen.classList.toggle('light', lightMode);

  const WP_KEY = 'ios-dashboard-wallpaper';
  const WALLPAPERS = [
    'radial-gradient(140% 80% at 20% 0%, #4b3d7a 0%, transparent 55%), radial-gradient(120% 90% at 90% 20%, #7a3d6a 0%, transparent 50%), radial-gradient(120% 100% at 50% 100%, #16324f 0%, transparent 60%), linear-gradient(180deg, #191427 0%, #0b0910 100%)',
    'linear-gradient(160deg,#ff6a3d,#c9184a,#3d1e6d)',
    'linear-gradient(160deg,#0a84ff,#5e5ce6,#0b0910)',
    'linear-gradient(160deg,#134e5e,#71b280,#0b0910)',
    'linear-gradient(160deg,#f6d365,#fda085,#3d1e6d)',
    'linear-gradient(160deg,#232526,#414345)',
  ];

  const readWp = () => {
    let i = 0;
    try { i = parseInt(localStorage.getItem(WP_KEY), 10) || 0; } catch { /* ignore */ }
    return i >= 0 && i < WALLPAPERS.length ? i : 0;
  };
  let current = readWp();
  // in light mode a light wallpaper is forced; the chosen one is kept for dark mode
  const applyWallpaper = () => { screen.style.background = lightMode ? LIGHT_WP : WALLPAPERS[current]; };

  // build swatches
  if (wpWrap) {
    WALLPAPERS.forEach((bg, i) => {
      const b = document.createElement('button');
      b.className = 'wp' + (i === current ? ' active' : '');
      b.style.background = bg;
      b.addEventListener('click', () => {
        current = i;
        applyWallpaper();
        try { localStorage.setItem(WP_KEY, String(i)); } catch { /* ignore */ }
        wpWrap.querySelectorAll('.wp').forEach((el, j) => el.classList.toggle('active', j === i));
      });
      wpWrap.appendChild(b);
    });
  }
  applyWallpaper(); // apply saved wallpaper (or forced light one) on load

  // light-appearance switch
  const themeSwitch = document.querySelector('.switch[data-setting="theme-light"]');
  if (themeSwitch) {
    themeSwitch.classList.toggle('on', lightMode);
    themeSwitch.addEventListener('click', () => {
      lightMode = !lightMode;
      themeSwitch.classList.toggle('on', lightMode);
      screen.classList.toggle('light', lightMode);
      try { localStorage.setItem(THEME_KEY, lightMode ? 'light' : 'dark'); } catch { /* ignore */ }
      applyWallpaper(); // force a light wallpaper in light mode, restore the chosen one in dark
    });
  }

  // 24-hour switch
  const clockSwitch = document.querySelector('.switch[data-setting="clock24"]');
  if (clockSwitch) {
    let on = false;
    try { on = localStorage.getItem('ios-dashboard-clock24') === '1'; } catch { /* ignore */ }
    clockSwitch.classList.toggle('on', on);
    clockSwitch.addEventListener('click', () => {
      on = !on;
      clockSwitch.classList.toggle('on', on);
      try { localStorage.setItem('ios-dashboard-clock24', on ? '1' : '0'); } catch { /* ignore */ }
      updateClock(); // reflect immediately
    });
  }

  // iOS-style confirmation sheet
  const confirmSheet = (message, confirmLabel, onConfirm) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.innerHTML =
      '<div class="action-sheet">' +
      '<div class="sheet-group">' +
      `<p class="sheet-title">${message}</p>` +
      `<button class="sheet-btn delete confirm">${confirmLabel}</button>` +
      '</div>' +
      '<button class="sheet-btn cancel">Cancel</button>' +
      '</div>';
    screen.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('open'));
    const close = () => { backdrop.classList.remove('open'); setTimeout(() => backdrop.remove(), 260); };
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    backdrop.querySelector('.cancel').addEventListener('click', close);
    backdrop.querySelector('.confirm').addEventListener('click', () => { close(); onConfirm(); });
  };

  // action rows
  document.querySelectorAll('.set-row.action').forEach(row => {
    row.addEventListener('click', () => {
      const action = row.dataset.action;
      if (action === 'reset-widgets') {
        try { localStorage.removeItem('ios-dashboard-widget-order'); } catch { /* ignore */ }
        location.reload();
      } else if (action === 'clear-photos') {
        confirmSheet('This will permanently delete all photos and videos, including Recently Deleted. This can’t be undone.', 'Delete All', () => {
          try {
            localStorage.removeItem('ios-dashboard-photos');
            localStorage.removeItem('ios-dashboard-photos-deleted');
            localStorage.removeItem('ios-photos-purged');
            indexedDB.deleteDatabase('ios-dashboard-media'); // recorded videos
          } catch { /* ignore */ }
          location.reload();
        });
      }
    });
  });
}

setupSettings();

// ---------- Music: build a playlist from local files and play it ----------
function setupMusic() {
  const listEl = document.getElementById('npList');
  const addBtn = document.getElementById('npAdd');
  const fileInput = document.getElementById('npFile');
  const titleEl = document.getElementById('npTitle');
  const artistEl = document.getElementById('npArtist');
  const playBtn = document.getElementById('npPlay');
  const prevBtn = document.getElementById('npPrev');
  const nextBtn = document.getElementById('npNext');
  const progress = document.getElementById('npProgress');
  const fill = document.getElementById('npFill');
  const curEl = document.getElementById('npCur');
  const durEl = document.getElementById('npDur');
  if (!listEl) return;

  const artEl = document.getElementById('npArt');
  // mirror the current track onto the home widget
  const wTitle = document.querySelector('.widget.music .track-name');
  const wArtist = document.querySelector('.widget.music .w-sub');
  const wArt = document.querySelector('.widget.music .art');

  const META_KEY = 'ios-dashboard-playlist';
  const LAST_KEY = 'ios-dashboard-last-track';
  const musicDB = (() => {
    const DB = 'ios-dashboard-music';
    const STORE = 'tracks';
    const open = () => new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
      const rq = fn(db.transaction(STORE, mode).objectStore(STORE));
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    }));
    return {
      set: (k, v) => run('readwrite', s => s.put(v, k)).catch(() => {}),
      get: k => run('readonly', s => s.get(k)).catch(() => null),
      del: k => run('readwrite', s => s.delete(k)).catch(() => {}),
    };
  })();

  let seq = 0;
  const uid = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

  const fileCache = {}; // id -> original File, for direct (most reliable) playback this session
  let tracks = [];
  try {
    const t = JSON.parse(localStorage.getItem(META_KEY));
    if (Array.isArray(t)) tracks = t.filter(x => x && x.id && x.name);
  } catch { /* none */ }
  const saveMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify(tracks)); } catch { /* blocked */ } };

  let currentIndex = -1;
  let coverUrl = null;
  let volume = 1;
  try { const v = parseFloat(localStorage.getItem('ios-dashboard-volume')); if (v >= 0 && v <= 1) volume = v; } catch { /* default */ }
  const fmt = s => (isFinite(s) && s >= 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

  const trackTitle = t => t.title || t.name.replace(/\.[^.]+$/, '');
  const trackArtist = t => t.artist || 'Local file';

  // ----- Minimal ID3v2.3/2.4 tag reader (title, artist, cover) -----
  const latin1 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return s; };
  const readTextFrame = bytes => {
    const enc = bytes[0];
    const body = bytes.subarray(1);
    let text;
    if (enc === 3) text = new TextDecoder('utf-8').decode(body);
    else if (enc === 1) text = new TextDecoder('utf-16').decode(body);
    else if (enc === 2) text = new TextDecoder('utf-16be').decode(body);
    else text = latin1(body);
    return text.replace(/\0+$/, '');
  };
  const readAPIC = frame => {
    let p = 1; // skip encoding
    let m = p;
    while (m < frame.length && frame[m] !== 0) m++;
    const mime = latin1(frame.subarray(p, m)) || 'image/jpeg';
    p = m + 1;
    p += 1; // picture type
    const enc = frame[0];
    if (enc === 1 || enc === 2) { while (p + 1 < frame.length && !(frame[p] === 0 && frame[p + 1] === 0)) p += 2; p += 2; }
    else { while (p < frame.length && frame[p] !== 0) p++; p += 1; }
    return new Blob([frame.subarray(p)], { type: mime });
  };
  const parseID3 = async file => {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (latin1(head.subarray(0, 3)) !== 'ID3') return {};
    const version = head[3];
    if (version !== 3 && version !== 4) return {}; // only v2.3 / v2.4
    const size = (head[6] & 0x7f) << 21 | (head[7] & 0x7f) << 14 | (head[8] & 0x7f) << 7 | (head[9] & 0x7f);
    const data = new Uint8Array(await file.slice(10, 10 + size).arrayBuffer());
    const out = {};
    let o = 0;
    while (o + 10 <= data.length) {
      const id = latin1(data.subarray(o, o + 4));
      if (!/^[A-Z0-9]{4}$/.test(id)) break; // padding / end
      const fs = version === 4
        ? (data[o + 4] & 0x7f) << 21 | (data[o + 5] & 0x7f) << 14 | (data[o + 6] & 0x7f) << 7 | (data[o + 7] & 0x7f)
        : (data[o + 4] << 24 | data[o + 5] << 16 | data[o + 6] << 8 | data[o + 7]) >>> 0;
      if (fs <= 0 || o + 10 + fs > data.length) break;
      const frame = data.subarray(o + 10, o + 10 + fs);
      if (id === 'TIT2') out.title = readTextFrame(frame);
      else if (id === 'TPE1') out.artist = readTextFrame(frame);
      else if (id === 'APIC' && !out.cover) out.cover = readAPIC(frame);
      o += 10 + fs;
    }
    return out;
  };

  const setCover = bg => {
    if (artEl) artEl.style.backgroundImage = bg;
    if (wArt) wArt.style.backgroundImage = bg;
  };

  const updateNowPlaying = () => {
    const t = tracks[currentIndex];
    if (titleEl) titleEl.textContent = t ? trackTitle(t) : 'لا يوجد مقطع';
    if (artistEl) artistEl.textContent = t ? trackArtist(t) : 'أضف ملفات صوتية من جهازك';
    if (wTitle) wTitle.textContent = t ? trackTitle(t) : 'صوت الحق';
    if (wArtist) wArtist.textContent = t ? trackArtist(t) : 'Tap to open';
  };

  const renderList = () => {
    listEl.innerHTML = '';
    tracks.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'np-track' + (i === currentIndex ? ' playing' : '');
      li.innerHTML = '<span class="np-tnum">' + (i + 1) + '</span><span class="np-tinfo"><span class="np-tname"></span><span class="np-tart"></span></span><span class="np-tdel">✕</span>';
      li.querySelector('.np-tname').textContent = trackTitle(t);
      li.querySelector('.np-tart').textContent = trackArtist(t);
      const go = () => play(i);
      li.querySelector('.np-tname').addEventListener('click', go);
      li.querySelector('.np-tnum').addEventListener('click', go);
      li.querySelector('.np-tdel').addEventListener('click', e => { e.stopPropagation(); removeTrack(i); });
      listEl.appendChild(li);
    });
  };

  // ---- Web Audio decoder/player: reads the bytes, decodes MP3→PCM, plays via the audio graph ----
  let audioCtx = null;
  let selectedSink = '';
  const ensureCtx = () => {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (selectedSink && audioCtx.setSinkId) audioCtx.setSinkId(selectedSink).catch(() => {});
    }
    return audioCtx;
  };
  let buffer = null;    // decoded AudioBuffer of the current track
  let sourceNode = null;
  let gainNode = null;
  let startedAt = 0;    // ctx time when the current source started
  let offset = 0;       // seconds into the track at that start
  let playing = false;
  let rafId = 0;
  let stopping = false; // suppress onended during an intentional stop
  let loadToken = 0;    // guards against out-of-order async decodes

  const setPlayIcon = () => { if (playBtn) playBtn.textContent = playing ? '⏸' : '▶'; };
  const positionSec = () => {
    if (!buffer) return 0;
    if (!playing) return offset;
    return Math.min(buffer.duration, offset + (ensureCtx().currentTime - startedAt));
  };
  const saveLast = () => {
    try {
      if (currentIndex >= 0 && tracks[currentIndex]) {
        localStorage.setItem(LAST_KEY, JSON.stringify({ id: tracks[currentIndex].id, offset: positionSec() }));
      } else {
        localStorage.removeItem(LAST_KEY);
      }
    } catch { /* blocked */ }
  };
  const tick = () => {
    cancelAnimationFrame(rafId);
    const loop = () => {
      const pos = positionSec();
      if (fill && buffer) fill.style.width = `${(pos / buffer.duration) * 100}%`;
      if (curEl) curEl.textContent = fmt(pos);
      if (playing) rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  };
  const stopSource = () => {
    if (sourceNode) {
      stopping = true;
      try { sourceNode.onended = null; sourceNode.stop(); } catch { /* already stopped */ }
      try { sourceNode.disconnect(); } catch { /* ignore */ }
      sourceNode = null;
      stopping = false;
    }
  };
  const startAt = sec => {
    const ctx = ensureCtx();
    stopSource();
    sourceNode = ctx.createBufferSource();
    sourceNode.buffer = buffer;
    if (!gainNode) { gainNode = ctx.createGain(); gainNode.gain.value = volume; gainNode.connect(ctx.destination); }
    sourceNode.connect(gainNode);
    sourceNode.onended = () => { if (!stopping) onEnded(); };
    offset = Math.max(0, Math.min(sec, buffer.duration));
    startedAt = ctx.currentTime;
    sourceNode.start(0, offset);
    playing = true;
    setPlayIcon();
    tick();
    saveLast();
  };
  const onEnded = () => {
    playing = false;
    setPlayIcon();
    if (tracks.length) play((currentIndex + 1) % tracks.length);
  };
  const loadCover = async i => {
    if (coverUrl) { URL.revokeObjectURL(coverUrl); coverUrl = null; }
    setCover('');
    if (tracks[i] && tracks[i].hasCover) {
      const cover = await musicDB.get(tracks[i].id + ':cover');
      if (cover && currentIndex === i) {
        coverUrl = URL.createObjectURL(cover);
        setCover(`url("${coverUrl}")`);
      }
    }
  };

  // decode a track and show it in Now Playing WITHOUT starting playback (used to restore last track)
  const prepare = async (i, startOffset = 0) => {
    if (i < 0 || i >= tracks.length) return;
    const blob = fileCache[tracks[i].id] || await musicDB.get(tracks[i].id);
    if (!blob) return;
    currentIndex = i;
    updateNowPlaying();
    renderList();
    loadCover(i);
    let bytes;
    try { bytes = await blob.arrayBuffer(); } catch { return; }
    if (!bytes.byteLength) return;
    try { buffer = await ensureCtx().decodeAudioData(bytes.slice(0)); } catch { return; }
    offset = Math.max(0, Math.min(startOffset, buffer.duration));
    playing = false;
    setPlayIcon();
    if (durEl) durEl.textContent = fmt(buffer.duration);
    if (curEl) curEl.textContent = fmt(offset);
    if (fill) fill.style.width = `${(offset / buffer.duration) * 100}%`;
  };

  const play = async i => {
    if (i < 0 || i >= tracks.length) return;
    const blob = fileCache[tracks[i].id] || await musicDB.get(tracks[i].id);
    if (!blob) { if (artistEl) artistEl.textContent = 'File data missing'; return; }
    currentIndex = i;
    updateNowPlaying();
    renderList();

    const token = ++loadToken;
    let bytes;
    try { bytes = await blob.arrayBuffer(); } catch { if (artistEl) artistEl.textContent = 'Cannot read this file'; return; }
    if (!bytes || bytes.byteLength === 0) {
      if (artistEl) artistEl.textContent = `“${tracks[i].name}” is empty (0 bytes) — download it locally first`;
      return;
    }
    let decoded;
    try {
      const ctx = ensureCtx();
      await ctx.resume().catch(() => {});
      decoded = await ctx.decodeAudioData(bytes.slice(0)); // slice: decodeAudioData detaches the buffer
    } catch {
      const ext = (tracks[i].name.split('.').pop() || '').toUpperCase();
      if (artistEl) artistEl.textContent = `Can't decode ${ext || 'file'} (${Math.round(bytes.byteLength / 1024)} KB — corrupt or unsupported)`;
      return;
    }
    if (token !== loadToken) return; // superseded by a newer play()
    buffer = decoded;
    if (durEl) durEl.textContent = fmt(buffer.duration);
    startAt(0);
    loadCover(i);
  };

  const togglePlay = () => {
    if (!tracks.length) { if (artistEl) artistEl.textContent = 'أضف ملفات صوتية أولاً — اضغط ＋ أضف ملفات صوتية…'; return; }
    if (currentIndex < 0) { play(0); return; }
    if (playing) { offset = positionSec(); stopSource(); playing = false; setPlayIcon(); saveLast(); }
    else if (buffer) { ensureCtx().resume().catch(() => {}); startAt(offset >= buffer.duration ? 0 : offset); }
    else { play(currentIndex); }
  };

  const removeTrack = i => {
    const t = tracks[i];
    if (!t) return;
    musicDB.del(t.id);
    if (t.hasCover) musicDB.del(t.id + ':cover');
    tracks.splice(i, 1);
    saveMeta();
    if (i === currentIndex) {
      stopSource();
      playing = false;
      buffer = null;
      currentIndex = -1;
      setPlayIcon();
      updateNowPlaying();
      setCover('');
      if (fill) fill.style.width = '0%';
      if (curEl) curEl.textContent = '0:00';
      if (durEl) durEl.textContent = '0:00';
    } else if (i < currentIndex) {
      currentIndex--;
    }
    renderList();
  };

  const volEl = document.getElementById('npVol');
  if (volEl) {
    volEl.value = String(volume);
    volEl.addEventListener('input', () => {
      volume = parseFloat(volEl.value);
      if (gainNode) gainNode.gain.value = volume;
      try { localStorage.setItem('ios-dashboard-volume', String(volume)); } catch { /* blocked */ }
    });
  }

  if (playBtn) playBtn.addEventListener('click', togglePlay);
  if (prevBtn) prevBtn.addEventListener('click', () => { if (tracks.length) play((currentIndex - 1 + tracks.length) % tracks.length); });
  if (nextBtn) nextBtn.addEventListener('click', () => { if (tracks.length) play((currentIndex + 1) % tracks.length); });
  if (progress) progress.addEventListener('click', e => {
    if (!buffer) return;
    const rect = progress.getBoundingClientRect();
    const pos = ((e.clientX - rect.left) / rect.width) * buffer.duration;
    if (playing) startAt(pos);
    else { offset = Math.max(0, Math.min(pos, buffer.duration)); if (fill) fill.style.width = `${(offset / buffer.duration) * 100}%`; if (curEl) curEl.textContent = fmt(offset); }
  });

  if (addBtn) addBtn.addEventListener('click', () => fileInput.click());
  if (fileInput) fileInput.addEventListener('change', async () => {
    const picked = [...fileInput.files];
    const added = [];
    for (const file of picked) {
      if (!file.size) { // 0-byte file — typically a OneDrive/cloud online-only placeholder
        if (artistEl) artistEl.textContent = `“${file.name}” is empty (0 bytes). If it's a OneDrive/cloud file, download it locally first.`;
        continue;
      }
      added.push(file);
      const id = uid();
      fileCache[id] = file; // keep the File for direct playback
      await musicDB.set(id, file);
      let meta = {};
      try { meta = await parseID3(file); } catch { /* not tagged / unreadable */ }
      if (meta.cover) await musicDB.set(id + ':cover', meta.cover);
      tracks.push({ id, name: file.name, title: meta.title || '', artist: meta.artist || '', hasCover: !!meta.cover });
    }
    saveMeta();
    renderList();
    fileInput.value = '';
    // auto-play the first newly added track so it's easy to verify
    if (added.length && currentIndex < 0) play(tracks.length - added.length);
  });

  // ----- Audio output device (routes the Web Audio context to a chosen device) -----
  const outBtn = document.getElementById('npOutput');
  if (outBtn) {
    outBtn.addEventListener('click', async () => {
      if (!navigator.mediaDevices?.selectAudioOutput) {
        outBtn.textContent = '🔊 Picker not supported';
        return;
      }
      try {
        const device = await navigator.mediaDevices.selectAudioOutput();
        if (!device) return;
        selectedSink = device.deviceId;
        if (audioCtx?.setSinkId) await audioCtx.setSinkId(selectedSink); // applies to current + future playback
        outBtn.textContent = `🔊 ${device.label || 'Selected device'}`;
      } catch { /* user cancelled the picker */ }
    });
  }

  renderList();
  updateNowPlaying();
  if (fill) fill.style.width = '0%';

  // restore the last-played track (paused, at its saved position) so ▶ resumes it
  window.addEventListener('beforeunload', saveLast);
  try {
    const last = JSON.parse(localStorage.getItem(LAST_KEY));
    if (last && last.id) {
      const i = tracks.findIndex(t => t.id === last.id);
      if (i >= 0) prepare(i, last.offset || 0);
    }
  } catch { /* none */ }
}

setupMusic();

// ---------- EduLearn: learning dashboard (widgets, goal, streak, progress) ----------
function setupLearn() {
  const app = document.getElementById('app-learn');
  if (!app) return;

  const KEY = 'edulearn-state';
  const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const SUBJECT_COLORS = { Design: '#2563eb', Development: '#16a34a', Marketing: '#f59e0b' };
  const LESSON_POOL = {
    Design: ['Color Theory', 'Typographie', 'Grilles & espacement', 'Design System', 'Accessibilité'],
    Development: ['HTML Basics', 'Les fonctions', 'Les composants', 'Grid & Flexbox', 'APIs & fetch'],
    Marketing: ['Bases du SEO', 'Campagnes Meta', 'Séquences email', 'Analytics', 'Copywriting'],
  };
  const MIN_PER_LESSON = 10; // progression gagnée par leçon terminée

  const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dayKey(new Date());
  const shift = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  const seed = () => {
    const now = new Date();
    const days = {};
    for (let i = 1; i <= 6; i++) days[dayKey(shift(now, -i))] = true; // six jours déjà validés
    return {
      goal: 40,
      current: 'uiux',
      next: 'web',
      minutes: { [today()]: 30 },
      days,
      courses: [
        { id: 'uiux', name: 'UI/UX Design', subject: 'Design', lesson: 3, lessonName: 'Color Theory', progress: 60 },
        { id: 'web', name: 'Web Development', subject: 'Development', lesson: 4, lessonName: 'HTML Basics', progress: 40 },
        { id: 'seo', name: 'Marketing Digital', subject: 'Marketing', lesson: 2, lessonName: 'Bases du SEO', progress: 40 },
        { id: 'fig', name: 'Figma Avancé', subject: 'Design', lesson: 5, lessonName: 'Auto Layout', progress: 80 },
        { id: 'js', name: 'JavaScript Moderne', subject: 'Development', lesson: 2, lessonName: 'Les fonctions', progress: 55 },
        { id: 'brand', name: 'Brand Design', subject: 'Design', lesson: 1, lessonName: 'Identité visuelle', progress: 75 },
        { id: 'react', name: 'React Essentiel', subject: 'Development', lesson: 3, lessonName: 'Les composants', progress: 60 },
        { id: 'ads', name: 'Publicité en ligne', subject: 'Marketing', lesson: 2, lessonName: 'Campagnes Meta', progress: 45 },
        { id: 'ux', name: 'UX Research', subject: 'Design', lesson: 4, lessonName: 'Interviews utilisateurs', progress: 70 },
        { id: 'css', name: 'CSS Layouts', subject: 'Development', lesson: 6, lessonName: 'Grid & Flexbox', progress: 85 },
        { id: 'mail', name: 'Email Marketing', subject: 'Marketing', lesson: 1, lessonName: 'Séquences', progress: 35 },
        { id: 'proto', name: 'Prototypage', subject: 'Design', lesson: 2, lessonName: 'Micro-interactions', progress: 65 },
      ],
      todayLessons: [
        { courseId: 'uiux', name: 'Leçon 3 : Color Theory', done: false },
        { courseId: 'web', name: 'Leçon 4 : HTML Basics', done: false },
        { courseId: 'js', name: 'Leçon 2 : Les fonctions', done: false },
        { courseId: 'seo', name: 'Leçon 2 : Bases du SEO', done: false },
        { courseId: 'fig', name: 'Leçon 5 : Auto Layout', done: false },
      ],
    };
  };

  let state;
  try {
    state = JSON.parse(localStorage.getItem(KEY));
  } catch { /* corrompu */ }
  if (!state || !Array.isArray(state.courses)) state = seed();

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage plein */ }
  };

  const $ = id => document.getElementById(id);
  const course = id => state.courses.find(c => c.id === id) || state.courses[0];
  const minutesToday = () => state.minutes[today()] || 0;
  const lessonLabel = c => `Leçon ${c.lesson} : ${c.lessonName}`;

  // moyennes par matière + progression globale
  const subjectStats = () => {
    const by = {};
    state.courses.forEach(c => {
      by[c.subject] = by[c.subject] || { total: 0, n: 0 };
      by[c.subject].total += c.progress;
      by[c.subject].n += 1;
    });
    return Object.entries(by).map(([name, v]) => ({ name, pct: Math.round(v.total / v.n) }));
  };
  const overall = () => Math.round(state.courses.reduce((s, c) => s + c.progress, 0) / state.courses.length);

  // suite de jours consécutifs, en remontant depuis aujourd'hui (ou hier si rien encore aujourd'hui)
  const streakCount = () => {
    const now = new Date();
    let n = 0;
    let cursor = state.days[today()] ? now : shift(now, -1);
    while (state.days[dayKey(cursor)]) { n += 1; cursor = shift(cursor, -1); }
    return n;
  };

  // lundi → dimanche de la semaine en cours
  const weekDays = () => {
    const now = new Date();
    const monday = shift(now, -((now.getDay() + 6) % 7));
    return DAYS_FR.map((label, i) => {
      const d = shift(monday, i);
      const key = dayKey(d);
      return { label, key, done: !!state.days[key], isToday: key === today(), future: d > now && key !== today() };
    });
  };

  const setArc = (el, pct) => {
    if (!el) return;
    const c = 2 * Math.PI * 50; // r = 50 dans le viewBox
    el.style.strokeDasharray = c.toFixed(2);
    el.style.strokeDashoffset = (c * (1 - Math.min(100, Math.max(0, pct)) / 100)).toFixed(2);
  };

  let popDay = null; // jour à animer au prochain rendu

  const render = () => {
    const cur = course(state.current);
    const nxt = course(state.next);

    // 1. Continuer l'apprentissage
    $('eduHeroCourse').textContent = cur.name;
    $('eduHeroLesson').textContent = lessonLabel(cur);
    $('eduHeroBar').style.width = `${cur.progress}%`;
    $('eduHeroPct').textContent = `${cur.progress}%`;

    // 2. Objectif quotidien
    const done = minutesToday();
    const pct = Math.min(100, Math.round((done / state.goal) * 100));
    setArc($('eduGoalArc'), pct);
    $('eduGoalPct').textContent = `${pct}%`;
    $('eduGoalDone').textContent = done;
    $('eduGoalTarget').textContent = state.goal;
    $('eduFlame').classList.toggle('burn', pct >= 100);

    // 3 + 4. compteurs
    $('eduCourseCount').textContent = state.courses.length;
    $('eduLessonCount').textContent = state.todayLessons.length;

    // 5. Continuer à apprendre
    $('eduNextCat').textContent = nxt.subject;
    $('eduNextName').textContent = nxt.name;
    $('eduNextLesson').textContent = lessonLabel(nxt);
    $('eduNextBar').style.width = `${nxt.progress}%`;
    $('eduNextPct').textContent = `${nxt.progress}%`;
    $('eduNextGo').textContent = nxt.progress > 0 ? 'Continuer' : 'Commencer';

    // 6. Ma progression
    setArc($('eduOverallArc'), overall());
    $('eduOverallPct').textContent = `${overall()}%`;
    const subjects = $('eduSubjects');
    subjects.innerHTML = '';
    subjectStats().forEach(s => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="edu-sub-head"><span class="edu-dot"></span><span class="edu-sub-name"></span><span class="edu-sub-pct"></span></span><span class="edu-bar"><span></span></span>';
      li.querySelector('.edu-dot').style.background = SUBJECT_COLORS[s.name] || '#6c5ce7';
      li.querySelector('.edu-sub-name').textContent = s.name;
      li.querySelector('.edu-sub-pct').textContent = `${s.pct}%`;
      const fill = li.querySelector('.edu-bar span');
      fill.style.width = `${s.pct}%`;
      fill.style.background = SUBJECT_COLORS[s.name] || '#6c5ce7';
      subjects.appendChild(li);
    });

    // 7. Streak
    const n = streakCount();
    $('eduStreakN').textContent = n;
    $('eduStreakMsg').textContent = state.days[today()]
      ? 'Continue comme ça !'
      : (n ? 'Étudie aujourd\'hui pour garder ta série 🔥' : 'Commence une nouvelle série aujourd\'hui !');
    const week = $('eduWeek');
    week.innerHTML = '';
    weekDays().forEach(d => {
      const el = document.createElement('div');
      el.className = 'edu-day' + (d.done ? ' done' : '') + (d.isToday ? ' today' : '') + (d.key === popDay ? ' pop' : '');
      el.innerHTML = '<span class="edu-day-dot">✓</span><span class="edu-day-lbl"></span>';
      el.querySelector('.edu-day-lbl').textContent = d.label;
      week.appendChild(el);
    });
    popDay = null;

    // miroir sur le widget de l'écran d'accueil
    const wCourse = $('eduWCourse');
    if (wCourse) {
      wCourse.textContent = cur.name;
      $('eduWBar').style.width = `${cur.progress}%`;
      $('eduWPct').textContent = `${cur.progress}%`;
      $('eduWLesson').textContent = `Leçon ${cur.lesson}`;
    }
  };

  // ---- navigation entre les vues internes ----
  const showView = id => {
    app.querySelectorAll('.edu-view').forEach(v => v.classList.toggle('active', v.id === id));
    app.querySelector('.app-body').scrollTop = 0;
  };

  // ---- lecteur de leçon + chronomètre ----
  let timer = null;
  let seconds = 0;

  const paintTimer = () => {
    $('eduTimer').textContent = `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
  };

  const stopTimer = () => { clearInterval(timer); timer = null; };

  const openLesson = id => {
    state.current = id;
    const c = course(id);
    $('eduLessonCat').textContent = c.subject;
    $('eduLessonCourse').textContent = c.name;
    $('eduLessonName').textContent = lessonLabel(c);
    $('eduLessonBar').style.width = `${c.progress}%`;
    $('eduLessonPct').textContent = `${c.progress}%`;
    seconds = 0;
    paintTimer();
    showView('eduViewLesson');
    save();
    render();
    stopTimer();
    timer = setInterval(() => {
      seconds += 1;
      paintTimer();
      if (seconds % 60 === 0) { // chaque minute écoulée compte pour l'objectif
        state.minutes[today()] = minutesToday() + 1;
        save();
        render();
      }
    }, 1000);
  };

  const finishLesson = () => {
    const c = course(state.current);
    const rest = seconds % 60;
    if (rest) state.minutes[today()] = minutesToday() + 1; // minute entamée = minute comptée
    stopTimer();

    c.progress = Math.min(100, c.progress + MIN_PER_LESSON);
    c.lesson += 1;
    const pool = LESSON_POOL[c.subject] || LESSON_POOL.Design;
    c.lessonName = pool[(c.lesson - 1) % pool.length];

    const planned = state.todayLessons.find(l => l.courseId === c.id && !l.done) || state.todayLessons.find(l => !l.done);
    if (planned) planned.done = true;

    const wasStreak = streakCount();
    if (!state.days[today()]) {
      state.days[today()] = true;
      popDay = today(); // anime la pastille du jour
    }
    state.next = (state.courses.find(x => x.id !== c.id && x.progress < 100) || c).id;

    save();
    render();
    showView('eduViewHome');
    if (streakCount() > wasStreak) {
      const msg = $('eduStreakMsg');
      msg.textContent = `Série de ${streakCount()} jours — continue comme ça !`;
    }
  };

  // ---- listes ----
  const renderCourses = () => {
    const list = $('eduCourseList');
    list.innerHTML = '';
    state.courses.forEach(c => {
      const li = document.createElement('li');
      li.innerHTML = '<div class="edu-li-info"><p class="edu-li-name"></p><p class="edu-li-sub"></p><span class="edu-bar"><span></span></span></div><span class="edu-li-pct"></span>';
      li.querySelector('.edu-li-name').textContent = c.name;
      li.querySelector('.edu-li-sub').textContent = `${c.subject} · ${lessonLabel(c)}`;
      li.querySelector('.edu-bar span').style.width = `${c.progress}%`;
      li.querySelector('.edu-li-pct').textContent = `${c.progress}%`;
      li.addEventListener('click', () => openLesson(c.id));
      list.appendChild(li);
    });
  };

  const renderToday = () => {
    const list = $('eduTodayList');
    list.innerHTML = '';
    state.todayLessons.forEach(l => {
      const c = course(l.courseId);
      const li = document.createElement('li');
      li.className = l.done ? 'done' : '';
      li.innerHTML = '<span class="edu-check">✓</span><div class="edu-li-info"><p class="edu-li-name"></p><p class="edu-li-sub"></p></div>';
      li.querySelector('.edu-li-name').textContent = l.name;
      li.querySelector('.edu-li-sub').textContent = c.name;
      li.addEventListener('click', () => openLesson(l.courseId));
      list.appendChild(li);
    });
  };

  const renderStats = () => {
    const list = $('eduStats');
    const totalMin = Object.values(state.minutes).reduce((a, b) => a + b, 0);
    const finished = state.courses.filter(c => c.progress >= 100).length;
    const rows = [
      ['Progression globale', `${overall()}%`],
      ...subjectStats().map(s => [s.name, `${s.pct}%`]),
      ['Cours inscrits', state.courses.length],
      ['Cours terminés', finished],
      ['Temps aujourd\'hui', `${minutesToday()} min`],
      ['Temps total étudié', `${totalMin} min`],
      ['Objectif quotidien', `${state.goal} min`],
      ['Série en cours', `${streakCount()} jours`],
    ];
    list.innerHTML = '';
    rows.forEach(([label, value]) => {
      const li = document.createElement('li');
      li.innerHTML = '<span></span><b></b>';
      li.querySelector('span').textContent = label;
      li.querySelector('b').textContent = value;
      list.appendChild(li);
    });
  };

  // ---- interactions ----
  $('eduHero').addEventListener('click', () => openLesson(state.current));
  $('eduNextRow').addEventListener('click', () => openLesson(state.next));
  $('eduNextGo').addEventListener('click', () => openLesson(state.next));
  $('eduNextAll').addEventListener('click', () => { renderCourses(); showView('eduViewCourses'); });
  $('eduCoursesCard').addEventListener('click', () => { renderCourses(); showView('eduViewCourses'); });
  $('eduTodayCard').addEventListener('click', () => { renderToday(); showView('eduViewToday'); });
  $('eduStatsAll').addEventListener('click', () => { renderStats(); showView('eduViewStats'); });
  $('eduFinish').addEventListener('click', finishLesson);

  app.querySelectorAll('[data-edu-back]').forEach(b =>
    b.addEventListener('click', () => { stopTimer(); showView('eduViewHome'); render(); })
  );

  // quitter l'app arrête le chrono et revient à l'accueil de l'app
  const leave = () => { stopTimer(); showView('eduViewHome'); render(); };
  app.querySelector('.back').addEventListener('click', leave);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') leave(); });

  // menu ⋮ : modifier l'objectif quotidien
  const edit = $('eduGoalEdit');
  const paintPresets = () => edit.querySelectorAll('button').forEach(b =>
    b.classList.toggle('on', Number(b.dataset.goal) === state.goal)
  );
  $('eduGoalMenu').addEventListener('click', () => {
    const open = edit.hasAttribute('hidden');
    edit.toggleAttribute('hidden', !open);
    $('eduGoalMenu').setAttribute('aria-expanded', String(open));
    paintPresets();
  });
  edit.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    state.goal = Number(b.dataset.goal);
    save();
    paintPresets();
    render();
  }));

  // Réglages → remise à zéro des données EduLearn
  document.querySelectorAll('[data-action="reset-learn"]').forEach(btn =>
    btn.addEventListener('click', () => {
      state = seed();
      save();
      render();
      showView('eduViewHome');
    })
  );

  render();
}

setupLearn();

// ---------- Screen saver: iOS-style lock screen after a spell of inactivity ----------
function setupScreensaver() {
  const lock = document.getElementById('lockscreen');
  if (!lock) return;

  const IDLE_MS = 60000;   // how long the phone sits untouched before it locks
  const SWIPE_PX = 60;     // upward distance that counts as "swipe to unlock"
  let idleTimer = null;
  let drag = null;

  const locked = () => !lock.classList.contains('hidden');

  const lockNow = (force = false) => {
    if (locked() || (editState.editing && !force)) return; // a power-button press locks anyway
    updateClock(); // the big clock must be right the moment it appears
    lock.classList.remove('hidden');
    lock.setAttribute('aria-hidden', 'false');
  };

  const unlock = () => {
    if (!locked()) return;
    lock.style.transform = '';
    lock.classList.remove('dragging');
    lock.classList.add('hidden');
    lock.setAttribute('aria-hidden', 'true');
    arm();
  };

  const arm = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => lockNow(), IDLE_MS);
  };

  // any activity on the unlocked phone pushes the screen saver back
  ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach(evt =>
    document.addEventListener(evt, () => { if (!locked()) arm(); }, { passive: true })
  );

  // swipe up (or a plain tap / any key) dismisses it
  lock.addEventListener('pointerdown', e => {
    drag = { y: e.clientY, moved: false };
    lock.classList.add('dragging');
    lock.setPointerCapture(e.pointerId);
  });

  lock.addEventListener('pointermove', e => {
    if (!drag) return;
    const dy = Math.min(0, e.clientY - drag.y); // upward only
    if (dy < -4) drag.moved = true;
    lock.style.transform = `translateY(${dy}px)`;
  });

  const endDrag = e => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    const wasDrag = drag.moved;
    drag = null;
    lock.classList.remove('dragging');
    if (dy <= -SWIPE_PX || !wasDrag) unlock();  // swiped far enough, or just tapped
    else lock.style.transform = '';             // not far enough: settle back
  };
  lock.addEventListener('pointerup', endDrag);
  lock.addEventListener('pointercancel', endDrag);

  document.addEventListener('keydown', () => { if (locked()) unlock(); });
  lock.addEventListener('wheel', e => { if (e.deltaY < 0) unlock(); }, { passive: true });

  // Power side-button: lock instantly, press again to wake
  const power = document.querySelector('.side-btn.power');
  if (power) {
    power.setAttribute('role', 'button');
    power.setAttribute('aria-label', 'Lock screen');
    power.addEventListener('click', () => (locked() ? unlock() : lockNow(true)));
  }

  // Camera shortcut: unlock straight into the Camera app
  const camBtn = document.getElementById('lockCam');
  if (camBtn) {
    camBtn.addEventListener('pointerdown', e => e.stopPropagation()); // don't start a swipe
    camBtn.addEventListener('click', e => {
      e.stopPropagation();
      unlock();
      if (navControls.open) navControls.open('camera');
    });
  }

  arm();
}

setupScreensaver();
