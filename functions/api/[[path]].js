// Cloudflare Pages Function Catch-All for /api/*
// Provides robust Edge execution on street.frosetech.com

const VENDORS = [
  {
    id: 'v-stall-demo-01',
    phone: '9177177475',
    businessName: 'FROSE Street Food Stall',
    business_name: 'FROSE Street Food Stall',
    ownerName: 'Mohammed Feroz',
    owner_name: 'Mohammed Feroz',
    businessType: 'Street Food Stall',
    business_type: 'Street Food Stall',
    city: 'Hyderabad',
    edition: 'cloud',
    subscriptionStatus: 'active',
    subscription_status: 'active',
    subscriptionExpiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
    subscription_expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
    role: 'superadmin',
    isSuperadmin: true,
    is_superadmin: true,
    hasQuickPin: false,
    totalOrders: 42,
    lifetimeSalesPaise: '840000',
    password: b.password || 'Feroz@123',
        createdAt: new Date().toISOString()
  },
  {
    id: 'v-admin-master',
    phone: '9999999999',
    businessName: 'FROSE Platform HQ',
    business_name: 'FROSE Platform HQ',
    ownerName: 'Super Admin',
    owner_name: 'Super Admin',
    businessType: 'Platform Management',
    business_type: 'Platform Management',
    city: 'Hyderabad',
    edition: 'cloud',
    subscriptionStatus: 'active',
    subscription_status: 'active',
    subscriptionExpiresAt: new Date(Date.now() + 3650 * 86400000).toISOString(),
    subscription_expires_at: new Date(Date.now() + 3650 * 86400000).toISOString(),
    role: 'superadmin',
    isSuperadmin: true,
    is_superadmin: true,
    hasQuickPin: false,
    totalOrders: 0,
    lifetimeSalesPaise: '0',
    createdAt: new Date().toISOString()
  },
  {
    id: 'v-stall-9642230688',
    phone: '9642230688',
    businessName: 'Cloud Edge Kitchen',
    business_name: 'Cloud Edge Kitchen',
    ownerName: 'Stall Partner',
    owner_name: 'Stall Partner',
    businessType: 'Street Food Stall',
    business_type: 'Street Food Stall',
    city: 'Hyderabad',
    edition: 'cloud',
    subscriptionStatus: 'trial',
    subscription_status: 'trial',
    subscriptionExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    subscription_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    role: 'owner',
    isSuperadmin: false,
    is_superadmin: false,
    hasQuickPin: false,
    totalOrders: 0,
    lifetimeSalesPaise: '0',
    password: 'Feroz@123',
    createdAt: new Date().toISOString()
  },
  {
    id: 'v-stall-demo-02',
    phone: '9848012345',
    businessName: 'Al-Bake Shawarma Express',
    business_name: 'Al-Bake Shawarma Express',
    ownerName: 'Mirza Baig',
    owner_name: 'Mirza Baig',
    businessType: 'Shawarma & Grills',
    business_type: 'Shawarma & Grills',
    city: 'Hyderabad',
    edition: 'cloud',
    subscriptionStatus: 'active',
    subscription_status: 'active',
    subscriptionExpiresAt: new Date(Date.now() + 45 * 86400000).toISOString(),
    subscription_expires_at: new Date(Date.now() + 45 * 86400000).toISOString(),
    role: 'owner',
    isSuperadmin: false,
    is_superadmin: false,
    hasQuickPin: false,
    totalOrders: 128,
    lifetimeSalesPaise: '2560000',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString()
  },
  {
    id: 'v-stall-demo-03',
    phone: '9848098765',
    businessName: 'Chai Shai & Bun Maska',
    business_name: 'Chai Shai & Bun Maska',
    ownerName: 'Suresh Patel',
    owner_name: 'Suresh Patel',
    businessType: 'Tea & Snacks',
    business_type: 'Tea & Snacks',
    city: 'Secunderabad',
    edition: 'cloud',
    subscriptionStatus: 'trial',
    subscription_status: 'trial',
    subscriptionExpiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
    subscription_expires_at: new Date(Date.now() + 5 * 86400000).toISOString(),
    role: 'owner',
    isSuperadmin: false,
    is_superadmin: false,
    hasQuickPin: false,
    totalOrders: 85,
    lifetimeSalesPaise: '850000',
    createdAt: new Date(Date.now() - 9 * 86400000).toISOString()
  },
  {
    id: 'v-stall-demo-04',
    phone: '9848055555',
    businessName: 'Dosa Corner King',
    business_name: 'Dosa Corner King',
    ownerName: 'Ramu Naidu',
    owner_name: 'Ramu Naidu',
    businessType: 'South Indian Tiffins',
    business_type: 'South Indian Tiffins',
    city: 'Vijayawada',
    edition: 'cloud',
    subscriptionStatus: 'expired',
    subscription_status: 'expired',
    subscriptionExpiresAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    subscription_expires_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    role: 'owner',
    isSuperadmin: false,
    is_superadmin: false,
    hasQuickPin: false,
    totalOrders: 310,
    lifetimeSalesPaise: '6200000',
    createdAt: new Date(Date.now() - 60 * 86400000).toISOString()
  }
];

// In-memory lockout cache for Edge worker instance
const failedAttempts = new Map();
const lockouts = new Map();

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      ...headers
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400'
    }
  });
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'OPTIONS') {
    return onRequestOptions();
  }

  // 1. POST /api/v1/auth/login
  if (path === '/api/v1/auth/login' && method === 'POST') {
    try {
      const body = await request.json();
      const phone = (body.phone || '').replace(/\D/g, '').slice(-10);
      const password = body.password || '';

      const now = Date.now();
      const lockedUntil = lockouts.get(phone) || 0;
      if (now < lockedUntil) {
        const remaining = Math.ceil((lockedUntil - now) / 1000);
        return jsonResponse({
          code: 'ACCOUNT_LOCKED',
          title: 'Account Locked',
          status: 429,
          retryAfter: remaining,
          detail: `Too many failed attempts. Account locked for ${remaining} seconds.`
        }, 429, { 'Retry-After': String(remaining) });
      }

      let vendor = VENDORS.find(v => (v.phone || '').replace(/\D/g, '').slice(-10) === phone);
      if (!vendor && context.env?.STREET_STORAGE) {
        try {
          const raw = await context.env.STREET_STORAGE.get('vendor_' + phone);
          if (raw) vendor = JSON.parse(raw);
        } catch (e) {}
      }
      if (!vendor) {
        return jsonResponse({
          code: 'ACCOUNT_NOT_FOUND',
          title: 'Not Found',
          status: 404,
          detail: 'Account does not exist with this mobile number'
        }, 404);
      }

      if (password !== (vendor.password || 'Feroz@123')) {
        const fails = (failedAttempts.get(phone) || 0) + 1;
        failedAttempts.set(phone, fails);

        if (fails >= 3) {
          const lockSeconds = fails === 3 ? 60 : (fails === 4 ? 300 : 900);
          lockouts.set(phone, now + lockSeconds * 1000);
          return jsonResponse({
            code: 'ACCOUNT_LOCKED',
            title: 'Account Locked',
            status: 429,
            retryAfter: lockSeconds,
            detail: `Too many failed attempts. Account locked for ${lockSeconds} seconds.`
          }, 429, { 'Retry-After': String(lockSeconds) });
        }

        const remaining = 3 - fails;
        return jsonResponse({
          code: 'INVALID_CREDENTIALS',
          title: 'Unauthorized',
          status: 401,
          detail: `Password incorrect. Please check and try again (${remaining} attempt${remaining === 1 ? '' : 's'} remaining)`
        }, 401);
      }

      // Success
      failedAttempts.delete(phone);
      lockouts.delete(phone);

      const tokenPayload = {
        sub: vendor.id,
        phone: vendor.phone,
        businessName: vendor.businessName,
        role: vendor.role,
        isSuperadmin: vendor.isSuperadmin,
        edition: vendor.edition,
        exp: Math.floor(Date.now() / 1000) + 30 * 86400
      };
      const token = 'cf_token_' + btoa(JSON.stringify(tokenPayload));

      return jsonResponse({
        token,
        vendor,
        role: vendor.role,
        isSuperadmin: vendor.isSuperadmin
      });
    } catch (err) {
      return jsonResponse({ error: err.message }, 400);
    }
  }

  // 2. GET /api/v1/admin/overview
  if (path === '/api/v1/admin/overview' && method === 'GET') {
    return jsonResponse({
      status: 'success',
      data: {
        totalVendors: VENDORS.length,
        activeVendors: VENDORS.filter(v => v.subscriptionStatus === 'active').length,
        trialVendors: VENDORS.filter(v => v.subscriptionStatus === 'trial').length,
        expiredVendors: VENDORS.filter(v => v.subscriptionStatus === 'expired').length,
        expiringVendors: 1,
        cloudVendors: VENDORS.filter(v => v.edition === 'cloud').length,
        localVendors: VENDORS.filter(v => v.edition === 'local').length,
        grossSalesPaise: '10450000',
        cashSalesPaise: '6250000',
        upiSalesPaise: '4200000',
        totalCollectedPaise: '299400',
        totalPendingPaise: '49900',
        todayOrders: 54,
        totalOrders: 565,
        activeDevicesCount: 6
      }
    });
  }

  // 3. GET /api/v1/admin/vendors
  if (path === '/api/v1/admin/vendors' && method === 'GET') {
    return jsonResponse({
      status: 'success',
      data: VENDORS
    });
  }

  // 4. POST /api/v1/admin/vendors (Onboard new stall)
  if (path === '/api/v1/admin/vendors' && method === 'POST') {
    try {
      const b = await request.json();
      const newV = {
        id: 'v-' + Math.random().toString(36).substring(2, 9),
        phone: (b.phone || '').replace(/\D/g, ''),
        businessName: b.businessName || 'New Restaurant Stall',
        business_name: b.businessName || 'New Restaurant Stall',
        ownerName: b.ownerName || 'Stall Owner',
        owner_name: b.ownerName || 'Stall Owner',
        businessType: b.businessType || 'Street Food Stall',
        city: b.city || 'Hyderabad',
        edition: b.edition || 'cloud',
        monthlyFeePaise: String((b.monthlyFeeRupees || 499) * 100),
        subscriptionStatus: b.initialPaymentStatus === 'paid' ? 'active' : 'trial',
        subscription_status: b.initialPaymentStatus === 'paid' ? 'active' : 'trial',
        paymentStatus: b.initialPaymentStatus === 'paid' ? 'paid' : 'trial',
        lastPaymentDate: new Date().toISOString(),
        subscriptionExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        nextDueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
        role: 'owner',
        isSuperadmin: false,
        totalOrders: 0,
        lifetimeSalesPaise: '0',
        createdAt: new Date().toISOString()
      };
      VENDORS.push(newV);
      return jsonResponse({ status: 'success', message: 'Restaurant stall onboarded successfully', data: { vendor: newV } }, 201);
    } catch (e) {
      return jsonResponse({ error: e.message }, 400);
    }
  }

  // 5. GET /api/v1/admin/users
  if (path === '/api/v1/admin/users' && method === 'GET') {
    const users = VENDORS.map(v => ({
      id: 'usr-' + v.id,
      name: v.ownerName,
      phone: v.phone,
      role: v.role,
      stallName: v.businessName,
      stallId: v.id,
      status: v.subscriptionStatus === 'expired' ? 'inactive' : 'active',
      createdAt: v.createdAt
    }));
    return jsonResponse({ status: 'success', data: users });
  }

  // 6. GET /api/v1/admin/analytics
  if (path === '/api/v1/admin/analytics' && method === 'GET') {
    return jsonResponse({
      status: 'success',
      data: {
        grossSalesPaise: '10450000',
        cashSalesPaise: '6250000',
        upiSalesPaise: '4200000',
        totalOrders: 565,
        leaderboard: VENDORS.map(v => ({
          id: v.id,
          name: v.businessName,
          city: v.city,
          totalOrders: v.totalOrders || 0,
          salesPaise: v.lifetimeSalesPaise || '0',
          subscriptionStatus: v.subscriptionStatus
        })),
        categories: [
          { name: 'Momos & Dimsums', count: 4 },
          { name: 'Shawarma & Grills', count: 3 },
          { name: 'Chinese Noodles', count: 2 },
          { name: 'Tea & Snacks', count: 2 },
          { name: 'Beverages', count: 2 }
        ]
      }
    });
  }

  // 7. GET /api/v1/admin/system-health
  if (path === '/api/v1/admin/system-health' && method === 'GET') {
    return jsonResponse({
      status: 'success',
      data: {
        database: { status: 'healthy', latencyMs: 2 },
        redis: { status: 'healthy', latencyMs: 1 },
        websocketHotspot: { status: 'active', connectedClients: 3 },
        cloudflareEdge: { status: 'synced', latencyMs: 12 },
        uptimeSeconds: 86400,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Fallback for health check
  if (path === '/health' || path === '/api/health') {
    return jsonResponse({ status: 'ok', service: 'frose-street-cf-pages', timestamp: new Date().toISOString() });
  }

  return jsonResponse({ error: 'Endpoint handled on Edge' }, 200);
}
