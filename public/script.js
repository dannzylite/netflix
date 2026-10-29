/* ==========================================================================
   💌 NETFLIX & CHILL — DATE INVITATION
   Plain HTML + CSS + vanilla JS, plus two small Vercel functions that keep
   the keys on the server. No build step.

   Project layout
     public/                    the site (this file, index.html, styles.css, assets/)
     api/tmdb.mjs               movie data, adds the TMDB key server-side
     api/send-confirmation.mjs  designs and sends the HTML emails
     vercel.json                tells Vercel the site lives in public/
     .env                       your private copy of the keys (never committed)

   ── README ────────────────────────────────────────────────────────────────

   1) Keys live in environment variables, never in this file:
        TMDB_API_KEY         TMDB → Settings → API → "API Key"
        EMAILJS_PUBLIC_KEY   EmailJS → Account → Public Key
        EMAILJS_PRIVATE_KEY  EmailJS → Account → Security → Private Key
        EMAILJS_SERVICE_ID   EmailJS → Email Services
        EMAILJS_TEMPLATE_ID  EmailJS → Email Templates → your template → Settings
        MY_EMAIL             where your copy of the confirmation goes
        HER_EMAIL            optional: her copy only ever goes to this address
      Add them in Vercel → your project → Settings → Environment Variables (tick
      all environments), then redeploy. .env just keeps your own copy.

   2) EmailJS setup
      a. Email Services → Add New Service → Gmail → connect your account.
      b. Account → Security: turn on "Allow EmailJS API for non-browser
         applications" (emails are sent from the server) and the private key option.
      c. Email Templates → your template:
            Subject:     {{subject}}
            Content:     {{{html}}}     (code view; three braces keep the HTML intact)
            To Email:    {{to_email}}
            From Name:   {{from_name}}
            From Email:  keep "Use Default Email Address" ticked
            Reply To:    {{reply_to}}
         The email design lives in api/send-confirmation.mjs.
      The free plan allows 200 sends a month; each confirmation uses 2.

   3) The letter: edit LETTER below, between the backticks. Line breaks are kept.
      If your letter contains a backtick (`), write it as \`.

   4) Music: put a soft instrumental at public/assets/music.mp3 (or change MUSIC_SRC).
      It stays off until she taps the music button.

   5) Go live: push the project to GitHub (.env stays on your machine), then in
      Vercel → Add New → Project → import the repo. Leave the framework preset on
      "Other" and the build command empty; vercel.json does the rest. Every push
      redeploys, and preview links are a good place to test the emails.

   6) Test locally (optional): from the project folder run `npx vercel link` once,
      then `npx vercel dev` and open http://localhost:3000. It uses the variables
      from your Vercel project. Opening index.html directly still shows the letter,
      but movies and emails need the functions.
      Add ?reset to the URL to clear saved answers and replay from the envelope.
   ========================================================================== */

const CONFIG = {
  MY_NAME: 'Okorie',           // your name
  HER_NAME: 'Sarah',           // her name: shown on the envelope and pre-filled in the form
  REGION: 'CA',                // 2-letter country code for streaming availability (CA, US, GB, NG…)
  MUSIC_SRC: 'assets/music.mp3',
  // API keys and email addresses are deliberately NOT here. They live in Vercel's
  // environment variables, see the README above.
};

/* The letter. Typed out exactly as written, line breaks included. */
const LETTER = `My calm Sarah,

Somewhere between our first conversation and today, you quietly became one of my favourite parts of life. I still bless the day we started talking.

You are my best friend in the truest way. With you, I can talk about anything and everything, the serious, the silly, the things I'd never say out loud to anyone else, and I never once feel judged. Do you know how rare that is? You make my world feel calm, just like you.

I love you so, so much. I know you don't always like saying it back, and that's okay. I'll keep saying it enough for the both of us, and I'll keep hoping you feel it too.

But before all that, I have a much smaller, much cozier request…

Let me have you for one evening. Just you, me, a blanket, our favourite snacks, and whatever show or movie you choose. You pick everything, I just get to sit next to you and enjoy it.

So, my Sarah…

Will you go on a Netflix and chill date with me? 💕

Yours, always,
Daniel`;


(() => {
  'use strict';

  /* =====================================================================
     Constants
     ===================================================================== */
  const STORE_KEY = 'netflix-chill-invite-v1';
  const API = '/api'; // Vercel functions in the api/ folder
  const API_AVAILABLE = /^https?:$/.test(location.protocol); // not when opened as a file
  const IMG = 'https://image.tmdb.org/t/p/';
  const MAX_PICKS = 3;
  const MAX_GENRES = 3;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // Platforms are matched by name against TMDB's provider list for the region.
  // `prefer` only breaks ties (and is the fallback when TMDB can't be reached).
  const PLATFORMS = [
    { key: 'netflix', name: 'Netflix', match: /^netflix$/i, prefer: [8], brand: '#e50914', mono: 'N' },
    { key: 'prime', name: 'Prime Video', match: /^(amazon )?prime video$/i, prefer: [9, 119], brand: '#1a98ff', mono: 'prime' },
    { key: 'disney', name: 'Disney+', match: /^disney\s?(\+|plus)$/i, prefer: [337], brand: '#0b2a8f', mono: 'D+' },
    { key: 'apple', name: 'Apple TV+', match: /^apple tv(\s?(\+|plus))?$/i, prefer: [350], exclude: [2], brand: '#1d1d1f', mono: 'tv+' },
    { key: 'crave', name: 'Crave', match: /^crave$/i, prefer: [230], brand: '#1a56db', mono: 'crave' },
  ];

  const COUNTRIES = [
    { code: 'KR', label: 'K-Drama', flag: '🇰🇷' },
    { code: 'TR', label: 'Turkish', flag: '🇹🇷' },
    { code: 'NG', label: 'Nollywood', flag: '🇳🇬' },
    { code: 'IN', label: 'Bollywood / Indian', flag: '🇮🇳' },
    { code: 'JP', label: 'Japanese / Anime', flag: '🇯🇵' },
    { code: 'ES', label: 'Spanish', flag: '🇪🇸' },
    { code: 'US', label: 'Hollywood', flag: '🇺🇸' },
    { code: 'GB', label: 'British', flag: '🇬🇧' },
  ];

  const SNACKS = [
    { key: 'popcorn', label: 'Popcorn', emoji: '🍿' },
    { key: 'pizza', label: 'Pizza', emoji: '🍕' },
    { key: 'icecream', label: 'Ice cream', emoji: '🍦' },
    { key: 'chocolate', label: 'Chocolate', emoji: '🍫' },
    { key: 'wine', label: 'Wine', emoji: '🍷' },
    { key: 'suya', label: 'Suya/Shawarma', emoji: '🌯' },
    { key: 'chinchin', label: 'Chin chin', emoji: '🥨' },
    { key: 'surprise', label: 'Surprise me', emoji: '🎁' },
  ];

  const COZY = [
    { emoji: '😶', label: 'Sitting like strangers' },
    { emoji: '🙂', label: 'Polite couch buddies' },
    { emoji: '😊', label: 'Shoulder to shoulder' },
    { emoji: '🥰', label: 'Cuddle mode' },
    { emoji: '🌯', label: 'Full blanket burrito 🫶' },
  ];

  const TIMES = [
    { value: '18:00', label: '6pm' },
    { value: '19:00', label: '7pm' },
    { value: '20:00', label: '8pm' },
    { value: '21:00', label: '9pm' },
  ];

  const GENRE_PRIORITY = ['Romance', 'Comedy', 'Drama', 'Thriller', 'Horror', 'Animation', 'Mystery'];
  const GENRE_EMOJI = {
    Romance: '💘', Comedy: '😂', Drama: '🎭', Thriller: '🔪', Horror: '👻', Animation: '🧸', Mystery: '🕵️',
    Action: '💥', Adventure: '🗺️', 'Action & Adventure': '💥', Crime: '🚔', Documentary: '🎥', Family: '🏡',
    Fantasy: '🧚', History: '📜', Music: '🎵', 'Science Fiction': '🚀', 'Sci-Fi & Fantasy': '🚀', 'TV Movie': '📺',
    War: '⚔️', 'War & Politics': '🏛️', Western: '🤠', Kids: '🧒', News: '📰', Reality: '🌴', Soap: '🫧', Talk: '🎙️',
  };
  // Used when TMDB can't be reached (these are TMDB's real genre IDs).
  const FALLBACK_GENRES = {
    movie: [
      { id: 28, name: 'Action' }, { id: 12, name: 'Adventure' }, { id: 16, name: 'Animation' }, { id: 35, name: 'Comedy' },
      { id: 80, name: 'Crime' }, { id: 99, name: 'Documentary' }, { id: 18, name: 'Drama' }, { id: 10751, name: 'Family' },
      { id: 14, name: 'Fantasy' }, { id: 36, name: 'History' }, { id: 27, name: 'Horror' }, { id: 10402, name: 'Music' },
      { id: 9648, name: 'Mystery' }, { id: 10749, name: 'Romance' }, { id: 878, name: 'Science Fiction' },
      { id: 10770, name: 'TV Movie' }, { id: 53, name: 'Thriller' }, { id: 10752, name: 'War' }, { id: 37, name: 'Western' },
    ],
    tv: [
      { id: 10759, name: 'Action & Adventure' }, { id: 16, name: 'Animation' }, { id: 35, name: 'Comedy' },
      { id: 80, name: 'Crime' }, { id: 99, name: 'Documentary' }, { id: 18, name: 'Drama' }, { id: 10751, name: 'Family' },
      { id: 10762, name: 'Kids' }, { id: 9648, name: 'Mystery' }, { id: 10763, name: 'News' }, { id: 10764, name: 'Reality' },
      { id: 10765, name: 'Sci-Fi & Fantasy' }, { id: 10766, name: 'Soap' }, { id: 10767, name: 'Talk' },
      { id: 10768, name: 'War & Politics' }, { id: 37, name: 'Western' },
    ],
  };

  /* =====================================================================
     Small helpers
     ===================================================================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rand = (min, max) => Math.random() * (max - min) + min;
  const pad2 = (n) => String(n).padStart(2, '0');
  const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
  const motionOK = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const shortTitle = (t) => (t.length > 22 ? `${t.slice(0, 20)}…` : t);

  function debounce(fn, ms) {
    let t = 0;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function restartClass(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  let toastTimer = 0;
  function toast(msg, ms = 2800) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function announce(msg) {
    const a = $('#announcer');
    a.textContent = '';
    setTimeout(() => { a.textContent = msg; }, 60);
  }

  /* =====================================================================
     State (one object) + localStorage persistence
     ===================================================================== */
  const defaults = () => ({
    step: 1,
    accepted: false,
    platform: null,          // { key, name, ids, logo, names? }
    type: null,              // 'movie' | 'tv'
    genres: [],              // [{ id, name }]
    countries: [],           // ['KR', 'TR', …] — empty means "Any"
    picks: [],               // [{ key, id, mediaType, title, year, poster, rating }]
    winnerKey: null,         // the wheel's pick
    date: '',                // 'YYYY-MM-DD'
    time: '',                // 'HH:MM'
    snacks: [],
    cozy: 2,
    note: '',
    herName: CONFIG.HER_NAME || '',
    herEmail: '',
    confirmed: false,
    emailSent: { me: false, her: false },
  });

  const state = Object.assign(defaults(), sanitize(loadSaved()), {
    // Session-only values (never saved)
    temp: { editing: false, typeChanged: false, loosen: 0, sending: false, sendFailures: 0, copied: false },
  });

  function loadSaved() {
    let reset = false;
    try { reset = new URLSearchParams(location.search).has('reset'); } catch (e) { /* ignore */ }
    if (reset) {
      try { localStorage.removeItem(STORE_KEY); } catch (e) { /* storage unavailable */ }
      try {
        const url = new URL(location.href);
        url.searchParams.delete('reset');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      } catch (e) { /* ignore */ }
      return {};
    }
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return data && typeof data === 'object' ? data : {};
    } catch (e) {
      return {};
    }
  }

  // Only accept saved values whose type matches the defaults.
  function sanitize(saved) {
    const out = {};
    const def = defaults();
    Object.keys(def).forEach((k) => {
      if (!(k in saved)) return;
      const v = saved[k];
      const d = def[k];
      if (Array.isArray(d)) { if (Array.isArray(v)) out[k] = v; }
      else if (d === null) { out[k] = v; }
      else if (typeof d === 'object') { if (v && typeof v === 'object') out[k] = Object.assign({}, d, v); }
      else if (typeof v === typeof d) { out[k] = v; }
    });
    return out;
  }

  function save() {
    try {
      const { temp, ...data } = state;
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (e) { /* private mode / storage full: keep going without saving */ }
  }

  /* =====================================================================
     Formatting + shared details (ticket, emails, calendar)
     ===================================================================== */
  function whenDate() {
    if (!state.date || !state.time) return null;
    const [y, m, d] = state.date.split('-').map(Number);
    const [hh, mm] = state.time.split(':').map(Number);
    const dt = new Date(y, m - 1, d, hh, mm);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const fmtDateLong = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const fmtDateNoYear = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const fmtDateShort = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  function fmtTime(t) {
    const [h, m] = String(t).split(':').map(Number);
    return new Date(2000, 0, 1, h || 0, m || 0).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function details() {
    const herName = (state.herName || '').trim() || CONFIG.HER_NAME || 'You';
    const myName = CONFIG.MY_NAME || 'Me';
    const p = state.platform;
    const platform = !p ? '' : p.key === 'surprise' ? `Surprise me 🎲 (any of: ${(p.names || []).join(', ')})` : p.name;
    const type = state.type === 'tv' ? 'Series binge 📺' : state.type === 'movie' ? 'Movie night 🎬' : '';
    const genres = state.genres.length ? state.genres.map((g) => g.name).join(', ') : 'Any genre';
    const countries = state.countries.length
      ? state.countries.map((c) => { const x = COUNTRIES.find((k) => k.code === c); return x ? `${x.label} ${x.flag}` : c; }).join(', ')
      : 'Any 🌍';
    const picksArr = state.picks.map((pk, i) => {
      const bits = [pk.year, pk.mediaType === 'tv' ? 'Series' : 'Movie', pk.rating ? `★ ${pk.rating.toFixed(1)}` : ''].filter(Boolean).join(' · ');
      return `${i + 1}. ${pk.title}${bits ? ` (${bits})` : ''}${state.winnerKey === pk.key ? ' 👑 the wheel picked this one' : ''}`;
    });
    const dt = whenDate();
    const snacks = state.snacks.length
      ? state.snacks.map((k) => { const s = SNACKS.find((x) => x.key === k); return s ? `${s.label} ${s.emoji}` : k; }).join(', ')
      : 'Nothing picked';
    const cozyLevel = clampInt(state.cozy, 0, 4);
    return {
      herName,
      myName,
      platform,
      type,
      genres,
      countries,
      picks: picksArr.join('\n'),
      date: dt ? fmtDateLong(dt) : '',
      time: state.time ? fmtTime(state.time) : '',
      snacks,
      cozy: `${COZY[cozyLevel].label} (${cozyLevel + 1}/5)`,
      note: state.note.trim() || '—',
    };
  }

  function summaryText() {
    const d = details();
    return [
      'Netflix & Chill Date 💕',
      `When: ${d.date} at ${d.time}`,
      `Streaming on: ${d.platform}`,
      `Watching: ${d.type}`,
      `Genres: ${d.genres}`,
      `Vibe: ${d.countries}`,
      'Our picks:',
      d.picks || '—',
      `Snacks: ${d.snacks}`,
      `Cozy level: ${d.cozy}`,
      `Note: ${d.note}`,
    ].join('\n');
  }

  /* =====================================================================
     Background: stars, floating hearts & sparkles
     ===================================================================== */
  function buildStars() {
    const box = $('#stars');
    const n = window.innerWidth < 600 ? 60 : 110;
    let html = '';
    for (let i = 0; i < n; i++) {
      html += `<span class="star" style="left:${rand(0, 100).toFixed(2)}%;top:${rand(0, 88).toFixed(2)}%;--s:${rand(1, 2.6).toFixed(1)}px;--o:${rand(0.3, 0.9).toFixed(2)};--t:${rand(2, 5).toFixed(1)}s;--d:${(-rand(0, 5)).toFixed(1)}s"></span>`;
    }
    box.innerHTML = html;
  }

  function buildAmbient() {
    const box = $('#ambient');
    const small = window.innerWidth < 600;
    const hearts = small ? 10 : 16;
    const sparkles = small ? 12 : 20;
    let html = '';
    for (let i = 0; i < hearts + sparkles; i++) {
      const heart = i < hearts;
      const dur = heart ? rand(16, 30) : rand(12, 24);
      const size = heart ? rand(10, 24) : rand(5, 11);
      const op = heart ? rand(0.12, 0.3) : rand(0.3, 0.65);
      html += `<span class="floaty ${heart ? 'heart' : 'sparkle'}" style="--x:${rand(0, 100).toFixed(1)}%;--size:${size.toFixed(1)}px;--dur:${dur.toFixed(1)}s;--delay:${(-rand(0, dur)).toFixed(1)}s;--op:${op.toFixed(2)};--sway:${rand(10, 36).toFixed(0)}px"><i></i></span>`;
    }
    box.innerHTML = html;
  }

  /* =====================================================================
     Heart confetti (canvas)
     ===================================================================== */
  const confetti = (() => {
    const COLORS = ['#ff7aa8', '#ff4f7f', '#ffc2d4', '#f4c47b', '#fff1e0', '#e8456f'];
    let canvas = null;
    let ctx = null;
    let W = 0;
    let H = 0;
    let parts = [];
    let raf = 0;
    let last = 0;

    function init() {
      canvas = $('#confetti');
      ctx = canvas.getContext('2d');
      resize();
      window.addEventListener('resize', debounce(resize, 120));
    }

    function resize() {
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth || window.innerWidth;
      H = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function add(p) {
      parts.push(p);
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    }

    function particle(x, y, vx, vy, extra) {
      return Object.assign({
        x, y, vx, vy,
        g: rand(0.14, 0.24),
        size: rand(9, 17),
        rot: rand(0, Math.PI * 2),
        vr: rand(-0.12, 0.12),
        wob: rand(0, Math.PI * 2),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        shape: Math.random() < 0.8 ? 'heart' : 'dot',
        life: 0,
        ttl: rand(90, 150),
      }, extra);
    }

    // Burst of hearts from a point (e.g. the YES button)
    function burst(x, y, n = 60, power = 1) {
      if (!ctx || !motionOK()) return;
      for (let i = 0; i < n; i++) {
        const a = rand(-Math.PI * 0.92, -Math.PI * 0.08);
        const speed = rand(4, 11.5) * power;
        add(particle(x, y, Math.cos(a) * speed, Math.sin(a) * speed));
      }
    }

    // Hearts drifting down from the top
    function rain(n = 100) {
      if (!ctx || !motionOK()) return;
      for (let i = 0; i < n; i++) {
        add(particle(rand(0, W), rand(-H * 0.6, -20), rand(-1, 1), rand(1, 3), { g: rand(0.03, 0.06), ttl: rand(240, 360) }));
      }
    }

    function drawHeart(s) {
      ctx.beginPath();
      ctx.moveTo(0, s * 0.9);
      ctx.bezierCurveTo(-s * 1.3, 0, -s * 0.9, -s * 1.1, 0, -s * 0.42);
      ctx.bezierCurveTo(s * 0.9, -s * 1.1, s * 1.3, 0, 0, s * 0.9);
      ctx.fill();
    }

    function tick(now) {
      const dt = Math.min(3, (now - last) / 16.67);
      last = now;
      ctx.clearRect(0, 0, W, H);
      parts = parts.filter((p) => p.life < p.ttl && p.y < H + 40);
      parts.forEach((p) => {
        p.life += dt;
        p.vy += p.g * dt;
        p.vx *= Math.pow(0.985, dt);
        p.vy *= Math.pow(0.99, dt);
        p.wob += 0.08 * dt;
        p.x += (p.vx + Math.sin(p.wob) * 0.6) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ctx.globalAlpha = Math.max(0, Math.min(1, (p.ttl - p.life) / 30));
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.shape === 'heart') drawHeart(p.size / 2);
        else { ctx.beginPath(); ctx.arc(0, 0, p.size * 0.2, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      });
      ctx.globalAlpha = 1;
      if (parts.length) raf = requestAnimationFrame(tick);
      else { raf = 0; ctx.clearRect(0, 0, W, H); }
    }

    return {
      init,
      burst,
      rain,
      celebrate() {
        rain(110);
        burst(W * 0.2, H * 0.65, 45);
        burst(W * 0.8, H * 0.65, 45);
      },
    };
  })();

  /* =====================================================================
     Music toggle
     ===================================================================== */
  let audio = null;
  let musicOn = false;
  let fadeTimer = 0;

  function setMusicBtn(on) {
    const btn = $('#music-btn');
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Pause music' : 'Play music');
  }

  function fadeAudio(to, ms, done) {
    clearInterval(fadeTimer);
    if (!audio) return;
    const from = audio.volume;
    const start = performance.now();
    fadeTimer = setInterval(() => {
      if (!audio) { clearInterval(fadeTimer); return; }
      const t = Math.min(1, (performance.now() - start) / ms);
      try { audio.volume = from + (to - from) * t; } catch (e) { /* iOS: volume is read-only */ }
      if (t >= 1) { clearInterval(fadeTimer); if (done) done(); }
    }, 40);
  }

  async function toggleMusic() {
    if (musicOn) {
      musicOn = false;
      setMusicBtn(false);
      fadeAudio(0, 500, () => { if (audio && !musicOn) audio.pause(); });
      return;
    }
    musicOn = true;
    setMusicBtn(true);
    try {
      if (!audio) {
        audio = new Audio(CONFIG.MUSIC_SRC);
        audio.loop = true;
        audio.preload = 'auto';
      }
      audio.volume = 0;
      await audio.play();
      if (musicOn) fadeAudio(0.55, 1400);
    } catch (err) {
      if (err && err.name === 'AbortError') return; // paused again before it started
      musicOn = false;
      setMusicBtn(false);
      audio = null;
      toast("Couldn't play the music 🎵 (is assets/music.mp3 there?)");
      console.info('[invite] Music could not play:', err && err.message);
    }
  }

  /* =====================================================================
     Modals (focus trap, Escape, backdrop)
     ===================================================================== */
  let activeModal = null;
  let lastFocus = null;

  function focusables(root) {
    return $$('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select, [tabindex]:not([tabindex="-1"])', root)
      .filter((el) => !el.hidden && el.offsetParent !== null);
  }

  function openModal(modal) {
    lastFocus = document.activeElement;
    activeModal = modal;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    const first = modal.querySelector('[data-autofocus]') || focusables(modal)[0];
    if (first) first.focus({ preventScroll: true });
  }

  function closeModal() {
    if (!activeModal) return;
    activeModal.hidden = true;
    delete activeModal.dataset.locked;
    activeModal = null;
    document.body.classList.remove('modal-open');
    if (lastFocus && document.contains(lastFocus) && typeof lastFocus.focus === 'function') lastFocus.focus({ preventScroll: true });
  }

  function onModalKey(e) {
    if (!activeModal) return;
    if (e.key === 'Escape') {
      if (!activeModal.dataset.locked) { e.preventDefault(); closeModal(); }
      return;
    }
    if (e.key !== 'Tab') return;
    const f = focusables(activeModal);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0];
    const lastEl = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
  }

  /* =====================================================================
     Navigation
     ===================================================================== */
  let navToken = 0;

  function goTo(step, opts = {}) {
    const from = state.step;
    state.step = step;
    if (step >= 9) state.temp.editing = false;
    save();
    document.body.dataset.step = String(step);
    updateChrome();
    const enter = ENTER[step];
    const result = enter ? enter() : null;
    if (result && typeof result.catch === 'function') result.catch((err) => console.warn('[invite]', err));
    showSection(step, step >= from ? 1 : -1, !!opts.instant);
  }

  // Fade/slide the current section out and the target in.
  function showSection(step, dir, instant) {
    const token = ++navToken;
    const target = $(`#step-${step}`);
    const sections = $$('.step');
    const current = sections.find((s) => !s.hidden && s !== target);
    sections.forEach((s) => {
      if (s !== target && s !== current) {
        s.hidden = true;
        s.classList.remove('enter-fwd', 'enter-back', 'leave-fwd', 'leave-back');
      }
    });
    const animate = motionOK() && !instant;
    if (current && animate) current.classList.add(dir > 0 ? 'leave-fwd' : 'leave-back');

    const reveal = () => {
      if (token !== navToken) return;
      if (current) {
        current.hidden = true;
        current.classList.remove('leave-fwd', 'leave-back');
      }
      const wasHidden = target.hidden;
      target.classList.remove('enter-fwd', 'enter-back', 'leave-fwd', 'leave-back');
      target.hidden = false;
      window.scrollTo(0, 0);
      if (animate && wasHidden) restartClass(target, dir > 0 ? 'enter-fwd' : 'enter-back');
      const heading = target.querySelector('h2[tabindex="-1"]');
      if (heading) heading.focus({ preventScroll: true });
      if (step === 6) updateTrayHeight();
      queueStickyUpdate();
    };
    if (current && animate) setTimeout(reveal, 240);
    else reveal();
  }

  function updateChrome() {
    const s = state.step;
    const editing = state.temp.editing;
    $('#back-btn').hidden = !((s >= 3 && s <= 9) || (editing && s === 2));
    $('#back-label').textContent = editing ? 'Ticket' : 'Back';
    $('#progress-nav').hidden = s < 2 || s > 9;
    renderProgress();
    $('#tray').hidden = s !== 6;
    document.body.classList.toggle('has-tray', s === 6);
    $$('[data-next]').forEach((b) => { b.textContent = editing ? 'Back to our ticket 🎟️' : b.dataset.label; });
  }

  // Sticky "Continue" bars only get their fade background while floating over
  // content, i.e. while the sentinel right after the bar is below the fold.
  let stickyRaf = 0;
  function updateStickyBars() {
    stickyRaf = 0;
    $$('.step-actions.sticky').forEach((bar) => {
      const sentinel = bar.nextElementSibling;
      if (!sentinel || bar.offsetParent === null) return;
      bar.classList.toggle('stuck', sentinel.getBoundingClientRect().top > window.innerHeight);
    });
  }
  function queueStickyUpdate() {
    if (!stickyRaf) stickyRaf = requestAnimationFrame(updateStickyBars);
  }

  function setNextLabel(step, label) {
    const b = $(`#next-${step}`);
    if (!b) return;
    b.dataset.label = label;
    b.textContent = state.temp.editing ? 'Back to our ticket 🎟️' : label;
  }

  function renderProgress() {
    const ol = $('#progress');
    if (!ol.childElementCount) {
      ol.innerHTML = Array.from({ length: 8 }, (_, i) => `<li class="pdot" data-s="${i + 2}"><span class="sr-only">Step ${i + 1}</span></li>`).join('');
    }
    $$('.pdot', ol).forEach((li) => {
      const n = Number(li.dataset.s);
      li.classList.toggle('done', n < state.step);
      li.classList.toggle('current', n === state.step);
      if (n === state.step) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    $('#progress-label').textContent = state.step >= 2 && state.step <= 9 ? `Step ${state.step - 1} of 8` : '';
  }

  function onNext(step) {
    if (step === 2 && !state.platform) return;
    if (step === 3 && !state.type) return;
    if (step === 4) state.temp.typeChanged = false;
    if (step === 6 && !state.picks.length) { toast('Pick at least one title first 🍿'); return; }
    if (step === 7 && !markWhen(true)) return;
    if (step === 8 && !validateDetails()) return;
    if (state.temp.editing) {
      // Movie and TV genres differ, so a type change goes through genres first.
      if (step === 3 && state.temp.typeChanged) { goTo(4); return; }
      goTo(9);
      return;
    }
    goTo(step + 1);
  }

  function goBack() {
    if (state.temp.editing) { goTo(9); return; }
    if (state.step > 2) goTo(state.step - 1);
  }

  let advanceTimer = 0;
  function autoAdvance(step) {
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(() => { if (state.step === step) onNext(step); }, 650);
  }

  /* =====================================================================
     STEP 1 · Envelope → letter → YES / No
     ===================================================================== */
  const letterText = String(LETTER).replace(/\r\n?/g, '\n').replace(/^\n+/, '').replace(/\s+$/, '');
  let introLanded = false;
  let opened = false;
  let autoOpenTimer = 0;
  let typeTimer = 0;
  let typedNode = null;
  let typingDone = false;
  let lastUserScroll = 0;
  let saidYes = false;
  let noCount = 0;
  let lastNoAt = 0;

  function startIntro() {
    document.body.dataset.step = '1';
    $('#env-to').textContent = CONFIG.HER_NAME ? `For ${CONFIG.HER_NAME} 💕` : 'For you 💕';
    showSection(1, 1, true);
    updateChrome();
    getPlatforms(); // warm the cache while she reads

    const intro = $('#intro');
    const stage = $('#env-stage');
    requestAnimationFrame(() => intro.classList.add('play'));
    if (!motionOK()) {
      stage.classList.add('landed');
      setTimeout(onLanded, 500);
      return;
    }
    setTimeout(() => stage.classList.add('is-flying'), 700);
    setTimeout(onLanded, 700 + 2600);
  }

  function onLanded() {
    const stage = $('#env-stage');
    stage.classList.remove('is-flying');
    stage.classList.add('landed');
    introLanded = true;
    $('#seal').classList.add('ready');
    $('#tap-hint').classList.add('show');
    autoOpenTimer = setTimeout(openEnvelope, 1500);
  }

  function openEnvelope() {
    if (opened || !introLanded) return;
    opened = true;
    clearTimeout(autoOpenTimer);
    const env = $('#envelope');
    const seal = $('#seal');
    seal.classList.remove('ready');
    seal.classList.add('cracked');
    seal.disabled = true;
    $('#tap-hint').classList.remove('show');
    const m = motionOK();
    setTimeout(() => env.classList.add('flap-open'), m ? 420 : 0);
    setTimeout(() => env.classList.add('flap-behind'), m ? 720 : 0);
    setTimeout(() => env.classList.add('letter-out'), m ? 950 : 0);
    setTimeout(revealLetter, m ? 1750 : 120);
  }

  // Torn / deckled paper edge, made from a jittered polygon
  function deckle(el) {
    const j = () => (Math.random() * 3.4).toFixed(1);
    const H = 34;
    const V = 60;
    const pts = [];
    for (let i = 0; i <= H; i++) pts.push(`${((i / H) * 100).toFixed(2)}% ${j()}px`);
    for (let i = 1; i < V; i++) pts.push(`calc(100% - ${j()}px) ${((i / V) * 100).toFixed(2)}%`);
    for (let i = H; i >= 0; i--) pts.push(`${((i / H) * 100).toFixed(2)}% calc(100% - ${j()}px)`);
    for (let i = V - 1; i >= 1; i--) pts.push(`${j()}px ${((i / V) * 100).toFixed(2)}%`);
    const shape = `polygon(${pts.join(', ')})`;
    el.style.webkitClipPath = shape;
    el.style.clipPath = shape;
  }

  // The letter leaves the envelope, grows to the centre, then unfolds.
  function revealLetter() {
    const wrap = $('#letter-wrap');
    const intro = $('#intro');
    wrap.hidden = false;
    wrap.classList.add('folded');
    deckle($('#letter'));
    window.scrollTo(0, 0);

    if (!motionOK() || typeof wrap.animate !== 'function') {
      intro.hidden = true;
      wrap.classList.remove('folded');
      startTyping();
      return;
    }
    const envLetter = $('.env-letter');
    const from = envLetter.getBoundingClientRect();
    const mid = $('.panel-mid').getBoundingClientRect();
    const dx = from.left + from.width / 2 - (mid.left + mid.width / 2);
    const dy = from.top + from.height / 2 - (mid.top + mid.height / 2);
    const s = Math.max(0.2, from.width / mid.width);
    envLetter.style.opacity = '0';
    intro.classList.add('leaving');
    const anim = wrap.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: 'translate(0, 0) scale(1)' }],
      { duration: 800, easing: 'cubic-bezier(.2, .75, .25, 1)' }
    );
    anim.onfinish = () => {
      intro.hidden = true;
      wrap.classList.add('unfolding');
      setTimeout(() => {
        wrap.classList.remove('folded', 'unfolding');
        startTyping();
      }, 1150);
    };
  }

  function graphemes(text) {
    if (window.Intl && typeof Intl.Segmenter === 'function') {
      const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return Array.from(seg.segment(text), (x) => x.segment);
    }
    return Array.from(text);
  }

  // Natural pauses: longer after sentences and line breaks, short after commas.
  function typingDelay(ch, next) {
    const r = Math.random();
    if (ch === '\n') return next === '\n' ? 90 : 380 + r * 160;
    if (ch === '…') return 560 + r * 200;
    if (/[.!?]/.test(ch)) return !next || /\s/.test(next) ? 420 + r * 260 : 40;
    if (/[,;:]/.test(ch)) return 200 + r * 120;
    if (/[—–]/.test(ch)) return 240 + r * 100;
    if (ch === ' ') return 22 + r * 30;
    return 30 + r * 42;
  }

  function startTyping() {
    $('#letter-sr').textContent = letterText;
    if (typingDone) return; // skipped already
    const typed = $('#typed');
    typed.textContent = '';
    typedNode = document.createTextNode('');
    typed.appendChild(typedNode);
    const units = graphemes(letterText);
    const speed = Math.min(1, Math.max(0.55, 700 / Math.max(units.length, 1))); // long letters type a bit faster
    let i = 0;
    const tick = () => {
      if (typingDone) return;
      if (i >= units.length) { finishTyping(); return; }
      const ch = units[i++];
      typedNode.appendData(ch);
      if (ch === '\n' || i % 14 === 0) followPen();
      typeTimer = setTimeout(tick, typingDelay(ch, units[i]) * speed);
    };
    typeTimer = setTimeout(tick, 400);
  }

  // Keep the pen in view while typing, unless she's scrolling herself.
  function followPen() {
    if (Date.now() - lastUserScroll < 2500) return;
    const r = $('#pen').getBoundingClientRect();
    const limit = window.innerHeight - 110;
    if (r.bottom > limit) window.scrollBy({ top: r.bottom - limit + 60, behavior: motionOK() ? 'smooth' : 'auto' });
  }

  function finishTyping() {
    if (typingDone) return;
    typingDone = true;
    clearTimeout(typeTimer);
    $('#typed').textContent = letterText;
    $('#pen').classList.add('done');
    $('#skip-btn').hidden = true;
    const actions = $('#letter-actions');
    actions.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => actions.classList.add('show')));
    setTimeout(() => actions.scrollIntoView({ behavior: motionOK() ? 'smooth' : 'auto', block: 'nearest' }), 300);
  }

  /* ---------- The "No" button ---------- */
  function onNo() {
    const now = Date.now();
    if (now - lastNoAt < 380) return; // one hover + click shouldn't count twice
    lastNoAt = now;
    noCount += 1;
    if (noCount === 1) dodgeNo();
    else if (noCount === 2) {
      $('#no-btn').classList.add('shrunk');
      $('#yes-btn').classList.add('grown');
    } else openFeeModal();
  }

  // Jump to a random visible spot inside the letter, away from YES.
  // Positions are worked out in letter coordinates, then converted to the
  // button's offsetParent (the actions row) when applied.
  function dodgeNo() {
    const no = $('#no-btn');
    const paper = $('#letter');
    const br = no.getBoundingClientRect();
    if (!no.classList.contains('loose')) {
      const start = (no.offsetParent || paper).getBoundingClientRect();
      no.style.left = `${br.left - start.left}px`;
      no.style.top = `${br.top - start.top}px`;
      no.classList.add('loose');
      void no.offsetWidth;
    }
    const pr = paper.getBoundingClientRect();
    const parent = (no.offsetParent || paper).getBoundingClientRect();
    const cur = { x: br.left - pr.left, y: br.top - pr.top };
    const yr = $('#yes-btn').getBoundingClientRect();
    const pad = 18;
    const minX = pad;
    const maxX = Math.max(minX, pr.width - br.width - pad);
    const minY = Math.max(pad, 70 - pr.top);
    const maxY = Math.max(minY, Math.min(pr.height - br.height - pad, window.innerHeight - 40 - br.height - pr.top));
    const yes = { l: yr.left - pr.left - 14, r: yr.right - pr.left + 14, t: yr.top - pr.top - 14, b: yr.bottom - pr.top + 14 };
    let x = cur.x;
    let y = cur.y;
    for (let i = 0; i < 40; i++) {
      x = rand(minX, maxX);
      y = rand(minY, maxY);
      const hitsYes = x < yes.r && x + br.width > yes.l && y < yes.b && y + br.height > yes.t;
      if (!hitsYes && Math.hypot(x - cur.x, y - cur.y) > 90) break;
    }
    no.style.left = `${x + pr.left - parent.left}px`;
    no.style.top = `${y + pr.top - parent.top}px`;
  }

  function openFeeModal() {
    $('#declined-stamp').hidden = true;
    $('#fee-result').hidden = true;
    const pay = $('#pay-btn');
    pay.disabled = false;
    pay.textContent = 'Pay $50 🙄';
    $('#fine-yes-btn').disabled = false;
    openModal($('#fee-modal'));
  }

  // Purely a joke: there is no payment form and nothing is charged.
  function payFee() {
    const modal = $('#fee-modal');
    const pay = $('#pay-btn');
    modal.dataset.locked = '1';
    pay.disabled = true;
    $('#fine-yes-btn').disabled = true;
    pay.innerHTML = '<span class="spinner" aria-hidden="true"></span> Processing…';
    setTimeout(() => {
      $('#declined-stamp').hidden = false;
      const result = $('#fee-result');
      result.hidden = false;
      result.textContent = "Payment declined: reason — you're too cute to say no 😏";
      pay.textContent = 'Declined 💳';
      setTimeout(() => { closeModal(); sayYes(); }, 2600);
    }, 1300);
  }

  /* ---------- YES! ---------- */
  function sayYes() {
    if (saidYes) return;
    saidYes = true;
    state.accepted = true;
    save();
    const yes = $('#yes-btn');
    const wrap = $('#letter-wrap');
    yes.classList.add('pressed');
    yes.disabled = true;
    $('#no-btn').hidden = true;
    const r = yes.getBoundingClientRect();
    confetti.burst(r.left + r.width / 2, r.top + r.height / 2, 90);

    // Fold toward the middle of what's visible (the letter may be scrolled).
    const lr = wrap.getBoundingClientRect();
    const visTop = Math.max(lr.top, 0);
    const visBottom = Math.min(lr.bottom, window.innerHeight);
    const cy = (visTop + visBottom) / 2 - lr.top;
    const band = Math.max(40, (visBottom - visTop) / 6);
    wrap.style.setProperty('--fold-top', `${Math.max(0, cy - band)}px`);
    wrap.style.setProperty('--fold-bottom', `${Math.max(0, lr.height - cy - band)}px`);
    wrap.style.transformOrigin = `50% ${cy}px`;

    const m = motionOK();
    setTimeout(() => wrap.classList.add('fold-away'), m ? 380 : 0);
    setTimeout(() => {
      wrap.hidden = true;
      window.scrollTo(0, 0);
      const msg = $('#yes-message');
      msg.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => msg.classList.add('show')));
      setTimeout(() => goTo(2), m ? 3000 : 2200);
    }, m ? 1300 : 60);
  }

  /* =====================================================================
     TMDB
     ===================================================================== */
  const tmdbCache = new Map();

  // Goes through /api/tmdb, which adds the key on the server.
  function tmdb(path, params = {}) {
    if (!API_AVAILABLE) return Promise.reject(new Error('Movie data needs the site to be served (Vercel or vercel dev)'));
    const url = new URL(`${API}/tmdb`, location.href);
    url.searchParams.set('path', path);
    Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) url.searchParams.set(k, String(v)); });
    const cacheKey = url.toString();
    if (tmdbCache.has(cacheKey)) return tmdbCache.get(cacheKey);

    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 12000) : 0;
    const req = fetch(cacheKey, { headers: { accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
      .then((res) => {
        if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`);
        return res.json();
      })
      .finally(() => clearTimeout(timer));
    tmdbCache.set(cacheKey, req);
    req.catch(() => tmdbCache.delete(cacheKey)); // don't cache failures
    return req;
  }

  function normalize(r, type) {
    const title = type === 'tv' ? r.name || r.original_name : r.title || r.original_title;
    const date = type === 'tv' ? r.first_air_date : r.release_date;
    const it = {
      key: `${type}-${r.id}`,
      id: r.id,
      mediaType: type,
      title: title || 'Untitled',
      year: date ? String(date).slice(0, 4) : '',
      poster: r.poster_path || '',
      rating: Number(r.vote_average) || 0,
      overview: r.overview || '',
    };
    itemIndex.set(it.key, it);
    return it;
  }

  // Swap a broken image for a styled placeholder.
  function onImgError(e) {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.fallback) return;
    const span = document.createElement('span');
    span.className = img.dataset.fallback;
    span.textContent = img.dataset.fallbackText || '';
    if (img.dataset.brand) span.style.setProperty('--brand', img.dataset.brand);
    span.setAttribute('aria-hidden', 'true');
    img.replaceWith(span);
  }

  // `compact` thumbnails are too small for text, so their placeholder is just 🎬.
  function posterThumb(p, size, compact) {
    const label = compact ? '🎬' : shortTitle(p.title);
    return p.poster
      ? `<img src="${IMG}${size}${p.poster}" alt="${esc(p.title)}" loading="lazy" decoding="async" data-fallback="tray-ph" data-fallback-text="${esc(label)}">`
      : `<span class="tray-ph" role="img" aria-label="${esc(p.title)}">${esc(label)}</span>`;
  }

  /* =====================================================================
     STEP 2 · Platform
     ===================================================================== */
  let platformsPromise = null;
  let platformOptions = [];

  function getPlatforms() {
    if (!platformsPromise) platformsPromise = loadPlatforms();
    return platformsPromise;
  }

  async function loadPlatforms() {
    const fallback = () => PLATFORMS.map((p) => ({ key: p.key, name: p.name, ids: p.prefer.slice(), logo: '', brand: p.brand, mono: p.mono }));
    if (!API_AVAILABLE) {
      console.info('[invite] Opened as a file, so movie data and emails are off. Run `npx vercel dev` to test everything locally.');
      return fallback();
    }
    const settled = await Promise.allSettled(['movie', 'tv'].map((t) => tmdb(`/watch/providers/${t}`, { watch_region: CONFIG.REGION, language: 'en-US' })));
    const list = [];
    const seen = new Set();
    settled.forEach((r) => {
      if (r.status !== 'fulfilled') return;
      (r.value.results || []).forEach((x) => {
        if (!seen.has(x.provider_id)) { seen.add(x.provider_id); list.push(x); }
      });
    });
    if (!list.length) {
      console.info('[invite] Could not load streaming providers from TMDB: using the built-in list.');
      return fallback();
    }
    const found = PLATFORMS.map((p) => matchPlatform(p, list)).filter(Boolean);
    return found.length ? found : fallback();
  }

  function matchPlatform(p, list) {
    const priority = (x) => {
      const regional = x.display_priorities && x.display_priorities[CONFIG.REGION];
      return regional != null ? regional : x.display_priority != null ? x.display_priority : 999;
    };
    const candidates = list.filter((x) => p.match.test(String(x.provider_name || '').trim()) && !(p.exclude || []).includes(x.provider_id));
    if (!candidates.length) return null;
    const preferred = candidates.filter((x) => p.prefer.includes(x.provider_id));
    const chosen = preferred.length ? preferred : [candidates.sort((a, b) => priority(a) - priority(b))[0]];
    return { key: p.key, name: p.name, ids: chosen.map((x) => x.provider_id), logo: chosen[0].logo_path || '', brand: p.brand, mono: p.mono };
  }

  function platformLogo(p) {
    if (p.key === 'surprise') return '<span class="mono surprise" aria-hidden="true">🎲</span>';
    if (!p.logo) return `<span class="mono" style="--brand:${p.brand}" aria-hidden="true">${esc(p.mono)}</span>`;
    return `<img src="${IMG}w154${p.logo}" alt="" width="62" height="62" loading="lazy" decoding="async" data-fallback="mono" data-fallback-text="${esc(p.mono)}" data-brand="${p.brand}">`;
  }

  async function renderPlatforms() {
    const grid = $('#platform-grid');
    if (!platformOptions.length) grid.innerHTML = '<div class="pcard skeleton" aria-hidden="true"></div>'.repeat(6);
    markPlatform();
    const list = await getPlatforms();
    const allIds = Array.from(new Set(list.flatMap((p) => p.ids)));
    platformOptions = list.concat({ key: 'surprise', name: 'Surprise me', ids: allIds, logo: '', names: list.map((p) => p.name) });
    grid.innerHTML = platformOptions.map((p) => `
      <button class="pcard" type="button" data-key="${p.key}" aria-pressed="false">
        <span class="pcard-logo">${platformLogo(p)}</span>
        <span class="pcard-name">${esc(p.name)}</span>
        <span class="badge" aria-hidden="true">♥</span>
      </button>`).join('');
    markPlatform();
  }

  function markPlatform() {
    $$('#platform-grid .pcard[data-key]').forEach((b) => b.setAttribute('aria-pressed', String(!!state.platform && b.dataset.key === state.platform.key)));
    $('#next-2').hidden = !state.platform;
  }

  function onPlatformClick(e) {
    const btn = e.target.closest('.pcard[data-key]');
    if (!btn) return;
    const opt = platformOptions.find((p) => p.key === btn.dataset.key);
    if (!opt) return;
    state.platform = { key: opt.key, name: opt.name, ids: opt.ids, logo: opt.logo, names: opt.names || null };
    save();
    markPlatform();
    autoAdvance(2);
  }

  /* =====================================================================
     STEP 3 · Movie or series
     ===================================================================== */
  function renderTypes() {
    $$('#type-grid .tycard').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === state.type)));
    $('#next-3').hidden = !state.type;
  }

  function onTypeClick(e) {
    const btn = e.target.closest('.tycard[data-type]');
    if (!btn) return;
    const type = btn.dataset.type;
    if (state.type !== type) {
      state.type = type;
      state.temp.typeChanged = true;
      state.temp.loosen = 0;
    }
    save();
    renderTypes();
    getGenres(type); // warm the cache
    autoAdvance(3);
  }

  /* =====================================================================
     STEP 4 · Genres
     ===================================================================== */
  const genreCache = {};
  let genreOptions = [];

  function getGenres(type) {
    if (!genreCache[type]) {
      genreCache[type] = API_AVAILABLE
        ? tmdb(`/genre/${type}/list`, { language: 'en-US' })
          .then((d) => (d.genres && d.genres.length ? d.genres : FALLBACK_GENRES[type]))
          .catch(() => FALLBACK_GENRES[type])
        : Promise.resolve(FALLBACK_GENRES[type]);
    }
    return genreCache[type];
  }

  function sortGenres(list) {
    const rank = (g) => { const i = GENRE_PRIORITY.indexOf(g.name); return i === -1 ? 99 : i; };
    return list.slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }

  async function renderGenres() {
    const box = $('#genre-chips');
    const type = state.type || 'movie';
    box.innerHTML = '<span class="chip skeleton" aria-hidden="true">&nbsp;</span>'.repeat(10);
    markGenres();
    const list = await getGenres(type);
    if (state.step !== 4 || (state.type || 'movie') !== type) return;
    const before = state.genres.length;
    state.genres = state.genres.filter((g) => list.some((x) => x.id === g.id)); // movie/tv lists differ
    if (state.genres.length !== before) save();
    genreOptions = sortGenres(list);
    box.innerHTML = genreOptions.map((g) => {
      const horror = g.name === 'Horror';
      return `<button type="button" class="chip${horror ? ' chip-tall' : ''}" data-id="${g.id}" aria-pressed="false">`
        + `<span><span class="chip-emoji" aria-hidden="true">${GENRE_EMOJI[g.name] || '🎞️'}</span> ${esc(g.name)}</span>`
        + `${horror ? '<small>so you can hold onto me 👀</small>' : ''}</button>`;
    }).join('');
    markGenres();
    queueStickyUpdate();
  }

  function markGenres() {
    $$('#genre-chips .chip[data-id]').forEach((c) => c.setAttribute('aria-pressed', String(state.genres.some((g) => g.id === Number(c.dataset.id)))));
    $('#genre-count').textContent = `${state.genres.length}/${MAX_GENRES}`;
    setNextLabel(4, state.genres.length ? 'Continue' : 'Any genre is fine ✨');
  }

  function onGenreClick(e) {
    const chip = e.target.closest('.chip[data-id]');
    if (!chip) return;
    const id = Number(chip.dataset.id);
    const i = state.genres.findIndex((g) => g.id === id);
    if (i >= 0) state.genres.splice(i, 1);
    else if (state.genres.length >= MAX_GENRES) {
      restartClass(chip, 'shake');
      toast('Up to 3 genres. Pick your faves 💕');
      return;
    } else {
      const g = genreOptions.find((x) => x.id === id);
      state.genres.push({ id, name: g ? g.name : '' });
    }
    state.temp.loosen = 0;
    save();
    markGenres();
  }

  /* =====================================================================
     STEP 5 · Country / vibe
     ===================================================================== */
  function renderCountries() {
    const box = $('#country-chips');
    if (!box.childElementCount) {
      box.innerHTML = '<button type="button" class="chip" data-code="ANY" aria-pressed="false"><span class="chip-emoji" aria-hidden="true">🌍</span> Any</button>'
        + COUNTRIES.map((c) => `<button type="button" class="chip" data-code="${c.code}" aria-pressed="false"><span class="chip-emoji" aria-hidden="true">${c.flag}</span> ${esc(c.label)}</button>`).join('');
    }
    markCountries();
  }

  function markCountries() {
    $$('#country-chips .chip').forEach((c) => {
      const code = c.dataset.code;
      c.setAttribute('aria-pressed', String(code === 'ANY' ? !state.countries.length : state.countries.includes(code)));
    });
  }

  function onCountryClick(e) {
    const chip = e.target.closest('.chip[data-code]');
    if (!chip) return;
    const code = chip.dataset.code;
    if (code === 'ANY') state.countries = [];
    else if (state.countries.includes(code)) state.countries = state.countries.filter((c) => c !== code);
    else state.countries = state.countries.concat(code);
    state.temp.loosen = 0;
    save();
    markCountries();
  }

  /* =====================================================================
     STEP 6 · Recommendations, search, shortlist, wheel
     ===================================================================== */
  const recs = { sig: '', items: [], page: 0, total: 0, loading: false, error: '' };
  const search = { q: '', items: [], loading: false, error: '', seq: 0 };
  const itemIndex = new Map();
  let mode = 'recs'; // 'recs' | 'search'

  const effectiveType = () => state.type || 'movie';
  // Loosening order: drop country first, then genre.
  const loosenPlan = () => [state.countries.length ? 'country' : '', state.genres.length ? 'genre' : ''].filter(Boolean);
  const droppedFilters = () => loosenPlan().slice(0, state.temp.loosen);

  function discoverParams(page) {
    const dropped = droppedFilters();
    const countries = dropped.includes('country') ? [] : state.countries;
    const genres = dropped.includes('genre') ? [] : state.genres;
    const ids = state.platform && state.platform.ids && state.platform.ids.length
      ? state.platform.ids
      : PLATFORMS.flatMap((p) => p.prefer);
    return {
      watch_region: CONFIG.REGION,
      with_watch_providers: ids.join('|'),
      with_watch_monetization_types: 'flatrate|free|ads',
      with_genres: genres.map((g) => g.id).join('|'),
      with_origin_country: countries.join('|'),
      sort_by: 'popularity.desc',
      'vote_average.gte': 6.5,
      // Fewer votes needed outside the US so Nollywood / Turkish titles still show up
      'vote_count.gte': countries.some((c) => c !== 'US') ? 30 : 100,
      include_adult: 'false',
      language: 'en-US',
      page,
    };
  }

  const recsSig = () => JSON.stringify([effectiveType(), state.platform && state.platform.ids, state.genres.map((g) => g.id), state.countries, state.temp.loosen]);

  function enterRecs() {
    const sig = recsSig();
    if (sig !== recs.sig) {
      Object.assign(recs, { sig, items: [], page: 0, total: 0, loading: false, error: '' });
      loadRecs();
    }
    if (mode === 'search') renderSearch();
    else renderRecs();
    renderTray();
  }

  async function loadRecs() {
    if (recs.loading) return;
    if (!API_AVAILABLE) {
      recs.error = 'nokey';
      renderRecs();
      return;
    }
    const sig = recs.sig;
    recs.loading = true;
    recs.error = '';
    renderRecs();
    try {
      const data = await tmdb(`/discover/${effectiveType()}`, discoverParams(recs.page + 1));
      if (sig !== recs.sig) return; // filters changed meanwhile
      const seen = new Set(recs.items.map((x) => x.key));
      (data.results || []).forEach((r) => {
        const it = normalize(r, effectiveType());
        if (!seen.has(it.key)) { seen.add(it.key); recs.items.push(it); }
      });
      recs.page = data.page || recs.page + 1;
      recs.total = Math.min(data.total_pages || 0, 500);
    } catch (err) {
      if (sig !== recs.sig) return;
      recs.error = 'failed';
      console.info('[invite] TMDB discover failed:', err.message);
    }
    recs.loading = false;
    renderRecs();
  }

  function cardHTML(it) {
    const rating = it.rating ? it.rating.toFixed(1) : '–';
    const pct = Math.max(0, Math.min(100, it.rating * 10));
    const poster = it.poster
      ? `<img src="${IMG}w342${it.poster}" alt="Poster for ${esc(it.title)}${it.year ? ` (${esc(it.year)})` : ''}" loading="lazy" decoding="async" width="342" height="513" data-fallback="poster-ph" data-fallback-text="🎬">`
      : `<span class="poster-ph"><span aria-hidden="true">🎬</span><small>${esc(it.title)}</small></span>`;
    const overview = it.overview
      ? `<button class="tcard-overview" type="button" aria-expanded="false"><span class="ov-text">${esc(it.overview)}</span>${it.overview.length > 110 ? '<span class="ov-more" aria-hidden="true">more</span>' : ''}</button>`
      : '';
    return `<article class="tcard" data-key="${esc(it.key)}">
      <div class="tcard-poster">${poster}<span class="tcard-type">${it.mediaType === 'tv' ? 'Series' : 'Movie'}</span><span class="tcard-heart" aria-hidden="true">♥</span></div>
      <div class="tcard-body">
        <h3 class="tcard-title">${esc(it.title)}</h3>
        <p class="tcard-meta">${it.year ? `<span>${esc(it.year)}</span>` : ''}<span aria-label="Rated ${rating} out of 10"><span class="stars-vis" style="--pct:${pct}%" aria-hidden="true">★★★★★</span> ${rating}</span></p>
        ${overview}
        <button class="btn-pick" type="button" aria-pressed="false">Pick this 💕</button>
      </div>
    </article>`;
  }

  function renderResultsBar() {
    const bar = $('#results-bar');
    if (mode === 'search') {
      bar.hidden = false;
      bar.innerHTML = `<span>Results for “${esc(search.q)}”</span><button class="link-btn" type="button" data-action="clear-search">← Back to recommendations</button>`;
      return;
    }
    const dropped = droppedFilters();
    if (dropped.length) {
      bar.hidden = false;
      bar.innerHTML = `<span>Showing picks without the ${dropped.join(' & ')} filter</span><button class="link-btn" type="button" data-action="reset-loosen">Undo</button>`;
      return;
    }
    bar.hidden = true;
    bar.innerHTML = '';
  }

  function renderRecs() {
    if (mode !== 'recs') return;
    const grid = $('#title-grid');
    const status = $('#grid-status');
    const more = $('#more-btn');
    renderResultsBar();
    status.classList.remove('compact');

    if (!recs.items.length) {
      grid.dataset.sig = '';
      grid.dataset.count = '0';
      more.hidden = true;
      if (recs.loading) {
        grid.innerHTML = '<div class="tcard skeleton" aria-hidden="true"></div>'.repeat(6);
        status.hidden = true;
        return;
      }
      grid.innerHTML = '';
      status.hidden = false;
      status.innerHTML = recs.error ? libraryDownHTML() : emptyHTML();
      return;
    }

    status.hidden = true;
    // Append only the new cards so "Show more" doesn't redraw everything.
    let count = Number(grid.dataset.count || 0);
    if (grid.dataset.sig !== recs.sig || count > recs.items.length) {
      grid.innerHTML = '';
      count = 0;
    }
    if (count < recs.items.length) {
      grid.insertAdjacentHTML('beforeend', recs.items.slice(count).map(cardHTML).join(''));
      grid.dataset.count = String(recs.items.length);
      grid.dataset.sig = recs.sig;
      announce(`${recs.items.length} titles showing`);
    }
    syncPicked();
    more.hidden = recs.page >= recs.total && !recs.error;
    more.disabled = recs.loading;
    more.innerHTML = recs.loading ? '<span class="spinner" aria-hidden="true"></span> Loading…' : recs.error ? 'Try again' : 'Show more';
  }

  function emptyHTML() {
    const next = loosenPlan()[state.temp.loosen];
    const btn = next
      ? `<button class="btn btn-primary" type="button" data-action="loosen">${next === 'country' ? 'Drop the country filter 🌍' : 'Drop the genre filter 🎭'}</button>`
      : '<button class="btn btn-primary" type="button" data-action="focus-search">Search for a title instead 🔎</button>';
    return `<span class="big-emoji" aria-hidden="true">😅</span><h3>Even TMDB couldn't find this combo</h3>`
      + `<p>${next ? 'Want me to loosen the filters a little?' : 'Try searching for something you love.'}</p>${btn}`;
  }

  function libraryDownHTML() {
    return '<span class="big-emoji" aria-hidden="true">😴</span><h3>The movie library is napping</h3>'
      + '<p>I couldn\'t load recommendations right now. Search above, or type any title and add it to our shortlist.</p>'
      + (recs.error === 'failed' ? '<button class="btn btn-ghost" type="button" data-action="retry-recs">Try again</button>' : '');
  }

  const debouncedSearch = debounce(() => runSearch($('#search-input').value), 450);

  async function runSearch(raw) {
    const q = String(raw || '').trim();
    $('#search-clear').hidden = !raw;
    if (q.length < 2) {
      if (mode === 'search') { mode = 'recs'; search.seq += 1; renderRecs(); }
      return;
    }
    if (mode === 'search' && q === search.q && !search.error) return;
    mode = 'search';
    const seq = ++search.seq;
    Object.assign(search, { q, items: [], loading: true, error: '' });
    renderSearch();
    if (!API_AVAILABLE) {
      search.loading = false;
      search.error = 'nokey';
      renderSearch();
      return;
    }
    try {
      const data = await tmdb('/search/multi', { query: q, include_adult: 'false', language: 'en-US', page: 1 });
      if (seq !== search.seq) return;
      search.items = (data.results || [])
        .filter((r) => (r.media_type === 'movie' || r.media_type === 'tv') && (r.poster_path || r.vote_count > 0)) // no people
        .slice(0, 20)
        .map((r) => normalize(r, r.media_type));
    } catch (err) {
      if (seq !== search.seq) return;
      search.error = 'failed';
    }
    search.loading = false;
    renderSearch();
  }

  function renderSearch() {
    if (mode !== 'search') return;
    const grid = $('#title-grid');
    const status = $('#grid-status');
    renderResultsBar();
    $('#more-btn').hidden = true;
    grid.dataset.sig = 'search';
    grid.dataset.count = '0';
    if (search.loading) {
      grid.innerHTML = '<div class="tcard skeleton" aria-hidden="true"></div>'.repeat(4);
      status.hidden = true;
      return;
    }
    grid.innerHTML = search.items.map(cardHTML).join('');
    syncPicked();
    const add = `<button class="btn btn-ghost" type="button" data-action="custom">Add “${esc(search.q)}” to our shortlist 💕</button>`;
    status.hidden = false;
    status.classList.toggle('compact', search.items.length > 0);
    if (!search.items.length) {
      status.innerHTML = search.error
        ? `<span class="big-emoji" aria-hidden="true">📼</span><h3>Search is taking a nap</h3><p>No worries, you can still add “${esc(search.q)}” by name.</p>${add}`
        : `<span class="big-emoji" aria-hidden="true">🤔</span><h3>No matches for “${esc(search.q)}”</h3><p>Check the spelling, or add it by name anyway.</p>${add}`;
    } else {
      status.innerHTML = `<p>Not seeing it?</p>${add}`;
    }
    announce(search.items.length ? `${search.items.length} results for ${search.q}` : `No results for ${search.q}`);
  }

  function clearSearch() {
    const input = $('#search-input');
    input.value = '';
    $('#search-clear').hidden = true;
    search.seq += 1; // ignore any search still in flight
    search.q = '';
    if (mode === 'search') { mode = 'recs'; renderRecs(); }
  }

  function syncPicked() {
    $$('#title-grid .tcard[data-key]').forEach((card) => {
      const on = state.picks.some((p) => p.key === card.dataset.key);
      card.classList.toggle('picked', on);
      const btn = card.querySelector('.btn-pick');
      if (btn) {
        btn.setAttribute('aria-pressed', String(on));
        btn.textContent = on ? 'Picked 💕' : 'Pick this 💕';
      }
    });
  }

  function togglePick(key, btn) {
    const i = state.picks.findIndex((p) => p.key === key);
    if (i >= 0) {
      state.picks.splice(i, 1);
      if (state.winnerKey === key) state.winnerKey = null;
    } else {
      if (state.picks.length >= MAX_PICKS) {
        toast('Our shortlist holds 3. Remove one first 💕');
        restartClass($('#tray'), 'bump');
        return;
      }
      const it = itemIndex.get(key);
      if (!it) return;
      state.picks.push({ key: it.key, id: it.id, mediaType: it.mediaType, title: it.title, year: it.year, poster: it.poster, rating: it.rating });
      if (btn) {
        const r = btn.getBoundingClientRect();
        confetti.burst(r.left + r.width / 2, r.top + r.height / 2, 12, 0.55);
      }
    }
    save();
    syncPicked();
    renderTray();
  }

  function addCustomPick(title) {
    const t = String(title || '').trim().slice(0, 80);
    if (!t) return;
    const key = `custom-${t.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (state.picks.some((p) => p.key === key)) { toast('Already on our shortlist 💕'); return; }
    if (state.picks.length >= MAX_PICKS) {
      toast('Our shortlist holds 3. Remove one first 💕');
      restartClass($('#tray'), 'bump');
      return;
    }
    state.picks.push({ key, id: 0, mediaType: effectiveType(), title: t, year: '', poster: '', rating: 0 });
    save();
    renderTray();
    toast(`Added “${t}” 💕`);
  }

  function removePick(key) {
    state.picks = state.picks.filter((p) => p.key !== key);
    if (state.winnerKey === key) state.winnerKey = null;
    save();
    renderTray();
    syncPicked();
  }

  function onGridClick(e) {
    const pick = e.target.closest('.btn-pick');
    if (pick) {
      togglePick(pick.closest('.tcard').dataset.key, pick);
      return;
    }
    const ov = e.target.closest('.tcard-overview');
    if (ov) {
      const open = ov.getAttribute('aria-expanded') !== 'true';
      ov.setAttribute('aria-expanded', String(open));
      const more = ov.querySelector('.ov-more');
      if (more) more.textContent = open ? 'less' : 'more';
    }
  }

  function onRecsAction(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'loosen') { state.temp.loosen += 1; enterRecs(); }
    else if (action === 'reset-loosen') { state.temp.loosen = 0; enterRecs(); }
    else if (action === 'retry-recs') { recs.error = ''; loadRecs(); }
    else if (action === 'focus-search') $('#search-input').focus();
    else if (action === 'clear-search') clearSearch();
    else if (action === 'custom') addCustomPick(search.q);
  }

  function renderTray() {
    $('#tray-picks').innerHTML = Array.from({ length: MAX_PICKS }, (_, i) => {
      const p = state.picks[i];
      if (!p) return '<li class="tray-slot empty" aria-hidden="true">♥</li>';
      return `<li class="tray-slot${state.winnerKey === p.key ? ' winner' : ''}">${posterThumb(p, 'w92')}`
        + `<button class="tray-remove" type="button" data-remove="${esc(p.key)}" aria-label="Remove ${esc(p.title)}">✕</button></li>`;
    }).join('');
    $('#tray-count').textContent = `${state.picks.length}/${MAX_PICKS}`;
    const next = $('#tray-next');
    next.disabled = !state.picks.length;
    next.textContent = state.temp.editing ? 'Back to ticket 🎟️' : 'Continue →';
    $('#spin-btn').hidden = state.picks.length < 2;
    updateTrayHeight();
  }

  function updateTrayHeight() {
    const tray = $('#tray');
    if (!tray.hidden) document.documentElement.style.setProperty('--tray-h', `${tray.offsetHeight}px`);
  }

  /* ---------- Spin the wheel ---------- */
  let wheelRotation = 0;
  let wheelSpinning = false;

  function openWheel() {
    if (state.picks.length < 2) return;
    const n = state.picks.length;
    const seg = 360 / n;
    const colors = ['#ffb3c8', '#f6d39a', '#ffd9e3'];
    const wheel = $('#wheel');
    wheel.style.transition = 'none';
    wheelRotation = 0;
    wheel.style.transform = 'rotate(0deg)';
    wheel.style.background = `conic-gradient(${state.picks.map((_, i) => `${colors[i % colors.length]} ${i * seg}deg ${(i + 1) * seg}deg`).join(', ')})`;
    wheel.innerHTML = state.picks.map((p, i) => `<div class="wheel-seg" style="--a:${(i + 0.5) * seg}deg"><span>${posterThumb(p, 'w154')}</span></div>`).join('');
    void wheel.offsetWidth;
    wheel.style.transition = '';
    $('#wheel-result').textContent = '';
    const spin = $('#wheel-spin');
    spin.disabled = false;
    spin.textContent = 'Spin! 🎡';
    $('#wheel-done').hidden = true;
    openModal($('#wheel-modal'));
  }

  function spinWheel() {
    const n = state.picks.length;
    if (wheelSpinning || n < 2) return;
    wheelSpinning = true;
    const modal = $('#wheel-modal');
    modal.dataset.locked = '1';
    $('#wheel-spin').disabled = true;
    $('#wheel-done').hidden = true;
    $('#wheel-result').textContent = 'Spinning…';

    const seg = 360 / n;
    const win = Math.floor(Math.random() * n);
    const landAt = (win + 0.5) * seg + (Math.random() - 0.5) * seg * 0.55; // somewhere inside the winning slice
    const want = ((-landAt % 360) + 360) % 360; // rotation that brings it under the pointer
    const diff = ((want - (wheelRotation % 360)) + 360) % 360;
    wheelRotation += 360 * 5 + diff;
    $('#wheel').style.transform = `rotate(${wheelRotation}deg)`;

    setTimeout(() => {
      wheelSpinning = false;
      delete modal.dataset.locked;
      const p = state.picks[win];
      if (!p) return;
      state.winnerKey = p.key;
      save();
      renderTray();
      $('#wheel-result').textContent = `The wheel has spoken: ${p.title} 🍿`;
      const spin = $('#wheel-spin');
      spin.disabled = false;
      spin.textContent = 'Spin again';
      $('#wheel-done').hidden = false;
      if (!modal.hidden) {
        const r = $('#wheel').getBoundingClientRect();
        confetti.burst(r.left + r.width / 2, r.top + r.height * 0.3, 40);
      }
    }, motionOK() ? 4500 : 80);
  }

  /* =====================================================================
     STEP 7 · Date & time
     ===================================================================== */
  let customTimeOpen = false;

  function quickDates() {
    const now = new Date();
    const make = (dow, label, emoji, defTime) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let diff = (dow - d.getDay() + 7) % 7;
      if (diff === 0 && now.getHours() >= 21) diff = 7; // tonight is basically over
      d.setDate(d.getDate() + diff);
      return { label, emoji, defTime, date: ymd(d), sub: fmtDateShort(d) };
    };
    return [
      make(5, 'This Friday night', '🌙', '20:00'),
      make(6, 'This Saturday night', '✨', '20:00'),
      make(0, 'Sunday chill', '☕', '18:00'),
    ];
  }

  function renderWhen() {
    const today = ymd(new Date());
    const input = $('#date-input');
    input.min = today;
    if (state.date && state.date < today) { state.date = ''; save(); }
    input.value = state.date || '';
    $('#date-quick').innerHTML = quickDates().map((q) => `<button type="button" class="chip chip-tall" data-date="${q.date}" data-time="${q.defTime}" aria-pressed="false">`
      + `<span><span class="chip-emoji" aria-hidden="true">${q.emoji}</span> ${esc(q.label)}</span><small>${esc(q.sub)}</small></button>`).join('');
    $('#time-chips').innerHTML = TIMES.map((t) => `<button type="button" class="chip" data-time="${t.value}" aria-pressed="false">${t.label}</button>`).join('')
      + '<button type="button" class="chip" data-time="custom" aria-pressed="false">Custom ⏰</button>';
    customTimeOpen = !!state.time && !TIMES.some((t) => t.value === state.time);
    $('#time-input').value = state.time || '';
    markWhen(false);
  }

  function whenStatus() {
    if (!state.date) return { ok: false, msg: '' };
    if (state.date < ymd(new Date())) return { ok: false, msg: 'Pick a date from today onwards 💕' };
    if (!state.time) return { ok: false, msg: '' };
    const dt = whenDate();
    if (!dt || dt <= new Date()) return { ok: false, msg: 'That time has already passed. Pick a later one ⏰' };
    return { ok: true, msg: '' };
  }

  // Updates chips, preview and the Continue button. Returns true when valid.
  function markWhen(showMissing) {
    $$('#date-quick .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.date === state.date)));
    const isCustom = customTimeOpen || (!!state.time && !TIMES.some((t) => t.value === state.time));
    $$('#time-chips .chip').forEach((c) => {
      const v = c.dataset.time;
      c.setAttribute('aria-pressed', String(v === 'custom' ? isCustom : !isCustom && v === state.time));
    });
    $('#time-custom').hidden = !isCustom;
    const status = whenStatus();
    let msg = status.msg;
    if (!msg && showMissing && !status.ok) msg = !state.date ? 'Pick a day first 🗓️' : 'Now pick a time ⏰';
    const err = $('#when-error');
    err.hidden = !msg;
    err.textContent = msg;
    $('#next-7').disabled = !status.ok;
    const dt = whenDate();
    $('#when-preview').textContent = status.ok && dt ? `${fmtDateNoYear(dt)} at ${fmtTime(state.time)} 💕` : '';
    return status.ok;
  }

  function onQuickDate(e) {
    const chip = e.target.closest('[data-date]');
    if (!chip) return;
    state.date = chip.dataset.date;
    if (!state.time) state.time = chip.dataset.time;
    $('#date-input').value = state.date;
    $('#time-input').value = state.time;
    save();
    markWhen(false);
  }

  function onTimeChip(e) {
    const chip = e.target.closest('[data-time]');
    if (!chip) return;
    if (chip.dataset.time === 'custom') {
      customTimeOpen = true;
      markWhen(false);
      $('#time-input').focus();
      return;
    }
    customTimeOpen = false;
    state.time = chip.dataset.time;
    $('#time-input').value = state.time;
    save();
    markWhen(false);
  }

  /* =====================================================================
     STEP 8 · Snacks, cozy level, note, name + email
     ===================================================================== */
  function renderExtras() {
    const box = $('#snack-chips');
    if (!box.childElementCount) {
      box.innerHTML = SNACKS.map((s) => `<button type="button" class="chip" data-snack="${s.key}" aria-pressed="false"><span class="chip-emoji" aria-hidden="true">${s.emoji}</span> ${esc(s.label)}</button>`).join('');
    }
    markSnacks();
    $('#cozy-range').value = String(clampInt(state.cozy, 0, 4));
    updateCozy(false);
    $('#note-input').value = state.note;
    $('#name-input').value = state.herName;
    $('#email-input').value = state.herEmail;
    $('#details-error').hidden = true;
    $('#name-input').removeAttribute('aria-invalid');
    $('#email-input').removeAttribute('aria-invalid');
  }

  function markSnacks() {
    $$('#snack-chips .chip').forEach((c) => c.setAttribute('aria-pressed', String(state.snacks.includes(c.dataset.snack))));
  }

  function onSnackClick(e) {
    const chip = e.target.closest('.chip[data-snack]');
    if (!chip) return;
    const k = chip.dataset.snack;
    state.snacks = state.snacks.includes(k) ? state.snacks.filter((x) => x !== k) : state.snacks.concat(k);
    save();
    markSnacks();
  }

  function updateCozy(bump) {
    const range = $('#cozy-range');
    const v = clampInt(range.value, 0, 4);
    const level = COZY[v];
    const emoji = $('#cozy-emoji');
    emoji.textContent = level.emoji;
    $('#cozy-label').textContent = level.label;
    range.style.setProperty('--pct', `${(v / 4) * 100}%`);
    range.setAttribute('aria-valuetext', level.label);
    if (bump && motionOK()) restartClass(emoji, 'bump');
  }

  function validateDetails() {
    const name = state.herName.trim();
    const email = state.herEmail.trim();
    const emailOk = EMAIL_RE.test(email);
    let msg = '';
    let field = null;
    if (!name) { msg = 'What should I call you? 😊'; field = $('#name-input'); }
    else if (!emailOk) { msg = email ? "That email doesn't look quite right 🤔" : 'I need your email to send you our ticket 💌'; field = $('#email-input'); }
    $('#name-input').setAttribute('aria-invalid', String(!name));
    $('#email-input').setAttribute('aria-invalid', String(!!name && !emailOk));
    const err = $('#details-error');
    err.hidden = !msg;
    err.textContent = msg;
    if (field) field.focus();
    return !msg;
  }

  /* =====================================================================
     STEP 9 · Ticket + confirmation emails
     ===================================================================== */
  function ticketRows() {
    const d = details();
    const when = whenStatus();
    return [
      { label: 'Streaming on', html: esc(d.platform), step: 2, ok: !!state.platform },
      { label: 'Watching', html: esc(d.type), step: 3, ok: !!state.type },
      { label: 'Genres', html: esc(d.genres), step: 4, ok: true },
      { label: 'Vibe', html: esc(d.countries), step: 5, ok: true },
      { label: 'Our picks', html: picksTicketHTML(), step: 6, ok: state.picks.length > 0 },
      { label: 'When', html: `${esc(d.date)} · <span class="nowrap">${esc(d.time)}</span>`, step: 7, ok: when.ok },
      { label: 'Snacks', html: esc(d.snacks), step: 8, ok: true },
      { label: 'Cozy level', html: esc(d.cozy), step: 8, ok: true },
      { label: 'Note', html: esc(d.note), step: 8, ok: true },
      { label: 'Ticket goes to', html: esc(`${d.herName} · ${state.herEmail.trim()}`), step: 8, ok: !!state.herName.trim() && EMAIL_RE.test(state.herEmail.trim()) },
    ];
  }

  function picksTicketHTML() {
    return `<span class="tpicks">${state.picks.map((p) => {
      const meta = [p.year, p.mediaType === 'tv' ? 'Series' : 'Movie'].filter(Boolean).join(' · ');
      return `<span class="tpick">${posterThumb(p, 'w92', true)}<span>${state.winnerKey === p.key ? '👑 ' : ''}${esc(p.title)} <small>${esc(meta)}</small></span></span>`;
    }).join('')}</span>`;
  }

  function renderTicket() {
    const d = details();
    const rows = ticketRows();
    const dt = whenDate();
    const whenOk = whenStatus().ok;
    const ticketNo = dt ? `${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}-${state.time.replace(':', '')}` : '0000-0000';
    $('#ticket').innerHTML = `
      <div class="ticket-main">
        <div class="ticket-head">
          <p class="ticket-kicker">Admit two</p>
          <h3 class="ticket-title">Netflix &amp; Chill Date 💕</h3>
        </div>
        <ul class="trows">
          ${rows.map((r) => `<li class="trow"><span class="trow-label">${r.label}</span>`
            + `<span class="trow-value${r.ok ? '' : ' missing'}">${r.ok ? r.html : 'Not chosen yet'}</span>`
            + `<button class="edit${r.ok ? '' : ' add'}" type="button" data-edit="${r.step}" aria-label="${r.ok ? 'Edit' : 'Add'} ${r.label.toLowerCase()}">${r.ok ? 'Edit' : 'Add'}</button></li>`).join('')}
        </ul>
      </div>
      <div class="ticket-stub">
        <div><div class="stub-admit">ADMIT TWO</div><div class="stub-names">${esc(d.herName)} &amp; ${esc(d.myName)}</div></div>
        <div class="stub-when">${dt && whenOk ? `${esc(fmtDateShort(dt).toUpperCase())}<small>${esc(fmtTime(state.time))}</small>` : '<small>Date TBD</small>'}</div>
        <div class="barcode" aria-hidden="true"></div>
        <div class="stub-no">No. ${ticketNo}</div>
      </div>`;
    const complete = rows.every((r) => r.ok);
    $('#ticket-missing').hidden = complete;
    const btn = $('#confirm-btn');
    btn.hidden = false;
    btn.disabled = !complete;
    $('#send-error').hidden = true;
  }

  function onTicketClick(e) {
    const b = e.target.closest('[data-edit]');
    if (!b || state.temp.sending) return;
    // Details may change, so both emails go out again with the final version.
    if (!state.confirmed) state.emailSent = { me: false, her: false };
    state.temp.editing = true;
    goTo(Number(b.dataset.edit));
  }

  // What the email function needs. Dates are formatted here, in her timezone;
  // the server designs the email, escapes everything and adds the addresses.
  function confirmationPayload(send) {
    const d = details();
    const start = whenDate();
    return {
      send,
      herName: d.herName,
      herEmail: state.herEmail.trim(),
      myName: d.myName,
      platform: d.platform,
      type: d.type,
      genres: d.genres,
      countries: d.countries,
      dateText: d.date,
      timeText: d.time,
      start: start ? start.toISOString() : '',
      snacks: d.snacks,
      cozy: d.cozy,
      note: d.note,
      picks: state.picks.map((p) => ({
        title: p.title,
        year: p.year,
        mediaType: p.mediaType,
        rating: p.rating,
        poster: p.poster,
        winner: state.winnerKey === p.key,
      })),
    };
  }

  function setSending(on) {
    state.temp.sending = on;
    const btn = $('#confirm-btn');
    btn.disabled = on;
    btn.classList.toggle('sending', on);
    btn.innerHTML = on ? '<span class="spinner" aria-hidden="true"></span> Sending our ticket…' : 'Confirm our date 💌';
    $('#retry-btn').disabled = on;
    $$('#ticket .edit').forEach((b) => { b.disabled = on; });
  }

  async function confirmDate() {
    if (state.temp.sending) return;
    if (!ticketRows().every((r) => r.ok)) { renderTicket(); return; }
    $('#send-error').hidden = true;
    $('#confirm-btn').hidden = false;
    setSending(true);
    try {
      // Only emails that haven't gone out yet are (re)sent.
      const send = ['me', 'her'].filter((who) => !state.emailSent[who]);
      if (send.length) {
        if (!API_AVAILABLE) {
          const err = new Error('Emails need the site to be served (Vercel or vercel dev)');
          err.code = 'local';
          throw err;
        }
        const res = await fetch(`${API}/send-confirmation`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(confirmationPayload(send)),
        });
        let data = {};
        try { data = await res.json(); } catch (e) { /* not JSON, e.g. a 404 page */ }
        Object.keys(data.sent || {}).forEach((who) => {
          if (data.sent[who] && who in state.emailSent) state.emailSent[who] = true;
        });
        save();
        if (!res.ok) {
          const err = new Error(data.error || `Email request failed (${res.status})`);
          err.code = res.status === 404 ? 'local' : data.code;
          throw err;
        }
      }
      state.confirmed = true;
      save();
      setSending(false);
      goTo(10);
    } catch (err) {
      setSending(false);
      state.temp.sendFailures += 1;
      console.warn('[invite] Sending the confirmation failed:', err && err.message);
      showSendError(err);
    }
  }

  function showSendError(err) {
    const hints = {
      config: '(Psst: the email settings on Vercel are still missing.)',
      local: '(Psst: emails only send from the live site or `npx vercel dev`.)',
    };
    const hint = err && hints[err.code];
    $('#send-error-msg').innerHTML = "Hmm, our ticket got stuck in the mail 😢 Don't worry, all your answers are saved. Try again, or copy the details and text them to me."
      + (hint ? `<small>${hint}</small>` : '');
    $('#confirm-btn').hidden = true;
    $('#send-error').hidden = false;
    $('#skip-send-btn').hidden = !(state.temp.sendFailures >= 2 || state.temp.copied);
    $('#send-error').scrollIntoView({ behavior: motionOK() ? 'smooth' : 'auto', block: 'nearest' });
  }

  async function copyDetails() {
    const text = summaryText();
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (e) {
      const ta = $('#copy-fallback');
      ta.value = text;
      ta.hidden = false;
      ta.focus();
      ta.select();
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    }
    state.temp.copied = true;
    $('#skip-send-btn').hidden = false;
    toast(ok ? `Copied! Text it to ${CONFIG.MY_NAME || 'me'} 💕` : 'Select the text above and copy it 💕');
  }

  function skipSend() {
    state.confirmed = true;
    save();
    goTo(10);
  }

  /* =====================================================================
     STEP 10 · Celebration, countdown, calendar
     ===================================================================== */
  let countdownTimer = 0;

  function enterCelebration() {
    const her = (state.herName || '').trim() || CONFIG.HER_NAME;
    $('#thanks-line').innerHTML = `Thank you for saying yes${her ? `, ${esc(her)}` : ''}. I can't wait to see you 💕`
      + (CONFIG.MY_NAME ? `<span class="sig">— ${esc(CONFIG.MY_NAME)}</span>` : '');
    const sent = state.emailSent.me && state.emailSent.her;
    $('#email-note').textContent = sent ? 'A copy of our ticket is on its way to your inbox 💌' : 'Send me those details when you can 😉';
    $('#celebrate-picks').innerHTML = state.picks.map((p) => `<figure>${posterThumb(p, 'w154')}<figcaption>${state.winnerKey === p.key ? '👑 ' : ''}${esc(p.title)}</figcaption></figure>`).join('');
    $('#gcal-link').href = googleCalUrl();
    clearInterval(countdownTimer);
    tickCountdown();
    countdownTimer = setInterval(tickCountdown, 1000);
    if (motionOK()) setTimeout(() => confetti.celebrate(), 450);
  }

  function tickCountdown() {
    const target = whenDate();
    const set = (id, v) => { $(id).textContent = String(v); };
    const line = $('#countdown-line');
    if (!target) { line.textContent = ''; return; }
    const ms = target.getTime() - Date.now();
    if (ms <= 0) {
      ['#cd-d', '#cd-h', '#cd-m', '#cd-s'].forEach((id) => set(id, 0));
      line.textContent = ms > -4 * 3600 * 1000 ? "It's date time! 🍿❤️" : 'Hope it was as magical as you 💕';
      return;
    }
    const total = Math.floor(ms / 1000);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    set('#cd-d', days);
    set('#cd-h', hours);
    set('#cd-m', mins);
    set('#cd-s', secs);
    const units = $$('#countdown .cd-unit');
    [[days, 'day'], [hours, 'hour'], [mins, 'min'], [secs, 'sec']].forEach(([n, unit], i) => {
      if (units[i]) units[i].textContent = n === 1 ? unit : `${unit}s`;
    });
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const parts = [];
    if (days) parts.push(plural(days, 'day'));
    if (days || hours) parts.push(plural(hours, 'hour'));
    parts.push(plural(mins, 'minute'));
    line.textContent = `Our date is in ${parts.join(', ')} ❤️`;
  }

  const icsStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

  // Lines longer than 75 bytes must be folded (without splitting a character).
  function icsFold(line) {
    const enc = new TextEncoder();
    if (enc.encode(line).length <= 75) return line;
    const out = [];
    let cur = '';
    let bytes = 0;
    let limit = 75;
    for (const ch of line) {
      const b = enc.encode(ch).length;
      if (bytes + b > limit) { out.push(cur); cur = ''; bytes = 0; limit = 74; }
      cur += ch;
      bytes += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  }

  function buildICS() {
    const start = whenDate();
    const end = new Date(start.getTime() + 3 * 3600 * 1000);
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Netflix and Chill Invite//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@netflix-and-chill`,
      `DTSTAMP:${icsStamp(new Date())}`,
      `DTSTART:${icsStamp(start)}`,
      `DTEND:${icsStamp(end)}`,
      `SUMMARY:${icsEscape('Netflix & Chill Date 💕')}`,
      `DESCRIPTION:${icsEscape(summaryText())}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape('Netflix & Chill Date in 1 hour 💕')}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ];
    return `${lines.map(icsFold).join('\r\n')}\r\n`;
  }

  function downloadICS() {
    if (!whenDate()) return;
    const blob = new Blob([buildICS()], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'netflix-and-chill-date.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('Calendar invite downloaded 📅');
  }

  function googleCalUrl() {
    const start = whenDate();
    if (!start) return 'https://calendar.google.com/';
    const end = new Date(start.getTime() + 3 * 3600 * 1000);
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: 'Netflix & Chill Date 💕',
      dates: `${icsStamp(start)}/${icsStamp(end)}`,
      details: summaryText(),
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  /* =====================================================================
     Wiring + boot
     ===================================================================== */
  const ENTER = {
    2: renderPlatforms,
    3: renderTypes,
    4: renderGenres,
    5: renderCountries,
    6: enterRecs,
    7: renderWhen,
    8: renderExtras,
    9: renderTicket,
    10: enterCelebration,
  };

  function wire() {
    // Step 1
    $('#seal').addEventListener('click', openEnvelope);
    $('#skip-btn').addEventListener('click', finishTyping);
    $('#yes-btn').addEventListener('click', sayYes);
    const no = $('#no-btn');
    no.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') onNo(); });
    no.addEventListener('click', onNo);
    $('#pay-btn').addEventListener('click', payFee);
    $('#fine-yes-btn').addEventListener('click', () => { closeModal(); sayYes(); });

    // Navigation
    $('#back-btn').addEventListener('click', goBack);
    $$('[data-next]').forEach((b) => b.addEventListener('click', () => onNext(Number(b.dataset.next))));

    // Steps 2–5
    $('#platform-grid').addEventListener('click', onPlatformClick);
    $('#type-grid').addEventListener('click', onTypeClick);
    $('#genre-chips').addEventListener('click', onGenreClick);
    $('#country-chips').addEventListener('click', onCountryClick);

    // Step 6
    const input = $('#search-input');
    input.addEventListener('input', () => { $('#search-clear').hidden = !input.value; debouncedSearch(); });
    $('#search-form').addEventListener('submit', (e) => { e.preventDefault(); runSearch(input.value); input.blur(); });
    $('#search-clear').addEventListener('click', () => { clearSearch(); input.focus(); });
    $('#title-grid').addEventListener('click', onGridClick);
    $('#step-6').addEventListener('click', onRecsAction);
    $('#more-btn').addEventListener('click', () => { recs.error = ''; loadRecs(); });
    $('#tray-picks').addEventListener('click', (e) => { const b = e.target.closest('[data-remove]'); if (b) removePick(b.dataset.remove); });
    $('#tray-next').addEventListener('click', () => onNext(6));
    $('#spin-btn').addEventListener('click', openWheel);
    $('#wheel-spin').addEventListener('click', spinWheel);

    // Step 7
    $('#date-quick').addEventListener('click', onQuickDate);
    $('#time-chips').addEventListener('click', onTimeChip);
    const dateInput = $('#date-input');
    const onDate = () => { state.date = dateInput.value; save(); markWhen(false); };
    dateInput.addEventListener('input', onDate);
    dateInput.addEventListener('change', onDate);
    const timeInput = $('#time-input');
    const onTime = () => { state.time = timeInput.value; save(); markWhen(false); };
    timeInput.addEventListener('input', onTime);
    timeInput.addEventListener('change', onTime);

    // Step 8
    $('#snack-chips').addEventListener('click', onSnackClick);
    $('#cozy-range').addEventListener('input', (e) => {
      const v = clampInt(e.target.value, 0, 4);
      const changed = v !== state.cozy;
      state.cozy = v;
      save();
      updateCozy(changed);
    });
    $('#note-input').addEventListener('input', (e) => { state.note = e.target.value; save(); });
    $('#name-input').addEventListener('input', (e) => { state.herName = e.target.value; save(); });
    $('#email-input').addEventListener('input', (e) => { state.herEmail = e.target.value; save(); });

    // Step 9
    $('#ticket').addEventListener('click', onTicketClick);
    $('#confirm-btn').addEventListener('click', confirmDate);
    $('#retry-btn').addEventListener('click', confirmDate);
    $('#copy-btn').addEventListener('click', copyDetails);
    $('#skip-send-btn').addEventListener('click', skipSend);

    // Step 10
    $('#ics-btn').addEventListener('click', downloadICS);

    // Global
    $('#music-btn').addEventListener('click', toggleMusic);
    $$('.modal').forEach((m) => m.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]') && !m.dataset.locked) closeModal();
    }));
    document.addEventListener('keydown', onModalKey);
    document.addEventListener('error', onImgError, true);
    ['wheel', 'touchmove'].forEach((t) => window.addEventListener(t, () => { lastUserScroll = Date.now(); }, { passive: true }));
    window.addEventListener('resize', debounce(updateTrayHeight, 150));
  }

  function setupStickyBars() {
    $$('.step-actions.sticky').forEach((bar) => {
      const sentinel = document.createElement('div');
      sentinel.className = 'sticky-sentinel';
      sentinel.setAttribute('aria-hidden', 'true');
      bar.after(sentinel);
    });
    window.addEventListener('scroll', queueStickyUpdate, { passive: true });
    window.addEventListener('resize', queueStickyUpdate);
  }

  function boot() {
    $$('[data-next]').forEach((b) => { b.dataset.label = b.textContent.trim(); });
    buildStars();
    buildAmbient();
    confetti.init();
    setupStickyBars();
    wire();

    if (state.confirmed) {
      goTo(10, { instant: true });
      return;
    }
    if (state.accepted) {
      goTo(Math.min(Math.max(state.step, 2), 9), { instant: true });
      setTimeout(() => toast('Welcome back 💕 I saved your answers'), 700);
      return;
    }
    state.step = 1;
    startIntro();
  }

  boot();
})();
