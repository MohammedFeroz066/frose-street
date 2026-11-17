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
      const phone = (body.phone || '').replace(/\D/g, '');
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

      const vendor = VENDORS.find(v => v.phone === phone);
      if (!vendor) {
        return jsonResponse({
          code: 'ACCOUNT_NOT_FOUND',
          title: 'Not Found',
          status: 404,
          detail: 'Account does not exist with this mobile number'
        }, 404);
      }

      if (password !== 'Feroz@123') {
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
        grossSalesPaise: '10450000',
        cashSalesPaise: '6250000',
        upiSalesPaise: '4200000',
        todayOrders: 54,
        totalOrders: 565
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

  // Fallback for health check
  if (path === '/health' || path === '/api/health') {
    return jsonResponse({ status: 'ok', service: 'frose-street-cf-pages', timestamp: new Date().toISOString() });
  }

  return jsonResponse({ error: 'Endpoint handled on Edge' }, 200);
}
