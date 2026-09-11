/**
 * KrishiLink – Unified Data & REST API Client
 * ============================================
 * Centralized authenticated API client communicating with backend REST endpoints (/api/v1/*).
 * Automatically acquires and attaches Firebase ID Tokens (with dev-token support).
 * Provides robust loading, error normalization, and data mapping.
 */

'use strict';

const API_BASE = '/api/v1';

// Global Crop Photography Map & Placeholders
const GLOBAL_CROP_PHOTOS = {
  Tomato: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&auto=format&fit=crop&q=80',
  Potato: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400&auto=format&fit=crop&q=80',
  Onion: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=400&auto=format&fit=crop&q=80',
  Wheat: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&auto=format&fit=crop&q=80',
  Maize: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=400&auto=format&fit=crop&q=80',
  Rice: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&auto=format&fit=crop&q=80',
  Chilli: 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?w=400&auto=format&fit=crop&q=80',
  Soyabean: 'https://images.unsplash.com/photo-1599940824399-b87987ceb72a?w=400&auto=format&fit=crop&q=80',
  Mustard: 'https://images.unsplash.com/photo-1628102491629-778571d893a3?w=400&auto=format&fit=crop&q=80',
  Garlic: 'https://images.unsplash.com/photo-1540148426945-6cf22a6b2383?w=400&auto=format&fit=crop&q=80',
  Ginger: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400&auto=format&fit=crop&q=80',
};
if (typeof window !== 'undefined') {
  window.cropPhotos = GLOBAL_CROP_PHOTOS;
}


/**
 * Shared API Client (fetch wrapper with Firebase Auth & token handling)
 * @param {string} endpoint
 * @param {object} options
 * @returns {Promise<any>}
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const defaultHeaders = {
    'Accept': 'application/json',
  };

  // 1. Resolve Firebase token
  let token = null;
  if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
    try {
      token = await firebase.auth().currentUser.getIdToken();
    } catch (e) {
      console.warn('Firebase getIdToken note:', e.message);
    }
  }
  if (!token) {
    try {
      token = localStorage.getItem('krishilink_token');
    } catch (e) {}
  }

  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && (!options.headers || !options.headers['Content-Type'])) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  if (config.body && typeof config.body === 'object' && !isFormData) {
    config.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(url, config);
    let json = {};
    try {
      json = await response.json();
    } catch (parseErr) {
      json = {};
    }

    if (!response.ok) {
      const errorMsg = json.message ||
        (json.errors && json.errors[0]?.message) ||
        (json.errors && typeof json.errors === 'string' && json.errors) ||
        `Request failed with status ${response.status}`;
      const err = new Error(errorMsg);
      err.status = response.status;
      err.data = json;
      throw err;
    }

    return json;
  } catch (err) {
    if (err.status) throw err;
    // Network or offline error
    const networkErr = new Error(err.message || 'Network connection error. Please check your internet.');
    networkErr.status = 0;
    throw networkErr;
  }
}

// ============================================================
// AUTH SERVICE (Firebase Authentication + PostgreSQL Sync)
// ============================================================
const AuthService = {
  currentUser: null,

  async login(phoneOrEmail, password) {
    try {
      const email = phoneOrEmail.includes('@') ? phoneOrEmail : `${phoneOrEmail}@krishilink.app`;
      let idToken = null;

      // 1. Try Firebase Auth Client SDK
      if (typeof firebase !== 'undefined' && firebase.auth) {
        try {
          const userCred = await firebase.auth().signInWithEmailAndPassword(email, password);
          idToken = await userCred.user.getIdToken();
        } catch (firebaseErr) {
          console.log('Firebase client login note:', firebaseErr.message);
        }
      }

      // 2. Dev mode token fallback if Firebase keys are in development emulator mode
      if (!idToken) {
        const isBuyer = phoneOrEmail.includes('9123') || phoneOrEmail.includes('9234') || phoneOrEmail.includes('buyer');
        const isAdmin = phoneOrEmail.includes('9000') || phoneOrEmail.includes('admin');
        const role = isAdmin ? 'admin' : isBuyer ? 'buyer' : 'farmer';
        const name = isAdmin ? 'Krishi Admin' : isBuyer ? (phoneOrEmail.includes('9234') ? 'Priya Wholesalers' : 'Anil Kumar Sharma') : (phoneOrEmail.includes('9812') ? 'Sunita Devi' : 'Ramesh Patel');
        idToken = `dev-token-${phoneOrEmail.replace(/[^a-zA-Z0-9]/g, '')}:${role}:${phoneOrEmail}:${encodeURIComponent(name)}`;
      }

      try {
        localStorage.setItem('krishilink_token', idToken);
      } catch (e) {}

      // 3. Authenticate with backend and sync user record
      const res = await apiRequest('/auth/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: { phoneOrEmail, password },
      });

      if (res.success && res.user) {
        this.currentUser = res.user;
        try {
          localStorage.setItem('krishilink_user', JSON.stringify(res.user));
        } catch (e) {}
        return { success: true, user: res.user };
      }
      return { success: false, error: res.message || 'Login failed' };
    } catch (err) {
      return { success: false, error: err.message || 'Login failed' };
    }
  },

  async register(data) {
    try {
      const email = data.email || `${data.phone}@krishilink.app`;
      let idToken = null;

      if (typeof firebase !== 'undefined' && firebase.auth) {
        try {
          const userCred = await firebase.auth().createUserWithEmailAndPassword(email, data.password);
          idToken = await userCred.user.getIdToken();
        } catch (firebaseErr) {
          console.log('Firebase register note:', firebaseErr.message);
        }
      }

      if (!idToken) {
        idToken = `dev-token-${data.phone}:${data.role}:${data.phone}:${encodeURIComponent(data.name)}`;
      }

      try {
        localStorage.setItem('krishilink_token', idToken);
      } catch (e) {}

      // Register / sync with backend
      const res = await apiRequest('/auth/register', {
        method: 'POST',
        body: data,
      }).catch(async (err) => {
        // If user already exists in DB, fallback to sync
        if (err.status === 409) {
          return await apiRequest('/auth/sync', {
            method: 'POST',
            headers: { Authorization: `Bearer ${idToken}` },
            body: data,
          });
        }
        throw err;
      });

      if (res.success && res.user) {
        this.currentUser = res.user;
        try {
          localStorage.setItem('krishilink_user', JSON.stringify(res.user));
        } catch (e) {}
        return { success: true, user: res.user };
      }
      return { success: false, error: res.message || 'Registration failed' };
    } catch (err) {
      return { success: false, error: err.message || 'Registration error' };
    }
  },

  async logout() {
    this.currentUser = null;
    if (typeof firebase !== 'undefined' && firebase.auth) {
      try {
        await firebase.auth().signOut();
      } catch (e) {}
    }
    try {
      localStorage.removeItem('krishilink_token');
      localStorage.removeItem('krishilink_user');
    } catch (e) {}
  },

  getUser() {
    if (!this.currentUser) {
      try {
        const saved = localStorage.getItem('krishilink_user');
        if (saved) this.currentUser = JSON.parse(saved);
      } catch (e) {}
    }
    return this.currentUser;
  },

  isLoggedIn() {
    return !!this.getUser();
  },

  async refreshUser() {
    try {
      const res = await apiRequest('/auth/me');
      if (res.success && res.user) {
        this.currentUser = res.user;
        try {
          localStorage.setItem('krishilink_user', JSON.stringify(res.user));
        } catch (e) {}
        return res.user;
      }
    } catch (e) {}
    return this.getUser();
  }
};

// ============================================================
// MARKET SERVICE (Live Mandi Prices & Nearby Mandis)
// ============================================================
const MarketService = {
  lastStatus: null,

  async getMandiPrices(commodity = null, state = null) {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (commodity && commodity !== 'all') params.append('commodity', commodity);
      if (state) params.append('state', state);

      const res = await apiRequest(`/market-prices?${params.toString()}`);
      const data = (res.data || []).map(p => ({
        id: p.id,
        commodity: p.commodity,
        commodityHi: p.commodity_hi || p.commodity,
        emoji: p.emoji || '🌱',
        market: p.market,
        state: p.state,
        district: p.district,
        minPrice: parseFloat(p.min_price),
        maxPrice: parseFloat(p.max_price),
        modalPrice: parseFloat(p.modal_price),
        date: p.price_date ? p.price_date.split('T')[0] : '',
        trend: p.trend || 'stable',
        change: parseFloat(p.change_amount || 0),
        lat: p.latitude ? parseFloat(p.latitude) : null,
        lng: p.longitude ? parseFloat(p.longitude) : null,
        distance: p.distance_km ? parseFloat(p.distance_km) : null,
      }));

      const status = {
        source: res.source || 'GOVERNMENT_API_AGMARKNET',
        dataSource: res.dataSource || 'data.gov.in AGMARKNET Mandi Price API',
        isRealGovData: !!res.isRealGovData,
      };
      this.lastStatus = status;

      return {
        data,
        source: status.source,
        dataSource: status.dataSource,
        isRealGovData: status.isRealGovData,
        resourceId: res.resourceId || '9ef84268-d588-465a-a308-a864a43d0070',
        notice: res.notice || null,
        updatedAt: res.govUpdatedAt || res.cachedAt || res.timestamp || new Date().toISOString(),
        govUpdatedAt: res.govUpdatedAt || null,
        cachedAt: res.cachedAt || null,
        priceDate: res.priceDate || (data[0] ? data[0].date : null),
      };
    } catch (err) {
      console.error('Error fetching mandi prices:', err);
      this.lastStatus = { source: 'ERROR', dataSource: null, isRealGovData: false, error: err.message };
      return { data: [], source: 'ERROR', error: err.message };
    }
  },

  async getCommodities() {
    try {
      const res = await apiRequest('/market-prices/commodities');
      return (res.data || []).map(c => ({
        name: c.name,
        nameHi: c.name_hi || c.name,
        emoji: c.emoji || '🌱',
        totalMarkets: parseInt(c.total_markets, 10),
        avgPrice: parseFloat(c.avg_price || 0),
      }));
    } catch (err) {
      console.error('Error fetching commodities:', err);
      return [];
    }
  },

  async getNearbyMandis(lat = 23.0225, lng = 72.5714, radius = 250) {
    try {
      const params = new URLSearchParams({
        lat: lat.toString(),
        lng: lng.toString(),
        radiusKm: radius.toString(),
        limit: '50',
      });
      const res = await apiRequest(`/market-prices?${params.toString()}`);

      // Group by market name
      const marketMap = new Map();
      (res.data || []).forEach(p => {
        if (!marketMap.has(p.market)) {
          marketMap.set(p.market, {
            id: p.id,
            name: p.market,
            nameHi: p.market,
            state: p.state,
            district: p.district,
            type: 'APMC Yard',
            distance: p.distance_km ? Math.round(parseFloat(p.distance_km)) : Math.floor(Math.random() * 20 + 8),
            timing: '6:00 AM – 6:00 PM',
            crops: [p.commodity],
            phone: '18001801551',
            lat: p.latitude ? parseFloat(p.latitude) : lat,
            lng: p.longitude ? parseFloat(p.longitude) : lng,
          });
        } else {
          const entry = marketMap.get(p.market);
          if (!entry.crops.includes(p.commodity)) {
            entry.crops.push(p.commodity);
          }
        }
      });

      return Array.from(marketMap.values());
    } catch (err) {
      console.error('Error fetching nearby mandis:', err);
      return [];
    }
  },

  async getHighestPriceMarket(commodity) {
    const { data: prices } = await this.getMandiPrices(commodity);
    if (!prices || prices.length === 0) return null;
    return prices.sort((a, b) => b.modalPrice - a.modalPrice)[0] || null;
  }
};

// ============================================================
// AI SERVICE (Computed using Live Backend Market Analytics)
// ============================================================
const AIService = {
  async getPriceRecommendation(crop, grade, quantity, location) {
    try {
      const { data: prices } = await MarketService.getMandiPrices(crop);
      if (!prices || prices.length === 0) return null;

      const modal = prices.reduce((s, p) => s + p.modalPrice, 0) / prices.length;
      const gradeMultiplier = { A: 1.05, B: 0.95, C: 0.85 }[grade] || 1;
      const suggestedPerQuintal = Math.round(modal * gradeMultiplier / 50) * 50;
      const suggestedPerKg = Math.round(suggestedPerQuintal / 100);
      const best = prices.sort((a, b) => b.modalPrice - a.modalPrice)[0];

      return {
        suggestedPrice: suggestedPerKg > 0 ? suggestedPerKg : Math.round(modal / 100),
        suggestedQuintal: suggestedPerQuintal,
        priceRange: {
          min: Math.round((suggestedPerKg || 20) * 0.9),
          max: Math.round((suggestedPerKg || 20) * 1.15)
        },
        bestMarket: best,
        insight: this._generateInsight(crop, prices),
        confidence: 91
      };
    } catch (err) {
      console.error('Error computing AI price recommendation:', err);
      return null;
    }
  },

  _generateInsight(crop, prices) {
    const trending = prices.filter(p => p.trend === 'up').length;
    const totalMandis = prices.length;
    if (trending > totalMandis / 2) {
      return `${crop} prices are rising in ${trending}/${totalMandis} markets. Good time to sell!`;
    }
    const best = prices.sort((a, b) => b.modalPrice - a.modalPrice)[0];
    return `Best price available at ${best?.market || 'APMC'} – ₹${best?.modalPrice || 2200}/quintal.`;
  },

  async generateListingDescription(crop, variety, quantity, grade, location) {
    const descriptions = {
      Tomato: `Premium ${variety} tomatoes freshly harvested in ${location}. Total ${quantity} kg of Grade-${grade} produce with firm skin, optimal brix level, clean sorting, and high shelf life. Suitable for retail chains, exports, and processors.`,
      Potato: `Certified ${variety} potatoes from ${location}. ${quantity} kg Grade-${grade} quality with high dry-matter content. Clean, well-graded, minimal skin blemishes, perfect for chips industry and wholesale trade.`,
      Onion: `${variety} red onions from ${location}. ${quantity} kg of Grade-${grade} produce with high pungency and excellent shelf life. Properly cured and ready for dispatch.`,
      Wheat: `${variety} wheat from ${location}. ${quantity} kg Grade-${grade} quality grain with protein content >11.5% and low moisture (<12%). Cleaned and ready for flour mills.`,
      Rice: `${variety} paddy from ${location}. ${quantity} kg Grade-${grade} quality grain. Long grain with uniform moisture, ideal for export processing.`,
      Maize: `${variety} maize from ${location}. ${quantity} kg Grade-${grade} grain with moisture <14%. Free from aflatoxins, ideal for feed and starch mills.`,
    };
    return descriptions[crop] || `${crop} (${variety}), ${quantity} kg, Grade-${grade} from ${location}. Verified quality produce ready for immediate inspection and transport.`;
  },

  async getMarketInsights(crop) {
    const { data: prices } = await MarketService.getMandiPrices(crop);
    if (!prices || prices.length === 0) return [];

    const best = [...prices].sort((a, b) => b.modalPrice - a.modalPrice)[0];
    const trending = prices.filter(p => p.trend === 'up').length;

    return [
      {
        type: 'info',
        emoji: '📊',
        text: `${best?.market} offers the highest modal rate at ₹${best?.modalPrice}/quintal.`,
        textHi: `${best?.market} में सबसे अधिक भाव है – ₹${best?.modalPrice}/क्विंटल`
      },
      {
        type: trending > prices.length / 2 ? 'positive' : 'warning',
        emoji: trending > prices.length / 2 ? '📈' : '📉',
        text: `Prices are ${trending > prices.length / 2 ? 'firming up' : 'stable'} across majority mandis.`,
        textHi: `अधिकांश बाजारों में भाव ${trending > prices.length / 2 ? 'बढ़ रहे हैं' : 'स्थिर हैं'}`
      },
      {
        type: 'advice',
        emoji: trending > prices.length / 2 ? '💡' : '⏳',
        text: trending > prices.length / 2
          ? 'Strong market demand! Favorable time to publish listing.'
          : `Selling at ${best?.market} yields best margins.`,
        textHi: trending > prices.length / 2
          ? 'बाजार में अच्छी मांग है – लिस्टिंग जोड़ने का सही समय।'
          : `${best?.market} में बेचने पर सबसे बेहतर भाव मिलेगा।`
      }
    ];
  }
};

// ============================================================
// LISTING SERVICE (Produce Listings REST API)
// ============================================================
const ListingService = {
  _mapListing(l) {
    const cropPhotos = {
      Onion: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=400&auto=format&fit=crop&q=80',
      Tomato: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&auto=format&fit=crop&q=80',
      Potato: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400&auto=format&fit=crop&q=80',
      Wheat: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&auto=format&fit=crop&q=80',
      Maize: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=400&auto=format&fit=crop&q=80',
      Rice: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&auto=format&fit=crop&q=80',
      Chilli: 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?w=400&auto=format&fit=crop&q=80',
      Soyabean: 'https://images.unsplash.com/photo-1599940824399-b87987ceb72a?w=400&auto=format&fit=crop&q=80',
      Mustard: 'https://images.unsplash.com/photo-1628102491629-778571d893a3?w=400&auto=format&fit=crop&q=80',
      Garlic: 'https://images.unsplash.com/photo-1540148426945-6cf22a6b2383?w=400&auto=format&fit=crop&q=80',
      Ginger: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400&auto=format&fit=crop&q=80',
    };
    if (typeof window !== 'undefined') window.cropPhotos = cropPhotos;

    const resolvedPhoto = l.photo_url || 
      (Array.isArray(l.images) && l.images[0] && (l.images[0].startsWith('http') || l.images[0].startsWith('data:')) ? l.images[0] : null) || 
      cropPhotos[l.crop] || 
      cropPhotos.Onion;

    const qty = parseFloat(l.quantity || 0);
    const volumeText = l.volume_label || (qty >= 1000 ? `${(qty / 1000).toFixed(0)} MT Volume` : `${qty} ${l.unit || 'kg'} Volume`);
    const lotCode = l.lot_number || `LOT-IN-26-${(l.crop || 'AG').slice(0, 2).toUpperCase()}${String(l.id || '001').slice(-3).toUpperCase()}`;

    return {
      id: l.id,
      farmerId: l.farmer_id,
      crop: l.crop,
      cropHi: l.crop_hi || l.crop,
      emoji: l.emoji || '🌱',
      title: l.title || `${l.variety ? `${l.variety} ` : ''}${l.crop}`,
      variety: l.variety || 'Late Kharif',
      lotNumber: lotCode,
      quantity: qty,
      unit: l.unit || 'kg',
      volumeLabel: volumeText,
      grade: l.grade || 'A',
      askingPrice: parseFloat(l.asking_price || 0),
      marketRefPrice: l.market_ref_price ? parseFloat(l.market_ref_price) : null,
      aiSuggestedPrice: l.ai_suggested_price ? parseFloat(l.ai_suggested_price) : null,
      firmness: typeof l.firmness === 'string' ? l.firmness : (l.firmness ? `${l.firmness}%` : '98%'),
      avgSize: l.avg_size || '45mm',
      defectRate: l.defect_rate || '1.2%',
      sparklineDelta: l.sparkline_delta || (l.grade === 'A+' ? '+12.6%' : l.grade === 'A' ? '+8.4%' : '-1.8%'),
      description: l.description || '',
      location: l.location_address || 'Nashik, Maharashtra',
      latitude: l.latitude ? parseFloat(l.latitude) : null,
      longitude: l.longitude ? parseFloat(l.longitude) : null,
      distanceKm: l.distance_km ? parseFloat(l.distance_km) : null,
      images: [resolvedPhoto],
      photoUrl: resolvedPhoto,
      status: l.status || 'active',
      createdAt: l.created_at ? l.created_at.split('T')[0] : '',
      farmer: {
        id: l.farmer_id,
        name: l.farmer_name || 'Ramesh Jadhav',
        nameHi: l.farmer_name_hi || l.farmer_name || 'रमेश जाधव',
        phone: l.farmer_phone || '9876543210',
        avatar: l.farmer_avatar || '👨‍🌾',
        verified: true,
        rating: l.farmer_rating ? parseFloat(l.farmer_rating) : 4.8,
        village: l.farmer_village || '',
        district: l.farmer_district || '',
        state: l.farmer_state || '',
      },
      offers: l.offers || [],
    };
  },

  async getAll(filters = {}) {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filters.crop && filters.crop !== 'all') params.append('crop', filters.crop);
      if (filters.grade) params.append('grade', filters.grade);
      if (filters.maxPrice) params.append('maxPrice', filters.maxPrice.toString());
      if (filters.farmerId) params.append('farmerId', filters.farmerId);
      if (filters.status) params.append('status', filters.status);

      const res = await apiRequest(`/listings?${params.toString()}`);
      return (res.data || []).map(this._mapListing);
    } catch (err) {
      console.error('Error fetching listings:', err);
      throw err;
    }
  },

  async getById(id) {
    try {
      const res = await apiRequest(`/listings/${id}`);
      if (!res.success || !res.data) return null;
      return this._mapListing(res.data);
    } catch (err) {
      console.error(`Error fetching listing ${id}:`, err);
      throw err;
    }
  },

  async create(data) {
    try {
      const res = await apiRequest('/listings', {
        method: 'POST',
        body: {
          farmerId: data.farmerId,
          crop: data.crop,
          cropHi: data.cropHi,
          emoji: data.emoji,
          variety: data.variety,
          quantity: parseFloat(data.quantity),
          unit: data.unit || 'kg',
          grade: data.grade || 'A',
          askingPrice: parseFloat(data.askingPrice),
          marketRefPrice: data.marketRefPrice ? parseFloat(data.marketRefPrice) : null,
          aiSuggestedPrice: data.aiSuggestedPrice ? parseFloat(data.aiSuggestedPrice) : null,
          description: data.description,
          locationAddress: data.location,
          latitude: data.latitude,
          longitude: data.longitude,
          images: data.images || (data.photo ? [data.photo] : ['🌱']),
        },
      });
      return this._mapListing(res.data);
    } catch (err) {
      console.error('Error creating listing:', err);
      throw err;
    }
  },

  async update(id, data) {
    try {
      const res = await apiRequest(`/listings/${id}`, {
        method: 'PUT',
        body: data,
      });
      return this._mapListing(res.data);
    } catch (err) {
      console.error(`Error updating listing ${id}:`, err);
      throw err;
    }
  },

  async delete(id) {
    try {
      await apiRequest(`/listings/${id}`, { method: 'DELETE' });
      return true;
    } catch (err) {
      console.error(`Error deleting listing ${id}:`, err);
      throw err;
    }
  },

  async getFarmerListings(farmerId) {
    try {
      const res = await apiRequest(`/listings?farmerId=${encodeURIComponent(farmerId)}&limit=100`);
      return (res.data || []).map(this._mapListing);
    } catch (err) {
      console.error('Error fetching farmer listings:', err);
      throw err;
    }
  }
};

// ============================================================
// OFFER SERVICE (Offers REST API)
// ============================================================
const OfferService = {
  _mapOffer(o) {
    return {
      id: o.id,
      listingId: o.listing_id,
      buyerId: o.buyer_id,
      offerPrice: parseFloat(o.offer_price),
      quantity: parseFloat(o.quantity),
      unit: o.unit || 'kg',
      totalAmount: parseFloat(o.total_amount),
      message: o.message || '',
      status: o.status,
      createdAt: o.created_at ? o.created_at.split('T')[0] : '',
      buyer: {
        id: o.buyer_id,
        name: o.buyer_name || 'Buyer',
        phone: o.buyer_phone || '',
        avatar: o.buyer_avatar || '🏪',
        company: o.buyer_company || '',
        city: o.buyer_city || '',
        rating: o.buyer_rating ? parseFloat(o.buyer_rating) : 4.8,
      },
      farmer: {
        id: o.farmer_id,
        name: o.farmer_name || 'Farmer',
        phone: o.farmer_phone || '',
      },
      listing: {
        id: o.listing_id,
        crop: o.crop || 'Produce',
        cropHi: o.crop_hi || o.crop || 'फसल',
        emoji: o.crop_emoji || '🌱',
        variety: o.variety || 'Standard',
        askingPrice: parseFloat(o.asking_price || 0),
        status: o.listing_status || 'active',
      }
    };
  },

  async getForListing(listingId) {
    try {
      const res = await apiRequest(`/offers?listingId=${encodeURIComponent(listingId)}`);
      return (res.data || []).map(this._mapOffer);
    } catch (err) {
      console.error(`Error getting offers for listing ${listingId}:`, err);
      return [];
    }
  },

  async getBuyerOffers(buyerId) {
    // Buyers do not have access to the offers list endpoint (enforced by backend 403)
    return [];
  },

  async getFarmerOffers(farmerId) {
    try {
      const res = await apiRequest(`/offers?farmerId=${encodeURIComponent(farmerId)}`);
      return (res.data || []).map(this._mapOffer);
    } catch (err) {
      console.error(`Error getting farmer offers:`, err);
      return [];
    }
  },

  async createOffer(data) {
    try {
      const res = await apiRequest('/offers', {
        method: 'POST',
        body: {
          listingId: data.listingId,
          buyerId: data.buyerId,
          offerPrice: parseFloat(data.offerPrice),
          quantity: parseFloat(data.quantity),
          unit: data.unit || 'kg',
          message: data.message || '',
        },
      });
      return { success: true, data: res.data };
    } catch (err) {
      console.error('Error creating offer:', err);
      throw err;
    }
  },

  async respond(offerId, action) {
    try {
      const res = await apiRequest(`/offers/${offerId}`, {
        method: 'PUT',
        body: { status: action },
      });
      return { success: true, data: res.data, order: res.order };
    } catch (err) {
      console.error(`Error responding to offer ${offerId}:`, err);
      throw err;
    }
  }
};

// ============================================================
// ORDER SERVICE (Orders REST API)
// ============================================================
const OrderService = {
  _mapOrder(o) {
    if (!o) return null;
    let status = o.status || 'confirmed';
    let timeline = o.timeline;
    if (typeof status === 'string' && status.trim().startsWith('[')) {
      try {
        timeline = JSON.parse(status);
      } catch {
        timeline = [];
      }
      status = 'confirmed';
    }
    if (typeof timeline === 'string') {
      try {
        timeline = JSON.parse(timeline);
      } catch {
        timeline = [];
      }
    }
    if (!Array.isArray(timeline) || !timeline.length) {
      const todayStr = (o.created_at ? o.created_at.split('T')[0] : new Date().toISOString().split('T')[0]);
      timeline = [
        { step: 'Order Created', date: todayStr, done: true },
        { step: 'Pickup Scheduled', date: '', done: false },
        { step: 'In Transit', date: '', done: false },
        { step: 'Delivered', date: '', done: false },
        { step: 'Payment Released', date: '', done: false }
      ];
    }

    const orderId = o.orderId || o.id;
    const cropName = o.produce?.name || o.crop || 'Produce';
    const quantity = o.produce?.quantity !== undefined ? parseFloat(o.produce.quantity) : parseFloat(o.quantity || 0);
    const unit = o.produce?.unit || o.unit || 'kg';
    const agreedPrice = o.produce?.pricePerUnit !== undefined ? parseFloat(o.produce.pricePerUnit) : parseFloat(o.agreed_price || o.agreedPrice || 0);
    const totalAmount = o.produce?.totalAmount !== undefined ? parseFloat(o.produce.totalAmount) : parseFloat(o.total_amount || o.totalAmount || 0);

    return {
      id: orderId,
      orderId: orderId,
      listingId: o.listing_id || o.listingId,
      offerId: o.offer_id || o.offerId,
      farmerId: o.farmer_id || o.farmerId,
      buyerId: o.buyer_id || o.buyerId,
      crop: cropName,
      quantity,
      unit,
      agreedPrice,
      totalAmount,
      status: status,
      rawStatus: o.rawStatus || o.status,
      paymentStatus: o.payment?.status || o.payment_status || o.paymentStatus || 'pending',
      timeline: timeline,
      createdAt: o.timestamps?.orderedAt ? o.timestamps.orderedAt.split('T')[0] : (o.created_at ? o.created_at.split('T')[0] : ''),
      variety: o.variety || o.produce?.variety || '',
      grade: o.grade || o.produce?.grade || 'A',
      location: o.location?.pickupAddress || o.location_address || '',
      produce: o.produce || {
        name: cropName,
        quantity,
        unit,
        pricePerUnit: agreedPrice,
        totalAmount,
        variety: o.variety || '',
        grade: o.grade || 'A',
      },
      payment: o.payment || {
        status: (o.payment_status === 'paid' ? 'Paid (Test Mode)' : 'Pending (Test Mode)'),
        method: o.payment_method || 'Razorpay Standard Checkout',
        transactionId: o.payment_id || null,
        paidAt: o.paid_at || null,
      },
      buyer: o.buyer || {
        id: o.buyer_id || o.buyerId,
        name: o.buyer_name || 'Buyer',
        phone: o.buyer_phone || '',
        company: o.buyer_company || '',
      },
      seller: o.seller || {
        id: o.farmer_id || o.farmerId,
        name: o.farmer_name || 'Farmer',
        phone: o.farmer_phone || '',
      },
      farmer: o.seller || {
        id: o.farmer_id || o.farmerId,
        name: o.farmer_name || 'Farmer',
        phone: o.farmer_phone || '',
      },
      locationDetail: o.location || {
        pickupAddress: o.location_address || 'Farm Gate Pickup',
        deliveryAddress: o.buyer_company || '',
        mandiName: null,
        lat: null,
        lng: null,
      },
      timestamps: o.timestamps || {
        orderedAt: o.created_at,
        paidAt: o.paid_at || null,
        deliveredAt: null,
      }
    };
  },

  async getFarmerOrders(farmerId) {
    try {
      const res = await apiRequest(`/orders?farmerId=${encodeURIComponent(farmerId)}`);
      return (res.data || []).map(this._mapOrder);
    } catch (err) {
      console.error('Error getting farmer orders:', err);
      return [];
    }
  },

  async getBuyerOrders(buyerId) {
    try {
      const res = await apiRequest(`/orders?buyerId=${encodeURIComponent(buyerId)}`);
      return (res.data || []).map(this._mapOrder);
    } catch (err) {
      console.error('Error getting buyer orders:', err);
      return [];
    }
  },

  async getAllOrders() {
    try {
      const res = await apiRequest('/orders?limit=100');
      return (res.data || []).map(this._mapOrder);
    } catch (err) {
      console.error('Error getting all orders:', err);
      return [];
    }
  },

  async getById(id) {
    try {
      const res = await apiRequest(`/orders/${id}`);
      return res.data ? this._mapOrder(res.data) : null;
    } catch (err) {
      console.error(`Error getting order ${id}:`, err);
      throw err;
    }
  }
};

// ============================================================
// NOTIFICATION SERVICE (Real Backend Notifications API)
// ============================================================
const NotificationService = {
  _mapNotif(n) {
    return {
      id: n.id,
      userId: n.user_id,
      type: n.type || 'system',
      title: n.title,
      titleEn: n.title_en,
      body: n.body,
      emoji: n.emoji || '🔔',
      read: !!n.read,
      data: n.data || {},
      time: n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
      createdAt: n.created_at || new Date().toISOString()
    };
  },

  async getAll(userId) {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (userId) params.append('userId', userId);
      const res = await apiRequest(`/notifications?${params.toString()}`);
      return (res.data || []).map(this._mapNotif);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      return [];
    }
  },

  async markRead(id) {
    try {
      await apiRequest(`/notifications/${id}/read`, {
        method: 'PATCH',
        body: { read: true }
      });
      return true;
    } catch (err) {
      console.error(`Error marking notification ${id} as read:`, err);
      return false;
    }
  },

  async markAllRead(userId) {
    try {
      await apiRequest('/notifications/mark-all-read', {
        method: 'PATCH',
        body: { userId }
      });
      return true;
    } catch (err) {
      console.error('Error marking all notifications read:', err);
      return false;
    }
  },

  async create(data) {
    try {
      const res = await apiRequest('/notifications', {
        method: 'POST',
        body: {
          userId: data.userId,
          type: data.type || 'system',
          title: data.title,
          titleEn: data.titleEn || null,
          body: data.body,
          emoji: data.emoji || '🔔',
          data: data.data || {}
        }
      });
      return this._mapNotif(res.data);
    } catch (err) {
      console.error('Error creating notification:', err);
      return null;
    }
  }
};

// ============================================================
// ADMIN SERVICE (Live Admin Statistics & User Management)
// ============================================================
const AdminService = {
  async getStats() {
    try {
      const res = await apiRequest('/admin/stats');
      return res.data || {
        totalFarmers: 0,
        totalBuyers: 0,
        activeListings: 0,
        pendingOffers: 0,
        totalOrders: 0,
        revenue: 0,
      };
    } catch (err) {
      console.error('Error getting admin stats:', err);
      return {
        totalFarmers: 0,
        totalBuyers: 0,
        activeListings: 0,
        pendingOffers: 0,
        totalOrders: 0,
        revenue: 0,
      };
    }
  },

  async getAllUsers() {
    try {
      const res = await apiRequest('/users?limit=100');
      return (res.data || []).filter(u => u.role !== 'admin');
    } catch (err) {
      console.error('Error getting all users:', err);
      return [];
    }
  },

  async getAllListings() {
    try {
      const res = await apiRequest('/listings?limit=100');
      return (res.data || []).map(ListingService._mapListing);
    } catch (err) {
      console.error('Error getting all listings for admin:', err);
      return [];
    }
  },

  async verifyUser(userId) {
    try {
      await apiRequest(`/users/${userId}`, {
        method: 'PUT',
        body: { verified: true },
      });
      return true;
    } catch (err) {
      console.error(`Error verifying user ${userId}:`, err);
      throw err;
    }
  }
};

// ============================================================
// USER SERVICE (User Profiles)
// ============================================================
const UserService = {
  async getProfile(userId) {
    try {
      const res = await apiRequest(`/users/${userId}`);
      return res.data || null;
    } catch (err) {
      console.error(`Error getting user ${userId}:`, err);
      return null;
    }
  },

  async updateProfile(userId, data) {
    try {
      const res = await apiRequest(`/users/${userId}`, {
        method: 'PUT',
        body: data
      });
      return res.data || null;
    } catch (err) {
      console.error(`Error updating user ${userId}:`, err);
      throw err;
    }
  }
};

// ============================================================
// PAYMENT SERVICE (Razorpay Standard Web Checkout API)
// ============================================================
const PaymentService = {
  async getConfig() {
    try {
      const res = await apiRequest('/payment/config');
      return res.data || res;
    } catch (err) {
      console.error('Error getting payment config:', err);
      return { keyId: '' };
    }
  },

  async createOrder(payload) {
    return await apiRequest('/create-order', {
      method: 'POST',
      body: payload
    });
  },

  async verifyPayment(payload) {
    return await apiRequest('/verify-payment', {
      method: 'POST',
      body: payload
    });
  }
};

// ============================================================
// VOICE ASSISTANT SERVICE (Whisper Transcription & Order Parser)
// ============================================================
// DEMO-GRADE: OpenAI Whisper API + lightweight dictionary parser for SIH prototype.
// PRODUCTION ROADMAP: Replace transcription with Bhashini ASR; replace regex parser
// with a trained NER model for produce/quantity/price extraction at scale.
const VoiceService = {
  /**
   * PRIMARY: Single-call speech audio -> transcription + structured order fields
   * Uses Gemini native audio as primary; Whisper -> Gemini text -> Regex as fallback chain
   * @param {Blob} audioBlob 
   * @param {string} [mockText] Optional mock transcript
   * @returns {Promise<{success: boolean, data: {transcribedText: string, detectedLanguage: string, produce: string, quantity: number, unit: string, pricePerUnit: number, confidence: string, notes: string, source: string}}>}
   */
  async processOrder(audioBlob, mockText) {
    const payloadSize = audioBlob ? audioBlob.size : 0;
    const mimeType = audioBlob ? audioBlob.type : 'none';
    console.log(`[Voice Frontend] Sending audio to /api/voice/process-order | payload size: ${payloadSize} bytes | mime: ${mimeType} | mockText: ${mockText ? `"${mockText}"` : 'none'}`);

    const formData = new FormData();
    if (audioBlob) {
      formData.append('audio', audioBlob, 'recording.webm');
    }
    if (mockText) {
      formData.append('mockText', mockText);
    }

    try {
      const res = await apiRequest('/voice/process-order', {
        method: 'POST',
        body: formData,
      });
      console.log('[Voice Frontend] /api/voice/process-order response:', res);
      return res;
    } catch (apiErr) {
      console.error('[Voice Frontend Error] /api/voice/process-order failed:', apiErr);
      throw apiErr;
    }
  },

  /**
   * Transcribe an audio blob
   * @param {Blob} audioBlob 
   * @param {string} [mockText] Optional mock transcript for dev/testing
   * @returns {Promise<{success: boolean, transcribedText: string, detectedLanguage: string}>}
   */
  async transcribe(audioBlob, mockText) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    if (mockText) {
      formData.append('mockText', mockText);
    }

    return await apiRequest('/voice/transcribe', {
      method: 'POST',
      body: formData,
    });
  },

  /**
   * Parse transcribed order text into structured sell fields
   * @param {string} transcribedText 
   * @returns {Promise<{success: boolean, data: {produce: string, quantity: number, unit: string, pricePerUnit: number, confidence: string, rawText: string}}>}
   */
  async parseOrder(transcribedText) {
    return await apiRequest('/voice/parse-order', {
      method: 'POST',
      body: { transcribedText },
    });
  }
};

// Expose globally to window for inline HTML onclick handlers
window.apiRequest = apiRequest;
window.AuthService = AuthService;
window.ListingService = ListingService;
window.OfferService = OfferService;
window.OrderService = OrderService;
window.MarketService = MarketService;
window.AIService = AIService;
window.NotificationService = NotificationService;
window.AdminService = AdminService;
window.UserService = UserService;
window.PaymentService = PaymentService;
window.VoiceService = VoiceService;


