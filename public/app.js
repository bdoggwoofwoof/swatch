/* Swatch — personal palette generator. Data stays on the device (localStorage). */
(function () {
  const C = window.Color;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast('Could not save on this device'); } },
  };
  let lib = store.get('swatch.lib', null) || { palettes: [], collections: ['Favorites'] };
  const saveLib = () => store.set('swatch.lib', lib);

  // ---------- built-in palettes ----------
  const BUILTIN = [
    { id: 'unc-primary', name: 'UNC Primary', note: 'Carolina Blue, Navy and White are the core of the identity and the main colors on all University materials. Use Carolina Blue as much as possible.',
      c: [['Carolina Blue', '#4B9CD3', 'PMS 542 C', '60/19/1/4'], ['Navy', '#13294B', 'PMS 2767 C', '100/90/10/77'], ['White', '#FFFFFF', 'No ink', '0/0/0/0']] },
    { id: 'unc-secondary', name: 'UNC Secondary', note: 'Neutral complements to the primary palette, with tints and shades for depth. Keep use to a minimum and never as a direct replacement for a primary color.',
      c: [['Black', '#000000', 'PMS Process Black C', '0/0/0/100'], ['Bolin Creek', '#2C5080', 'PMS 2161 C', '80/55/5/34'], ['Fordham Fountain', '#B7D7ED', 'PMS 290 C', '24/7/0/2'], ['Cloud', '#EDF5FB', 'PMS 290 C 30%', '6/2/0/0'], ['Old Well Basin', '#5B6670', 'PMS 431 C', '68/52/44/17'], ['Flat Gray', '#A2AAAD', 'PMS 429 C', '21/11/9/23'], ['Cornerstone', '#CFD3D5', 'PMS 427 C', '17/11/11/0'], ['Franklin Fog', '#ECEDED', 'PMS 427 C 40%', '6/4/4/0']] },
    { id: 'unc-supporting-warm', name: 'UNC Supporting · Warm', note: 'Inspired by places and plants across campus and the state. Use intentionally and sparingly as accents (buttons, infographics, data visualizations), never in large floods or competing with primary or secondary colors.',
      c: [['Clay', '#E95550', 'PMS 2348 C', '3/82/69/0'], ['Polk Pathways', '#FBC8B6', 'PMS 6022 C', '0/25/24/0'], ['Tulip Poplar', '#FF9E1B', 'PMS 1375 C', '0/44/97/0'], ['Old East', '#FECF86', 'PMS 1345 C', '0/20/54/0'], ['Ginkgo', '#FFD340', 'PMS 122 C', '0/16/85/0'], ['Coastal Sand', '#FFEEC2', 'PMS 122 C 35%', '0/5/26/0']] },
    { id: 'unc-supporting-cool', name: 'UNC Supporting · Cool', note: 'Inspired by places and plants across campus and the state. Use intentionally and sparingly as accents (buttons, infographics, data visualizations), never in large floods or competing with primary or secondary colors.',
      c: [['Piedmont Pine', '#006D6A', 'PMS 7719 C', '100/36/58/18'], ['Dogwood', '#B6DDC0', 'PMS 2253 C', '30/0/30/0'], ['Beautyberry', '#9F237E', 'PMS 2415 C', '42/100/14/1'], ['Coneflower', '#EBCAE1', 'PMS 671 C', '5/23/0/0'], ['Mountain Dusk', '#4E3C98', 'PMS 2098 C', '85/92/0/0'], ['Aster', '#B1B8DD', 'PMS 270 C', '29/23/0/0']] },
  ];
  const SPECS = {};
  window.CUSTOM_NAMES = window.CUSTOM_NAMES || {};
  BUILTIN.forEach(b => b.c.forEach(([n, h, pms, cmyk]) => { if (h !== '#FFFFFF' && h !== '#000000') window.CUSTOM_NAMES[h] = n; SPECS[h] = { name: n, pms, cmyk }; }));
  const BUILTIN_IDS = new Set(BUILTIN.map(b => b.id));
  const isBuiltin = p => !!p && BUILTIN_IDS.has(p.id);
  // Where a new palette goes: the collection last saved to, else Favorites, else any collection that isn't the built-in one.
  function defaultColl(except) {
    const ok = c => c && c !== except && lib.collections.includes(c);
    const last = store.get('swatch.lastColl', null);
    if (ok(last)) return last;
    if (ok('Favorites')) return 'Favorites';
    return lib.collections.find(c => c !== 'UNC' && c !== except) || lib.collections.find(c => c !== except) || 'Favorites';
  }
  (function seed() {
    const done = store.get('swatch.seeded', []);
    let changed = false;
    // Add the UNC collection only the first time this browser is seeded, so renaming or deleting it sticks.
    if (!done.length && !lib.collections.includes('UNC')) { lib.collections.push('UNC'); changed = true; }
    BUILTIN.slice().reverse().forEach(b => {
      if (done.includes(b.id)) return;
      if (!lib.palettes.some(p => p.id === b.id)) lib.palettes.unshift({ id: b.id, name: b.name, collection: 'UNC', note: b.note, colors: b.c.map(x => x[1]), created: Date.now(), updated: Date.now() });
      done.push(b.id); changed = true;
    });
    if (changed) { saveLib(); store.set('swatch.seeded', done); }
  })();

  // ---------- state ----------
  const MIN = 2, MAX = 10;
  let state = { colors: [], mode: 'auto', libId: null };
  let history = [], future = [];

  function snapshot() { return JSON.stringify(state.colors); }
  function pushHistory() { history.push(snapshot()); if (history.length > 100) history.shift(); future = []; updateUndo(); }
  function updateUndo() { $('#undoBtn').disabled = !history.length; $('#redoBtn').disabled = !future.length; }

  function setColors(hexes, opts = {}) {
    if (!opts.noHistory) pushHistory();
    state.colors = hexes.map((h, i) => ({ hex: C.normHex(h.hex || h), locked: !!(h.locked) }));
    if (!opts.keepLib) state.libId = null;
    render();
  }

  function generate() {
    pushHistory();
    const fixed = state.colors.map(c => (c.locked ? c.hex : null));
    const { colors } = C.generate(state.colors.length || 5, state.mode, fixed);
    state.colors = colors.map((hex, i) => ({ hex, locked: !!fixed[i] }));
    render();
  }

  // ---------- URL ----------
  function writeHash() {
    const h = '#' + state.colors.map(c => c.hex.slice(1)).join('-');
    if (location.hash !== h) window.history.replaceState(null, '', h);
  }
  function readHash() {
    const m = location.hash.match(/^#\/?([0-9a-fA-F-]+)$/);
    if (!m) return null;
    const hexes = m[1].split('-').map(x => C.normHex('#' + x)).filter(Boolean);
    return hexes.length >= MIN ? hexes.slice(0, MAX) : null;
  }

  const I = {
    lock: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    unlock: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>',
    shades: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    grip: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  };

  // ---------- generator render ----------
  const pal = $('#palette');
  function render() {
    pal.innerHTML = '';
    state.colors.forEach((c, i) => {
      const fg = C.textOn(c.hex);
      const el = document.createElement('div');
      el.className = 'sw';
      el.style.background = c.hex; el.style.color = fg;
      el.dataset.i = i;
      el.innerHTML = `
        <div class="info">
          <button class="hex" data-act="copy" aria-label="Copy ${c.hex}">${c.hex.slice(1)}</button>
          <span class="nm">${esc(C.nameOf(c.hex))}</span>
        </div>
        <div class="acts">
          <button data-act="lock" class="${c.locked ? 'on' : ''}" aria-pressed="${c.locked}" aria-label="Lock color ${i + 1}">${c.locked ? I.lock : I.unlock}</button>
          <button data-act="edit" aria-label="Adjust color ${i + 1}">${I.shades}</button>
          <button data-act="remove" aria-label="Remove color ${i + 1}" ${state.colors.length <= MIN ? 'disabled' : ''}>${I.x}</button>
          <button data-act="drag" class="drag" aria-label="Move color ${i + 1}: drag, or use arrow keys">${I.grip}</button>
        </div>`;
      pal.appendChild(el);
    });
    $('#countLbl').textContent = state.colors.length;
    $('#minusBtn').disabled = state.colors.length <= MIN;
    $('#plusBtn').disabled = state.colors.length >= MAX;
    writeHash();
    updateUndo();
    fitRows();
    store.set('swatch.current', { colors: state.colors, mode: state.mode, libId: state.libId });
    if ($('#view-contrast').classList.contains('active')) renderContrast();
  }
  // When rows get short (many colors, small screen), hide color names so nothing overlaps.
  function fitRows() {
    const n = state.colors.length || 1;
    pal.classList.remove('compact');
    const v = getComputedStyle(pal).flexDirection !== 'row';
    if (v && pal.clientHeight && pal.clientHeight / n < 60) pal.classList.add('compact');
  }
  window.addEventListener('resize', fitRows);

  pal.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const i = +b.closest('.sw').dataset.i, c = state.colors[i];
    const act = b.dataset.act;
    if (act === 'copy') copy(c.hex, `Copied ${c.hex}`);
    else if (act === 'lock') { pushHistory(); c.locked = !c.locked; render(); }
    else if (act === 'remove') { if (state.colors.length > MIN) { pushHistory(); state.colors.splice(i, 1); render(); toast(`Removed ${c.hex}`, 'Undo', undo); } }
    else if (act === 'edit') openEdit(i);
    if (act === 'lock') { const b2 = pal.children[i] && pal.children[i].querySelector('[data-act=lock]'); if (b2) b2.focus(); }
  });
  // Arrow keys on the drag handle move the color without dragging.
  pal.addEventListener('keydown', e => {
    const h = e.target.closest('.drag'); if (!h) return;
    const back = ['ArrowUp', 'ArrowLeft'].includes(e.key), fwd = ['ArrowDown', 'ArrowRight'].includes(e.key);
    if (!back && !fwd) return;
    e.preventDefault();
    const i = +h.closest('.sw').dataset.i, j = moveColor(i, back ? -1 : 1);
    if (j !== i) { pal.children[j].querySelector('.drag').focus(); toast(`Moved to position ${j + 1}`); }
  });

  // drag to reorder (pointer events; works with touch)
  let drag = null;
  pal.addEventListener('pointerdown', e => {
    const h = e.target.closest('.drag'); if (!h) return;
    e.preventDefault();
    const el = h.closest('.sw');
    drag = { el, from: +el.dataset.i, horiz: getComputedStyle(pal).flexDirection === 'row' };
    el.classList.add('dragging');
    document.addEventListener('pointermove', onDrag);
    document.addEventListener('pointerup', endDrag, { once: true });
    document.addEventListener('pointercancel', endDrag, { once: true });
  });
  function onDrag(e) {
    if (!drag) return;
    const kids = Array.from(pal.children).filter(k => k !== drag.el);
    const pos = drag.horiz ? e.clientX : e.clientY;
    let before = null;
    for (const k of kids) {
      const r = k.getBoundingClientRect();
      const mid = drag.horiz ? r.left + r.width / 2 : r.top + r.height / 2;
      if (pos < mid) { before = k; break; }
    }
    if (before !== drag.el.nextSibling) pal.insertBefore(drag.el, before);
  }
  function endDrag() {
    document.removeEventListener('pointermove', onDrag);
    if (!drag) return;
    const to = Array.from(pal.children).indexOf(drag.el);
    drag.el.classList.remove('dragging');
    const from = drag.from; drag = null;
    if (to !== from && to >= 0) { pushHistory(); const [m] = state.colors.splice(from, 1); state.colors.splice(to, 0, m); }
    render();
  }

  $('#genBtn').addEventListener('click', generate);
  $('#mode').addEventListener('change', e => { state.mode = e.target.value; store.set('swatch.mode', state.mode); generate(); });
  $('#plusBtn').addEventListener('click', () => {
    if (state.colors.length >= MAX) return;
    pushHistory();
    const fixed = state.colors.map(c => c.hex).concat([null]);
    const { colors } = C.generate(fixed.length, state.mode, fixed);
    state.colors.push({ hex: colors[colors.length - 1], locked: false });
    render();
  });
  $('#minusBtn').addEventListener('click', () => {
    if (state.colors.length <= MIN) return;
    pushHistory();
    let idx = -1; for (let i = state.colors.length - 1; i >= 0; i--) if (!state.colors[i].locked) { idx = i; break; }
    state.colors.splice(idx < 0 ? state.colors.length - 1 : idx, 1);
    render();
  });
  $('#pasteBtn').addEventListener('click', () => {
    openSheet(`<h2 class="st">Open a palette</h2><label class="small" for="pcTxt" style="display:block;margin-bottom:6px">Paste colors in any form: hex codes like #1D3557 or #FFF, rgb(29, 53, 87), a list, a link, or CSS.</label><textarea id="pcTxt" rows="3" style="width:100%;border-radius:10px;border:1px solid var(--line);background:var(--bg);padding:10px;font:14px ui-monospace,monospace" placeholder="264653-2A9D8F-E9C46A-F4A261-E76F51"></textarea><div class="row gap"><button class="pill primary" id="pcGo">Open</button></div>`, root => {
      root.querySelector('#pcGo').addEventListener('click', () => {
        const found = parseColors(root.querySelector('#pcTxt').value).slice(0, MAX);
        if (found.length < MIN) { toast("Couldn't find two colors. Paste codes like #1D3557."); return; }
        closeSheet(); setColors(found); toast(`Opened ${found.length} colors`);
      });
    });
  });
  // Finds colors in pasted text, in the order they appear: #RRGGBB, #RGB, bare RRGGBB, rgb()/rgba().
  function parseColors(text) {
    // No lookbehind here: older iPhone Safari can't parse it, and a syntax error would stop the whole app.
    const out = [], re = /rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})[^)]*\)|#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])|(^|[^0-9a-zA-Z#])([0-9a-fA-F]{6})(?![0-9a-zA-Z])/g;
    let m;
    while ((m = re.exec(text))) {
      const hex = m[1] != null ? C.rgbToHex(Math.min(255, +m[1]), Math.min(255, +m[2]), Math.min(255, +m[3])) : C.normHex('#' + (m[4] || m[6]));
      if (hex) out.push(hex);
    }
    return out;
  }
  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);
  function undo() { if (!history.length) return; future.push(snapshot()); state.colors = JSON.parse(history.pop()); render(); }
  function redo() { if (!future.length) return; history.push(snapshot()); state.colors = JSON.parse(future.pop()); render(); }

  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || !$('#sheet').hidden) { if (e.key === 'Escape') closeSheet(); return; }
    if (!$('#view-create').classList.contains('active')) return;
    // Space generates only when no button or control has focus; otherwise it presses that control.
    if (e.code === 'Space' && !e.target.closest('button,a,input,select,textarea,label,[tabindex]')) { e.preventDefault(); generate(); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  });

  // swipe up on the palette (phones) also generates
  let sy = null;
  pal.addEventListener('touchstart', e => { if (!e.target.closest('button')) sy = e.touches[0].clientY; }, { passive: true });
  pal.addEventListener('touchend', e => { if (sy == null) return; const dy = sy - e.changedTouches[0].clientY; sy = null; if (dy > 80) generate(); }, { passive: true });

  // ---------- sheet ----------
  let lastFocus = null, onSheetClose = null;
  const behindSheet = () => [$('header.top'), $('main'), $('nav.tabs')];
  // onClose runs on every way of closing (Done, ✕, Escape, tapping outside), so sheets can commit their changes.
  function openSheet(html, onMount, onClose) {
    if (!$('#sheet').hidden) closeSheet(true);
    lastFocus = document.activeElement;
    onSheetClose = onClose || null;
    const body = $('#sheetBody');
    body.innerHTML = html;
    const title = body.querySelector('.st');
    if (title) { title.id = 'sheetTitle'; title.tabIndex = -1; $('#sheet').setAttribute('aria-labelledby', 'sheetTitle'); }
    $('#sheet').hidden = false; $('#scrim').hidden = false;
    behindSheet().forEach(el => el.inert = true);
    if (onMount) onMount(body);
    // Focus the title, not a text field, so the phone keyboard doesn't pop up over the sheet.
    (title || $('#sheetX')).focus({ preventScroll: true });
  }
  function closeSheet(keepFocus) {
    if ($('#sheet').hidden) return;
    const cb = onSheetClose; onSheetClose = null;
    if (cb) cb();
    $('#sheet').hidden = true; $('#scrim').hidden = true; $('#sheetBody').innerHTML = '';
    $('#sheet').removeAttribute('aria-labelledby');
    behindSheet().forEach(el => el.inert = false);
    if (!keepFocus && lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  $('#scrim').addEventListener('click', () => closeSheet());
  $('#sheetX').addEventListener('click', () => closeSheet());
  // Keep Tab inside the open sheet.
  $('#sheet').addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = Array.from($('#sheet').querySelectorAll('button,input,select,textarea,[tabindex]:not([tabindex="-1"]),a[href]')).filter(x => !x.disabled && !x.closest('[hidden]'));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement.id === 'sheetTitle')) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // edit / shades
  const vertical = () => getComputedStyle(pal).flexDirection !== 'row';
  // Move a color one place earlier (-1) or later (+1). Used by the Adjust sheet and by arrow keys on the drag handle.
  function moveColor(i, d) {
    const j = i + d; if (j < 0 || j >= state.colors.length) return i;
    pushHistory();
    const [m] = state.colors.splice(i, 1); state.colors.splice(j, 0, m);
    render();
    return j;
  }
  function openEdit(i) {
    let idx = i, removed = false, pushed = false, moved = false;
    const start = state.colors[idx].hex;
    let cur = start;
    const sh = C.shades(start, 11);
    const v = vertical();
    const earlier = v ? 'Move up' : 'Move left', later = v ? 'Move down' : 'Move right';
    openSheet(`
      <h2 class="st">Adjust color</h2>
      <div class="edit-top">
        <div class="big" id="eBig"></div>
        <input class="hexin" id="eHex" maxlength="7" autocapitalize="characters" aria-label="Hex code">
        <input type="color" id="ePick" aria-label="Color picker" style="width:56px;height:44px;border:0;background:none">
      </div>
      <div class="muted small" id="eName"></div>
      <h3>Shades</h3>
      <div class="shade-row" id="eShades">${sh.map(s => `<button data-h="${s}" style="background:${s};color:${C.textOn(s)}" aria-label="Shade ${s}"></button>`).join('')}</div>
      <div class="sliders">
        <label>Hue <input type="range" id="eH" min="0" max="359"><span id="eHv"></span></label>
        <label>Saturation <input type="range" id="eS" min="0" max="100"><span id="eSv"></span></label>
        <label>Lightness <input type="range" id="eL" min="0" max="100"><span id="eLv"></span></label>
      </div>
      <div class="row gap">
        <button class="pill" id="eReset">Reset</button>
        <button class="pill" id="eCopy">Copy hex</button>
        <button class="pill primary" id="eDone" style="margin-left:auto">Done</button>
      </div>
      <div class="row gap edit-more">
        <button class="pill" id="eEarlier">${earlier}</button>
        <button class="pill" id="eLater">${later}</button>
        <button class="pill danger" id="eRemove" style="margin-left:auto">Remove color</button>
      </div>`, root => {
      const set = (hex, from) => {
        // Record one Undo step, on the first real change only.
        if (hex !== cur && !pushed) { history.push(JSON.stringify(state.colors.map((c, k) => k === idx ? { ...c, hex: cur } : c))); if (history.length > 100) history.shift(); future = []; pushed = true; updateUndo(); }
        cur = hex; state.colors[idx].hex = hex;
        root.querySelector('#eBig').style.background = hex;
        if (from !== 'hex') root.querySelector('#eHex').value = hex;
        if (from !== 'pick') root.querySelector('#ePick').value = hex.toLowerCase();
        root.querySelector('#eName').textContent = C.nameOf(hex);
        if (from !== 'slider') {
          const [h, s, l] = C.hexToHsl(hex);
          root.querySelector('#eH').value = Math.round(h); root.querySelector('#eS').value = Math.round(s * 100); root.querySelector('#eL').value = Math.round(l * 100);
        }
        root.querySelector('#eHv').textContent = root.querySelector('#eH').value + '°';
        root.querySelector('#eSv').textContent = root.querySelector('#eS').value + '%';
        root.querySelector('#eLv').textContent = root.querySelector('#eL').value + '%';
        root.querySelectorAll('#eShades button').forEach(b => b.classList.toggle('cur', b.dataset.h === hex));
        const sw = pal.children[idx]; if (sw) { sw.style.background = hex; sw.style.color = C.textOn(hex); sw.querySelector('.hex').textContent = hex.slice(1); sw.querySelector('.nm').textContent = C.nameOf(hex); }
      };
      set(start);
      const syncMove = () => { root.querySelector('#eEarlier').disabled = idx === 0; root.querySelector('#eLater').disabled = idx === state.colors.length - 1; root.querySelector('#eRemove').disabled = state.colors.length <= MIN; };
      syncMove();
      root.querySelector('#eEarlier').addEventListener('click', () => { moved = true; idx = moveColor(idx, -1); syncMove(); toast(`Moved to position ${idx + 1}`); });
      root.querySelector('#eLater').addEventListener('click', () => { moved = true; idx = moveColor(idx, 1); syncMove(); toast(`Moved to position ${idx + 1}`); });
      root.querySelector('#eRemove').addEventListener('click', () => {
        if (state.colors.length <= MIN) return;
        pushHistory(); const gone = state.colors.splice(idx, 1)[0]; removed = true;
        closeSheet(true); render(); toast(`Removed ${gone.hex}`, 'Undo', undo);
        const n = pal.children[Math.min(idx, state.colors.length - 1)]; if (n) n.querySelector('.hex').focus();
      });
      root.querySelector('#eShades').addEventListener('click', e => { const b = e.target.closest('button'); if (b) set(b.dataset.h); });
      ['#eH', '#eS', '#eL'].forEach(id => root.querySelector(id).addEventListener('input', () => {
        set(C.hslToHex(+root.querySelector('#eH').value, root.querySelector('#eS').value / 100, root.querySelector('#eL').value / 100), 'slider');
      }));
      root.querySelector('#eHex').addEventListener('input', e => { let v = e.target.value.trim(); if (!v.startsWith('#')) v = '#' + v; const n = C.normHex(v); if (n && v.length >= 4) set(n, 'hex'); });
      root.querySelector('#ePick').addEventListener('input', e => set(C.normHex(e.target.value), 'pick'));
      root.querySelector('#eReset').addEventListener('click', () => set(start));
      root.querySelector('#eCopy').addEventListener('click', () => copy(cur, `Copied ${cur}`));
      root.querySelector('#eDone').addEventListener('click', () => closeSheet());
    }, () => {
      // Runs on every way of closing: keep the edit, and drop the Undo step if the color ended where it started.
      if (removed) return;
      if (pushed && cur === start && !moved) { history.pop(); }
      render();
      const sw = pal.children[idx]; if (sw) lastFocus = sw.querySelector('[data-act=edit]');
    });
  }

  // ---------- export ----------
  const hexes = () => state.colors.map(c => c.hex);
  function slugName(hex, i, used) {
    let n = C.nameOf(hex).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'color-' + (i + 1);
    let base = n, k = 2; while (used.has(n)) n = base + '-' + k++; used.add(n); return n;
  }
  const formats = {
    hex: () => hexes().join(', '),
    css: () => { const u = new Set(); return ':root {\n' + hexes().map((h, i) => `  --${slugName(h, i, u)}: ${h};`).join('\n') + '\n}'; },
    scss: () => { const u = new Set(); return hexes().map((h, i) => `$${slugName(h, i, u)}: ${h};`).join('\n'); },
    tailwind: () => { const u = new Set(); return "// tailwind.config.js → theme.extend.colors\ncolors: {\n" + hexes().map((h, i) => `  '${slugName(h, i, u)}': '${h}',`).join('\n') + '\n}'; },
    json: () => JSON.stringify(state.colors.map(c => ({ name: C.nameOf(c.hex), hex: c.hex, rgb: C.hexToRgb(c.hex) })), null, 2),
    rgb: () => hexes().map(h => `rgb(${C.hexToRgb(h).join(', ')})`).join('\n'),
    hsl: () => hexes().map(h => { const [a, b, c] = C.hexToHsl(h); return `hsl(${Math.round(a)}, ${Math.round(b * 100)}%, ${Math.round(c * 100)}%)`; }).join('\n'),
  };
  
  const shareUrl = () => location.origin + location.pathname + '#' + hexes().map(h => h.slice(1)).join('-');
  function openExport(list) {
    const snap = list ? list.map(h => ({ hex: h, locked: false })) : state.colors.slice();
    const withPal = fn => { const p = state.colors; state.colors = snap; try { return fn(); } finally { state.colors = p; } };
    openSheet(`
      <h2 class="st">Export</h2>
      <div class="export-grid">
        <button data-f="hex">Copy hex codes</button>
        <button data-f="css">CSS variables</button>
        <button data-f="tailwind">Tailwind</button>
        <button data-f="scss">SCSS</button>
        <button data-f="rgb">RGB</button>
        <button data-f="hsl">HSL</button>
        <button data-f="json">JSON</button>
        <button data-f="png">Image (PNG)</button>
        <button data-f="code">Palette code</button>
        <button data-f="link">Copy link</button>
        <button data-f="share">Share…</button>
      </div>
      <pre class="code" id="exOut" hidden></pre>`, root => {
      root.querySelector('.export-grid').addEventListener('click', async e => {
        const b = e.target.closest('button'); if (!b) return;
        const f = b.dataset.f;
        if (formats[f]) {
          const txt = withPal(formats[f]);
          const out = root.querySelector('#exOut'); out.hidden = false; out.textContent = txt;
          copy(txt, 'Copied ' + b.textContent.replace('Copy ', ''));
        } else if (f === 'png') withPal(() => exportPng());
        else if (f === 'link') copy(withPal(shareUrl), 'Link copied');
        else if (f === 'share') {
          const url = withPal(shareUrl), text = withPal(formats.hex);
          if (navigator.share) navigator.share({ title: 'Palette', text, url }).catch(() => { });
          else copy(url, 'Link copied');
        }
        else if (f === 'code') { const txt = withPal(() => hexes().map(h => h.slice(1)).join('-')); const out = root.querySelector('#exOut'); out.hidden = false; out.textContent = txt + '\n\nPaste a code like this into Create → Paste code to open it again.'; copy(txt, 'Palette code copied'); }
      });
    });
  }
  $('#exportBtn').addEventListener('click', () => openExport());

  function exportPng() {
    const hs = hexes(), W = 1600, H = 1000, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const x = cv.getContext('2d'), sw = W / hs.length, barH = 780;
    hs.forEach((h, i) => {
      x.fillStyle = h; x.fillRect(i * sw, 0, Math.ceil(sw), barH);
      x.fillStyle = '#FFFFFF'; x.fillRect(i * sw, barH, Math.ceil(sw), H - barH);
      x.fillStyle = '#16161A'; x.font = `700 ${Math.min(44, sw / 5)}px system-ui, sans-serif`; x.textAlign = 'center';
      x.fillText(h.slice(1), i * sw + sw / 2, barH + 96);
      x.fillStyle = '#6B6A70'; x.font = `500 ${Math.min(28, sw / 8)}px system-ui, sans-serif`;
      x.fillText(C.nameOf(h), i * sw + sw / 2, barH + 146);
    });
    const url = cv.toDataURL('image/png');
    openSheet(`<h2 class="st">Palette image</h2><img src="${url}" alt="Palette image" style="width:100%;border-radius:12px;border:1px solid var(--line)"><p class="muted small">Tap Save image, or press and hold the image.</p><div class="row gap"><button class="pill primary" id="imgSave">Save image</button><button class="pill" id="imgCopy">Copy image</button></div>`, root => {
      root.querySelector('#imgSave').addEventListener('click', () => cv.toBlob(b => saveFile(b, 'palette-' + hs.map(h => h.slice(1)).join('-') + '.png', 'Image saved'), 'image/png'));
      root.querySelector('#imgCopy').addEventListener('click', () => {
        try {
          const p = new Promise(res => cv.toBlob(res, 'image/png'));
          navigator.clipboard.write([new ClipboardItem({ 'image/png': p })]).then(() => toast('Image copied'), () => toast('Press and hold the image instead'));
        } catch { toast('Press and hold the image instead'); }
      });
    });
  }

  // ---------- save / library ----------
  function suggestName(hs) {
    const names = [...new Set(hs.map(C.nameOf))];
    return names.slice(0, 2).join(' & ');
  }
  function collOptions(sel) { return lib.collections.map(c => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('') + '<option value="__new">+ New collection…</option>'; }

  function openSave() {
    const opened = state.libId && lib.palettes.find(p => p.id === state.libId);
    // Built-in palettes are read-only: saving one always makes a copy.
    const existing = isBuiltin(opened) ? null : opened;
    const hs = hexes();
    openSheet(`
      <h2 class="st">${existing ? 'Save palette' : 'Save to library'}</h2>
      ${isBuiltin(opened) ? `<p class="muted small">${esc(opened.name)} is a built-in palette, so this saves a copy.</p>` : ''}
      <div class="strip" role="img" aria-label="Palette: ${hs.join(', ')}">${hs.map(h => `<span style="background:${h}"></span>`).join('')}</div>
      <label class="field">Name<input id="sName" value="${esc(suggestName(hs))}" maxlength="60"></label>
      <label class="field">Collection<select id="sColl">${collOptions(existing ? existing.collection : defaultColl())}</select></label>
      <label class="field" id="sNewWrap" hidden>New collection name<input id="sNew" maxlength="40" placeholder="e.g. Instagram, Portfolio"></label>
      <div class="row gap">
        ${existing ? `<button class="pill" id="sUpd">Update “${esc(existing.name)}”</button>` : ''}
        <button class="pill primary" id="sGo" style="margin-left:auto">${existing ? 'Save as new' : 'Save'}</button>
      </div>`, root => {
      const coll = root.querySelector('#sColl');
      coll.addEventListener('change', () => { root.querySelector('#sNewWrap').hidden = coll.value !== '__new'; if (coll.value === '__new') root.querySelector('#sNew').focus(); });
      const doSave = asNew => {
        let c = coll.value;
        if (c === '__new') { c = root.querySelector('#sNew').value.trim(); if (!c) { toast('Name the new collection'); return; } if (!lib.collections.includes(c)) lib.collections.push(c); }
        let name = root.querySelector('#sName').value.trim() || suggestName(hs);
        if (existing && !asNew && name === suggestName(hs)) name = existing.name;
        if (existing && !asNew) { Object.assign(existing, { name, collection: c, colors: hs, updated: Date.now() }); }
        else { const p = { id: uid(), name, collection: c, colors: hs, created: Date.now(), updated: Date.now() }; lib.palettes.unshift(p); state.libId = p.id; }
        store.set('swatch.lastColl', c);
        saveLib(); askPersist(); store.set('swatch.current', { colors: state.colors, mode: state.mode, libId: state.libId });
        closeSheet(); toast(`Saved to ${c}`); renderLibrary();
      };
      root.querySelector('#sGo').addEventListener('click', () => doSave(true));
      const up = root.querySelector('#sUpd'); if (up) up.addEventListener('click', () => doSave(false));
    });
  }
  $('#saveBtn').addEventListener('click', openSave);

  function renderLibrary() {
    const sel = $('#libColl'), curSel = sel.value || 'all';
    sel.innerHTML = `<option value="all">All palettes</option>` + lib.collections.map(c => `<option ${c === curSel ? 'selected' : ''}>${esc(c)}</option>`).join('') + `<option value="__manage">Manage collections…</option>`;
    if (curSel === 'all') sel.value = 'all';
    const q = $('#libSearch').value.trim().toLowerCase().replace('#', '');
    const list = lib.palettes.filter(p => (sel.value === 'all' || p.collection === sel.value) &&
      (!q || p.name.toLowerCase().includes(q) || p.colors.some(h => h.toLowerCase().includes(q)) || p.colors.some(h => C.nameOf(h).toLowerCase().includes(q))));
    const box = $('#libList');
    if (!lib.palettes.length) { box.innerHTML = `<div class="empty">No saved palettes yet.<br>Tap <b>Save</b> on the Create tab.</div>`; return; }
    if (!list.length) { box.innerHTML = `<div class="empty">Nothing matches.</div>`; return; }
    box.innerHTML = list.map(p => `
      <div class="card" data-id="${p.id}">
        <button class="bar" data-act="open" aria-label="Open ${esc(p.name)}">${p.colors.map(h => `<span style="background:${h}"></span>`).join('')}</button>
        <div class="meta">
          <div><b>${esc(p.name)}</b><small>${esc(p.collection)} · ${p.colors.length} colors · ${new Date(p.updated || p.created).toLocaleDateString()}</small></div>
          <button class="icon-btn" data-act="more" aria-label="More for ${esc(p.name)}">⋯</button>
        </div>
      </div>`).join('');
  }
  $('#libSearch').addEventListener('input', renderLibrary);
  $('#libColl').addEventListener('change', e => { if (e.target.value === '__manage') { e.target.value = 'all'; renderLibrary(); manageCollections(); } else renderLibrary(); });
  $('#libList').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const p = lib.palettes.find(x => x.id === b.closest('.card').dataset.id); if (!p) return;
    if (b.dataset.act === 'open') openFromLib(p);
    else paletteMenu(p);
  });
  function openFromLib(p) { setColors(p.colors); state.libId = p.id; store.set('swatch.current', { colors: state.colors, mode: state.mode, libId: p.id }); showView('create'); toast(`Opened ${p.name}`); }

  function paletteMenu(p) {
    openSheet(`
      <h2 class="st">${esc(p.name)}</h2>
      <div class="strip">${p.colors.map(h => `<button data-h="${h}" style="background:${h};color:${C.textOn(h)}">${h.slice(1)}</button>`).join('')}</div>
      ${p.note ? `<p class="small" style="line-height:1.45">${esc(p.note)}</p>` : ''}
      <div class="specs">${p.colors.map(h => { const sp = SPECS[h]; return `<div class="spec"><span style="background:${h}"></span><div><b>${esc(C.nameOf(h))}</b><small>${h}${sp ? ` · ${esc(sp.pms)} · CMYK ${esc(sp.cmyk)}` : ''} · RGB ${C.hexToRgb(h).join('/')}</small></div></div>`; }).join('')}</div>
      <p class="muted small">Tap a color to copy it.</p>
      <label class="field">Name<input id="pName" value="${esc(p.name)}" maxlength="60"></label>
      <label class="field">Collection<select id="pColl">${collOptions(p.collection)}</select></label>
      <label class="field" id="pNewWrap" hidden>New collection name<input id="pNew" maxlength="40"></label>
      <div class="row gap">
        <button class="pill primary" data-a="open">Open</button>
        <button class="pill" data-a="export">Export</button>
        <button class="pill" data-a="dup">Duplicate</button>
        <button class="pill danger" data-a="del" style="margin-left:auto">Delete</button>
      </div>`, root => {
      root.querySelector('.strip').addEventListener('click', e => { const b = e.target.closest('button'); if (b) copy(b.dataset.h, 'Copied ' + b.dataset.h); });
      const nm = root.querySelector('#pName'), coll = root.querySelector('#pColl');
      nm.addEventListener('change', () => { p.name = nm.value.trim() || p.name; saveLib(); renderLibrary(); });
      coll.addEventListener('change', () => {
        root.querySelector('#pNewWrap').hidden = coll.value !== '__new';
        if (coll.value !== '__new') { p.collection = coll.value; saveLib(); renderLibrary(); }
      });
      root.querySelector('#pNew').addEventListener('change', e => { const c = e.target.value.trim(); if (!c) return; if (!lib.collections.includes(c)) lib.collections.push(c); p.collection = c; saveLib(); renderLibrary(); toast(`Moved to ${c}`); });
      root.querySelector('.row.gap').addEventListener('click', e => {
        const a = e.target.closest('button[data-a]'); if (!a) return;
        if (a.dataset.a === 'open') { closeSheet(); openFromLib(p); }
        else if (a.dataset.a === 'export') { closeSheet(); openExport(p.colors); }
        else if (a.dataset.a === 'dup') { const d = { ...p, id: uid(), name: p.name + ' copy', created: Date.now(), updated: Date.now(), colors: p.colors.slice() }; lib.palettes.splice(lib.palettes.indexOf(p), 0, d); saveLib(); closeSheet(); renderLibrary(); toast('Duplicated'); }
        else if (a.dataset.a === 'del') {
          const idx = lib.palettes.indexOf(p); lib.palettes.splice(idx, 1); saveLib(); closeSheet(); renderLibrary();
          // Undo can only put the palette back once, and only if it isn't already there.
          toast(`Deleted ${p.name}`, 'Undo', () => { if (lib.palettes.some(x => x.id === p.id)) return; lib.palettes.splice(Math.min(idx, lib.palettes.length), 0, p); saveLib(); renderLibrary(); toast(`Restored ${p.name}`); });
        }
      });
    });
  }

  function manageCollections() {
    const draw = root => {
      root.querySelector('#mcList').innerHTML = lib.collections.map((c, i) => {
        const n = lib.palettes.filter(p => p.collection === c).length;
        return `<div class="row"><input class="hexin" style="flex:1;text-transform:none;font-weight:600" data-i="${i}" value="${esc(c)}" maxlength="40" aria-label="Collection name"><span class="muted small">${n}</span><button class="icon-btn" data-del="${i}" aria-label="Delete ${esc(c)}" ${lib.collections.length <= 1 ? 'disabled' : ''}>✕</button></div>`;
      }).join('');
    };
    openSheet(`<h2 class="st">Collections</h2><div id="mcList"></div>
      <div class="row"><input class="hexin" id="mcNew" style="flex:1;text-transform:none" placeholder="New collection" aria-label="New collection name"><button class="pill primary" id="mcAdd">Add</button></div>
      <p class="muted small">Deleting a collection moves its palettes to ${esc(defaultColl())}.</p>`, root => {
      draw(root);
      root.addEventListener('change', e => {
        const i = e.target.dataset.i; if (i == null) return;
        const old = lib.collections[i], nw = e.target.value.trim(); if (!nw || lib.collections.includes(nw)) { e.target.value = old; return; }
        lib.collections[i] = nw; lib.palettes.forEach(p => { if (p.collection === old) p.collection = nw; }); saveLib(); renderLibrary();
      });
      root.addEventListener('click', e => {
        const d = e.target.closest('[data-del]');
        if (d) { const old = lib.collections[+d.dataset.del], to = defaultColl(old); lib.collections.splice(+d.dataset.del, 1); lib.palettes.forEach(p => { if (p.collection === old) p.collection = to; }); saveLib(); draw(root); renderLibrary(); toast(`Deleted ${old}. Its palettes moved to ${to}.`); }
        if (e.target.id === 'mcAdd') { const v = root.querySelector('#mcNew').value.trim(); if (v && !lib.collections.includes(v)) { lib.collections.push(v); saveLib(); draw(root); renderLibrary(); root.querySelector('#mcNew').value = ''; } }
      });
    });
  }

  $('#backupBtn').addEventListener('click', () => {
    const txt = JSON.stringify({ app: 'swatch', version: 1, saved: new Date().toISOString(), ...lib });
    copy(txt, 'Backup copied — paste it somewhere safe'); markBackup();
  });
  $('#backupFileBtn').addEventListener('click', () => {
    const txt = JSON.stringify({ app: 'swatch', version: 1, saved: new Date().toISOString(), ...lib }, null, 2);
    saveFile(new Blob([txt], { type: 'application/json' }), `swatch-backup-${new Date().toISOString().slice(0, 10)}.json`, 'Backup file saved'); markBackup();
  });
  $('#pasteRestore').addEventListener('click', () => {
    openSheet(`<h2 class="st">Restore from backup</h2><label class="small" for="rsTxt" style="display:block;margin-bottom:6px">Paste the backup text you copied earlier. Palettes you already have are kept.</label><textarea id="rsTxt" rows="6" style="width:100%;border-radius:10px;border:1px solid var(--line);background:var(--bg);padding:10px;font:12px ui-monospace,monospace"></textarea><div class="row gap"><button class="pill primary" id="rsGo">Restore</button></div>`, root => {
      root.querySelector('#rsGo').addEventListener('click', () => { if (restoreFrom(root.querySelector('#rsTxt').value)) closeSheet(); });
    });
  });
  function restoreFrom(text) {
    try {
      const d = JSON.parse(text);
      if (!Array.isArray(d.palettes)) throw 0;
      let added = 0;
      for (const p of d.palettes) {
        const cols = (p.colors || []).map(C.normHex).filter(Boolean);
        if (cols.length < MIN || lib.palettes.some(x => x.id === p.id)) continue;
        const np = { id: p.id || uid(), name: String(p.name || suggestName(cols)).slice(0, 60), collection: String(p.collection || defaultColl()).slice(0, 40), colors: cols.slice(0, MAX), created: p.created || Date.now(), updated: p.updated || Date.now() };
        if (typeof p.note === 'string') np.note = p.note.slice(0, 600);
        lib.palettes.push(np);
        added++;
      }
      for (const c of d.collections || []) if (typeof c === 'string' && !lib.collections.includes(c)) lib.collections.push(c.slice(0, 40));
      lib.palettes.forEach(p => { if (!lib.collections.includes(p.collection)) lib.collections.push(p.collection); });
      saveLib(); renderLibrary(); toast(added ? `Restored ${added} palette${added === 1 ? '' : 's'}` : 'You already have all of these palettes'); return true;
    } catch { toast("That isn't a Swatch backup"); return false; }
  }
  $('#restoreIn').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) restoreFrom(await f.text()); });

  // ---------- photo ----------
  const pc = $('#photoCanvas'), px2d = pc.getContext('2d', { willReadFrequently: true });
  let photo = { px: null, scale: 1, picks: [], sel: 0 };
  $('#fileIn').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) loadPhoto(f); });
  const drop = $('#drop');
  drop.addEventListener('click', () => $('#fileIn').click());
  $('#restoreBtn').addEventListener('click', () => $('#restoreIn').click());
  ['dragover', 'dragenter'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); }));
  drop.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) loadPhoto(f); });

  function loadPhoto(file) {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const max = 1200, s = Math.min(1, max / Math.max(img.width, img.height));
      pc.width = Math.round(img.width * s); pc.height = Math.round(img.height * s);
      px2d.drawImage(img, 0, 0, pc.width, pc.height);
      URL.revokeObjectURL(url);
      // sample from a small copy for speed
      const sm = document.createElement('canvas'), ss = Math.min(1, 220 / Math.max(pc.width, pc.height));
      sm.width = Math.max(1, Math.round(pc.width * ss)); sm.height = Math.max(1, Math.round(pc.height * ss));
      const sx = sm.getContext('2d'); sx.drawImage(pc, 0, 0, sm.width, sm.height);
      photo.px = C.samplePixels(sx.getImageData(0, 0, sm.width, sm.height).data, sm.width, sm.height);
      photo.scale = 1 / ss;
      $('#photoWrap').hidden = false; $('#photoCtrls').hidden = false; drop.querySelector('span').textContent = 'Choose a different photo'; drop.classList.add('small');
      extract();
    };
    img.onerror = () => toast("Couldn't open that image");
    img.src = url;
  }
  function extract() {
    if (!photo.px) return;
    const k = +$('#photoCount').value;
    photo.picks = C.photoPalette(photo.px, k, $('#photoStyle').value).map(c => ({ hex: c.hex, x: c.x * photo.scale, y: c.y * photo.scale }));
    photo.sel = 0; drawPhoto();
  }
  function drawPhoto() {
    $('#photoStrip').innerHTML = photo.picks.map((p, i) => `<button class="${i === photo.sel ? 'sel' : ''}" data-i="${i}" style="background:${p.hex};color:${C.textOn(p.hex)}" aria-label="Color ${i + 1} ${p.hex}">${p.hex.slice(1)}</button>`).join('');
    $('#markers').innerHTML = photo.picks.map((p, i) => `<button type="button" class="marker ${i === photo.sel ? 'sel' : ''}" data-i="${i}" style="left:${(p.x / pc.width) * 100}%;top:${(p.y / pc.height) * 100}%;background:${p.hex}" aria-label="Color ${i + 1}, ${p.hex}. Drag, or use arrow keys, to pick a different spot"></button>`).join('');
  }
  $('#photoStrip').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { photo.sel = +b.dataset.i; drawPhoto(); } });
  $('#photoCount').addEventListener('input', e => { $('#photoCountLbl').textContent = e.target.value; });
  $('#photoCount').addEventListener('change', extract);
  $('#photoStyle').addEventListener('change', extract);
  $('#photoAgain').addEventListener('click', extract);
  // Repicking: only dragging a marker changes a color. A tap or scroll on the photo itself does nothing.
  const pickXY = (i, x, y) => {
    x = Math.max(0, Math.min(pc.width - 1, x)); y = Math.max(0, Math.min(pc.height - 1, y));
    const d = px2d.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    const p = photo.picks[i]; if (!p) return;
    Object.assign(p, { hex: C.rgbToHex(d[0], d[1], d[2]), x, y });
  };
  const moveMarker = (i, e) => {
    const r = pc.getBoundingClientRect();
    pickXY(i, ((e.clientX - r.left) / r.width) * pc.width, ((e.clientY - r.top) / r.height) * pc.height);
    const m = $('#markers').children[i]; const p = photo.picks[i];
    if (m) { m.style.left = (p.x / pc.width) * 100 + '%'; m.style.top = (p.y / pc.height) * 100 + '%'; m.style.background = p.hex; }
  };
  let dragMark = null;
  $('#markers').addEventListener('pointerdown', e => {
    const m = e.target.closest('.marker'); if (!m) return;
    e.preventDefault();
    const i = +m.dataset.i; photo.sel = i; dragMark = { i, id: e.pointerId };
    m.setPointerCapture(e.pointerId);
    $$('#markers .marker').forEach(x => x.classList.toggle('sel', x === m));
  });
  $('#markers').addEventListener('pointermove', e => { if (dragMark && e.pointerId === dragMark.id) moveMarker(dragMark.i, e); });
  const endMark = () => { if (!dragMark) return; dragMark = null; drawPhoto(); };
  $('#markers').addEventListener('pointerup', endMark);
  $('#markers').addEventListener('pointercancel', endMark);
  $('#markers').addEventListener('keydown', e => {
    const m = e.target.closest('.marker'); if (!m) return;
    const step = Math.max(2, Math.round(pc.width / 60)), d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    const i = +m.dataset.i, p = photo.picks[i]; photo.sel = i;
    pickXY(i, p.x + d[0], p.y + d[1]); drawPhoto();
    const again = $('#markers').children[i]; if (again) again.focus();
  });
  $('#photoUse').addEventListener('click', () => { if (!photo.picks.length) return; setColors(photo.picks.map(p => p.hex)); showView('create'); toast('Palette from photo'); });

  // ---------- contrast ----------
  let ccTarget = 'fg';
  function setCC(which, hex) {
    hex = C.normHex(hex); if (!hex) return;
    $('#cc' + (which === 'fg' ? 'Fg' : 'Bg')).value = hex.toLowerCase();
    $('#cc' + (which === 'fg' ? 'Fg' : 'Bg') + 'Hex').value = hex;
    updateCC();
  }
  function updateCC() {
    const fg = C.normHex($('#ccFg').value), bg = C.normHex($('#ccBg').value);
    const r = C.contrast(fg, bg);
    $('#ccPreview').style.background = bg; $('#ccPreview').style.color = fg;
    $('#ccRatio').textContent = (Math.floor(r * 100) / 100).toFixed(2);
    const tests = [['AA normal', 4.5], ['AA large', 3], ['AAA normal', 7], ['AAA large', 4.5], ['Icons & UI', 3]];
    $('#ccBadges').innerHTML = tests.map(([n, t]) => `<span class="badge ${r >= t ? 'pass' : 'fail'}">${r >= t ? '✓' : '✕'} ${n}</span>`).join('');
    $('#ccFix').hidden = r >= 4.5;
    store.set('swatch.cc', { fg, bg });
  }
  function renderContrast() {
    const hs = hexes();
    $('#ccChips').innerHTML = hs.map(h => `<button class="chip" data-h="${h}" style="background:${h};color:${C.textOn(h)}" aria-label="Use ${h} as ${ccTarget === 'fg' ? 'text' : 'background'}">${h.slice(1)}</button>`).join('');
    const all = [...new Set(hs.concat(['#FFFFFF', '#000000']))];
    // Rows are text colors, columns are backgrounds. Ratios are rounded down, so a fail never shows as a pass.
    let t = '<caption class="sr">Contrast of each palette color as text (rows) on each as background (columns)</caption><tr><th scope="col"><span class="sr">Text color, then background</span></th>' + all.map(h => `<th scope="col"><span class="dot2" style="background:${h}"></span><span class="sr">Background ${h}</span></th>`).join('') + '</tr>';
    for (const fg of all) {
      t += `<tr><th scope="row"><span class="dot2" style="background:${fg}"></span><span class="sr">Text ${fg}</span></th>`;
      for (const bg of all) {
        if (fg === bg) { t += '<td></td>'; continue; }
        const r = C.contrast(fg, bg), shown = (Math.floor(r * 10) / 10).toFixed(1);
        const lvl = r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'Large' : '';
        // "Aa" shows the pair itself; the ratio is printed in black or white so it can always be read.
        t += `<td class="${r < 3 ? 'fail' : ''}"><button type="button" data-fg="${fg}" data-bg="${bg}" style="background:${bg};color:${C.textOn(bg)}" aria-label="${fg} text on ${bg}: ${shown} to 1${lvl ? ', passes ' + (lvl === 'Large' ? 'for large text only' : lvl) : ', fails'}"><span class="aa" aria-hidden="true" style="color:${fg}">Aa</span><span class="rt">${lvl ? '' : '✕ '}${shown}</span></button></td>`;
      }
      t += '</tr>';
    }
    $('#ccGrid').innerHTML = t;
    updateCC();
  }
  $('#ccChips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) setCC(ccTarget, b.dataset.h); });
  $('#ccGrid').addEventListener('click', e => { const b = e.target.closest('button[data-fg]'); if (!b) return; setCC('fg', b.dataset.fg); setCC('bg', b.dataset.bg); $('#view-contrast').scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); toast(`Checking ${b.dataset.fg} on ${b.dataset.bg}`); });
  $('#ccTarget').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; ccTarget = b.dataset.t; $$('#ccTarget button').forEach(x => { x.classList.toggle('primary', x === b); x.setAttribute('aria-pressed', x === b); }); renderContrast(); });
  $('#ccFg').addEventListener('input', e => { $('#ccFgHex').value = C.normHex(e.target.value); updateCC(); });
  $('#ccBg').addEventListener('input', e => { $('#ccBgHex').value = C.normHex(e.target.value); updateCC(); });
  ['Fg', 'Bg'].forEach(k => $('#cc' + k + 'Hex').addEventListener('input', e => { let v = e.target.value.trim(); if (!v.startsWith('#')) v = '#' + v; const n = C.normHex(v); if (n) { $('#cc' + k).value = n.toLowerCase(); updateCC(); } }));
  $('#ccSwap').addEventListener('click', () => { const f = $('#ccFg').value, b = $('#ccBg').value; setCC('fg', b); setCC('bg', f); });
  $('#ccFix').addEventListener('click', () => {
    const fg = C.normHex($('#ccFg').value), bg = C.normHex($('#ccBg').value);
    const [h, s, l] = C.hexToHsl(fg);
    const goLight = C.luminance(bg) < 0.18;
    let best = null;
    for (let step = 0; step <= 100; step++) {
      const L = goLight ? Math.min(1, l + step / 100) : Math.max(0, l - step / 100);
      const cand = C.hslToHex(h, s, L);
      if (C.contrast(cand, bg) >= 4.5) { best = cand; break; }
    }
    if (!best) best = goLight ? '#FFFFFF' : '#000000';
    setCC('fg', best); toast(`Text nudged to ${best}`);
  });

  // ---------- views ----------
  function showView(v) {
    $$('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v));
    $$('.tab').forEach(t => { const on = t.dataset.view === v; t.classList.toggle('active', on); if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    $('#createActions').style.visibility = v === 'create' ? 'visible' : 'hidden';
    if (v === 'library') { renderLibrary(); renderBackupNote(); }
    if (v === 'create') fitRows();
    if (v === 'contrast') renderContrast();
    store.set('swatch.view', v);
  }
  $$('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));

  // ---------- keeping palettes safe ----------
  // Ask the browser not to clear Swatch's storage (Safari can clear sites that go unvisited, unless installed).
  function askPersist() { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { }); } catch { } }
  const ownPalettes = () => lib.palettes.filter(p => !isBuiltin(p)).length;
  function markBackup() { store.set('swatch.lastBackup', Date.now()); renderBackupNote(); }
  function renderBackupNote() {
    const el = $('#backupNote'); if (!el) return;
    const last = store.get('swatch.lastBackup', 0), n = ownPalettes();
    const days = last ? Math.floor((Date.now() - last) / 864e5) : null;
    const when = last ? new Date(last).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
    el.classList.toggle('warn', n > 0 && (!last || days >= 30));
    el.textContent = !n ? 'Palettes live on this device only.'
      : !last ? `You have ${n} palette${n === 1 ? '' : 's'} saved only on this device and no backup yet. Save a backup file so a cleared browser can't lose them.`
      : days >= 30 ? `Last backup ${when}, ${days} days ago. Save a new backup file to keep recent palettes safe.`
      : `Last backup ${when}. Palettes live on this device; restore a backup file to move them to another one.`;
  }

  // ---------- helpers ----------
  async function saveFile(blob, name, okMsg) {
    const file = new File([blob], name, { type: blob.type });
    if (/iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(okMsg || 'Saved');
  }
  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { } ta.remove();
    }
    toast(msg || 'Copied');
  }
  let tt, tclear;
  function hideToast() {
    const t = $('#toast'); t.classList.remove('show');
    // Remove the message (and any Undo button) once it has faded, so nothing invisible stays tappable.
    clearTimeout(tclear); tclear = setTimeout(() => { if (!t.classList.contains('show')) t.innerHTML = ''; }, 250);
  }
  function toast(msg, actLabel, act) {
    const t = $('#toast'); clearTimeout(tt); clearTimeout(tclear);
    t.innerHTML = esc(msg) + (actLabel ? ` <button type="button">${esc(actLabel)}</button>` : '');
    if (actLabel) { let used = false; t.querySelector('button').onclick = () => { if (used) return; used = true; hideToast(); act(); }; }
    t.classList.add('show'); tt = setTimeout(hideToast, actLabel ? 6000 : 2000);
  }

  // ---------- boot ----------
  state.mode = store.get('swatch.mode', 'auto'); $('#mode').value = state.mode;
  const fromUrl = readHash();
  const saved = store.get('swatch.current', null);
  if (fromUrl) state.colors = fromUrl.map(hex => ({ hex, locked: false }));
  else if (saved && saved.colors && saved.colors.length >= MIN) { state.colors = saved.colors; state.libId = saved.libId || null; }
  else state.colors = C.generate(5, state.mode).colors.map(hex => ({ hex, locked: false }));
  render();
  const cc = store.get('swatch.cc', null);
  if (cc) { setCC('fg', cc.fg); setCC('bg', cc.bg); } else updateCC();
  window.addEventListener('hashchange', () => { const h = readHash(); if (h && h.join() !== hexes().join()) setColors(h); });
  showView(store.get('swatch.view', 'create'));

  if (ownPalettes()) askPersist();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
  window.__swatch = { state, lib, generate, showView };
})();
