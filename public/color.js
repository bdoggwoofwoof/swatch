/* Swatch color math: conversions, harmony generation, photo extraction, contrast. */
(function (g) {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const wrap = h => ((h % 360) + 360) % 360;

  function hexToRgb(hex) {
    let h = String(hex).trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function normHex(hex) { const c = hexToRgb(hex); return c ? rgbToHex(...c) : null; }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hslToRgb(h, s, l) {
    h = wrap(h) / 360;
    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  const hexToHsl = hex => rgbToHsl(...hexToRgb(hex));
  const hslToHex = (h, s, l) => rgbToHex(...hslToRgb(h, clamp(s), clamp(l)));

  // sRGB -> linear -> XYZ -> Lab (D65)
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  function rgbToLab(r, g, b) {
    const R = lin(r), G = lin(g), B = lin(b);
    let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    let y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
    let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    x = f(x); y = f(y); z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  const labDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }
  function contrast(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  // Pure white or pure black: one of the two always reaches at least 4.58:1 on any color.
  const textOn = hex => (contrast(hex, '#FFFFFF') >= contrast(hex, '#000000') ? '#FFFFFF' : '#000000');

  // Nearest color name (Lab distance) from window.COLOR_NAMES [[name, hex], ...]
  let nameLabs = null;
  function nameOf(hex) {
    const exact = (g.CUSTOM_NAMES || {})[String(hex).toUpperCase()];
    if (exact) return exact;
    const list = g.COLOR_NAMES || [];
    if (!nameLabs) nameLabs = list.map(([n, h]) => [n, rgbToLab(...hexToRgb(h))]);
    const lab = rgbToLab(...hexToRgb(hex));
    let best = 'Color', bd = Infinity;
    for (const [n, l] of nameLabs) { const d = labDist(lab, l); if (d < bd) { bd = d; best = n; } }
    return best;
  }

  // Shades: from near-black to near-white through the color.
  function shades(hex, n = 15) {
    const [h, s] = hexToHsl(hex);
    const out = [];
    for (let i = 0; i < n; i++) {
      const l = 0.06 + (0.9 * i) / (n - 1);
      const sat = s * (1 - Math.abs(l - 0.5) * 0.6);
      out.push(hslToHex(h, sat, l));
    }
    return out;
  }

  // Harmony hue offsets
  const MODES = {
    analogous: [0, 25, -25, 50, -50, 12, -12, 38, -38, 60],
    monochrome: [0],
    complementary: [0, 180],
    split: [0, 150, 210],
    triadic: [0, 120, 240],
    tetradic: [0, 60, 180, 240],
    square: [0, 90, 180, 270],
    shades: [0],
  };
  const MODE_KEYS = ['analogous', 'monochrome', 'complementary', 'split', 'triadic', 'tetradic', 'square'];

  // Generate n colors. `fixed` is an array (len n) with hex or null; locked stay put.
  function generate(n, mode, fixed) {
    fixed = fixed || [];
    let m = mode === 'auto' ? MODE_KEYS[Math.floor(Math.random() * MODE_KEYS.length)] : mode;
    const anchor = fixed.find(Boolean);
    let baseH, baseS;
    if (anchor) { const [h, s] = hexToHsl(anchor); baseH = h; baseS = Math.max(s, 0.25); }
    else { baseH = rand(0, 360); baseS = rand(0.45, 0.85); }
    const offs = MODES[m] || MODES.analogous;

    // spread lightness across the slots so the palette has range
    const lights = [];
    const lo = rand(0.14, 0.3), hi = rand(0.78, 0.94);
    for (let i = 0; i < n; i++) lights.push(n === 1 ? 0.5 : lo + ((hi - lo) * i) / (n - 1));
    if (m !== 'shades' && m !== 'monochrome') {
      // gentle shuffle so hues don't always sort dark->light
      for (let i = lights.length - 1; i > 0; i--) if (Math.random() < 0.35) { const j = Math.floor(Math.random() * (i + 1)); [lights[i], lights[j]] = [lights[j], lights[i]]; }
    }

    const out = [];
    for (let i = 0; i < n; i++) {
      if (fixed[i]) { out.push(fixed[i]); continue; }
      let h, s, l = lights[i];
      if (m === 'shades') { h = baseH; s = baseS * (1 - Math.abs(l - 0.5) * 0.5); }
      else if (m === 'monochrome') { h = baseH + rand(-6, 6); s = clamp(baseS + rand(-0.25, 0.15), 0.12, 0.95); }
      else {
        h = baseH + offs[i % offs.length] + rand(-8, 8);
        s = clamp(baseS + rand(-0.2, 0.15), 0.18, 0.95);
        // occasional near-neutral for breathing room
        if (n >= 4 && Math.random() < 0.18) s = rand(0.04, 0.16);
      }
      // keep mid-light colors from going neon (greens/yellows/cyans read loudest)
      const hh = wrap(h);
      const loud = hh > 50 && hh < 200 ? 0.62 : 0.78;
      if (l > 0.35 && l < 0.75) s = Math.min(s, loud + (Math.abs(l - 0.55) * 0.6));
      out.push(hslToHex(h, s, l));
    }
    return { colors: out, mode: m };
  }

  // ---- Photo extraction: k-means in Lab on sampled pixels ----
  function samplePixels(data, w, h, max = 6000) {
    const step = Math.max(1, Math.floor(Math.sqrt((w * h) / max)));
    const px = [];
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue;
      const rgb = [data[i], data[i + 1], data[i + 2]];
      px.push({ rgb, lab: rgbToLab(...rgb), x, y });
    }
    return px;
  }
  function kmeans(px, k, iters = 12) {
    if (!px.length) return [];
    k = Math.min(k, px.length);
    // k-means++ seeding
    const cents = [px[Math.floor(Math.random() * px.length)].lab.slice()];
    while (cents.length < k) {
      const d = px.map(p => Math.min(...cents.map(c => labDist(p.lab, c))) ** 2);
      const sum = d.reduce((a, b) => a + b, 0) || 1;
      let r = Math.random() * sum, idx = 0;
      for (; idx < d.length - 1; idx++) { r -= d[idx]; if (r <= 0) break; }
      cents.push(px[idx].lab.slice());
    }
    const asg = new Array(px.length).fill(0);
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < px.length; i++) {
        let bi = 0, bd = Infinity;
        for (let c = 0; c < k; c++) { const d = labDist(px[i].lab, cents[c]); if (d < bd) { bd = d; bi = c; } }
        asg[i] = bi;
      }
      const acc = cents.map(() => [0, 0, 0, 0]);
      for (let i = 0; i < px.length; i++) { const a = acc[asg[i]], l = px[i].lab; a[0] += l[0]; a[1] += l[1]; a[2] += l[2]; a[3]++; }
      acc.forEach((a, c) => { if (a[3]) cents[c] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
    }
    // For each cluster, pick the real pixel nearest the center (so markers sit on actual spots)
    const clusters = cents.map(c => ({ center: c, size: 0, best: null, bd: Infinity, mx: 0, my: 0 }));
    for (let i = 0; i < px.length; i++) {
      const cl = clusters[asg[i]]; cl.size++; cl.mx += px[i].x; cl.my += px[i].y;
      const d = labDist(px[i].lab, cl.center);
      if (d < cl.bd) cl.bd = d;
    }
    clusters.forEach(cl => { if (cl.size) { cl.mx /= cl.size; cl.my /= cl.size; } cl.pd = Infinity; });
    // among pixels close to the center color, take the one nearest the cluster's middle (not the image edge)
    for (let i = 0; i < px.length; i++) {
      const cl = clusters[asg[i]];
      if (labDist(px[i].lab, cl.center) > cl.bd + 3) continue;
      const pd = Math.hypot(px[i].x - cl.mx, px[i].y - cl.my);
      if (pd < cl.pd) { cl.pd = pd; cl.best = px[i]; }
    }
    return clusters.filter(c => c.best).map(c => ({ hex: rgbToHex(...c.best.rgb), x: c.best.x, y: c.best.y, size: c.size, lab: c.best.lab }));
  }
  function photoPalette(px, k, style) {
    let pool = px;
    if (style !== 'main') {
      const score = p => {
        const [h, s, l] = rgbToHsl(...p.rgb);
        if (style === 'vivid') return s * (1 - Math.abs(l - 0.5) * 1.4);
        if (style === 'muted') return (1 - s) * (1 - Math.abs(l - 0.5));
        if (style === 'bright') return l + s * 0.3;
        if (style === 'dark') return 1 - l;
        return 0;
      };
      const sorted = px.slice().sort((a, b) => score(b) - score(a));
      pool = sorted.slice(0, Math.max(k * 40, Math.floor(px.length * 0.3)));
    }
    let cl = kmeans(pool, Math.min(k + 2, 12));
    // drop near-duplicates, keep the biggest, then trim to k
    cl.sort((a, b) => b.size - a.size);
    const kept = [];
    for (const c of cl) if (!kept.some(k2 => labDist(k2.lab, c.lab) < 10)) kept.push(c);
    for (const c of cl) if (kept.length < k && !kept.includes(c)) kept.push(c);
    const res = kept.slice(0, k);
    res.sort((a, b) => a.lab[0] - b.lab[0]);
    return res;
  }

  g.Color = { clamp, hexToRgb, rgbToHex, normHex, rgbToHsl, hslToRgb, hexToHsl, hslToHex, rgbToLab, labDist, luminance, contrast, textOn, nameOf, shades, generate, samplePixels, photoPalette, MODES };
})(typeof window !== 'undefined' ? window : globalThis);
