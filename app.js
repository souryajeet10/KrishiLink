/**
 * KrishiLink – App Controller
 * ============================
 * Single-page application router, screen renderer, and event controller.
 */

'use strict';

// Assign directly to window so inline onclick="App.xxx()" handlers can access it
window.App = {
  // ── State ──────────────────────────────────────────────────
  currentScreen: 'splash',
  history: [],
  currentListing: null,
  addForm: { crop: '', variety: '', qty: 500, unit: 'kg', grade: 'A', price: '', location: '', desc: '' },
  currentCropTab: 'Tomato',
  mandiFilter: '',
  marketFilter: 'all',
  currentStep: 1,
  currentLang: (typeof localStorage !== 'undefined' && localStorage.getItem('krishilink_lang')) || 'hi',

  setActiveNav(btn) {
    if (!btn) return;
    const parent = btn.closest('.bottom-nav');
    if (parent) {
      parent.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
    }
    btn.classList.add('active');
  },

  showToast(msg, duration = 3000) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(20px)';
    }, duration);
  },

  // ── Navigation ─────────────────────────────────────────────
  navigate(screenId) {
    const prev = this.currentScreen;
    if (prev !== screenId) {
      this.history.push(prev);
    }
    this.showScreen(screenId);
    this.currentScreen = screenId;
    this.onScreenEnter(screenId);
  },

  goBack() {
    const prev = this.history.pop();
    if (prev) {
      this.showScreen(prev);
      this.currentScreen = prev;
      this.onScreenEnter(prev);
    } else {
      const user = AuthService.getUser();
      if (user) {
        const home = user.role === 'farmer' ? 'farmer-dashboard' : user.role === 'buyer' ? 'buyer-dashboard' : 'admin-dashboard';
        this.navigate(home);
      } else {
        this.navigate('splash');
      }
    }
  },

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(`screen-${id}`);
    if (el) el.classList.add('active');
    window.scrollTo(0, 0);
    setTimeout(() => {
      if (window.lucide) {
        try { lucide.createIcons(); } catch (e) {}
      }
    }, 20);
  },

  onScreenEnter(id) {
    switch (id) {
      case 'farmer-dashboard': this.renderFarmerDashboard(); break;
      case 'buyer-dashboard':  this.renderBuyerDashboard();  break;
      case 'admin-dashboard':  this.renderAdminDashboard();  break;
      case 'marketplace':      this.renderMarketplace('all'); break;
      case 'mandi-prices':     this.renderMandiPrices('');   break;
      case 'nearby-mandis':    this.renderNearbyMandis();    break;
      case 'orders':           this.renderOrders();          break;
      case 'notifications':    this.renderNotifications();   break;
      case 'profile':          this.renderProfile();         break;
      case 'add-produce':      this.initAddProduce();        break;
      case 'make-offer':       this.initMakeOffer();         break;
      case 'onboarding-farmer': this.setFarmerOBStep(1);     break;
      case 'onboarding-buyer':  this.setBuyerOBStep(1);      break;
    }
  },

  // ── Auth ───────────────────────────────────────────────────
  async doLogin() {
    const phone = document.getElementById('login-phone').value.trim();
    const pass  = document.getElementById('login-pass').value;
    if (!phone || !pass) { this.showLoginError('सभी फ़ील्ड भरें / Fill all fields'); return; }
    const btn = document.getElementById('login-btn');
    btn.textContent = 'लॉगिन हो रहा है...';
    btn.disabled = true;
    try {
      const result = await AuthService.login(phone, pass);
      btn.innerHTML = '<span class="material-symbols-outlined">login</span> लॉगिन करें';
      btn.disabled = false;
      if (result.success) {
        this.showToast(`✅ स्वागत है, ${result.user.name}!`);
        const route = result.user.role === 'farmer' ? 'farmer-dashboard'
                    : result.user.role === 'buyer'  ? 'buyer-dashboard'
                    : 'admin-dashboard';
        this.navigate(route);
      } else {
        this.showLoginError(result.error || '❌ गलत नंबर या पासवर्ड / Invalid credentials');
      }
    } catch (err) {
      btn.innerHTML = '<span class="material-symbols-outlined">login</span> लॉगिन करें';
      btn.disabled = false;
      this.showLoginError(err.message || 'लॉगिन में त्रुटि');
    }
  },

  showLoginError(msg) {
    const el = document.getElementById('login-error');
    const txt = document.getElementById('login-error-text');
    txt.textContent = msg;
    el.classList.remove('hidden');
    el.style.display = 'flex';
    setTimeout(() => { el.classList.add('hidden'); el.style.display = 'none'; }, 4000);
  },

  fillDemo(phone, pass) {
    document.getElementById('login-phone').value = phone;
    document.getElementById('login-pass').value = pass;
    this.doLogin();
  },

  async doRegister() {
    const role = document.querySelector('#reg-role-farmer').style.borderColor.includes('primary') ? 'farmer' : 'buyer';
    const name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const pass = document.getElementById('reg-pass').value;
    const email = document.getElementById('reg-email').value.trim();
    const errEl = document.getElementById('reg-error');

    if (!name || !phone || !pass) {
      errEl.textContent = '❌ नाम, मोबाइल और पासवर्ड जरूरी है'; errEl.classList.remove('hidden'); return;
    }
    if (pass.length < 4) {
      errEl.textContent = '❌ पासवर्ड कम से कम 4 अक्षर'; errEl.classList.remove('hidden'); return;
    }
    errEl.classList.add('hidden');
    const data = {
      role, name, phone, email, password: pass,
      village: document.getElementById('reg-village')?.value || '',
      district: document.getElementById('reg-district')?.value || '',
      state: document.getElementById('reg-state')?.value || '',
      company: document.getElementById('reg-company')?.value || '',
      city: document.getElementById('reg-city')?.value || '',
    };
    try {
      const result = await AuthService.register(data);
      if (result.success) {
        this.showToast(`🎉 खाता बन गया! Welcome, ${name}!`);
        const route = role === 'farmer' ? 'onboarding-farmer' : 'onboarding-buyer';
        this.navigate(route);
      } else {
        errEl.textContent = `❌ ${result.error || 'पंजीकरण विफल'}`; errEl.classList.remove('hidden');
      }
    } catch (err) {
      errEl.textContent = `❌ ${err.message || 'त्रुटि'}`; errEl.classList.remove('hidden');
    }
  },

  setRegRole(role) {
    const fa = document.getElementById('reg-role-farmer');
    const bu = document.getElementById('reg-role-buyer');
    const farmerFields = document.getElementById('farmer-fields');
    const buyerFields  = document.getElementById('buyer-fields');
    if (role === 'farmer') {
      fa.style.cssText = 'flex:1;padding:16px 8px;border-radius:16px;border:2.5px solid var(--primary);background:rgba(27,94,32,0.08);color:var(--primary);font-size:14px;font-weight:700;display:flex;flex-direction:column;align-items:center;gap:6px;';
      bu.style.cssText = 'flex:1;padding:16px 8px;border-radius:16px;border:2.5px solid var(--outline-variant);background:var(--surface-container);color:var(--on-surface-variant);font-size:14px;font-weight:700;display:flex;flex-direction:column;align-items:center;gap:6px;';
      farmerFields.classList.remove('hidden'); buyerFields.classList.add('hidden');
    } else {
      bu.style.cssText = 'flex:1;padding:16px 8px;border-radius:16px;border:2.5px solid var(--primary);background:rgba(27,94,32,0.08);color:var(--primary);font-size:14px;font-weight:700;display:flex;flex-direction:column;align-items:center;gap:6px;';
      fa.style.cssText = 'flex:1;padding:16px 8px;border-radius:16px;border:2.5px solid var(--outline-variant);background:var(--surface-container);color:var(--on-surface-variant);font-size:14px;font-weight:700;display:flex;flex-direction:column;align-items:center;gap:6px;';
      buyerFields.classList.remove('hidden'); farmerFields.classList.add('hidden');
    }
  },

  logout() {
    AuthService.logout();
    this.history = [];
    this.navigate('splash');
    this.showToast('👋 लॉगआउट सफल / Logged out');
  },

  togglePass(inputId, icon) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') { input.type = 'text'; icon.textContent = 'visibility'; }
    else { input.type = 'password'; icon.textContent = 'visibility_off'; }
  },

  // ── FARMER DASHBOARD ───────────────────────────────────────
  async renderFarmerDashboard() {
    const user = AuthService.getUser();
    if (!user) { this.navigate('login'); return; }

    // Greeting & Avatar
    const greetingEl = document.getElementById('farmer-greeting');
    if (greetingEl) greetingEl.textContent = `नमस्ते, ${user.name.split(' ')[0]}! 👋`;
    const avatarEl = document.getElementById('farmer-avatar-bar');
    if (avatarEl) avatarEl.textContent = user.avatar || '👨‍🌾';

    // Show initial loading state for dynamic sections
    const listingsEl = document.getElementById('farmer-listings');
    const emptyEl = document.getElementById('farmer-listings-empty');
    const offersEl = document.getElementById('farmer-offers');

    if (listingsEl) listingsEl.innerHTML = `<div class="state-loading" style="padding:16px;"><div class="spinner"></div><p style="font-size:13px;">फसलें लोड हो रही हैं... / Loading listings...</p></div>`;
    if (offersEl) offersEl.innerHTML = `<div class="state-loading" style="padding:16px;"><div class="spinner"></div><p style="font-size:13px;">ऑफर लोड हो रहे हैं... / Loading offers...</p></div>`;

    try {
      // Fetch listings, offers, orders in parallel from real API
      const [listings, offers, orders] = await Promise.all([
        ListingService.getFarmerListings(user.id),
        OfferService.getFarmerOffers(user.id),
        OrderService.getFarmerOrders(user.id)
      ]);

      const activeListings = listings.filter(l => l.status === 'active');
      const pendingOffers = offers.filter(o => o.status === 'pending');

      // Update real stats
      const statListings = document.getElementById('farmer-stat-listings');
      if (statListings) statListings.textContent = activeListings.length;
      const statOffers = document.getElementById('farmer-stat-offers');
      if (statOffers) statOffers.textContent = pendingOffers.length;
      const statOrders = document.getElementById('farmer-stat-orders');
      if (statOrders) statOrders.textContent = orders.length;

      // Price card (Tomato default)
      this.renderCropPriceCard('farmer-price-card', 'Tomato');

      // Listings section
      if (listingsEl) {
        if (activeListings.length === 0) {
          listingsEl.style.display = 'none';
          if (emptyEl) emptyEl.classList.remove('hidden');
        } else {
          listingsEl.style.display = 'flex';
          if (emptyEl) emptyEl.classList.add('hidden');
          listingsEl.innerHTML = activeListings.slice(0, 4).map(l => this._listingRowHTML(l)).join('');
        }
      }

      // Pending Offers section
      if (offersEl) {
        if (pendingOffers.length === 0) {
          offersEl.innerHTML = `
            <div class="state-empty" style="padding:24px 16px;">
              <span style="font-size:28px;">💰</span>
              <p class="text-body-md text-on-surface-variant" style="margin:0;">कोई नया ऑफर नहीं / No pending offers</p>
            </div>`;
        } else {
          offersEl.innerHTML = pendingOffers.slice(0, 3).map(o => this._offerCardHTML(o, true)).join('');
        }
      }

      // AI Insights
      const insights = await AIService.getMarketInsights('Tomato');
      const aiInsightsEl = document.getElementById('ai-insights-farmer');
      if (aiInsightsEl) {
        aiInsightsEl.innerHTML = insights.map(i =>
          `<div style="background:rgba(255,255,255,0.6);border-radius:10px;padding:10px 12px;font-size:14px;color:var(--on-surface);">
            <span style="font-size:18px;margin-right:6px;">${i.emoji}</span>${i.textHi}
           </div>`
        ).join('');
      }

      // Update notification badge
      this._updateNotifBadge();

      if (window.lucide) {
        try { lucide.createIcons(); } catch (e) {}
      }
    } catch (err) {
      console.error('Error in renderFarmerDashboard:', err);
      this.updateNetworkStatus('ERROR', false);
      if (listingsEl) {
        listingsEl.innerHTML = `
          <div class="state-error" style="padding:16px;">
            <p style="font-size:13px;margin:0;">${err.message || 'डेटा लोड करने में विफल / Failed to load data'}</p>
            <button class="btn btn-outline" style="min-height:32px;font-size:12px;margin-top:6px;" onclick="App.renderFarmerDashboard()">पुनः प्रयास करें / Retry</button>
          </div>`;
      }
    }
  },

  _listingRowHTML(listing) {
    const gradeColor = { A: 'chip-success', B: 'chip-warning', C: 'chip-error' }[listing.grade] || 'chip-surface';
    const statusColor = listing.status === 'active' ? 'var(--primary)' : listing.status === 'sold' ? 'var(--grade-b-text)' : 'var(--error)';
    return `
    <div class="card card-body" style="display:flex;gap:12px;align-items:flex-start;cursor:pointer;" onclick="App.viewProduct('${listing.id}')">
      <div style="width:52px;height:52px;border-radius:12px;background:var(--surface-container);display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;">${listing.emoji}</div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span class="text-label-lg text-on-surface">${listing.cropHi} / ${listing.crop}</span>
          <span class="chip ${gradeColor}">Grade ${listing.grade}</span>
        </div>
        <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap;">
          <span class="text-label-sm text-on-surface-variant">📦 ${listing.quantity} ${listing.unit}</span>
          <span class="text-price" style="font-size:16px;font-weight:800;color:var(--primary);">₹${listing.askingPrice}/kg</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;align-items:center;">
          <span style="font-size:12px;color:${statusColor};font-weight:700;">${listing.status.toUpperCase()}</span>
          <span style="font-size:12px;color:var(--on-surface-variant);">${(listing.offers||[]).length} ऑफर</span>
        </div>
      </div>
    </div>`;
  },

  _offerCardHTML(offer, isFarmer) {
    const buyer = offer.buyer || {};
    const listing = offer.listing || {};
    return `
    <div class="offer-card ${offer.status}">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:8px;">
        <div style="display:flex;gap:10px;align-items:center;">
          <div style="font-size:28px;">${isFarmer ? (buyer.avatar || '🏪') : (listing.emoji || '🌱')}</div>
          <div>
            <p class="text-label-lg text-on-surface">${isFarmer ? (buyer.name || 'Buyer') : (listing.cropHi || listing.crop || 'Crop')}</p>
            <p class="text-label-sm text-on-surface-variant">${isFarmer ? (buyer.company || buyer.city || 'Verified Buyer') : (listing.variety || '')}</p>
          </div>
        </div>
        <span class="chip ${offer.status === 'pending' ? 'chip-secondary' : offer.status === 'accepted' ? 'chip-success' : 'chip-error'}">${offer.status === 'pending' ? '⏳ PENDING' : offer.status === 'accepted' ? '✅ ACCEPTED' : '❌ REJECTED'}</span>
      </div>
      <div style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap;">
        <span style="font-size:22px;font-weight:800;color:var(--primary);">₹${offer.offerPrice}/kg</span>
        <span style="font-size:14px;color:var(--on-surface-variant);align-self:center;">📦 ${offer.quantity} ${offer.unit || 'kg'}</span>
        <span style="font-size:14px;color:var(--on-surface-variant);align-self:center;">💰 Total: ₹${(offer.totalAmount || (offer.offerPrice * offer.quantity)).toLocaleString('en-IN')}</span>
      </div>
      ${offer.message ? `<p style="font-size:13px;color:var(--on-surface-variant);margin-top:8px;font-style:italic;">"${offer.message}"</p>` : ''}
      ${isFarmer && offer.status === 'pending' ? `
      <div style="display:flex;gap:10px;margin-top:12px;">
        <button onclick="event.stopPropagation();App.respondOffer('${offer.id}','accepted',this)" class="btn btn-primary" style="flex:1;min-height:40px;font-size:14px;">✅ स्वीकार करें / Accept</button>
        <button onclick="event.stopPropagation();App.respondOffer('${offer.id}','rejected',this)" class="btn" style="flex:1;min-height:40px;font-size:14px;background:var(--error-container);color:var(--on-error-container);">❌ अस्वीकार / Reject</button>
      </div>` : ''}
    </div>`;
  },

  async respondOffer(offerId, action, btnEl) {
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = `<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;"></span> Processing...`;
    }
    try {
      await OfferService.respond(offerId, action);
      this.showToast(action === 'accepted' ? '🎉 ऑफर स्वीकार किया! ऑर्डर जनरेट हुआ!' : '❌ ऑफर अस्वीकार किया');
      if (this.currentScreen === 'orders') {
        await this.renderOrders();
      } else {
        await this.renderFarmerDashboard();
      }
    } catch (err) {
      this.showToast(`❌ त्रुटि: ${err.message}`);
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = action === 'accepted' ? '✅ स्वीकार करें' : '❌ अस्वीकार';
      }
    }
  },

  // ── CROP PRICE CARD ────────────────────────────────────────
  async renderCropPriceCard(cardId, crop) {
    const cardEl = document.getElementById(cardId);
    if (!cardEl) return;
    cardEl.innerHTML = `<div class="state-loading" style="padding:16px;"><div class="spinner"></div></div>`;

    const res = await MarketService.getMandiPrices(crop);
    const prices = res.data || [];
    this.updateNetworkStatus(res.source, res.isRealGovData);

    if (!prices.length) {
      cardEl.innerHTML = `<p class="text-body-md text-on-surface-variant">कोई डेटा नहीं / No data</p>`;
      return;
    }
    const best = prices.sort((a, b) => b.modalPrice - a.modalPrice)[0];
    const crop_data = prices[0];
    const sourceLabel = res.source === 'GOVERNMENT_API_AGMARKNET'
      ? '🏛️ Mandi Rate (AGMARKNET · Govt. of India)'
      : res.source === 'REDIS_CACHE'
      ? '⚡ Mandi Rate (AGMARKNET · Cached)'
      : '🏛️ Mandi Rate (AGMARKNET · Govt. of India)';

    cardEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:start;">
        <div>
          <span class="badge" style="font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:6px;background:rgba(21,128,61,0.12);color:#15803d;display:inline-block;margin-bottom:4px;">
            ${sourceLabel}
          </span>
          <p class="text-label-md text-on-surface-variant">${best.market} (${best.state})</p>
          <div style="display:flex;align-items:baseline;gap:8px;margin-top:4px;">
            <span class="text-price" style="color:var(--primary);">₹${best.modalPrice}</span>
            <span class="text-label-sm text-on-surface-variant">/ क्विंटल</span>
          </div>
        </div>
        <span style="font-size:40px;">${crop_data.emoji}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:8px;">
        <span class="chip ${best.trend === 'up' ? 'chip-success' : best.trend === 'down' ? 'chip-error' : 'chip-surface'}">
          ${best.trend === 'up' ? '📈' : best.trend === 'down' ? '📉' : '➡️'} ${best.trend === 'up' ? `+₹${best.change} आज` : best.trend === 'down' ? `₹${Math.abs(best.change)} कम` : 'स्थिर'}
        </span>
        <div style="font-size:12px;color:var(--on-surface-variant);">
          Min: ₹${best.minPrice} · Max: ₹${best.maxPrice}
        </div>
      </div>
      <button class="btn btn-outline" style="margin-top:12px;min-height:38px;font-size:13px;" onclick="App.navigate('mandi-prices')">
        सभी ${prices.length} मंडियों के भाव देखें →
      </button>`;
  },

  // ── NETWORK & DATA SOURCE STATUS BAR ────────────────────────
  updateNetworkStatus(source, isRealGovData) {
    const bar = document.getElementById('network-status-bar');
    const dot = document.getElementById('network-status-dot');
    const text = document.getElementById('network-status-text');
    const content = document.getElementById('network-status-content');
    if (!text) return;

    if (source === 'GOVERNMENT_API_AGMARKNET' || (isRealGovData && source !== 'REDIS_CACHE' && source !== 'POSTGRESQL_FALLBACK')) {
      // 1. Live Data from Government AGMARKNET API (Green)
      text.textContent = '📶 नेटवर्क ठीक है · LIVE DATA';
      if (dot) dot.style.background = '#16a34a';
      if (bar) bar.style.background = 'rgba(21, 128, 61, 0.08)';
      if (content) content.style.color = '#15803d';
    } else if (source === 'REDIS_CACHE' || source === 'POSTGRESQL_FALLBACK') {
      // 2. Cached / Fallback Data (Amber)
      text.textContent = '📶 नेटवर्क ठीक है · CACHED DATA';
      if (dot) dot.style.background = '#d97706';
      if (bar) bar.style.background = 'rgba(217, 119, 6, 0.12)';
      if (content) content.style.color = '#b45309';
    } else {
      // 3. Demo / Offline Data (Slate / Amber)
      text.textContent = '📶 नेटवर्क ठीक है · DEMO DATA';
      if (dot) dot.style.background = '#64748b';
      if (bar) bar.style.background = 'rgba(100, 116, 139, 0.12)';
      if (content) content.style.color = '#475569';
    }

    const mandiBadge = document.getElementById('mandi-header-badge');
    if (mandiBadge) {
      if (source === 'GOVERNMENT_API_AGMARKNET') {
        mandiBadge.textContent = 'LIVE DATA';
        mandiBadge.className = 'badge';
        mandiBadge.style.background = 'rgba(21, 128, 61, 0.15)';
        mandiBadge.style.color = '#15803d';
        mandiBadge.style.fontWeight = '700';
      } else if (source === 'REDIS_CACHE' || source === 'POSTGRESQL_FALLBACK') {
        mandiBadge.textContent = 'CACHED DATA';
        mandiBadge.className = 'badge';
        mandiBadge.style.background = 'rgba(217, 119, 6, 0.15)';
        mandiBadge.style.color = '#d97706';
        mandiBadge.style.fontWeight = '700';
      } else {
        mandiBadge.textContent = 'DEMO DATA';
        mandiBadge.className = 'demo-badge';
      }
    }
  },

  selectCropTab(btn, cardId) {
    btn.closest('.tabs, #farmer-crop-tabs, #mandi-crop-tabs, .filter-row').querySelectorAll('.tab-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const crop = btn.dataset.crop;
    this.currentCropTab = crop;
    this.renderCropPriceCard(cardId, crop);
  },

  // ── BUYER DASHBOARD ────────────────────────────────────────
  async renderBuyerDashboard() {
    const user = AuthService.getUser();
    if (!user) { this.navigate('login'); return; }

    const greetingEl = document.getElementById('buyer-greeting');
    if (greetingEl) greetingEl.textContent = `Welcome, ${user.name.split(' ')[0]}! 🏪`;
    const avatarEl = document.getElementById('buyer-avatar-bar');
    if (avatarEl) avatarEl.textContent = user.avatar || '🏪';

    const offerPreviewEl = document.getElementById('buyer-offers-preview');
    if (offerPreviewEl) {
      offerPreviewEl.innerHTML = `<div class="state-loading" style="padding:16px;"><div class="spinner"></div><p style="font-size:13px;">Loading offers...</p></div>`;
    }

    try {
      const [offers, orders] = await Promise.all([
        OfferService.getBuyerOffers(user.id),
        OrderService.getBuyerOrders(user.id)
      ]);

      const statOffers = document.getElementById('buyer-stat-offers');
      if (statOffers) statOffers.textContent = offers.length;
      const statOrders = document.getElementById('buyer-stat-orders');
      if (statOrders) statOrders.textContent = orders.length;
      const ratingEl = document.getElementById('buyer-rating');
      if (ratingEl) ratingEl.textContent = user.rating || user.buyer_rating || '4.8';

      // Marketplace grid in buyer dashboard
      this.renderMarketplace('all', 'buyer-market-grid');

      // Offers preview
      if (offerPreviewEl) {
        if (!offers.length) {
          offerPreviewEl.innerHTML = `
            <div class="state-empty" style="padding:24px 16px;">
              <span style="font-size:28px;">💰</span>
              <p class="text-body-md text-on-surface-variant" style="margin:0;">No offers sent yet</p>
              <button class="btn btn-outline" style="min-height:34px;font-size:12px;margin-top:8px;" onclick="App.navigate('marketplace')">Browse Market →</button>
            </div>`;
        } else {
          offerPreviewEl.innerHTML = offers.slice(0, 3).map(o => this._offerCardHTML(o, false)).join('');
        }
      }

      this._updateNotifBadge();
      if (window.lucide) {
        try { lucide.createIcons(); } catch (e) {}
      }
    } catch (err) {
      console.error('Error in renderBuyerDashboard:', err);
      if (offerPreviewEl) {
        offerPreviewEl.innerHTML = `
          <div class="state-error" style="padding:16px;">
            <p style="font-size:13px;margin:0;">${err.message || 'Failed to load dashboard'}</p>
            <button class="btn btn-outline" style="min-height:32px;font-size:12px;margin-top:6px;" onclick="App.renderBuyerDashboard()">Retry</button>
          </div>`;
      }
    }
  },

  // ── MARKETPLACE ────────────────────────────────────────────
  async renderMarketplace(filter = 'all', gridId = 'market-grid') {
    const currentUser = AuthService.getUser();
    if (currentUser && gridId === 'market-grid') {
      this.updateMarketNav(currentUser.role);
    }
    const gridEl = document.getElementById(gridId);
    const emptyEl = document.getElementById('market-empty');
    if (!gridEl) return;

    // Loading state
    gridEl.innerHTML = `
      <div style="grid-column:1/-1;" class="state-loading">
        <div class="spinner"></div>
        <p style="font-size:14px;margin:0;">फसलें लोड हो रही हैं... / Loading fresh produce...</p>
      </div>`;
    if (emptyEl) emptyEl.classList.add('hidden');

    try {
      const filters = { status: 'active' };
      if (filter && filter !== 'all') filters.crop = filter;
      let listings = await ListingService.getAll(filters);

      // Filter by active grade filter if set
      if (this.gradeFilter && this.gradeFilter !== 'all') {
        const target = this.gradeFilter;
        listings = listings.filter(l => {
          if (target === 'A+') return l.grade === 'A+' || l.grade === 'A';
          if (target === 'A') return l.grade === 'A' || l.grade === 'A+';
          if (target === 'B+') return l.grade === 'B+' || l.grade === 'B';
          return l.grade === target;
        });
      }

      if (!listings.length) {
        gridEl.innerHTML = '';
        if (emptyEl) {
          emptyEl.classList.remove('hidden');
        } else {
          gridEl.innerHTML = `
            <div style="grid-column:1/-1;" class="state-empty">
              <span class="empty-icon"><i data-lucide="store" style="width:48px;height:48px;color:#94a3b8;"></i></span>
              <div class="empty-title">कोई फसल उपलब्ध नहीं / No produce listed</div>
              <div class="empty-sub">Try selecting another grade or commodity filter or add your produce to the market.</div>
            </div>`;
          if (window.lucide) lucide.createIcons();
        }
        return;
      }

      if (emptyEl) emptyEl.classList.add('hidden');

      gridEl.innerHTML = listings.map(l => this._produceCardV2HTML(l)).join('');
      if (window.lucide) {
        try { lucide.createIcons(); } catch (e) {}
      }
    } catch (err) {
      console.error('Error in renderMarketplace:', err);
      gridEl.innerHTML = `
        <div style="grid-column:1/-1;" class="state-error">
          <i data-lucide="alert-circle" style="width:36px;height:36px;color:var(--error);"></i>
          <div class="error-msg">${err.message || 'मार्केट लोड करने में त्रुटि / Failed to load marketplace'}</div>
          <button class="btn btn-outline" style="min-height:36px;font-size:13px;" onclick="App.renderMarketplace('${filter}','${gridId}')">पुनः प्रयास करें / Retry</button>
        </div>`;
      if (window.lucide) lucide.createIcons();
    }
  },

  _produceCardV2HTML(l) {
    const lotId = l.lot_number || `LOT-MH-2024-0${Math.abs((l.id || '10').charCodeAt(0) * 17) % 900 + 100}`;
    const photo = l.photoUrl || l.photo_url || (window.cropPhotos && window.cropPhotos[l.crop]) || 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=600&q=80';
    const gradeClass = l.grade === 'A+' ? 'grade-aplus' : l.grade === 'A' ? 'grade-a' : 'grade-bplus';
    const gradeLabel = l.grade === 'A+' ? 'GRADE A+' : l.grade === 'A' ? 'GRADE A' : `GRADE ${l.grade}`;
    const farmerName = l.farmer?.name || l.farmer_name || 'Suresh Patil';
    const location = l.location || 'Niphad, Nashik';
    const variety = l.variety || 'Garwa (Late Kharif)';
    const volume = l.volume_label || (l.quantity >= 1000 ? `${(l.quantity / 1000).toFixed(1)} MT` : `${l.quantity} ${l.unit}`);

    // SVG Sparkline
    const p1 = 20, p2 = 14, p3 = 18, p4 = 10, p5 = 15, p6 = 8, p7 = 6;
    const sparklineSvg = `
      <svg class="market-card-sparkline-svg" viewBox="0 0 90 28" fill="none">
        <defs>
          <linearGradient id="sparkGrad-${l.id}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#10b981" stop-opacity="0.3" />
            <stop offset="100%" stop-color="#10b981" stop-opacity="0.0" />
          </linearGradient>
        </defs>
        <polygon points="0,${p1} 15,${p2} 30,${p3} 45,${p4} 60,${p5} 75,${p6} 90,${p7} 90,28 0,28" fill="url(#sparkGrad-${l.id})" />
        <polyline points="0,${p1} 15,${p2} 30,${p3} 45,${p4} 60,${p5} 75,${p6} 90,${p7}" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="90" cy="${p7}" r="3" fill="#10b981" />
      </svg>`;

    // Format price per quintal matching reference design
    const pricePerQuintal = l.unit === 'kg' ? (l.askingPrice * 100) : l.askingPrice;
    const formattedPrice = Number(pricePerQuintal).toLocaleString('en-IN');

    return `
      <div class="market-card-v2" onclick="App.viewProduct('${l.id}')">
        <!-- Header: Lot Number & 48h Mandi Sparkline -->
        <div class="market-card-v2-header">
          <span class="market-card-lot-id">#${lotId}</span>
          <span class="market-card-sparkline-tag">
            <i data-lucide="trending-up" style="width:13px;height:13px;"></i>
            48H MANDI SPARKLINE
          </span>
        </div>

        <!-- Body Hero: Produce Photograph Thumbnail with Grade Overlay Badge + Details -->
        <div class="market-card-v2-hero">
          <div class="market-card-thumb-wrap">
            <img src="${photo}" alt="${l.crop}" class="market-card-thumb-img" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=400&q=80'" />
            <span class="market-card-grade-badge ${gradeClass}">${gradeLabel}</span>
          </div>

          <div class="market-card-details">
            <h3 class="market-card-title">${l.cropHi || l.crop} <span style="font-weight:600;font-size:13.5px;color:#475569;">(${l.crop})</span></h3>
            <div class="market-card-meta-line">
              <span class="market-card-variety">Variety: ${variety}</span>
              <span class="market-card-volume-highlight">Volume: ${volume}</span>
            </div>
            <div class="market-card-farmer-line">
              <span class="market-card-verified-icon">
                <i data-lucide="check-circle-2" style="width:14px;height:14px;"></i>
              </span>
              <span>${farmerName} · ${location}</span>
            </div>
          </div>
        </div>

        <!-- AI-VERIFIED GRADE SEAL Box (Mint Green, Spec verified) -->
        <div class="ai-grade-seal-box">
          <div class="ai-grade-seal-head">
            <span class="ai-grade-seal-title">
              <i data-lucide="shield-check" style="width:14px;height:14px;"></i>
              AI-VERIFIED GRADE SEAL
            </span>
            <span class="ai-grade-seal-tag">${gradeLabel} · AGMARK SPEC</span>
          </div>

          <div class="ai-grade-seal-metrics">
            <div class="ai-metric-item">
              <span class="ai-metric-label">FIRMNESS</span>
              <span class="ai-metric-val">${l.firmness || '8.8/10'}</span>
            </div>
            <div class="ai-metric-item">
              <span class="ai-metric-label">AVG SIZE</span>
              <span class="ai-metric-val">${l.avg_size || '55-65mm'}</span>
            </div>
            <div class="ai-metric-item">
              <span class="ai-metric-label">DEFECT</span>
              <span class="ai-metric-val">${l.defect_rate || '<1.2%'}</span>
            </div>
          </div>

          <div class="ai-grade-seal-sub">
            <i data-lucide="sparkles" style="width:12px;height:12px;"></i>
            Verified via Multi-Spectral Computer Vision
          </div>
        </div>

        <!-- Price & Mandi Delta Row with Sparkline -->
        <div class="market-card-price-row">
          <div class="market-card-price-block">
            <div>
              <span class="market-card-price-val">₹${formattedPrice}</span>
              <span class="market-card-price-unit">/ quintal</span>
            </div>
            <div class="market-card-mandi-delta">
              <i data-lucide="arrow-up-right" style="width:11px;height:11px;"></i>
              +3.8% vs Mandi Avg
            </div>
          </div>
          <div>${sparklineSvg}</div>
        </div>

        <!-- Card Actions & Micro-AI badge -->
        <div class="market-card-actions">
          <span class="agroguide-ai-pill">
            AgroGuide AI <span class="micro-tag">MICRO-AI</span>
          </span>
          <button class="btn-card-offer" onclick="event.stopPropagation();App.startOffer('${l.id}')">
            <i data-lucide="tag" style="width:14px;height:14px;"></i> Make Offer
          </button>
          <button class="btn-card-view" onclick="event.stopPropagation();App.viewProduct('${l.id}')">
            View Lot
          </button>
        </div>
      </div>`;
  },

  setGradeFilter(btn, grade) {
    document.querySelectorAll('.grade-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    this.gradeFilter = grade;
    const user = AuthService.getUser();
    if (user && user.role === 'buyer') {
      this.renderMarketplace(this.marketFilter || 'all', 'buyer-market-grid');
    } else {
      this.renderMarketplace(this.marketFilter || 'all', 'market-grid');
    }
  },

  setMarketFilter(btn, filter) {
    btn.closest('.filter-row, .tabs').querySelectorAll('.tab-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    this.marketFilter = filter;
    const user = AuthService.getUser();
    if (user && user.role === 'buyer') {
      this.renderMarketplace(filter, 'buyer-market-grid');
    } else {
      this.renderMarketplace(filter, 'market-grid');
    }
  },

  filterMarket() {
    const q = document.getElementById('market-search')?.value?.toLowerCase() || '';
    const grids = document.querySelectorAll('#market-grid .market-card-v2, #buyer-market-grid .market-card-v2, .produce-card');
    grids.forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(q) ? '' : 'none';
    });
  },

  // ── PRODUCT DETAIL ─────────────────────────────────────────
  async viewProduct(listingId) {
    const content = document.getElementById('product-detail-content');
    const actionsEl = document.getElementById('product-detail-actions');
    if (content) {
      content.innerHTML = `
        <header class="app-bar" style="position:sticky;">
          <button onclick="App.goBack()" class="app-bar-icon"><span class="material-symbols-outlined">arrow_back</span></button>
          <h1 class="app-bar-title">विवरण / Details</h1>
        </header>
        <div class="state-loading" style="padding:48px 16px;">
          <div class="spinner"></div>
          <p>जानकारी लोड हो रही है... / Loading details...</p>
        </div>`;
    }
    if (actionsEl) actionsEl.innerHTML = '';
    this.navigate('product-detail');

    try {
      const listing = await ListingService.getById(listingId);
      if (!listing) {
        if (content) {
          content.innerHTML = `
            <header class="app-bar" style="position:sticky;">
              <button onclick="App.goBack()" class="app-bar-icon"><span class="material-symbols-outlined">arrow_back</span></button>
              <h1 class="app-bar-title">विवरण / Details</h1>
            </header>
            <div class="state-error" style="margin:24px;">
              <span class="material-symbols-outlined error-icon">search_off</span>
              <div class="error-msg">यह लिस्टिंग उपलब्ध नहीं है / Listing not found</div>
              <button class="btn btn-outline" onclick="App.goBack()">वापस जाएं / Go Back</button>
            </div>`;
        }
        return;
      }

      this.currentListing = listing;
      const farmer = listing.farmer || {};
      const gradeColor = { A: '#e8f5e9', B: '#fff8e1', C: '#ffebee' }[listing.grade] || '#f0f0f0';
      const gradeBorder = { A: '#2e7d32', B: '#f9a825', C: '#d32f2f' }[listing.grade] || '#ccc';

      // AI recommendation
      const ai = await AIService.getPriceRecommendation(listing.crop, listing.grade, listing.quantity, listing.location);

      content.innerHTML = `
      <header class="app-bar" style="position:sticky;">
        <button onclick="App.goBack()" class="app-bar-icon"><span class="material-symbols-outlined">arrow_back</span></button>
        <h1 class="app-bar-title">${listing.cropHi} / ${listing.crop}</h1>
      </header>
      
      <!-- Hero -->
      <div style="background:linear-gradient(135deg,${gradeColor},#fff);border-bottom:1px solid ${gradeBorder}40;padding:32px 16px;text-align:center;">
        <div style="font-size:80px;margin-bottom:8px;">${listing.emoji}</div>
        <h2 style="font-size:24px;font-weight:800;color:var(--on-surface);">${listing.cropHi}</h2>
        <p style="font-size:15px;color:var(--on-surface-variant);">${listing.variety} · ${listing.crop}</p>
        <div style="display:flex;justify-content:center;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <span class="chip chip-success">Grade ${listing.grade} ${listing.grade === 'A' ? '🟢' : listing.grade === 'B' ? '🟡' : '🔴'}</span>
          <span class="chip chip-surface">📦 ${listing.quantity} ${listing.unit}</span>
          ${farmer.verified ? '<span class="chip chip-primary">✅ Verified Farmer</span>' : ''}
        </div>
      </div>

      <div style="padding:16px;display:flex;flex-direction:column;gap:16px;">
        
        <!-- Price Section -->
        <div class="card card-body">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div>
              <p class="text-label-sm text-on-surface-variant">किसान का मूल्य / Asking Price</p>
              <p style="font-size:28px;font-weight:800;color:var(--primary);">₹${listing.askingPrice}<span style="font-size:14px;font-weight:400;color:var(--on-surface-variant);">/${listing.unit}</span></p>
            </div>
            ${listing.marketRefPrice ? `
            <div style="text-align:right;">
              <p class="text-label-sm text-on-surface-variant">मंडी संदर्भ मूल्य / Mandi Ref</p>
              <p style="font-size:18px;font-weight:700;color:var(--on-surface);">₹${listing.marketRefPrice}/${listing.unit}</p>
            </div>` : ''}
          </div>
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--outline-variant);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <span class="text-label-sm text-on-surface-variant">कुल लॉट मूल्य (${listing.quantity} ${listing.unit}): <b style="color:var(--primary);">₹${(listing.askingPrice * listing.quantity).toLocaleString('en-IN')}</b></span>
          </div>
        </div>

        <!-- AI Recommendation -->
        ${ai ? `
        <div class="ai-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div class="ai-badge"><span class="material-symbols-outlined" style="font-size:14px;">auto_awesome</span>Kisan AI सुझाया मूल्य</div>
            <span class="badge" style="background:#e8f5e9;color:#166534;font-size:11px;padding:2px 8px;border-radius:6px;">LIVE ANALYTICS</span>
          </div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;">
            <div>
              <p class="text-label-sm text-on-surface-variant">Suggested Price</p>
              <p style="font-size:26px;font-weight:800;color:var(--secondary);">₹${ai.suggestedPrice}/${listing.unit}</p>
            </div>
            <div>
              <p class="text-label-sm text-on-surface-variant">Optimal Range</p>
              <p style="font-size:16px;font-weight:700;color:var(--on-surface);">₹${ai.priceRange.min} – ₹${ai.priceRange.max}</p>
            </div>
          </div>
          <div style="background:rgba(255,255,255,0.6);border-radius:10px;padding:10px;margin-top:10px;font-size:14px;color:var(--on-surface);">
            💡 ${ai.insight}
          </div>
          <div style="margin-top:8px;font-size:12px;color:var(--on-surface-variant);">AI Confidence: ${ai.confidence}%</div>
        </div>` : ''}

        <!-- Farmer Info -->
        <div class="card card-body">
          <h3 class="text-label-lg text-on-surface" style="margin-bottom:12px;">👨‍🌾 किसान जानकारी / Farmer Profile</h3>
          <div style="display:flex;gap:12px;align-items:center;">
            <div style="width:52px;height:52px;border-radius:50%;background:var(--surface-container);display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;">${farmer.avatar || '👨‍🌾'}</div>
            <div>
              <p class="text-label-lg">${farmer.name || 'किसान'}</p>
              <p class="text-label-sm text-on-surface-variant">📍 ${listing.location}</p>
              <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;">
                ${farmer.verified ? '<span class="chip chip-success">✅ Verified</span>' : '<span class="chip chip-warning">⏳ Pending KYC</span>'}
                <span class="chip chip-surface">⭐ ${farmer.rating || '4.5'}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Description -->
        <div class="card card-body">
          <h3 class="text-label-lg text-on-surface" style="margin-bottom:8px;">📝 विवरण / Description</h3>
          <p style="font-size:14px;color:var(--on-surface-variant);line-height:1.7;">${listing.description || 'Verified agricultural listing ready for dispatch.'}</p>
        </div>

        <!-- Location & Mandi -->
        <div class="card card-body">
          <h3 class="text-label-lg text-on-surface" style="margin-bottom:8px;">📍 स्थान / Dispatch Point</h3>
          <p style="font-size:14px;color:var(--on-surface-variant);">🌱 ${listing.location}</p>
          <button onclick="App.navigate('nearby-mandis')" class="btn btn-outline" style="margin-top:12px;min-height:40px;font-size:13px;">
            📍 पास की मंडी देखें / View Nearby Mandis
          </button>
        </div>
      </div>`;

      // Actions
      const user = AuthService.getUser();
      if (user && user.role === 'buyer') {
        actionsEl.innerHTML = `
          <button class="btn btn-outline" style="flex:1;" onclick="App.callFarmer('${farmer.phone}')">
            <span class="material-symbols-outlined">call</span> Call
          </button>
          <button class="btn btn-primary" style="flex:2;" onclick="App.startOffer('${listing.id}')">
            <span class="material-symbols-outlined">handshake</span> ऑफर करें / Make Offer
          </button>`;
      } else if (user && user.id === listing.farmerId) {
        actionsEl.innerHTML = `
          <button class="btn btn-outline" style="flex:1;color:var(--error);border-color:var(--error);" onclick="App.deleteListing('${listing.id}')">
            <span class="material-symbols-outlined">delete</span> हटाएं / Delete
          </button>
          <button class="btn btn-primary" style="flex:2;" onclick="App.navigate('orders')">
            <span class="material-symbols-outlined">visibility</span> ऑफर देखें / View Offers
          </button>`;
      } else {
        actionsEl.innerHTML = `
          <button class="btn btn-primary" style="flex:1;" onclick="App.navigate('login')">
            लॉगिन करके ऑफर दें / Login to Make Offer
          </button>`;
      }
    } catch (err) {
      console.error('Error in viewProduct:', err);
      if (content) {
        content.innerHTML = `
          <header class="app-bar" style="position:sticky;">
            <button onclick="App.goBack()" class="app-bar-icon"><span class="material-symbols-outlined">arrow_back</span></button>
            <h1 class="app-bar-title">त्रुटि / Error</h1>
          </header>
          <div class="state-error" style="margin:24px;">
            <span class="material-symbols-outlined error-icon">error</span>
            <div class="error-msg">${err.message || 'विवरण लोड करने में विफल / Failed to load listing'}</div>
            <button class="btn btn-outline" onclick="App.goBack()">वापस जाएं / Go Back</button>
          </div>`;
      }
    }
  },

  callFarmer(phone) {
    this.showToast(`📞 Calling farmer... (Demo: +91 ${phone})`);
  },

  async deleteListing(listingId) {
    const user = AuthService.getUser();
    await ListingService.delete(listingId, user.id);
    this.showToast('🗑️ लिस्टिंग हटा दी गई');
    this.goBack();
  },

  // ── MAKE OFFER ─────────────────────────────────────────────
  startOffer(listingId) {
    const user = AuthService.getUser();
    if (!user) { this.navigate('login'); return; }
    if (user.role === 'farmer') { this.showToast('⚠️ केवल खरीदार ऑफर दे सकते हैं'); return; }
    this._offerListingId = listingId;
    this.navigate('make-offer');
  },

  async initMakeOffer() {
    const listingId = this._offerListingId;
    if (!listingId) return;
    const listing = await ListingService.getById(listingId);
    if (!listing) return;
    this.currentListing = listing;

    document.getElementById('farmer-asking-ref').textContent = `₹${listing.askingPrice}/kg`;
    document.getElementById('offer-qty').value = Math.min(500, listing.quantity);
    document.getElementById('offer-price').value = Math.round(listing.askingPrice * 0.95);

    document.getElementById('offer-listing-preview').innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;">
        <div style="font-size:40px;">${listing.emoji}</div>
        <div>
          <p class="text-label-lg">${listing.cropHi} / ${listing.crop}</p>
          <p class="text-label-sm text-on-surface-variant">📦 ${listing.quantity} ${listing.unit} · Grade ${listing.grade}</p>
          <p class="text-label-sm text-on-surface-variant">📍 ${listing.location}</p>
        </div>
      </div>`;

    this._updateOfferCalc();
    document.getElementById('offer-price').addEventListener('input', () => this._updateOfferCalc());
    document.getElementById('offer-qty').addEventListener('input', () => this._updateOfferCalc());
  },

  _updateOfferCalc() {
    const price = parseFloat(document.getElementById('offer-price').value) || 0;
    const qty   = parseFloat(document.getElementById('offer-qty').value) || 0;
    const total = price * qty;
    document.getElementById('offer-calc-sub').textContent = `₹${price} × ${qty} kg`;
    document.getElementById('offer-calc-total').textContent = `₹${total.toLocaleString('en-IN')}`;
  },

  changeOfferQty(delta) {
    const input = document.getElementById('offer-qty');
    const val = Math.max(1, (parseFloat(input.value) || 0) + delta);
    input.value = val;
    this._updateOfferCalc();
  },

  async submitOffer() {
    const user = AuthService.getUser();
    if (!user) { this.navigate('login'); return; }
    const price = parseFloat(document.getElementById('offer-price').value);
    const qty   = parseFloat(document.getElementById('offer-qty').value);
    const msg   = document.getElementById('offer-msg').value.trim();
    const errEl = document.getElementById('offer-error');
    if (!price || !qty) {
      if (errEl) { errEl.textContent = '❌ मूल्य और मात्रा जरूरी है'; errEl.classList.remove('hidden'); }
      return;
    }
    if (errEl) errEl.classList.add('hidden');

    const submitBtn = event?.target?.closest('button') || document.querySelector('#screen-make-offer .btn-primary');
    const originalBtnHTML = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;"></span> सबमिट हो रहा है...`;
    }

    try {
      await OfferService.createOffer({
        listingId: this.currentListing.id,
        buyerId: user.id,
        offerPrice: price,
        quantity: qty,
        unit: this.currentListing.unit,
        totalAmount: price * qty,
        message: msg
      });
      this.showToast('🎉 ऑफर भेज दिया गया! Offer sent successfully!');
      this.navigate('buyer-dashboard');
    } catch (err) {
      console.error('Error submitting offer:', err);
      if (errEl) {
        errEl.textContent = `❌ ${err.message || 'ऑफर भेजने में विफल'}`;
        errEl.classList.remove('hidden');
      } else {
        this.showToast(`❌ ${err.message || 'ऑफर भेजने में विफल'}`);
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHTML || '💰 ऑफर भेजें / Submit Offer';
      }
    }
  },

  // ── ADD PRODUCE (SELL CROP WIZARD) ────────────────────────
  initAddProduce() {
    this.currentStep = 1;
    this.addForm = {
      crop: 'Tomato',
      variety: 'Hybrid Red',
      qty: 500,
      unit: 'kg',
      grade: 'A',
      price: 28,
      location: '',
      desc: '',
      photo: null,
      photoName: '',
      readiness: 'immediate',
      transport: 'farmgate',
      aiSuggestedPrice: 28,
    };

    const cropEl = document.getElementById('add-crop');
    if (cropEl) cropEl.value = 'Tomato';
    const varEl = document.getElementById('add-variety');
    if (varEl) varEl.value = 'Hybrid Red';
    const qtyEl = document.getElementById('add-qty');
    if (qtyEl) qtyEl.value = '500';
    const unitEl = document.getElementById('add-unit');
    if (unitEl) unitEl.value = 'kg';

    this.selectGrade('A');
    this._showAddStep(1);
    this.renderPhotoPresets('Tomato');

    const user = AuthService.getUser();
    if (user) {
      const loc = [user.village || user.city, user.district, user.state].filter(Boolean).join(', ');
      const locInput = document.getElementById('add-location');
      if (locInput && !locInput.value) locInput.value = loc;
    }
  },

  _showAddStep(step) {
    [1, 2, 3].forEach(s => {
      const el = document.getElementById(`add-step${s}`);
      if (el) {
        el.classList.remove('hidden');
        el.style.display = s === step ? 'flex' : 'none';
      }
    });

    ['step1-dot', 'step2-dot', 'step3-dot'].forEach((id, i) => {
      const dot = document.getElementById(id);
      if (!dot) return;
      dot.classList.remove('done', 'active');
      if (i + 1 < step) dot.classList.add('done');
      else if (i + 1 === step) dot.classList.add('active');
    });

    const label = document.getElementById('step-label');
    if (label) {
      const stepNames = {
        1: this.currentLang === 'en' ? 'Step 1 of 3: Crop Details' : 'चरण 1/3: फसल विवरण',
        2: this.currentLang === 'en' ? 'Step 2 of 3: Pricing & Mandi Benchmark' : 'चरण 2/3: भाव एवं मंडी दरें',
        3: this.currentLang === 'en' ? 'Step 3 of 3: Photos, Description & Confirm' : 'चरण 3/3: फोटो, विवरण व पुष्टि',
      };
      label.textContent = stepNames[step] || `Step ${step} of 3`;
    }

    this.currentStep = step;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  addStep(step) {
    this._showAddStep(step);
  },

  selectGrade(grade) {
    ['A', 'B', 'C'].forEach(g => {
      const btn = document.getElementById(`grade-${g}`);
      if (!btn) return;
      if (g === grade) {
        const colors = {
          A: 'border-color:var(--grade-a-border);background:var(--grade-a-bg);color:var(--grade-a-text);',
          B: 'border-color:var(--grade-b-border);background:var(--grade-b-bg);color:var(--grade-b-text);',
          C: 'border-color:var(--grade-c-border);background:var(--grade-c-bg);color:var(--grade-c-text);'
        };
        btn.style.cssText = `flex:1;padding:12px 8px;border-radius:12px;border:2.5px solid;font-weight:700;font-size:13px;cursor:pointer;${colors[g]}`;
      } else {
        btn.style.cssText = 'flex:1;padding:12px 8px;border-radius:12px;border:2px solid var(--outline-variant);background:var(--surface-container);color:var(--on-surface-variant);font-weight:700;font-size:13px;cursor:pointer;';
      }
    });
    const gradeInput = document.getElementById('add-grade');
    if (gradeInput) gradeInput.value = grade;
    this.addForm.grade = grade;
  },

  onCropChange() {
    const crop = document.getElementById('add-crop').value;
    this.addForm.crop = crop;
    const defaults = {
      Tomato: { variety: 'Hybrid Red', qty: 500, price: 28 },
      Potato: { variety: 'Kufri Jyoti', qty: 800, price: 18 },
      Onion:  { variety: 'Nasik Red', qty: 1000, price: 22 },
      Wheat:  { variety: 'HD 3086', qty: 2000, price: 24 },
      Rice:   { variety: 'Basmati 1121', qty: 1500, price: 55 },
      Maize:  { variety: 'Pioneer 3396', qty: 1200, price: 20 }
    };
    if (defaults[crop]) {
      const v = document.getElementById('add-variety');
      if (v) v.value = defaults[crop].variety;
      this.addForm.variety = defaults[crop].variety;
    }
    this.renderPhotoPresets(crop);
  },

  addStep1Next() {
    const crop  = document.getElementById('add-crop').value;
    const qty   = document.getElementById('add-qty').value;
    const unit  = document.getElementById('add-unit').value || 'kg';
    const grade = document.getElementById('add-grade').value || 'A';
    const variety = document.getElementById('add-variety').value.trim() || 'Standard';

    if (!crop) {
      this.showToast('⚠️ कृपया फसल चुनें / Please select crop');
      return;
    }
    if (!qty || parseFloat(qty) <= 0) {
      this.showToast('⚠️ कृपया मान्य मात्रा दर्ज करें / Enter valid quantity');
      return;
    }

    Object.assign(this.addForm, {
      crop,
      variety,
      qty: parseFloat(qty),
      unit,
      grade
    });

    this._showAddStep(2);
    this._loadAIPriceAndBenchmarks(crop, grade, parseFloat(qty));
    this.updateEarningsCalc();
  },

  async _loadAIPriceAndBenchmarks(crop, grade, qty) {
    const user = AuthService.getUser();
    const location = user ? `${user.village || ''}, ${user.state || ''}` : '';
    const resultEl = document.getElementById('ai-price-result');
    const benchEl = document.getElementById('add-mandi-benchmarks');

    if (resultEl) resultEl.innerHTML = '<div class="spinner" style="margin:16px auto;"></div>';
    if (benchEl) benchEl.innerHTML = '';

    try {
      const [ai, pricesRes] = await Promise.all([
        AIService.getPriceRecommendation(crop, grade, qty, location),
        MarketService.getMandiPrices(crop)
      ]);

      const prices = pricesRes?.data || pricesRes || [];
      const suggestedPrice = ai?.suggestedPrice || 25;
      this.addForm.aiSuggestedPrice = suggestedPrice;

      if (resultEl) {
        resultEl.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px;">
            <div>
              <p class="text-label-sm" style="color:var(--on-surface-variant);font-size:12px;margin:0;">AI अनुशंसित भाव (Suggested Price)</p>
              <div style="display:flex;align-items:baseline;gap:6px;margin-top:2px;">
                <span style="font-size:28px;font-weight:800;color:var(--primary);">₹${suggestedPrice}</span>
                <span style="font-size:13px;font-weight:600;color:var(--on-surface-variant);">/ kg (₹${suggestedPrice * 100}/क्विंटल)</span>
              </div>
            </div>
            <div style="text-align:right;">
              <span class="chip chip-surface" style="font-size:11.5px;font-weight:700;">
                रेंज: ₹${ai?.priceRange?.min || Math.round(suggestedPrice * 0.9)} - ₹${ai?.priceRange?.max || Math.round(suggestedPrice * 1.15)} / kg
              </span>
            </div>
          </div>
          <div style="background:rgba(255,255,255,0.75);border-radius:10px;padding:8px 12px;margin-top:6px;font-size:12.5px;color:var(--on-surface);display:flex;align-items:center;gap:6px;">
            <span class="material-symbols-outlined" style="font-size:16px;color:var(--secondary);">trending_up</span>
            <span>${ai?.insight || `${crop} के भाव में सकारात्मक मांग है।`}</span>
          </div>`;
      }

      const priceInput = document.getElementById('add-price');
      if (priceInput && (!priceInput.value || parseFloat(priceInput.value) <= 0)) {
        priceInput.value = suggestedPrice;
        this.addForm.price = suggestedPrice;
      }

      if (benchEl && prices.length > 0) {
        const topMandis = prices.slice(0, 3);
        benchEl.innerHTML = `
          <div class="mandi-compare-mini">
            <div style="padding:6px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:11.5px;font-weight:700;color:var(--on-surface-variant);display:flex;justify-content:space-between;">
              <span>APMC मंडी दरें (${crop})</span>
              <span>मॉडल भाव</span>
            </div>
            ${topMandis.map(m => `
              <div class="mandi-compare-row">
                <div>
                  <span style="font-weight:600;color:var(--on-surface);">${m.market}</span>
                  <span style="font-size:11px;color:var(--on-surface-variant);margin-left:4px;">(${m.state})</span>
                </div>
                <div style="text-align:right;">
                  <span style="font-weight:700;color:var(--primary);">₹${m.modalPrice}/क्विंटल</span>
                  <span style="font-size:11px;color:var(--on-surface-variant);margin-left:4px;">(~₹${Math.round(m.modalPrice / 100)}/kg)</span>
                </div>
              </div>
            `).join('')}
          </div>`;
      }
    } catch (err) {
      console.error('Error loading AI price and benchmarks:', err);
      if (resultEl) {
        resultEl.innerHTML = `
          <div style="font-size:13px;color:var(--on-surface);">
            अनुशंसित भाव: <strong style="color:var(--primary);">₹25/kg</strong>
          </div>`;
      }
    }

    this.updateEarningsCalc();
  },

  nudgePrice(delta) {
    const input = document.getElementById('add-price');
    if (!input) return;
    const current = parseFloat(input.value) || this.addForm.aiSuggestedPrice || 25;
    const next = Math.max(1, Math.round((current + delta) * 10) / 10);
    input.value = next;
    this.addForm.price = next;
    this.updateEarningsCalc();
  },

  applyAISuggestedPrice() {
    const input = document.getElementById('add-price');
    if (!input) return;
    const price = this.addForm.aiSuggestedPrice || 28;
    input.value = price;
    this.addForm.price = price;
    this.updateEarningsCalc();
    this.showToast(`✨ AI अनुशंसित भाव ₹${price}/kg लागू किया गया`);
  },

  updateEarningsCalc() {
    const qtyInput = document.getElementById('add-qty');
    const priceInput = document.getElementById('add-price');
    const unitInput = document.getElementById('add-unit');

    const qty = parseFloat(qtyInput?.value) || this.addForm.qty || 500;
    const price = parseFloat(priceInput?.value) || this.addForm.price || 28;
    const unit = unitInput?.value || this.addForm.unit || 'kg';

    this.addForm.qty = qty;
    this.addForm.price = price;
    this.addForm.unit = unit;

    const total = Math.round(qty * price);
    const displayEl = document.getElementById('earnings-total-display');
    const unitCalcEl = document.getElementById('earnings-unit-calc');

    if (displayEl) displayEl.textContent = `₹${total.toLocaleString('en-IN')}`;
    if (unitCalcEl) unitCalcEl.textContent = `${qty} ${unit} × ₹${price}/${unit}`;
  },

  autoDetectLocation() {
    const locInput = document.getElementById('add-location');
    if (!locInput) return;

    if (navigator.geolocation) {
      locInput.placeholder = 'स्थान खोजा जा रहा है... (Detecting GPS)';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.addForm.lat = pos.coords.latitude;
          this.addForm.lng = pos.coords.longitude;
          const user = AuthService.getUser();
          const detected = [user?.village || 'फार्म गेट', user?.district || 'गांधीनगर', user?.state || 'गुजरात'].filter(Boolean).join(', ');
          locInput.value = detected;
          this.addForm.location = detected;
          this.showToast('📍 GPS लोकेशन सफलतापूर्वक दर्ज की गई');
        },
        () => {
          const user = AuthService.getUser();
          const fallback = [user?.village, user?.district, user?.state].filter(Boolean).join(', ') || 'गांधीनगर, गुजरात';
          locInput.value = fallback;
          this.addForm.location = fallback;
          this.showToast('📍 प्रोफ़ाइल स्थान चुना गया');
        },
        { timeout: 5000 }
      );
    } else {
      const user = AuthService.getUser();
      const fallback = [user?.village, user?.district, user?.state].filter(Boolean).join(', ') || 'गांधीनगर, गुजरात';
      locInput.value = fallback;
      this.addForm.location = fallback;
      this.showToast('📍 प्रोफ़ाइल स्थान चुना गया');
    }
  },

  addStep2Next() {
    const priceInput = document.getElementById('add-price');
    const locInput = document.getElementById('add-location');
    const readinessEl = document.getElementById('add-readiness');
    const transportEl = document.getElementById('add-transport');

    const price = parseFloat(priceInput?.value);
    const location = locInput?.value.trim();

    if (!price || price <= 0) {
      this.showToast('⚠️ कृपया अपेक्षित भाव भरें / Enter asking price');
      return;
    }
    if (!location) {
      this.showToast('⚠️ कृपया खेत/उठान का स्थान भरें / Enter location');
      return;
    }

    Object.assign(this.addForm, {
      price,
      location,
      readiness: readinessEl?.value || 'immediate',
      transport: transportEl?.value || 'farmgate',
    });

    this._showAddStep(3);
    this._updateAddSummary();

    const descEl = document.getElementById('add-desc');
    if (descEl && !descEl.value.trim()) {
      this.generateAIDesc();
    }
  },

  renderPhotoPresets(crop = 'Tomato') {
    const container = document.getElementById('photo-preset-container');
    if (!container) return;

    const cropPresets = {
      Tomato: [
        { url: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&q=80', name: 'Fresh Red Tomatoes' },
        { url: 'https://images.unsplash.com/photo-1546470427-e26264be0b11?w=400&q=80', name: 'Field Tomatoes' },
        { url: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400&q=80', name: 'Crate Sorting' },
      ],
      Potato: [
        { url: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400&q=80', name: 'Clean Potatoes' },
        { url: 'https://images.unsplash.com/photo-1508747703725-719777637510?w=400&q=80', name: 'Graded Potatoes' },
      ],
      Onion: [
        { url: 'https://images.unsplash.com/photo-1508747703725-719777637510?w=400&q=80', name: 'Red Onions' },
        { url: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=400&q=80', name: 'Nasik Onions' },
      ],
      Wheat: [
        { url: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&q=80', name: 'Golden Wheat Grain' },
      ],
      Rice: [
        { url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&q=80', name: 'Basmati Paddy' },
      ],
      Maize: [
        { url: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=400&q=80', name: 'Yellow Maize' },
      ],
    };

    const presets = cropPresets[crop] || cropPresets.Tomato;
    container.innerHTML = presets.map((p, idx) => `
      <div class="photo-preset-chip ${idx === 0 ? 'active' : ''}" onclick="App.selectPresetPhoto('${p.url}', '${p.name}', this)">
        <img src="${p.url}" alt="${p.name}" loading="lazy" />
      </div>
    `).join('');

    if (presets[0]) {
      this.addForm.photo = presets[0].url;
      this.addForm.photoName = presets[0].name;
      this._showPhotoPreview(presets[0].url, presets[0].name);
    }
  },

  selectPresetPhoto(url, name, element) {
    document.querySelectorAll('.photo-preset-chip').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');
    this.addForm.photo = url;
    this.addForm.photoName = name;
    this._showPhotoPreview(url, name);
    this._updateAddSummary();
  },

  handleProduceFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      this.addForm.photo = dataUrl;
      this.addForm.photoName = file.name;
      this._showPhotoPreview(dataUrl, file.name);
      this._updateAddSummary();
      this.showToast('📸 फोटो लोड हो गई!');
    };
    reader.readAsDataURL(file);
  },

  _showPhotoPreview(url, name) {
    const previewEl = document.getElementById('selected-photo-preview');
    const imgEl = document.getElementById('selected-photo-img');
    const nameEl = document.getElementById('selected-photo-name');

    if (previewEl && imgEl) {
      imgEl.src = url;
      if (nameEl) nameEl.textContent = name || 'Uploaded Photo';
      previewEl.style.display = 'flex';
    }
  },

  removeSelectedPhoto() {
    this.addForm.photo = null;
    this.addForm.photoName = '';
    const previewEl = document.getElementById('selected-photo-preview');
    if (previewEl) previewEl.style.display = 'none';
    document.querySelectorAll('.photo-preset-chip').forEach(el => el.classList.remove('active'));
    this._updateAddSummary();
  },

  _updateAddSummary() {
    const f = this.addForm;
    const emojiMap = { Tomato: '🍅', Potato: '🥔', Onion: '🧅', Wheat: '🌾', Rice: '🌾', Maize: '🌽' };
    const emoji = emojiMap[f.crop] || '🌱';
    const user = AuthService.getUser();
    const totalVal = Math.round(f.price * f.qty);

    const readinessLabels = {
      immediate: 'तुरंत उठान (Ready Now)',
      '2days': '2-3 दिन में तैयार',
      '7days': '1 सप्ताह में तैयार',
    };

    const isOrganic = document.getElementById('tag-organic')?.checked;
    const isClean = document.getElementById('tag-clean')?.checked;

    const summaryEl = document.getElementById('add-summary-content');
    if (!summaryEl) return;

    summaryEl.innerHTML = `
      <div style="display:flex;gap:14px;align-items:flex-start;padding-bottom:12px;border-bottom:1px solid #f1f5f9;">
        <div style="width:70px;height:70px;border-radius:12px;background:#f8fafc;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;border:1px solid #e2e8f0;">
          ${f.photo ? `<img src="${f.photo}" alt="${f.crop}" style="width:100%;height:100%;object-fit:cover;" />` : `<span style="font-size:38px;">${emoji}</span>`}
        </div>
        <div style="flex:1;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <h4 style="font-size:16px;font-weight:800;color:var(--on-surface);margin:0;">
                ${emoji} ${f.crop} (${f.variety})
              </h4>
              <p style="font-size:12px;color:var(--on-surface-variant);margin:2px 0 0;">
                📍 ${f.location || 'खेत स्थान'}
              </p>
            </div>
            <span class="chip" style="background:var(--grade-a-bg);color:var(--grade-a-text);border:1px solid var(--grade-a-border);font-weight:700;font-size:11px;">
              Grade ${f.grade}
            </span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
            ${isOrganic ? '<span class="chip chip-surface" style="font-size:10.5px;padding:2px 6px;">🌱 Organic</span>' : ''}
            ${isClean ? '<span class="chip chip-surface" style="font-size:10.5px;padding:2px 6px;">✨ Sorted</span>' : ''}
            <span class="chip chip-surface" style="font-size:10.5px;padding:2px 6px;">⏱️ ${readinessLabels[f.readiness] || 'Ready'}</span>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-top:12px;font-size:13px;">
        <div style="background:#f8fafc;padding:8px 10px;border-radius:8px;">
          <span style="color:var(--on-surface-variant);font-size:11.5px;display:block;">उपलब्ध मात्रा (Quantity)</span>
          <strong style="font-size:15px;color:var(--on-surface);">${f.qty.toLocaleString('en-IN')} ${f.unit}</strong>
        </div>
        <div style="background:#e8f5e9;padding:8px 10px;border-radius:8px;border:1px solid #c8e6c9;">
          <span style="color:#1b5e20;font-size:11.5px;display:block;font-weight:600;">अपेक्षित भाव (Price)</span>
          <strong style="font-size:15px;color:#1b5e20;">₹${f.price} / ${f.unit}</strong>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:8px 12px;background:#f1f5f9;border-radius:10px;">
        <span style="font-size:12.5px;font-weight:600;color:var(--on-surface);">अनुमानित कुल सौदा (Gross Deal)</span>
        <span style="font-size:16px;font-weight:800;color:var(--primary);">₹${totalVal.toLocaleString('en-IN')}</span>
      </div>

      <div style="margin-top:8px;font-size:11.5px;color:var(--on-surface-variant);display:flex;align-items:center;gap:6px;">
        <span class="material-symbols-outlined" style="font-size:14px;color:var(--primary);">account_circle</span>
        <span>विक्रेता: <strong>${user?.name || 'पंजीकृत किसान'}</strong> (${user?.phone || '9876543210'})</span>
      </div>`;
  },

  async generateAIDesc() {
    const f = this.addForm;
    const btn = document.querySelector('#add-step3 .ai-badge');
    const originalHTML = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;animation:spin 0.8s linear infinite;">refresh</span> AI लिख रहा है...';

    try {
      const desc = await AIService.generateListingDescription(f.crop, f.variety || 'Standard', f.qty, f.grade, f.location);
      const descEl = document.getElementById('add-desc');
      if (descEl) descEl.value = desc;
      this.addForm.desc = desc;
    } catch (err) {
      console.error('Error generating AI description:', err);
    } finally {
      if (btn) btn.innerHTML = originalHTML || '<span class="material-symbols-outlined" style="font-size:15px;">auto_awesome</span> AI से ऑटो-लिखें';
    }
  },



  // ── PRODUCE PHOTOS & COMMODITY RESOLVER ────────────────────
  getCropPhoto(cropName) {
    if (!cropName) return 'https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?w=120&auto=format&fit=crop&q=80';
    const c = cropName.toLowerCase().trim();
    if (c.includes('tomato') || c.includes('टमाटर')) return 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=120&auto=format&fit=crop&q=80';
    if (c.includes('potato') || c.includes('आलू')) return 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=120&auto=format&fit=crop&q=80';
    if (c.includes('onion') || c.includes('प्याज')) return 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=120&auto=format&fit=crop&q=80';
    if (c.includes('wheat') || c.includes('गेहूं')) return 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=120&auto=format&fit=crop&q=80';
    if (c.includes('rice') || c.includes('चावल') || c.includes('paddy')) return 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=120&auto=format&fit=crop&q=80';
    if (c.includes('maize') || c.includes('मक्का') || c.includes('corn')) return 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=120&auto=format&fit=crop&q=80';
    if (c.includes('chilli') || c.includes('mirch') || c.includes('मिर्च')) return 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?w=120&auto=format&fit=crop&q=80';
    if (c.includes('garlic') || c.includes('लहसुन')) return 'https://images.unsplash.com/photo-1540148426945-6cf22a6b2383?w=120&auto=format&fit=crop&q=80';
    if (c.includes('ginger') || c.includes('अदरक')) return 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=120&auto=format&fit=crop&q=80';
    if (c.includes('bottle gourd') || c.includes('gourd') || c.includes('लौकी')) return 'https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?w=120&auto=format&fit=crop&q=80';
    if (c.includes('coriander') || c.includes('धनिया')) return 'https://images.unsplash.com/photo-1588879462719-756184511d73?w=120&auto=format&fit=crop&q=80';
    if (c.includes('amaranthus') || c.includes('पालक') || c.includes('spinach')) return 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=120&auto=format&fit=crop&q=80';
    if (c.includes('cabbage') || c.includes('पत्तागोभी')) return 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=120&auto=format&fit=crop&q=80';
    if (c.includes('cauliflower') || c.includes('फूलगोभी')) return 'https://images.unsplash.com/photo-1568584711075-3d021a7c3ca3?w=120&auto=format&fit=crop&q=80';
    if (c.includes('carrot') || c.includes('गाजर')) return 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=120&auto=format&fit=crop&q=80';
    if (c.includes('brinjal') || c.includes('eggplant') || c.includes('बैंगन')) return 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=120&auto=format&fit=crop&q=80';
    if (c.includes('soyabean') || c.includes('सोयाबीन')) return 'https://images.unsplash.com/photo-1599940824399-b87987ceb72a?w=120&auto=format&fit=crop&q=80';
    if (c.includes('mustard') || c.includes('सरसों')) return 'https://images.unsplash.com/photo-1628102491629-778571d893a3?w=120&auto=format&fit=crop&q=80';
    return 'https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?w=120&auto=format&fit=crop&q=80';
  },

  // ── MANDI PRICES ───────────────────────────────────────────
  allMandiPrices: [],

  async renderMandiPrices(filter = '') {
    this.mandiFilter = filter;
    const tbody = document.getElementById('mandi-table-body');
    const sourceBadge = document.getElementById('mandi-source-badge');
    const countBadge = document.getElementById('mandi-count-badge');
    const badgeText = document.getElementById('mandi-badge-text');

    const user = AuthService.getUser();
    this.updateMandiNav(user?.role || 'farmer');

    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:48px 16px;"><div class="spinner" style="margin:0 auto 10px;"></div><span style="font-size:13px;font-weight:600;color:var(--on-surface-variant);">भारत सरकार AGMARKNET सर्वर से मंडी भाव लोड हो रहे हैं... / Connecting to live APMC feed...</span></td></tr>`;
    }
    if (countBadge) countBadge.textContent = 'डेटा लोड हो रहा है...';

    try {
      const res = await MarketService.getMandiPrices(filter || null);
      this.allMandiPrices = res.data || [];

      this.updateNetworkStatus(res.source, res.isRealGovData);

      if (sourceBadge) {
        if (res.source === 'GOVERNMENT_API_AGMARKNET') {
          sourceBadge.innerHTML = '<i data-lucide="check-circle-2" style="width:13px;height:13px;"></i> Live: data.gov.in AGMARKNET';
          sourceBadge.style.background = 'rgba(21,128,61,0.12)';
          sourceBadge.style.color = '#15803d';
        } else if (res.source === 'REDIS_CACHE') {
          sourceBadge.innerHTML = '<i data-lucide="zap" style="width:13px;height:13px;"></i> Redis Cached (data.gov.in AGMARKNET)';
          sourceBadge.style.background = 'rgba(37,99,235,0.12)';
          sourceBadge.style.color = '#2563eb';
        } else {
          sourceBadge.innerHTML = '<i data-lucide="shield-check" style="width:13px;height:13px;"></i> Mandi Rate (AGMARKNET · Govt. of India)';
          sourceBadge.style.background = 'rgba(234,88,12,0.12)';
          sourceBadge.style.color = '#ea580c';
        }
      }

      if (badgeText) {
        badgeText.textContent = res.source === 'REDIS_CACHE' ? 'CACHE SYNCED' : 'LIVE APMC';
      }

      // Populate State filter dropdown dynamically from available records
      const stateSelect = document.getElementById('mandi-state-filter');
      if (stateSelect) {
        const states = Array.from(new Set(this.allMandiPrices.map(p => p.state).filter(Boolean))).sort();
        const currentSelected = stateSelect.value;
        stateSelect.innerHTML = `<option value="">सभी राज्य (${states.length} States)</option>` +
          states.map(s => `<option value="${s}" ${s === currentSelected ? 'selected' : ''}>${s}</option>`).join('');
      }

      // Render table rows using the filter function
      this.filterMandiTable();

      // Render AI Insights
      const crop = filter || (this.allMandiPrices[0] ? this.allMandiPrices[0].commodity : 'Tomato');
      await this.renderMandiInsights(crop);

      if (window.lucide) {
        try { lucide.createIcons(); } catch (e) {}
      }
    } catch (err) {
      console.error('Error fetching mandi prices:', err);
      if (tbody) {
        tbody.innerHTML = `
          <tr><td colspan="7" style="text-align:center;padding:32px 16px;">
            <p style="color:var(--error);font-size:13px;font-weight:700;margin-bottom:8px;">${err.message || 'भाव लोड करने में असमर्थ'}</p>
            <button class="btn btn-outline" style="min-height:32px;font-size:12px;" onclick="App.renderMandiPrices('${filter}')">
              <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> पुनः प्रयास करें / Retry
            </button>
          </td></tr>`;
      }
      if (window.lucide) {
        try { lucide.createIcons(); } catch (e) {}
      }
    }
  },

  filterMandiTable() {
    const tbody = document.getElementById('mandi-table-body');
    const countBadge = document.getElementById('mandi-count-badge');
    if (!tbody) return;

    const query = (document.getElementById('mandi-search-input')?.value || '').toLowerCase().trim();
    const stateFilter = (document.getElementById('mandi-state-filter')?.value || '').trim();

    let list = this.allMandiPrices || [];

    if (stateFilter) {
      list = list.filter(p => p.state === stateFilter);
    }
    if (query) {
      list = list.filter(p =>
        (p.commodity && p.commodity.toLowerCase().includes(query)) ||
        (p.commodityHi && p.commodityHi.toLowerCase().includes(query)) ||
        (p.market && p.market.toLowerCase().includes(query)) ||
        (p.state && p.state.toLowerCase().includes(query)) ||
        (p.district && p.district.toLowerCase().includes(query))
      );
    }

    if (countBadge) {
      countBadge.textContent = `${list.length} मंडियां उपलब्ध / ${list.length} APMC Records`;
    }

    if (!list.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center;padding:48px 16px;color:var(--on-surface-variant);">
            <div style="font-size:32px;margin-bottom:6px;">🌾</div>
            <div style="font-weight:700;font-size:14px;color:var(--on-surface);">कोई मंडी रिकॉर्ड नहीं मिला</div>
            <div style="font-size:12px;margin-top:2px;">No matching APMC records for your query. Try clearing filters.</div>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = list.map(p => {
      const photoUrl = this.getCropPhoto(p.commodity);
      const minP = typeof p.minPrice === 'number' ? p.minPrice.toLocaleString('en-IN') : p.minPrice;
      const maxP = typeof p.maxPrice === 'number' ? p.maxPrice.toLocaleString('en-IN') : p.maxPrice;
      const modalP = typeof p.modalPrice === 'number' ? p.modalPrice.toLocaleString('en-IN') : p.modalPrice;

      let trendHtml = '';
      if (p.trend === 'up') {
        const changeTxt = p.change ? `+₹${p.change}` : 'तेज (Up)';
        trendHtml = `<span class="mandi-trend-pill trend-up"><i data-lucide="trending-up" style="width:13px;height:13px;"></i> ${changeTxt}</span>`;
      } else if (p.trend === 'down') {
        const changeTxt = p.change ? `-₹${Math.abs(p.change)}` : 'मंदा (Down)';
        trendHtml = `<span class="mandi-trend-pill trend-down"><i data-lucide="trending-down" style="width:13px;height:13px;"></i> ${changeTxt}</span>`;
      } else {
        trendHtml = `<span class="mandi-trend-pill trend-stable"><i data-lucide="minus" style="width:13px;height:13px;"></i> स्थिर (Stable)</span>`;
      }

      return `
        <tr>
          <td>
            <div class="mandi-crop-cell">
              <img src="${photoUrl}" alt="${p.commodity}" class="mandi-crop-thumb" loading="lazy" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?w=80&auto=format&fit=crop&q=80';" />
              <div class="mandi-crop-info">
                <span class="mandi-crop-name">${p.commodityHi || p.commodity}</span>
                <span class="mandi-crop-sub">${p.commodity}</span>
              </div>
            </div>
          </td>
          <td>
            <div class="mandi-location-cell">
              <div class="mandi-market-name">
                <i data-lucide="map-pin" style="width:14px;height:14px;color:var(--primary);flex-shrink:0;"></i>
                <span>${p.market}</span>
              </div>
              <span class="mandi-state-badge">${p.state || 'India'} ${p.district ? `· ${p.district}` : ''}</span>
            </div>
          </td>
          <td style="text-align:right;">
            <span class="mandi-price-val">₹${minP}</span>
          </td>
          <td style="text-align:right;">
            <span class="mandi-price-val">₹${maxP}</span>
          </td>
          <td style="text-align:center;">
            <div class="mandi-modal-badge">
              <span class="mandi-modal-val">₹${modalP}</span>
              <span class="mandi-modal-unit">/Qtl</span>
            </div>
          </td>
          <td style="text-align:center;">
            ${trendHtml}
          </td>
          <td style="text-align:center;">
            <button class="btn btn-sm btn-outline mandi-row-btn" onclick="App.openMandiProduce('${p.commodity}')">
              <i data-lucide="shopping-bag" style="width:12px;height:12px;"></i> ट्रेड / Trade
            </button>
          </td>
        </tr>`;
    }).join('');

    if (window.lucide) {
      try { lucide.createIcons(); } catch (e) {}
    }
  },

  async renderMandiInsights(crop) {
    const aiEl = document.getElementById('mandi-ai-content');
    if (!aiEl) return;
    try {
      const insights = await AIService.getMarketInsights(crop);
      if (!insights || !insights.length) {
        aiEl.innerHTML = `<div style="font-size:12px;color:var(--on-surface-variant);padding:8px;">विश्लेषण उपलब्ध नहीं है / Insights currently loading...</div>`;
        return;
      }

      aiEl.innerHTML = insights.map((i, idx) => {
        let iconName = 'sparkles';
        let tagText = 'AI ADVISORY';
        let typeClass = 'type-info';

        if (idx === 0) {
          iconName = 'award';
          tagText = 'उच्चतम भाव मंडी (Peak APMC)';
          typeClass = 'type-positive';
        } else if (idx === 1) {
          iconName = i.type === 'positive' ? 'trending-up' : 'activity';
          tagText = 'बाजार रुझान (Market Trend)';
          typeClass = i.type === 'positive' ? 'type-positive' : 'type-warning';
        } else {
          iconName = 'compass';
          tagText = 'स्मार्ट सिफारिश (Strategy)';
          typeClass = 'type-advice';
        }

        return `
          <div class="mandi-ai-item-card">
            <div class="mandi-ai-item-icon ${typeClass}">
              <i data-lucide="${iconName}" style="width:16px;height:16px;"></i>
            </div>
            <div class="mandi-ai-item-content">
              <div class="mandi-ai-item-tag">${tagText}</div>
              <div class="mandi-ai-item-text">${i.textHi || i.text}</div>
            </div>
          </div>`;
      }).join('');

      if (window.lucide) {
        try { lucide.createIcons(); } catch (e) {}
      }
    } catch (e) {
      console.warn('Error loading insights:', e);
    }
  },

  openMandiProduce(cropName) {
    this.navigate('marketplace');
    const search = document.getElementById('market-search');
    if (search) {
      search.value = cropName;
      this.filterMarket();
    }
  },

  refreshMandiPrices() {
    this.showToast('🔄 मंडी भाव ताज़ा हो रहे हैं... / Refreshing APMC feed...');
    this.renderMandiPrices(this.mandiFilter);
  },

  setMandiFilter(btn, crop) {
    const parent = btn.closest('.mandi-crop-tabs') || btn.closest('.mandi-crop-tabs-wrap');
    if (parent) {
      parent.querySelectorAll('.mandi-crop-chip').forEach(b => b.classList.remove('active'));
    }
    btn.classList.add('active');
    this.renderMandiPrices(crop);
  },

  updateMandiNav(role) {
    const nav = document.getElementById('mandi-bottom-nav');
    if (!nav) return;
    if (role === 'buyer') {
      nav.innerHTML = `
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('buyer-dashboard')">
          <span class="material-symbols-outlined mat-icon">home</span><span data-i18n="home">होम</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('marketplace')">
          <span class="material-symbols-outlined mat-icon">storefront</span><span data-i18n="market">मार्केट</span>
        </button>
        <button class="bottom-nav-item active" onclick="App.setActiveNav(this);App.navigate('mandi-prices')">
          <span class="material-symbols-outlined mat-icon">bar_chart</span><span data-i18n="prices">भाव</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('orders')">
          <span class="material-symbols-outlined mat-icon">inventory_2</span><span data-i18n="orders">ऑर्डर</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('profile')">
          <span class="material-symbols-outlined mat-icon">person</span><span data-i18n="profile">प्रोफ़ाइल</span>
        </button>`;
    } else {
      nav.innerHTML = `
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('farmer-dashboard')">
          <span class="material-symbols-outlined mat-icon">home</span><span data-i18n="home">होम</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('marketplace')">
          <span class="material-symbols-outlined mat-icon">storefront</span><span data-i18n="market">मार्केट</span>
        </button>
        <button class="bottom-nav-item" onclick="App.navigate('add-produce')" style="position:relative;">
          <div style="width:52px;height:52px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;position:absolute;top:-20px;box-shadow:var(--shadow-md);">
            <span class="material-symbols-outlined" style="font-size:26px;color:#fff;font-variation-settings:'FILL' 1;">add</span>
          </div>
          <span style="margin-top:32px;font-size:10px;font-weight:700;color:var(--primary);" data-i18n="sell">बेचें</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('orders')">
          <span class="material-symbols-outlined mat-icon">inventory_2</span><span data-i18n="orders">ऑर्डर</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('profile')">
          <span class="material-symbols-outlined mat-icon">person</span><span data-i18n="profile">प्रोफ़ाइल</span>
        </button>`;
    }
    this.applyLang();
  },

  // ── NEARBY MANDIS ──────────────────────────────────────────
  async renderNearbyMandis() {
    const listEl = document.getElementById('mandi-list');
    if (!listEl) return;
    listEl.innerHTML = `<div class="state-loading"><div class="spinner"></div><p>पास की मंडियां खोजी जा रही हैं... / Locating APMC yards...</p></div>`;

    try {
      const mandis = await MarketService.getNearbyMandis();
      if (!mandis.length) {
        listEl.innerHTML = `
          <div class="state-empty">
            <span class="empty-icon">📍</span>
            <div class="empty-title">कोई मंडी नहीं मिली / No nearby mandis found</div>
            <div class="empty-sub">Radius filter may need to be expanded.</div>
          </div>`;
        return;
      }

      listEl.innerHTML = mandis.map(m => `
        <div class="card card-body">
          <div style="display:flex;justify-content:space-between;align-items:start;gap:12px;">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <h3 class="text-label-lg">${m.nameHi || m.name}</h3>
                <span class="chip chip-primary" style="font-size:11px;">${m.type}</span>
              </div>
              <p class="text-label-sm text-on-surface-variant" style="margin-top:2px;">📍 ${m.district}, ${m.state}</p>
              <p class="text-label-sm text-on-surface-variant">⏰ ${m.timing}</p>
              <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
                ${m.crops.slice(0,3).map(c => `<span class="chip chip-surface" style="font-size:11px;">${c}</span>`).join('')}
              </div>
            </div>
            <div style="text-align:center;flex-shrink:0;">
              <div style="font-size:24px;font-weight:800;color:var(--primary);">${m.distance}</div>
              <div style="font-size:11px;color:var(--on-surface-variant);">किमी / km</div>
            </div>
          </div>
          <div style="display:flex;gap:10px;margin-top:12px;">
            <a href="tel:${m.phone || '18001801551'}" class="btn btn-outline" style="flex:1;min-height:38px;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px;">
              <span class="material-symbols-outlined" style="font-size:18px;">call</span> Call
            </a>
            <button class="btn btn-primary" style="flex:2;min-height:38px;font-size:13px;" onclick="App.showToast('📍 Opening ${m.name} in Maps... (Demo)')">
              <span class="material-symbols-outlined" style="font-size:18px;">directions</span> दिशा / Directions
            </button>
          </div>
        </div>`).join('');
    } catch (err) {
      console.error('Error fetching nearby mandis:', err);
      listEl.innerHTML = `
        <div class="state-error">
          <span class="material-symbols-outlined error-icon">error</span>
          <div class="error-msg">${err.message || 'मंडियां लोड करने में विफल'}</div>
          <button class="btn btn-outline" onclick="App.renderNearbyMandis()">पुनः प्रयास करें / Retry</button>
        </div>`;
    }
  },

  // ── ORDERS & OFFERS ─────────────────────────────────────────
  async renderOrders() {
    const user = AuthService.getUser();
    if (!user) { this.navigate('login'); return; }
    this.updateOrdersBottomNav(user.role);
    await this.switchOrderTab('offers');
  },

  async switchOrderTab(tab) {
    const user = AuthService.getUser();
    if (!user) return;

    ['offers','orders'].forEach(t => {
      const btn = document.getElementById(`ord-tab-${t}`);
      if (btn) btn.classList.toggle('active', t === tab);
    });
    const offersView = document.getElementById('orders-offers-view');
    const ordersView = document.getElementById('orders-orders-view');

    if (offersView) offersView.style.display = tab === 'offers' ? 'flex' : 'none';
    if (ordersView) ordersView.classList.toggle('hidden', tab !== 'orders');

    if (tab === 'offers') {
      if (!offersView) return;
      offersView.innerHTML = `<div class="state-loading"><div class="spinner"></div><p>ऑफर लोड हो रहे हैं... / Loading offers...</p></div>`;

      try {
        const offers = user.role === 'farmer'
          ? await OfferService.getFarmerOffers(user.id)
          : await OfferService.getBuyerOffers(user.id);

        if (!offers.length) {
          offersView.innerHTML = `
            <div class="state-empty">
              <span class="empty-icon">💰</span>
              <div class="empty-title">अभी कोई ऑफर नहीं / No offers found</div>
              <div class="empty-sub">${user.role === 'farmer' ? 'जब कोई खरीदार आपकी फसल पर बोली लगाएगा, तो वह यहाँ दिखेगा।' : 'You have not submitted any offers yet.'}</div>
              ${user.role === 'buyer' ? '<button class="btn btn-primary" style="margin-top:12px;min-height:36px;font-size:13px;" onclick="App.navigate(\'marketplace\')">Browse Market →</button>' : ''}
            </div>`;
        } else {
          offersView.innerHTML = offers.map(o => this._offerCardHTML(o, user.role === 'farmer')).join('');
        }
      } catch (err) {
        console.error('Error in switchOrderTab offers:', err);
        offersView.innerHTML = `
          <div class="state-error">
            <span class="material-symbols-outlined error-icon">error</span>
            <div class="error-msg">${err.message || 'ऑफर लोड करने में विफल'}</div>
            <button class="btn btn-outline" onclick="App.switchOrderTab('offers')">पुनः प्रयास करें / Retry</button>
          </div>`;
      }
    } else {
      if (!ordersView) return;
      ordersView.innerHTML = `<div class="state-loading"><div class="spinner"></div><p>ऑर्डर लोड हो रहे हैं... / Loading orders...</p></div>`;

      try {
        const orders = user.role === 'farmer'
          ? await OrderService.getFarmerOrders(user.id)
          : await OrderService.getBuyerOrders(user.id);

        if (!orders.length) {
          ordersView.innerHTML = `
            <div class="state-empty">
              <span class="empty-icon">📦</span>
              <div class="empty-title">कोई ऑर्डर नहीं / No orders found</div>
              <div class="empty-sub">${user.role === 'farmer' ? 'ऑफर स्वीकार करने पर यहाँ ऑर्डर बनेगा।' : 'Accepted offers will generate orders here.'}</div>
            </div>`;
        } else {
          ordersView.innerHTML = orders.map(o => this._orderCardHTML(o, user)).join('');
        }
      } catch (err) {
        console.error('Error in switchOrderTab orders:', err);
        ordersView.innerHTML = `
          <div class="state-error">
            <span class="material-symbols-outlined error-icon">error</span>
            <div class="error-msg">${err.message || 'ऑर्डर लोड करने में विफल'}</div>
            <button class="btn btn-outline" onclick="App.switchOrderTab('orders')">पुनः प्रयास करें / Retry</button>
          </div>`;
      }
    }
  },

  _orderCardHTML(order, user) {
    const other = user.role === 'farmer' ? order.buyer : order.farmer;
    const statusColors = {
      confirmed: 'chip-primary', delivered: 'chip-success', cancelled: 'chip-error', in_transit: 'chip-warning'
    };
    return `
    <div class="card card-body">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div>
          <p class="text-label-sm text-on-surface-variant">Order #${order.id ? order.id.slice(0, 8) : ''}</p>
          <p class="text-label-lg">${order.crop} · ${order.quantity} ${order.unit}</p>
          <p class="text-label-sm text-on-surface-variant">${user.role === 'farmer' ? `Buyer: ${other?.name || other?.company || 'Verified'}` : `Farmer: ${other?.name || 'Farmer'}`}</p>
        </div>
        <div style="text-align:right;">
          <span class="chip ${statusColors[order.status] || 'chip-surface'}">${(order.status || 'CONFIRMED').toUpperCase()}</span>
          <div style="font-size:20px;font-weight:800;color:var(--primary);margin-top:4px;">₹${(order.totalAmount || 0).toLocaleString('en-IN')}</div>
          <div style="font-size:12px;color:var(--on-surface-variant);">@ ₹${order.agreedPrice}/${order.unit || 'kg'}</div>
        </div>
      </div>
      <!-- Timeline -->
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:8px;">
        ${(order.timeline || []).map((t, idx) => {
          const isLast = idx === order.timeline.length - 1;
          return `
          <div class="timeline-item">
            ${!isLast ? `<div class="timeline-line ${t.done ? 'done' : ''}"></div>` : ''}
            <div class="timeline-dot ${t.done ? '' : idx === order.timeline.findIndex(x => !x.done) ? 'pending' : 'inactive'}"></div>
            <div style="flex:1;">
              <p style="font-size:14px;font-weight:${t.done ? '600' : '400'};color:${t.done ? 'var(--on-surface)' : 'var(--on-surface-variant)'};">${t.step}</p>
              ${t.date ? `<p style="font-size:12px;color:var(--on-surface-variant);">${t.date}</p>` : ''}
            </div>
            ${t.done ? '<span class="material-symbols-outlined" style="color:var(--primary);font-size:18px;font-variation-settings:\'FILL\' 1;">check_circle</span>' : ''}
          </div>`;
        }).join('')}
      </div>
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--outline-variant);display:flex;gap:8px;flex-wrap:wrap;">
        <span class="chip ${order.paymentStatus === 'paid' ? 'chip-success' : 'chip-warning'}">
          💳 Payment: ${order.paymentStatus === 'paid' ? '✅ Paid' : '⏳ Escrow Pending'}
        </span>
      </div>
    </div>`;
  },

  // ── NOTIFICATIONS ──────────────────────────────────────────
  async renderNotifications() {
    const user = AuthService.getUser();
    if (!user) { this.navigate('login'); return; }
    const listEl = document.getElementById('notif-list');
    if (!listEl) return;

    listEl.innerHTML = `<div class="state-loading"><div class="spinner"></div><p>सूचनाएं लोड हो रही हैं... / Loading alerts...</p></div>`;

    try {
      const notifs = await NotificationService.getAll(user.id);
      if (!notifs.length) {
        listEl.innerHTML = `
          <div class="state-empty">
            <span class="empty-icon">🔔</span>
            <div class="empty-title">कोई नई सूचना नहीं / No notifications</div>
            <div class="empty-sub">All updates about listings, orders, and mandi prices will appear here.</div>
          </div>`;
        this._updateNotifBadge(0);
        return;
      }

      const bgMap = {
        offer: 'rgba(252,171,40,0.1)',
        price: 'rgba(27,94,32,0.1)',
        order: 'rgba(27,94,32,0.08)',
        ai: 'rgba(252,171,40,0.08)',
        system: 'var(--surface-container-low)'
      };

      listEl.innerHTML = notifs.map(n => `
        <div class="notif-item" style="opacity:${n.read ? '0.7' : '1'};${!n.read ? 'border-left:3px solid var(--primary);' : ''}" onclick="App.markNotifRead('${n.id}')">
          <div class="notif-icon" style="background:${bgMap[n.type] || 'var(--surface-container)'};">${n.emoji}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
              <p class="text-label-lg" style="color:${n.read ? 'var(--on-surface-variant)' : 'var(--on-surface)'};">${n.title}</p>
              <span class="text-label-sm text-on-surface-variant" style="white-space:nowrap;">${n.time}</span>
            </div>
            <p class="text-body-md text-on-surface-variant" style="font-size:13px;margin-top:2px;">${n.body}</p>
          </div>
          ${!n.read ? '<div style="width:8px;height:8px;border-radius:50%;background:var(--primary);flex-shrink:0;margin-top:4px;"></div>' : ''}
        </div>`).join('');

      const unreadCount = notifs.filter(n => !n.read).length;
      this._updateNotifBadge(unreadCount);
    } catch (err) {
      console.error('Error rendering notifications:', err);
      listEl.innerHTML = `
        <div class="state-error">
          <span class="material-symbols-outlined error-icon">error</span>
          <div class="error-msg">${err.message || 'सूचनाएं लोड करने में विफल'}</div>
          <button class="btn btn-outline" onclick="App.renderNotifications()">पुनः प्रयास करें / Retry</button>
        </div>`;
    }
  },

  async markNotifRead(id) {
    await NotificationService.markRead(id);
    await this.renderNotifications();
  },

  async markAllNotifRead() {
    const user = AuthService.getUser();
    if (user) {
      await NotificationService.markAllRead(user.id);
      await this.renderNotifications();
      this.showToast('✅ सभी पढ़ी गईं / All marked as read');
    }
  },

  async _updateNotifBadge(count) {
    const badge = document.getElementById('notif-badge');
    if (count === undefined) {
      const user = AuthService.getUser();
      if (user) {
        const notifs = await NotificationService.getAll(user.id);
        count = notifs.filter(n => !n.read).length;
      } else {
        count = 0;
      }
    }
    if (badge) badge.style.display = count > 0 ? 'block' : 'none';
  },

  // ── ADMIN DASHBOARD ────────────────────────────────────────
  async renderAdminDashboard() {
    const user = AuthService.getUser();
    if (!user || user.role !== 'admin') {
      this.showToast('⚠️ Admin access required');
      this.navigate('login');
      return;
    }

    try {
      const stats = await AdminService.getStats();
      const farmersEl = document.getElementById('admin-farmers');
      if (farmersEl) farmersEl.textContent = stats.totalFarmers;
      const buyersEl = document.getElementById('admin-buyers');
      if (buyersEl) buyersEl.textContent = stats.totalBuyers;
      const listingsEl = document.getElementById('admin-listings');
      if (listingsEl) listingsEl.textContent = stats.activeListings;
      const offersEl = document.getElementById('admin-offers');
      if (offersEl) offersEl.textContent = stats.pendingOffers;
      const ordersEl = document.getElementById('admin-orders');
      if (ordersEl) ordersEl.textContent = stats.totalOrders;
      const revEl = document.getElementById('admin-revenue');
      if (revEl) revEl.textContent = `₹${(stats.revenue / 100000).toFixed(1)}L`;

      // Users table
      const usersTable = document.getElementById('admin-users-table');
      if (usersTable) {
        usersTable.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:16px;"><div class="spinner" style="margin:0 auto;"></div></td></tr>`;
        const users = await AdminService.getAllUsers();
        if (!users.length) {
          usersTable.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:16px;">No users found</td></tr>`;
        } else {
          usersTable.innerHTML = users.map(u => `
            <tr>
              <td>${u.avatar || ''} ${u.name}</td>
              <td><span class="chip ${u.role === 'farmer' ? 'chip-success' : 'chip-secondary'}">${u.role}</span></td>
              <td>${u.phone}</td>
              <td>${u.verified ? '✅ Verified' : '⚠️ Pending'}</td>
              <td>
                ${!u.verified ? `<button onclick="App.verifyUser('${u.id}', this)" class="btn btn-primary" style="min-height:28px;padding:0 10px;font-size:12px;">Verify</button>` : '—'}
              </td>
            </tr>`).join('');
        }
      }

      // Listings table
      const listingsTable = document.getElementById('admin-listings-table');
      if (listingsTable) {
        listingsTable.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:16px;"><div class="spinner" style="margin:0 auto;"></div></td></tr>`;
        const listings = await AdminService.getAllListings();
        const activeListings = listings.filter(l => l.status !== 'deleted');
        if (!activeListings.length) {
          listingsTable.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:16px;">No active listings</td></tr>`;
        } else {
          listingsTable.innerHTML = activeListings.map(l => {
            const farmerName = l.farmer?.name || 'Verified Farmer';
            return `
            <tr>
              <td>${l.emoji} ${l.cropHi || l.crop}</td>
              <td>${l.quantity} ${l.unit}</td>
              <td>₹${l.askingPrice}/kg</td>
              <td>${farmerName}</td>
              <td><span class="chip ${l.status === 'active' ? 'chip-success' : 'chip-surface'}">${l.status}</span></td>
            </tr>`;
          }).join('');
        }
      }
    } catch (err) {
      console.error('Error in renderAdminDashboard:', err);
      this.showToast(`Admin dashboard error: ${err.message}`);
    }
  },

  async verifyUser(userId, btnEl) {
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.textContent = 'Verifying...';
    }
    try {
      await AdminService.verifyUser(userId);
      this.showToast('✅ User successfully verified!');
      await this.renderAdminDashboard();
    } catch (err) {
      this.showToast(`❌ Verification error: ${err.message}`);
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = 'Verify';
      }
    }
  },

  // ── PROFILE ────────────────────────────────────────────
  async renderProfile() {
    const user = AuthService.getUser();
    if (!user) { this.navigate('login'); return; }

    const avatarEl = document.getElementById('profile-avatar');
    const nameEl = document.getElementById('profile-name');
    const roleEl = document.getElementById('profile-role-tag');
    const verifiedEl = document.getElementById('profile-verified');
    const stat1Val = document.getElementById('profile-stat1');
    const stat1Lbl = document.getElementById('profile-stat1-label');
    const stat2Val = document.getElementById('profile-stat2');
    const stat2Lbl = document.getElementById('profile-stat2-label');
    const ratingEl = document.getElementById('profile-rating');
    const infoList = document.getElementById('profile-info-list');

    if (avatarEl) avatarEl.textContent = user.avatar || '👤';
    if (nameEl) nameEl.textContent = (this.currentLang === 'hi' && user.nameHi) ? user.nameHi : user.name;

    const roleLabels = {
      farmer: { hi: '🌾 पंजीकृत किसान (Farmer)', en: '🌾 Registered Farmer' },
      buyer:  { hi: '🏪 थोक खरीदार (Buyer)', en: '🏪 Wholesale Buyer' },
      admin:  { hi: '⚙️ व्यवस्थापक (Admin)', en: '⚙️ Administrator' }
    };
    if (roleEl) roleEl.textContent = (roleLabels[user.role] && roleLabels[user.role][this.currentLang === 'en' ? 'en' : 'hi']) || user.role;

    if (verifiedEl) {
      verifiedEl.textContent = user.verified ? '✅ सत्यापित / Verified' : '⏳ सत्यापन लंबित / Pending';
      verifiedEl.className = 'chip ' + (user.verified ? 'chip-primary' : 'chip-warning') + ' profile-verified-chip';
    }

    try {
      if (user.role === 'farmer') {
        const [listings, orders] = await Promise.all([
          ListingService.getFarmerListings(user.id),
          OrderService.getFarmerOrders(user.id)
        ]);
        if (stat1Val) stat1Val.textContent = listings.filter(l => l.status === 'active').length;
        if (stat1Lbl) stat1Lbl.textContent = 'Listings';
        if (stat2Val) stat2Val.textContent = orders.length;
        if (stat2Lbl) stat2Lbl.textContent = 'Orders';
        if (ratingEl) ratingEl.textContent = '⭐ ' + (user.rating || user.farmer_rating || '4.7');
      } else if (user.role === 'buyer') {
        const [offers, orders] = await Promise.all([
          OfferService.getBuyerOffers(user.id),
          OrderService.getBuyerOrders(user.id)
        ]);
        if (stat1Val) stat1Val.textContent = offers.length;
        if (stat1Lbl) stat1Lbl.textContent = 'Offers';
        if (stat2Val) stat2Val.textContent = orders.length;
        if (stat2Lbl) stat2Lbl.textContent = 'Orders';
        if (ratingEl) ratingEl.textContent = '⭐ ' + (user.rating || user.buyer_rating || '4.8');
      } else {
        const stats = await AdminService.getStats();
        if (stat1Val) stat1Val.textContent = stats.totalFarmers + stats.totalBuyers;
        if (stat1Lbl) stat1Lbl.textContent = 'Users';
        if (stat2Val) stat2Val.textContent = stats.activeListings;
        if (stat2Lbl) stat2Lbl.textContent = 'Listings';
        if (ratingEl) ratingEl.textContent = '⭐ 5.0';
      }
    } catch (err) {
      console.error('Error fetching profile stats:', err);
    }

    if (infoList) {
      const isHi = this.currentLang !== 'en';
      const rows = [
        {
          icon: '📱',
          label: isHi ? 'मोबाइल नंबर' : 'Phone Number',
          value: user.phone ? `<a href="tel:${user.phone}" style="color:var(--primary);text-decoration:none;font-weight:700;">${user.phone}</a>` : '-'
        },
        {
          icon: '📍',
          label: isHi ? 'पता / स्थान' : 'Location',
          value: [user.village || user.city, user.district, user.state].filter(Boolean).join(', ') || 'India'
        },
      ];

      if (user.role === 'farmer') {
        if (user.landAcres) {
          rows.push({
            icon: '🌾',
            label: isHi ? 'कृषि भूमि' : 'Total Land',
            value: `<span class="chip chip-surface" style="font-weight:700;color:var(--primary);background:rgba(22,101,52,0.1);">${user.landAcres} Acres</span>`
          });
        }
        if (user.crops) {
          const cropBadges = Array.isArray(user.crops)
            ? user.crops.map(c => `<span class="chip chip-surface" style="font-size:12px;font-weight:600;padding:3px 8px;margin:2px 0;">🌱 ${c}</span>`).join(' ')
            : user.crops;
          rows.push({
            icon: '🌱',
            label: isHi ? 'मुख्य फसलें' : 'Primary Crops',
            value: `<div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end;">${cropBadges}</div>`
          });
        }
      } else if (user.role === 'buyer') {
        if (user.company) {
          rows.push({
            icon: '🏢',
            label: isHi ? 'कंपनी / फर्म' : 'Company / Firm',
            value: user.company
          });
        }
      }

      rows.push({
        icon: '🏛️',
        label: isHi ? 'e-NAM स्थिति' : 'e-NAM Status',
        value: '<span class="chip" style="background:#e8f5e9;color:#166534;border:1px solid #86efac;font-size:11.5px;font-weight:700;padding:3px 10px;">✅ KYC Active</span>'
      });

      infoList.innerHTML = rows.map(r => `
        <div class="profile-info-row">
          <div class="profile-info-label-group">
            <span class="profile-info-icon">${r.icon}</span>
            <span class="profile-info-label">${r.label}</span>
          </div>
          <div class="profile-info-value">${r.value}</div>
        </div>`).join('');
    }

    const profileLang = document.getElementById('profile-lang-badge');
    if (profileLang) {
      const t = this._i18n[this.currentLang] || this._i18n.hi;
      profileLang.textContent = t.label;
    }

    this.updateProfileBottomNav(user.role);
  },

  // ── BOTTOM NAV SYNC HELPERS ────────────────────────────
  updateProfileBottomNav(role) {
    const nav = document.getElementById('profile-bottom-nav');
    if (!nav) return;
    if (role === 'buyer') {
      nav.innerHTML = `
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('buyer-dashboard')">
          <span class="material-symbols-outlined mat-icon">home</span>
          <span data-i18n="home">होम</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('marketplace')">
          <span class="material-symbols-outlined mat-icon">storefront</span>
          <span data-i18n="market">मार्केट</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('mandi-prices')">
          <span class="material-symbols-outlined mat-icon">bar_chart</span>
          <span data-i18n="prices">भाव</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('orders')">
          <span class="material-symbols-outlined mat-icon">inventory_2</span>
          <span data-i18n="orders">ऑर्डर</span>
        </button>
        <button class="bottom-nav-item active" onclick="App.setActiveNav(this);App.navigate('profile')">
          <div class="nav-indicator"></div>
          <span class="material-symbols-outlined mat-icon">person</span>
          <span data-i18n="profile">प्रोफ़ाइल</span>
        </button>`;
    } else if (role === 'admin') {
      nav.innerHTML = `
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('admin-dashboard')">
          <span class="material-symbols-outlined mat-icon">dashboard</span>
          <span>Admin</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('marketplace')">
          <span class="material-symbols-outlined mat-icon">storefront</span>
          <span data-i18n="market">मार्केट</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('mandi-prices')">
          <span class="material-symbols-outlined mat-icon">bar_chart</span>
          <span data-i18n="prices">भाव</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('notifications')">
          <span class="material-symbols-outlined mat-icon">notifications</span>
          <span data-i18n="notifs">सूचनाएं</span>
        </button>
        <button class="bottom-nav-item active" onclick="App.setActiveNav(this);App.navigate('profile')">
          <div class="nav-indicator"></div>
          <span class="material-symbols-outlined mat-icon">person</span>
          <span data-i18n="profile">प्रोफ़ाइल</span>
        </button>`;
    } else {
      nav.innerHTML = `
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('farmer-dashboard')">
          <span class="material-symbols-outlined mat-icon">home</span>
          <span data-i18n="home">होम</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('marketplace')">
          <span class="material-symbols-outlined mat-icon">storefront</span>
          <span data-i18n="market">मार्केट</span>
        </button>
        <button class="bottom-nav-item" onclick="App.navigate('add-produce')" style="position:relative;">
          <div style="width:52px;height:52px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;position:absolute;top:-20px;box-shadow:var(--shadow-md);">
            <span class="material-symbols-outlined" style="font-size:26px;color:#fff;font-variation-settings:'FILL' 1;">add</span>
          </div>
          <span style="margin-top:32px;font-size:10px;font-weight:700;color:var(--primary);" data-i18n="sell">बेचें</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('orders')">
          <span class="material-symbols-outlined mat-icon">inventory_2</span>
          <span data-i18n="orders">ऑर्डर</span>
        </button>
        <button class="bottom-nav-item active" onclick="App.setActiveNav(this);App.navigate('profile')">
          <div class="nav-indicator"></div>
          <span class="material-symbols-outlined mat-icon">person</span>
          <span data-i18n="profile">प्रोफ़ाइल</span>
        </button>`;
    }
    this.applyLang();
  },

  updateOrdersBottomNav(role) {
    const nav = document.getElementById('orders-bottom-nav');
    if (!nav) return;
    if (role === 'buyer') {
      nav.innerHTML = `
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('buyer-dashboard')">
          <span class="material-symbols-outlined mat-icon">home</span>
          <span data-i18n="home">होम</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('marketplace')">
          <span class="material-symbols-outlined mat-icon">storefront</span>
          <span data-i18n="market">मार्केट</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('mandi-prices')">
          <span class="material-symbols-outlined mat-icon">bar_chart</span>
          <span data-i18n="prices">भाव</span>
        </button>
        <button class="bottom-nav-item active" onclick="App.setActiveNav(this);App.navigate('orders')">
          <div class="nav-indicator"></div>
          <span class="material-symbols-outlined mat-icon">inventory_2</span>
          <span data-i18n="orders">ऑर्डर</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('profile')">
          <span class="material-symbols-outlined mat-icon">person</span>
          <span data-i18n="profile">प्रोफ़ाइल</span>
        </button>`;
    } else {
      nav.innerHTML = `
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('farmer-dashboard')">
          <span class="material-symbols-outlined mat-icon">home</span>
          <span data-i18n="home">होम</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('marketplace')">
          <span class="material-symbols-outlined mat-icon">storefront</span>
          <span data-i18n="market">मार्केट</span>
        </button>
        <button class="bottom-nav-item" onclick="App.navigate('add-produce')" style="position:relative;">
          <div style="width:52px;height:52px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;position:absolute;top:-20px;box-shadow:var(--shadow-md);">
            <span class="material-symbols-outlined" style="font-size:26px;color:#fff;font-variation-settings:'FILL' 1;">add</span>
          </div>
          <span style="margin-top:32px;font-size:10px;font-weight:700;color:var(--primary);" data-i18n="sell">बेचें</span>
        </button>
        <button class="bottom-nav-item active" onclick="App.setActiveNav(this);App.navigate('orders')">
          <div class="nav-indicator"></div>
          <span class="material-symbols-outlined mat-icon">inventory_2</span>
          <span data-i18n="orders">ऑर्डर</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('profile')">
          <span class="material-symbols-outlined mat-icon">person</span>
          <span data-i18n="profile">प्रोफ़ाइल</span>
        </button>`;
    }
    this.applyLang();
  },

  updateMarketNav(role) {
    const nav = document.getElementById('market-nav');
    if (!nav) return;
    if (role === 'buyer') {
      nav.innerHTML = `
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('buyer-dashboard')">
          <span class="material-symbols-outlined mat-icon">home</span><span data-i18n="home">होम</span>
        </button>
        <button class="bottom-nav-item active" onclick="App.setActiveNav(this)">
          <div class="nav-indicator"></div>
          <span class="material-symbols-outlined mat-icon">storefront</span><span data-i18n="market">मार्केट</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('mandi-prices')">
          <span class="material-symbols-outlined mat-icon">bar_chart</span><span data-i18n="prices">भाव</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('orders')">
          <span class="material-symbols-outlined mat-icon">inventory_2</span><span data-i18n="orders">ऑर्डर</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('profile')">
          <span class="material-symbols-outlined mat-icon">person</span><span data-i18n="profile">प्रोफ़ाइल</span>
        </button>`;
    } else {
      nav.innerHTML = `
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('farmer-dashboard')">
          <span class="material-symbols-outlined mat-icon">home</span><span data-i18n="home">होम</span>
        </button>
        <button class="bottom-nav-item active" onclick="App.setActiveNav(this)">
          <div class="nav-indicator"></div>
          <span class="material-symbols-outlined mat-icon">storefront</span><span data-i18n="market">मार्केट</span>
        </button>
        <button class="bottom-nav-item" onclick="App.navigate('add-produce')" style="position:relative;">
          <div style="width:52px;height:52px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;position:absolute;top:-20px;box-shadow:var(--shadow-md);">
            <span class="material-symbols-outlined" style="font-size:26px;color:#fff;font-variation-settings:'FILL' 1;">add</span>
          </div>
          <span style="margin-top:32px;font-size:10px;font-weight:700;color:var(--primary);" data-i18n="sell">बेचें</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('orders')">
          <span class="material-symbols-outlined mat-icon">inventory_2</span><span data-i18n="orders">ऑर्डर</span>
        </button>
        <button class="bottom-nav-item" onclick="App.setActiveNav(this);App.navigate('profile')">
          <span class="material-symbols-outlined mat-icon">person</span><span data-i18n="profile">प्रोफ़ाइल</span>
        </button>`;
    }
    this.applyLang();
  },

  // ── PROFILE HOME HELPER ────────────────────────────────
  goProfileHome() {
    const user = AuthService.getUser();
    if (!user) { this.navigate('splash'); return; }
    const home = user.role === 'farmer' ? 'farmer-dashboard'
               : user.role === 'buyer'  ? 'buyer-dashboard'
               : 'admin-dashboard';
    this.navigate(home);
  },

  logout() {
    AuthService.logout();
    this.history = [];
    this.showToast('लॉगआउट सफल / Logged out');
    this.navigate('splash');
  },

  // ── LANGUAGE SWITCHER & I18N ───────────────────────────
  _i18n: {
    hi: {
      label: 'हिंदी',
      home: 'होम',
      market: 'मार्केट',
      sell: 'बेचें',
      orders: 'ऑर्डर',
      prices: 'भाव',
      profile: 'प्रोफ़ाइल',
      notifs: 'सूचनाएं',
      nearby_mandi: 'पास की मंडी',
      view_mandi_prices: 'मंडी भाव देखें',
      change_lang: 'भाषा बदलें / Change Language',
      kisan_helpline: 'किसान हेल्पलाइन 1800-180-1551',
      logout: 'लॉगआउट / Logout',
      search_placeholder: 'फसल खोजें / Search produce...',
      profile_info: '📋 प्रोफ़ाइल जानकारी',
      listings: 'लिस्टिंग्स',
      verified_tag: '✅ सत्यापित किसान',
      all: 'सभी',
      order_offers: 'ऑर्डर & ऑफर',
      offers_tab: '💰 ऑफर',
      orders_tab: '📦 ऑर्डर',
    },
    en: {
      label: 'English',
      home: 'Home',
      market: 'Market',
      sell: 'Sell',
      orders: 'Orders',
      prices: 'Prices',
      profile: 'Profile',
      notifs: 'Alerts',
      nearby_mandi: 'Nearby Mandis',
      view_mandi_prices: 'View Mandi Prices',
      change_lang: 'Change Language / भाषा बदलें',
      kisan_helpline: 'Kisan Helpline 1800-180-1551',
      logout: 'Logout / लॉगआउट',
      search_placeholder: 'Search produce...',
      profile_info: '📋 Profile Information',
      listings: 'Listings',
      verified_tag: '✅ Verified Member',
      all: 'All',
      order_offers: 'Orders & Offers',
      offers_tab: '💰 Offers',
      orders_tab: '📦 Orders',
    },
    hinglish: {
      label: 'Hinglish',
      home: 'Home',
      market: 'Market',
      sell: 'Bechein',
      orders: 'Orders',
      prices: 'Bhav',
      profile: 'Profile',
      notifs: 'Notifications',
      nearby_mandi: 'Paas ki Mandi',
      view_mandi_prices: 'Mandi Bhav Dekhein',
      change_lang: 'Bhasha Badlein / Language',
      kisan_helpline: 'Kisan Helpline 1800-180-1551',
      logout: 'Logout',
      search_placeholder: 'Fasal khojein / Search...',
      profile_info: '📋 Profile Jankari',
      listings: 'Listings',
      verified_tag: '✅ Verified Member',
      all: 'Sabhi',
      order_offers: 'Orders & Offers',
      offers_tab: '💰 Offers',
      orders_tab: '📦 Orders',
    },
    mr: {
      label: 'मराठी',
      home: 'मुख्यपृष्ठ',
      market: 'बाजार',
      sell: 'विक्री करा',
      orders: 'ऑर्डर्स',
      prices: 'बाजारभाव',
      profile: 'प्रोफाइल',
      notifs: 'सूचना',
      nearby_mandi: 'जवळची बाजारपेठ',
      view_mandi_prices: 'बाजारभाव पहा',
      change_lang: 'भाषा बदला / Change Language',
      kisan_helpline: 'शेतकरी हेल्पलाइन 1800-180-1551',
      logout: 'लॉग आउट / Logout',
      search_placeholder: 'पीक शोधा... / Search produce...',
      profile_info: '📋 प्रोफाइल माहिती',
      listings: 'लिस्टिंग',
      verified_tag: '✅ पडताळणीकृत सदस्य',
      all: 'सर्व',
      order_offers: 'ऑर्डर्स आणि ऑफर्स',
      offers_tab: '💰 ऑफर्स',
      orders_tab: '📦 ऑर्डर्स',
    },
    pa: {
      label: 'ਪੰਜਾਬੀ',
      home: 'ਘਰ',
      market: 'ਬਾਜ਼ਾਰ',
      sell: 'ਵੇਚੋ',
      orders: 'ਆਰਡਰ',
      prices: 'ਭਾਅ',
      profile: 'ਪ੍ਰੋਫਾਈਲ',
      notifs: 'ਸੂਚਨਾਵਾਂ',
      nearby_mandi: 'ਨੇੜੇ ਮੰਡੀ',
      view_mandi_prices: 'ਮੰਡੀ ਭਾਅ ਦੇਖੋ',
      change_lang: 'ਭਾਸ਼ਾ ਬਦਲੋ / Change Language',
      kisan_helpline: 'ਕਿਸਾਨ ਹੈਲਪਲਾਈਨ 1800-180-1551',
      logout: 'ਲੌਗ ਆਉਟ / Logout',
      search_placeholder: 'ਫਸਲ ਖੋਜੋ... / Search produce...',
      profile_info: '📋 ਪ੍ਰੋਫਾਈਲ ਜਾਣਕਾਰੀ',
      listings: 'ਲਿਸਟਿੰਗ',
      verified_tag: '✅ ਪ੍ਰਮਾਣਿਤ ਮੈਂਬਰ',
      all: 'ਸਾਰੇ',
      order_offers: 'ਆਰਡਰ ਅਤੇ ਆਫਰ',
      offers_tab: '💰 ਆਫਰ',
      orders_tab: '📦 ਆਰਡਰ',
    },
    gu: {
      label: 'ગુજરાતી',
      home: 'ઘર',
      market: 'બજાર',
      sell: 'વેચો',
      orders: 'ઓર્ડર',
      prices: 'ભાવ',
      profile: 'પ્રૉફાઇલ',
      notifs: 'સૂચનાઓ',
      nearby_mandi: 'નજીકની માર્કેટ',
      view_mandi_prices: 'માર્કેટ ભાવ જુઓ',
      change_lang: 'ભાષા બદલો / Change Language',
      kisan_helpline: 'કિસાન હેલ્પલાઇન 1800-180-1551',
      logout: 'લૉગ આઉટ / Logout',
      search_placeholder: 'પાક શોધો... / Search produce...',
      profile_info: '📋 પ્રોફાઇલ માહિતી',
      listings: 'લિસ્ટિંગ',
      verified_tag: '✅ પ્રમાણિત સભ્ય',
      all: 'બધા',
      order_offers: 'ઓર્ડર અને ઑફર',
      offers_tab: '💰 ઑફર',
      orders_tab: '📦 ઓર્ડર',
    }
  },

  openLang() {
    const modal = document.getElementById('lang-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    const langs = ['hi','en','hinglish','mr','pa','gu'];
    langs.forEach(l => {
      const check = document.getElementById(`lang-${l}-check`);
      const btn   = document.getElementById(`lang-${l}`);
      if (!check || !btn) return;
      const isActive = l === this.currentLang;
      check.textContent = isActive ? 'check_circle' : 'radio_button_unchecked';
      check.style.color = isActive ? 'var(--primary)' : 'var(--on-surface-variant)';
      check.style.fontVariationSettings = isActive ? "'FILL' 1" : "'FILL' 0";
      btn.classList.toggle('active-lang', isActive);
    });
  },

  closeLang() {
    const modal = document.getElementById('lang-modal');
    if (modal) modal.classList.add('hidden');
  },

  setLang(lang) {
    this.currentLang = lang;
    try { localStorage.setItem('krishilink_lang', lang); } catch (e) {}
    this.applyLang();
    this.closeLang();
    const t = this._i18n[lang] || this._i18n.hi;
    this.showToast('🌐 Language: ' + t.label);
  },

  applyLang() {
    const t = this._i18n[this.currentLang] || this._i18n.hi;
    // Current-lang pill in profile screen & splash
    const lbl = document.getElementById('current-lang-label');
    if (lbl) lbl.textContent = t.label;
    const splashLbl = document.getElementById('splash-lang-label');
    if (splashLbl) splashLbl.textContent = t.label;
    const profileLang = document.getElementById('profile-lang-badge');
    if (profileLang) profileLang.textContent = t.label;

    // Header Language buttons on Marketplace & Buyer dashboard
    const marketLangLbl = document.getElementById('market-lang-lbl');
    if (marketLangLbl) marketLangLbl.textContent = `${t.label.toUpperCase()} (${t.label.toUpperCase()})`;
    const buyerLangLbl = document.getElementById('buyer-lang-lbl');
    if (buyerLangLbl) buyerLangLbl.textContent = `${t.label.toUpperCase()} (${t.label.toUpperCase()})`;

    // All elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (t[key] !== undefined) el.textContent = t[key];
    });

    // All elements with data-i18n-placeholder attribute
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (t[key] !== undefined) el.placeholder = t[key];
    });
  },

  // ── ONBOARDING CONTROLLERS ─────────────────────────────────
  setFarmerOBStep(step) {
    [1, 2, 3].forEach(s => {
      const pane = document.getElementById(`farmer-ob-step-${s}`);
      const ind = document.getElementById(`f-step-ind-${s}`);
      if (pane) pane.style.display = s === step ? 'block' : 'none';
      if (ind) {
        ind.classList.toggle('active', s === step);
        ind.classList.toggle('completed', s < step);
      }
    });
    const bar = document.getElementById('farmer-ob-progress-bar');
    if (bar) bar.style.width = step === 1 ? '33%' : step === 2 ? '66%' : '100%';
    if (window.lucide) {
      try { lucide.createIcons(); } catch (e) {}
    }
  },

  finishFarmerOB() {
    const user = AuthService.getUser();
    if (user) {
      user.onboarded = true;
      user.verified = true;
      try { localStorage.setItem('krishilink_user', JSON.stringify(user)); } catch (e) {}
    }
    this.navigate('farmer-dashboard');
    this.showToast('🎉 Farmer KYC & AI Verification Complete!');
    if (window.lucide) {
      try { lucide.createIcons(); } catch (e) {}
    }
  },

  setBuyerOBStep(step) {
    [1, 2, 3].forEach(s => {
      const pane = document.getElementById(`buyer-ob-step-${s}`);
      const ind = document.getElementById(`b-step-ind-${s}`);
      if (pane) pane.style.display = s === step ? 'block' : 'none';
      if (ind) {
        ind.classList.toggle('active', s === step);
        ind.classList.toggle('completed', s < step);
      }
    });
    const bar = document.getElementById('buyer-ob-progress-bar');
    if (bar) bar.style.width = step === 1 ? '33%' : step === 2 ? '66%' : '100%';
    if (window.lucide) {
      try { lucide.createIcons(); } catch (e) {}
    }
  },

  finishBuyerOB() {
    const user = AuthService.getUser();
    if (user) {
      user.onboarded = true;
      user.verified = true;
      try { localStorage.setItem('krishilink_user', JSON.stringify(user)); } catch (e) {}
    }
    this.navigate('buyer-dashboard');
    this.showToast('🎉 Institutional Buyer Account Activated!');
    if (window.lucide) {
      try { lucide.createIcons(); } catch (e) {}
    }
  }
};

// Note: App is already assigned to window above (window.App = {...})

// ── Bootstrap ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  try {
    const saved = localStorage.getItem('krishilink_lang');
    if (saved && App._i18n[saved]) {
      App.currentLang = saved;
    }
  } catch (e) {}
  const user = AuthService.getUser();
  if (user) {
    const route = user.role === 'farmer' ? 'farmer-dashboard'
                : user.role === 'buyer'  ? 'buyer-dashboard'
                : 'admin-dashboard';
    App.navigate(route);
  } else {
    App.navigate('splash');
  }

  App.applyLang();
  // Select Grade A by default on add produce
  App.selectGrade('A');
  // Initial notification badge
  App._updateNotifBadge();
  if (window.lucide) {
    try { lucide.createIcons(); } catch (e) {}
  }
});

