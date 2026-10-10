// ---- apply images from CONFIG ----
if(CONFIG.images.bannerVideo){
  document.getElementById('banner').innerHTML = `<video src="${CONFIG.images.bannerVideo}" autoplay muted loop playsinline></video>`;
} else if(CONFIG.images.banner){
  document.getElementById('banner').style.backgroundImage = `url('${CONFIG.images.banner}')`;
}
if(CONFIG.images.avatar){
  document.getElementById('avatar').innerHTML = `<img src="${CONFIG.images.avatar}" alt="avatar">`;
}
if(CONFIG.images.pageBackground){
  const v = document.getElementById('bgVideo');
  v.src = CONFIG.images.pageBackground;
  v.style.display = 'block';
}
// ---- image-or-video helpers (used by the card background and every tab background) ----
function isVideoUrl(u){ return /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i.test(u || '') || /^data:video\//i.test(u || ''); }
function mediaHTML(u){
  return isVideoUrl(u)
    ? `<video src="${esc(u)}" autoplay muted loop playsinline></video>`
    : `<img src="${esc(u)}" alt="">`;
}
if(CONFIG.images.panelBackground){
  const pbg = document.createElement('div');
  pbg.className = 'panel-bg';
  pbg.innerHTML = mediaHTML(CONFIG.images.panelBackground);
  document.querySelector('.panel').prepend(pbg);
}
const contentBox = document.getElementById('contentBox');
if(CONFIG.images.contentVideo){
  contentBox.innerHTML = `<video src="${CONFIG.images.contentVideo}" autoplay muted loop playsinline></video>`;
} else {
  contentBox.textContent = 'video / content';
}

// ---- background audio: browsers block real autoplay-with-sound, so it starts on first tap ----
if(CONFIG.images.bgAudio){
  const audioEl = document.getElementById('bgAudio');
  const soundBtn = document.getElementById('soundBtn');
  const soundIcon = document.getElementById('soundIcon');
  audioEl.src = CONFIG.images.bgAudio;
  soundBtn.style.display = 'flex';
  let playing = false;

  function setIcon(on){
    soundIcon.innerHTML = on
      ? '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a9 9 0 0 1 0 12"/>'
      : '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M23 9l-6 6M17 9l6 6"/>';
  }
  setIcon(false);

  function startAudio(){
    audioEl.play().then(()=>{ playing = true; setIcon(true); }).catch(()=>{});
  }
  document.body.addEventListener('click', function first(){
    if(!playing) startAudio();
    document.body.removeEventListener('click', first);
  });
  soundBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    if(playing){ audioEl.pause(); playing = false; setIcon(false); }
    else{ startAudio(); }
  });
}

document.getElementById('devicesRow').innerHTML = CONFIG.devices.map(d=>{
  const icons = {
    PC: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/></svg>',
    Laptop: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="10" rx="1.2"/><path d="M2 19h20l-2-4H4l-2 4z"/></svg>',
    Phone: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>'
  };
  return `<div class="device"><span class="ic">${icons[d]||'🔧'}</span>${d}</div>`;
}).join('');

function logoBox(item){
  if(item.logo){
    return `<div class="item-logo" style="background-image:url('${item.logo}')"></div>`;
  }
  return `<div class="item-logo">${item.icon}</div>`;
}

function renderGames(){
  return CONFIG.games.map(g=>`
    <div class="list-item"${g.bg ? ` style="background-image:url('${g.bg}')"` : ''}>
      ${logoBox(g)}
      <div class="item-text">
        <div class="label-row">${g.label}</div>
        <div class="sub-line">@${g.username} · id ${g.id}</div>
      </div>
    </div>`).join('');
}
function renderSocials(){
  return CONFIG.socials.map(s=>`
    <a class="list-item" href="${s.link}" target="_blank" rel="noopener"${s.bg ? ` style="background-image:url('${s.bg}')"` : ''}>
      ${logoBox(s)}
      <div class="item-text">
        <div class="label-row">${s.label}</div>
        ${s.desc ? `<div class="sub-line">${s.desc}</div>` : ''}
      </div>
      <span class="open-btn">Open</span>
    </a>`).join('');
}

function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ===== shared state (profile + activity posts) now lives in the artifact's db, =====
// ===== so every device shows the same thing instead of each browser's own copy. =====
let db = null, user = null, uid = null, isOwner = false, DATA_READY = false;

let activityPosts = [];

// same Spotify song saved twice -> keep only the newest one
function spotifyKey(p){ return (p.link || p.meta || '').split('?')[0].trim().toLowerCase(); }
function dedupeSpotify(){
  const seen = new Set();
  const before = activityPosts.length;
  activityPosts = activityPosts.filter(p=>{
    if(p.label !== 'Spotify') return true;
    const k = spotifyKey(p);
    if(seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if(activityPosts.length !== before) savePosts();
}

async function savePosts(){
  if(db && isOwner){
    try{ await db.doc('site/activity').set({ posts: activityPosts }); }catch(e){}
  } else if(!db){
    try{ localStorage.setItem('helloworld_activity_posts', JSON.stringify(activityPosts)); }catch(e){}
  }
}

// Owner tools (the + buttons and the × remove buttons) are only shown in edit mode.
// With the shared database connected, edit mode simply follows "is this visitor the
// site owner" - so it turns on for the owner on every device, and never for anyone
// else. Without a database (e.g. previewing the raw file), #edit / #view still work
// as a local-only fallback, same as before.
let EDIT = false;
function localEditFallback(){
  try{
    if(location.hash === '#edit') localStorage.setItem('helloworld_edit', '1');
    if(location.hash === '#view') localStorage.removeItem('helloworld_edit');
    return localStorage.getItem('helloworld_edit') === '1';
  }catch(e){ return location.hash === '#edit'; }
}
window.addEventListener('hashchange', ()=> location.reload());

// ---- profile text: editable in edit mode, saved for every device/visitor ----
const PROFILE_KEY = 'helloworld_profile';
let profile = { name:CONFIG.name, title:CONFIG.title, username:CONFIG.username, id:CONFIG.id, bio:CONFIG.bio };

async function saveProfile(){
  if(db && isOwner){
    try{ await db.doc('site/profile').set(profile); }catch(e){}
  } else if(!db){
    try{ localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }catch(e){}
  }
}

function badgeHTML(){
  if(!CONFIG.verified) return '';
  if(CONFIG.images.badge) return `<img class="badge-img" src="${esc(CONFIG.images.badge)}" alt="verified">`;
  return `<svg class="badge" viewBox="0 0 24 24" role="img" aria-label="Verified"><path fill="currentColor" d="M12 1.6l2.5 1.9 3.1-.2 1.1 2.9 2.8 1.5-.5 3.1L22.4 12l-1.4 2.4.5 3.1-2.8 1.5-1.1 2.9-3.1-.2L12 22.4l-2.5-1.9-3.1.2-1.1-2.9-2.8-1.5.5-3.1L1.6 12 3 9.6l-.5-3.1 2.8-1.5 1.1-2.9 3.1.2z"/><path d="M7.8 12.2l2.9 2.9 5.5-5.7" fill="none" stroke="#1a1008" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function renderProfile(){
  const ce = EDIT ? ' contenteditable="true" spellcheck="false"' : '';
  document.getElementById('nameRow').innerHTML = `<span class="ed" data-f="name"${ce}></span>${badgeHTML()}`;
  document.getElementById('titleText').innerHTML = `<span class="ed" data-f="title"${ce}></span>`;
  document.getElementById('uidText').innerHTML = `@<span class="ed" data-f="username"${ce}></span> · id <span class="ed" data-f="id"${ce}></span>`;
  document.getElementById('bioText').innerHTML = `<span class="ed" data-f="bio"${ce}></span>`;
  document.querySelectorAll('[data-f]').forEach(el=>{
    el.textContent = profile[el.dataset.f] || '';
    if(!EDIT) return;
    el.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); el.blur(); } });
    el.addEventListener('paste', e=>{ e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s+/g,' ')); });
    el.addEventListener('blur', ()=>{
      profile[el.dataset.f] = el.textContent.trim();
      saveProfile();
    });
  });
  const oldTag = document.querySelector('.edit-tag-fixed');
  if(oldTag) oldTag.remove();
  if(EDIT){
    const tag = document.createElement('div');
    tag.className = 'edit-tag-fixed';
    tag.textContent = db
      ? '✎ edit mode — signed in as the owner, changes sync to every device'
      : '✎ edit mode — click any dashed text · add #view to the address to leave';
    document.body.appendChild(tag);
  }
}

// Playlist tab: all saved Spotify songs / playlists

// Spotify's own compact player (same look as the one at the bottom) - needs no title/cover lookup
function spotifyEmbedUrl(link){
  const u = spotifyUri(link);
  if(!u) return null;
  const [, type, id] = u.split(':');
  return `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;
}
function spotifyEmbedHTML(link, h){
  const src = spotifyEmbedUrl(link);
  return src ? `<iframe src="${src}" height="${h}" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" title="Spotify player"></iframe>` : '';
}

function renderPlaylist(){
  const delBtn = i => EDIT ? `<button class="del-btn edit-btn" data-edit="${i}" title="Edit title / artist">✎</button><button class="del-btn" data-del="${i}" title="Remove">×</button>` : '';
  const songs = activityPosts.map((a, i)=>({a, i})).filter(x => x.a.label === 'Spotify');
  const items = songs.length ? songs.map(({a, i})=>{
    const link = a.link || a.meta;
    const h = /\/(playlist|album|show)\//.test(link) ? 152 : 80;
    const embed = spotifyEmbedHTML(link, h);
    if(embed){
      const tools = EDIT ? `<div class="tools"><button class="del-btn" data-del="${i}" title="Remove">×</button></div>` : '';
      return `<div class="sp-embed">${tools}${embed}</div>`;
    }
    return `
    <a class="activity-item spotify-card" href="${esc(link)}" target="_blank" rel="noopener">
      <div class="sp-art sp-art-empty">🎧</div>
      <div class="sp-text"><div class="sp-title">${esc(a.title || link)}</div>${a.artist ? `<div class="sp-artist">${esc(a.artist)}</div>` : ''}</div>
      ${delBtn(i)}
    </a>`;
  }).join('') : `<div class="activity-item" style="color:var(--sub);">No songs yet</div>`;
  return `
    ${EDIT ? `<div class="add-row">
      <button class="add-btn" id="addSong">+ Song</button>
      <button class="add-btn" id="addPlaylist">+ Playlist</button>
    </div>` : ''}
    <div>${items}</div>`;
}

function renderActivity(){
  const all = activityPosts.concat(CONFIG.activity);
  const delBtn = i => (EDIT && i < activityPosts.length) ? `<button class="del-btn" data-del="${i}" title="Remove">×</button>` : '';
  const shown = all.map((a, i)=>({a, i})).filter(x => x.a.label !== 'Spotify');
  const items = shown.length ? shown.map(({a, i})=>{
    if(a.data && (a.kind === 'photo' || a.kind === 'video')){
      const media = a.kind === 'photo'
        ? `<img src="${a.data}">`
        : `<video src="${a.data}" muted loop autoplay playsinline></video>`;
      return `
      <div class="activity-item media">
        <div class="media-preview">${media}${delBtn(i)}</div>
      </div>`;
    }
    return `
    <div class="activity-item${a.locked ? ' locked':''}">
      <span>${a.icon}</span><span>${a.label}</span><span class="meta">${a.meta||''}</span>${delBtn(i)}
    </div>`;
  }).join('') : `<div class="activity-item" style="color:var(--sub); border-bottom:none;">Nothing posted yet</div>`;
  return `
    ${EDIT ? `<div class="add-row">
      <button class="add-btn" id="addPhoto">+ Photo</button>
      <button class="add-btn" id="addVideo">+ Video</button>
      <input type="file" id="photoFile" accept="image/*" style="display:none;">
      <input type="file" id="videoFile" accept="video/*" style="display:none;">
    </div>` : ''}
    <div>${items}</div>`;
}

// Look up title + cover (+ artist when possible) from a Spotify link
async function fetchSpotifyInfo(link){
  const clean = link.trim().split('?')[0];
  const info = { link: clean, title: '', artist: '', thumb: '' };
  try{
    const r = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(clean));
    if(r.ok){
      const j = await r.json();
      info.title = j.title || '';
      info.thumb = j.thumbnail_url || '';
    }
  }catch(e){}
  // oEmbed has no artist name, so try the page's description (best effort)
  try{
    const r = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(clean));
    if(r.ok){
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      const desc = (doc.querySelector('meta[property="og:description"]') || {}).content || '';
      const parts = desc.split('·').map(p => p.trim()).filter(Boolean)
        .filter(p => p !== info.title && !/^(Song|Single|Album|EP|Playlist|Artist)$/i.test(p) && !/^\d{4}$/.test(p) && !/likes?|saves?|monthly/i.test(p));
      if(parts.length) info.artist = parts[0];
      if(!info.title){
        info.title = ((doc.querySelector('meta[property="og:title"]') || {}).content || '');
      }
      if(!info.thumb){
        info.thumb = ((doc.querySelector('meta[property="og:image"]') || {}).content || '');
      }
    }
  }catch(e){}
  return info;
}

function addActivityPost(icon, label, meta, data, kind, extra){
  if(label === 'Spotify'){
    const k = spotifyKey({link: (extra && extra.link) || meta});
    activityPosts = activityPosts.filter(p => !(p.label === 'Spotify' && spotifyKey(p) === k));
  }
  activityPosts.unshift(Object.assign({icon, label, meta, data, kind}, extra || {}));
  savePosts();
  renderTab(currentTab);
  if(label === 'Spotify'){
    renderNowPlaying();
  } else {
    renderFloaters();
    spawnPostToast(icon, label);
  }
}

// Floating layer: the latest songs, photos and videos drift at random (but remembered) spots beside the panel
function renderFloaters(){
  document.querySelectorAll('.float-song, .float-media').forEach(el => el.remove());
  const panel = document.querySelector('.panel');
  if(!panel) return;
  const pr = panel.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const bandL = pr.left, bandR = vw - pr.right;
  if(Math.max(bandL, bandR) < 150) return; // screen too narrow: nothing floats

  const items = activityPosts
    .filter(p => p.label === 'Spotify' || (p.data && (p.kind === 'photo' || p.kind === 'video')))
    .slice(0, 8);
  let seeded = false;
  const placed = [];

  items.forEach(p=>{
    if(p.fx == null){
      p.fx = Math.random(); p.fy = Math.random();
      p.fside = Math.random() < 0.5 ? 0 : 1;
      p.frot = Math.random() * 6 - 3;
      p.fdur = 4 + Math.random() * 3;
      p.fdelay = -Math.random() * 5;
      seeded = true;
    }
    const isSong = p.label === 'Spotify';
    const h = isSong ? (/\/(playlist|album|show)\//.test(p.link || p.meta || '') ? 152 : 80) : 110;
    const bandOf = side => side === 0 ? bandL : bandR;
    const wOf = side => Math.min(isSong ? 300 : 150, bandOf(side) - 24);
    const yMax = Math.max(12, vh - h - 70);

    let spot = null;
    for(let attempt = 0; attempt < 40 && !spot; attempt++){
      const side = attempt < 20 ? p.fside : 1 - p.fside;
      const w = wOf(side);
      if(w < (isSong ? 240 : 110)) continue;
      const xMin = side === 0 ? 12 : pr.right + 12;
      const xMax = side === 0 ? bandL - w - 12 : vw - w - 12;
      if(xMax < xMin) continue;
      // fallback spots are derived from the saved seed, so the layout stays the same after a refresh
      const rx = (p.fx + attempt * 0.618034) % 1;
      const ry = (p.fy + attempt * 0.381966) % 1;
      const x = xMin + rx * (xMax - xMin);
      const y = 12 + ry * (yMax - 12);
      const clash = placed.some(r => x < r.x + r.w + 10 && x + w + 10 > r.x && y < r.y + r.h + 10 && y + h + 10 > r.y);
      if(!clash) spot = {x, y, w, h};
    }
    if(!spot) return;
    placed.push(spot);

    let el;
    if(isSong){
      el = document.createElement('div');
      el.className = 'float-song float-embed';
      const lk = p.link || p.meta;
      el.innerHTML = spotifyEmbedHTML(lk, /\/(playlist|album|show)\//.test(lk) ? 152 : 80) ||
        `<a class="sp-fallback" href="${esc(lk)}" target="_blank" rel="noopener">🎧 ${esc(p.title || lk)}</a>`;
    } else {
      el = document.createElement('div');
      el.className = 'float-media';
      el.innerHTML = p.kind === 'photo'
        ? `<img src="${p.data}" alt="">`
        : `<video src="${p.data}" muted loop autoplay playsinline></video>`;
    }
    el.style.left = spot.x + 'px';
    el.style.top = spot.y + 'px';
    el.style.width = spot.w + 'px';
    if(!isSong) el.style.height = spot.h + 'px';
    el.style.rotate = p.frot + 'deg';
    el.style.animationDuration = p.fdur + 's';
    el.style.animationDelay = p.fdelay + 's';
    document.body.appendChild(el);
  });
  if(seeded) savePosts();
}

let floatResizeTimer = null;
window.addEventListener('resize', ()=>{
  clearTimeout(floatResizeTimer);
  floatResizeTimer = setTimeout(renderFloaters, 200);
});

// ---- background music: embedded Spotify player that loads + plays the latest song you added ----
let spApi = null, spController = null, spLoadedUri = null, spWantPlay = false;

function spotifyUri(link){
  const m = (link || '').match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/);
  return m ? 'spotify:' + m[1] + ':' + m[2] : null;
}

window.onSpotifyIframeApiReady = (IFrameAPI)=>{ spApi = IFrameAPI; renderPlayer(); };


// browsers only allow sound after a tap/click, so the first click anywhere starts the music
document.addEventListener('click', ()=>{
  spWantPlay = true;
  if(spController){ try{ spController.play(); }catch(e){} }
}, {once:true});

function renderPlayer(){
  // bottom player removed - songs play from the Playlist cards instead
  const oldBox = document.getElementById('spPlayerBox');
  if(oldBox) oldBox.remove();
  document.body.classList.remove('has-player');
  return;
}

function renderNowPlaying(){
  renderFloaters();
  renderPlayer();
  const existing = document.getElementById('nowPlaying');
  if(existing) existing.remove();
  const latest = activityPosts.find(p => p.label === 'Spotify');
  if(!latest) return;
  const el = document.createElement('a');
  el.id = 'nowPlaying';
  el.className = 'now-playing';
  el.href = latest.link || latest.meta;
  el.target = '_blank';
  el.rel = 'noopener';
  const npTitle = latest.title ? (latest.title + (latest.artist ? ' · ' + latest.artist : '')) : latest.meta;
  el.innerHTML = `<span class="np-icon">🎧</span><span class="np-text"><span class="np-label">Now playing</span><span class="np-title">${esc(npTitle)}</span></span>`;
  document.body.appendChild(el);
}

function spawnPostToast(icon, label){
  const corners = [
    {top:'16px', left:'16px'},
    {top:'16px', right:'16px'},
    {bottom:'16px', left:'16px'},
    {bottom:'16px', right:'16px'}
  ];
  const pos = corners[Math.floor(Math.random()*corners.length)];
  const el = document.createElement('div');
  el.className = 'post-toast';
  Object.assign(el.style, pos);
  el.innerHTML = `<span>${icon}</span><span>New ${label} post added</span>`;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 2600);
}

// Tab backgrounds are built once and preloaded, then just cross-faded when you switch tabs
// (no re-loading, so the card background underneath never flashes through)
const tabBgLayers = {};
function buildTabBackgrounds(){
  const colRight = document.querySelector('.col-right');
  const map = CONFIG.images.tabBackgrounds || {};
  Object.keys(map).forEach(k=>{
    const url = map[k];
    if(!url) return;
    const layer = document.createElement('div');
    layer.className = 'tab-bg';
    layer.innerHTML = isVideoUrl(url)
      ? `<video src="${esc(url)}" muted loop playsinline preload="auto"></video>`
      : `<img src="${esc(url)}" alt="">`;
    colRight.prepend(layer);
    tabBgLayers[k] = layer;
  });
}
function showTabBackground(key){
  Object.keys(tabBgLayers).forEach(k=>{
    const on = k === key;
    const layer = tabBgLayers[k];
    layer.classList.toggle('on', on);
    const v = layer.querySelector('video');
    if(v){ if(on){ const p = v.play(); if(p && p.catch) p.catch(()=>{}); } else { v.pause(); } }
  });
}

let currentTab = 'activity';
const renderers = {games:renderGames, socials:renderSocials, activity:renderActivity, playlist:renderPlaylist};
function renderTab(key){
  currentTab = key;
  const tabBody = document.getElementById('tabBody');
  showTabBackground(key);
  document.getElementById('tabBodyInner').innerHTML = renderers[key]();
  if(key === 'activity' || key === 'playlist'){
    document.querySelectorAll('.del-btn').forEach(btn=>{
      btn.addEventListener('click', e=>{
        e.preventDefault();
        e.stopPropagation();
        activityPosts.splice(Number(btn.dataset.del), 1);
        savePosts();
        renderTab(currentTab);
        renderNowPlaying();
      });
    });
    document.querySelectorAll('[data-edit]').forEach(btn=>{
      btn.addEventListener('click', e=>{
        e.preventDefault();
        e.stopPropagation();
        const post = activityPosts[Number(btn.dataset.edit)];
        if(!post) return;
        const t = prompt('Title:', post.title || '');
        if(t === null) return;
        const a = prompt('Artist (optional):', post.artist || '');
        post.title = t.trim() || post.title;
        if(a !== null) post.artist = a.trim();
        savePosts();
        renderTab(currentTab);
        renderNowPlaying();
      });
    });
    function setupSpotifyButton(btnId, type){
      const btn = document.getElementById(btnId);
      const isPlaylist = type === 'playlist';
      btn.addEventListener('click', async ()=>{
        const link = prompt(isPlaylist ? 'Paste the Spotify playlist link:' : 'Paste the Spotify song link:');
        if(!link) return;
        const kindOk = isPlaylist ? /\/(playlist|album)\//.test(link) : /\/track\//.test(link);
        if(!kindOk){
          alert(isPlaylist
            ? 'That doesn\'t look like a playlist link. Use the + Song button for single songs.'
            : 'That doesn\'t look like a song link. Use the + Playlist button for playlists.');
          return;
        }
        const oldText = btn.textContent;
        btn.textContent = 'Loading…';
        btn.disabled = true;
        const info = await fetchSpotifyInfo(link);
        if(isPlaylist){
          info.artist = info.artist ? 'Playlist · ' + info.artist : 'Playlist';
        } else if(!info.artist && info.title){
          const typed = prompt('Artist name (optional — couldn\'t be found automatically):', '');
          if(typed) info.artist = typed.trim();
        }
        if(!info.title){
          info.title = prompt('Couldn\'t load the info. Type the title:', '') || 'Spotify link';
        }
        info.spType = type;
        spWantPlay = true;
        addActivityPost('🎧', 'Spotify', info.link, null, 'spotify', info);
      });
    }
    if(key === 'playlist' && EDIT){
      setupSpotifyButton('addSong', 'song');
      setupSpotifyButton('addPlaylist', 'playlist');
    }
    if(key === 'activity' && EDIT){
    const photoFile = document.getElementById('photoFile');
    const videoFile = document.getElementById('videoFile');
    document.getElementById('addPhoto').addEventListener('click', ()=> photoFile.click());
    document.getElementById('addVideo').addEventListener('click', ()=> videoFile.click());
    photoFile.addEventListener('change', ()=>{
      const file = photoFile.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = ()=> addActivityPost('🖼️', 'Photo', file.name, reader.result, 'photo');
      reader.readAsDataURL(file);
    });
    videoFile.addEventListener('change', ()=>{
      const file = videoFile.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = ()=> addActivityPost('🎬', 'Video', file.name, reader.result, 'video');
      reader.readAsDataURL(file);
    });
    }
  }
}

document.getElementById('tabs').addEventListener('click', e=>{
  const btn = e.target.closest('.tab');
  if(!btn) return;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  renderTab(btn.dataset.tab);
});

// ---- likes / views: real shared counts (one per signed-in visitor), same database ----
const likeBtn = document.getElementById('likeBtn');
const likeN = document.getElementById('likeN');
const viewN = document.getElementById('viewN');
const statHint = document.getElementById('statHint');
let liked = false;

function paintLike(count){
  likeN.textContent = count;
  likeBtn.classList.toggle('liked', liked);
}

function localStats(){
  statHint.textContent = 'tap the heart to like — counted on this device only';
  let visits = 1;
  try{
    liked = localStorage.getItem('helloworld_liked') === 'true';
    visits = (parseInt(localStorage.getItem('helloworld_visits'), 10) || 0) + 1;
    localStorage.setItem('helloworld_visits', visits);
  }catch(e){}
  paintLike(liked ? 1 : 0);
  viewN.textContent = visits;
  likeBtn.addEventListener('click', ()=>{
    liked = !liked;
    try{ localStorage.setItem('helloworld_liked', liked); }catch(e){}
    paintLike(liked ? 1 : 0);
  });
}

async function initStats(){
  let likeDoc, viewDoc;
  if(!uid){ localStats(); return; }

  async function refreshCounts(){
    const [likesQ, viewsQ] = await Promise.all([
      db.collection('likes').get(),
      db.collection('views').get()
    ]);
    viewN.textContent = viewsQ.size;
    paintLike(likesQ.size);
  }

  try{
    likeDoc = db.doc('likes/' + uid);
    viewDoc = db.doc('views/' + uid);
    liked = (await likeDoc.get()).exists;
    if(!(await viewDoc.get()).exists){ await viewDoc.set({ at: Date.now() }); }
    await refreshCounts();
  }catch(e){ localStats(); return; }

  statHint.textContent = 'tap the heart to like — one like per signed-in visitor, synced everywhere';
  likeBtn.addEventListener('click', async ()=>{
    liked = !liked;
    paintLike(likeN.textContent);
    try{
      if(liked){ await likeDoc.set({ at: Date.now() }); } else { await likeDoc.delete(); }
    }catch(e){ liked = !liked; }
    try{ await refreshCounts(); }catch(e){ paintLike(likeN.textContent); }
  });
}

// ---- boot: connect to the shared database (if this view has it), load the real
// profile/activity/edit state, then render everything that depends on it ----
async function boot(){
  try{ db = await claude.use('db'); }catch(e){}
  try{ user = await claude.use('user'); }catch(e){}
  if(user){
    try{ isOwner = user.isOwner(); }catch(e){ isOwner = false; }
    try{ uid = await user.id(); }catch(e){ uid = null; }
  }

  if(db){
    EDIT = isOwner;
    try{
      const snap = await db.doc('site/profile').get();
      if(snap.exists) Object.assign(profile, snap.data());
    }catch(e){}
    try{
      const snap = await db.doc('site/activity').get();
      if(snap.exists && Array.isArray(snap.data().posts)) activityPosts = snap.data().posts;
    }catch(e){}
  } else {
    EDIT = localEditFallback();
    try{ Object.assign(profile, JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}); }catch(e){}
    try{ activityPosts = JSON.parse(localStorage.getItem('helloworld_activity_posts')) || []; }catch(e){ activityPosts = []; }
  }
  dedupeSpotify();

  renderProfile();
  buildTabBackgrounds();
  renderTab('activity');
  renderNowPlaying();
  initStats();
}
boot();
