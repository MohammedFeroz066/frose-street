import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AuthService } from './auth.service.js';
import type { StaffRole } from '../../../../shared/types/index.js';
import { signJwt } from './jwt.js';
import { requireAuth } from '../../middleware/auth.js';
import { getDatabase } from '../../db/database.js';
import { loadConfig } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { PaymentService } from '../payments/payment.service.js';
import { RegisterSchema, RegisterStallSchema, LoginSchema, validateSchema } from './auth.schemas.js';
import { LoginSecurityService } from './login-security.service.js';
import { signJoseAccessToken, getJwtKeyRotationConfig } from './jwt-jose.js';
import { RefreshTokenService } from './refresh-token.service.js';

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const config = loadConfig();

  let jwtConfig: any;
  try {
    jwtConfig = getJwtKeyRotationConfig(config);
  } catch {
    jwtConfig = {
      currentSecret: config.JWT_SECRET || 'dev-fallback-secret-at-least-32-chars-long-2026',
      currentKid: 'k1',
    };
  }

  // Helper to set HttpOnly session cookies (access token + rotating refresh token)
  const setSessionCookies = (reply: any, accessToken: string, refreshToken: string) => {
    const isProd = config.NODE_ENV === 'production';
    reply.setCookie('frose_access_token', accessToken, {
      path: '/',
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: 900, // 15 minutes
    });
    reply.setCookie('frose_refresh_token', refreshToken, {
      path: '/',
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: 30 * 86400, // 30 days
    });
    reply.setCookie('frose_street_token', accessToken, {
      path: '/',
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: 900,
    });
  };

  const clearSessionCookies = (reply: any) => {
    reply.clearCookie('frose_access_token', { path: '/' });
    reply.clearCookie('frose_refresh_token', { path: '/' });
    reply.clearCookie('frose_street_token', { path: '/' });
  };

  /**
   * POST /api/v1/auth/register
   * Registers a new street vendor stall with Phone Number & Password
   */
  app.post('/register', async (request, reply) => {
    const db = getDatabase();
    const body = validateSchema(RegisterSchema, request.body);

    const { vendor, staff } = await AuthService.registerVendor(db, {
      phone: body.phone,
      password: body.password,
      businessName: body.businessName,
      ownerName: body.ownerName,
      businessType: body.businessType,
      city: body.city,
      edition: body.edition,
    });

    const token = await signJoseAccessToken(
      {
        sub: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
        role: 'owner',
        edition: vendor.edition,
        staffId: staff.id,
      },
      jwtConfig,
      900
    );

    const refreshResult = await RefreshTokenService.createRefreshToken(db, vendor.id);
    setSessionCookies(reply, token, refreshResult.refreshToken);

    return reply.status(201).send({
      status: 'success',
      message: 'Stall registered successfully',
      vendor: {
        id: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
        ownerName: vendor.owner_name,
        businessType: vendor.business_type,
        edition: vendor.edition,
        subscriptionStatus: vendor.subscription_status,
        subscriptionExpiresAt: vendor.subscription_expires_at,
      },
      token,
    });
  });

  /**
   * POST /api/v1/auth/register-stall
   * 60-second vendor onboarding endpoint with Quick PIN & Automatic Menu Preset Seeding
   */
  app.post('/register-stall', async (request, reply) => {
    try {
      const db = getDatabase();
      const body = validateSchema(RegisterStallSchema, request.body);

      const { vendor, staff, seededItemsCount } = await AuthService.registerVendor(db, {
        phone: body.phone,
        password: body.password,
        businessName: body.businessName,
        ownerName: body.ownerName,
        businessType: body.businessType,
        city: body.city,
        edition: body.edition,
        upiId: body.upiId,
        quickPin: body.quickPin,
        presetKey: body.presetKey,
      });

      if (body.upiId) {
        try {
          PaymentService.setVendorVpa(vendor.id, body.upiId);
        } catch {
          // ignore VPA format warning
        }
      }

      const token = await signJoseAccessToken(
        {
          sub: vendor.id,
          phone: vendor.phone,
          businessName: vendor.business_name,
          role: 'owner',
          edition: vendor.edition,
          staffId: staff.id,
        },
        jwtConfig,
        900
      );

      const refreshResult = await RefreshTokenService.createRefreshToken(db, vendor.id);
      setSessionCookies(reply, token, refreshResult.refreshToken);

      return reply.status(201).send({
        status: 'success',
        message: 'Stall registered and seeded successfully',
        vendor: {
          id: vendor.id,
          phone: vendor.phone,
          businessName: vendor.business_name,
          ownerName: vendor.owner_name,
          businessType: vendor.business_type,
          edition: vendor.edition,
          subscriptionStatus: vendor.subscription_status,
          subscriptionExpiresAt: vendor.subscription_expires_at,
          hasQuickPin: !!vendor.quick_pin_hash,
          upiId: PaymentService.getVendorVpa(vendor.id, body.upiId || 'street@upi'),
        },
        token,
        seededItemsCount,
      });
    } catch (err) {
      throw err;
    }
  });

  /**
   * POST /api/v1/auth/login
   * Authenticates vendor with Phone Number & Password
   */
  app.post('/login', async (request, reply) => {
    const db = getDatabase();
    const rawBody = (request.body || {}) as any;

    if (rawBody.pin && !rawBody.password) {
      throw AppError.badRequest(
        'PIN-only login is deprecated. Please log in with your master password. PIN is reserved for local device unlock only.',
        'PIN_LOGIN_NOT_ALLOWED'
      );
    }

    const body = validateSchema(LoginSchema, request.body);
    const vendor = await AuthService.loginWithPassword(db, body.phone, body.password, request.ip);

    const isSuperadmin = (vendor as any).is_superadmin === true || (vendor as any).role === 'superadmin';
    const role: StaffRole = isSuperadmin ? 'superadmin' : 'owner';

    const token = await signJoseAccessToken(
      {
        sub: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
        role,
        edition: vendor.edition,
      },
      jwtConfig,
      900
    );

    const refreshResult = await RefreshTokenService.createRefreshToken(db, vendor.id);
    setSessionCookies(reply, token, refreshResult.refreshToken);

    return reply.status(200).send({
      status: 'success',
      message: isSuperadmin ? 'Super Admin authenticated successfully' : 'Login successful',
      vendor: {
        id: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
        ownerName: vendor.owner_name,
        businessType: vendor.business_type,
        edition: vendor.edition,
        subscriptionStatus: vendor.subscription_status,
        subscriptionExpiresAt: vendor.subscription_expires_at,
        hasQuickPin: !!vendor.quick_pin_hash,
        upiId: PaymentService.getVendorVpa(vendor.id),
        isSuperadmin,
        role,
      },
      token,
      isSuperadmin,
      role,
    });
  });

  /**
   * POST /api/v1/auth/refresh
   * Rotates refresh token and issues fresh short-lived access token
   */
  app.post('/refresh', async (request, reply) => {
    const db = getDatabase();
    const rawRefreshToken = request.cookies?.frose_refresh_token;

    if (!rawRefreshToken) {
      throw AppError.unauthorized('Refresh token cookie missing', 'MISSING_REFRESH_TOKEN');
    }

    const rotated = await RefreshTokenService.rotateRefreshToken(db, rawRefreshToken);

    const vendor = await db
      .selectFrom('vendors')
      .selectAll()
      .where('id', '=', rotated.vendorId)
      .executeTakeFirst();

    if (!vendor) {
      throw AppError.unauthorized('Vendor account not found for session', 'VENDOR_NOT_FOUND');
    }

    const isSuperadmin = (vendor as any).is_superadmin === true || (vendor as any).role === 'superadmin';
    const role: StaffRole = isSuperadmin ? 'superadmin' : 'owner';

    const accessToken = await signJoseAccessToken(
      {
        sub: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
        role,
        edition: vendor.edition,
      },
      jwtConfig,
      900
    );

    setSessionCookies(reply, accessToken, rotated.refreshToken);

    return reply.status(200).send({
      status: 'success',
      message: 'Session refreshed successfully',
      token: accessToken,
    });
  });

  /**
   * POST /api/v1/auth/logout
   * Revokes refresh token family and clears httpOnly session cookies
   */
  app.post('/logout', async (request, reply) => {
    const db = getDatabase();
    const rawRefreshToken = request.cookies?.frose_refresh_token;

    if (rawRefreshToken) {
      await RefreshTokenService.revokeFamily(db, rawRefreshToken);
    }

    clearSessionCookies(reply);

    return reply.status(200).send({
      status: 'success',
      message: 'Logged out successfully',
    });
  });

  /**
   * POST /api/v1/auth/setup-pin
   * Sets up 4-digit quick PIN for the authenticated vendor
   */
  app.post('/setup-pin', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getDatabase();
    const body = request.body as any;

    if (!body || !body.pin) {
      throw AppError.badRequest('4-digit PIN is required', 'MISSING_PIN');
    }

    await AuthService.setupQuickPin(db, request.user!.sub, body.pin);

    return reply.status(200).send({
      status: 'success',
      message: '4-digit Quick PIN configured successfully',
    });
  });

  /**
   * POST /api/v1/auth/verify-pin
   * Verifies 4-digit quick PIN and issues an authenticated session
   */
  app.post('/verify-pin', async (request, reply) => {
    const db = getDatabase();
    const body = request.body as any;

    const vendorId = body?.vendorId || request.user?.sub;
    if (!vendorId || !body?.pin) {
      throw AppError.badRequest('Vendor ID and PIN are required', 'MISSING_PIN_PARAMS');
    }

    const vendor = await AuthService.verifyQuickPin(db, vendorId, body.pin);

    const accessToken = await signJoseAccessToken(
      {
        sub: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
        role: 'owner',
        edition: vendor.edition as any,
      },
      jwtConfig,
    );

    const refreshToken = await RefreshTokenService.createRefreshToken(db, vendor.id);
    setSessionCookies(reply, accessToken, refreshToken.refreshToken);

    return reply.status(200).send({
      status: 'success',
      message: 'Quick PIN verified successfully',
      vendor: {
        id: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
      },
      token: accessToken,
    });
  });

  /**
   * POST /api/v1/auth/pin-login
   * Restricted: 4-digit quick PIN authentication is strictly for local offline terminal unlock.
   */
  app.post('/pin-login', async () => {
    throw AppError.forbidden(
      'Remote PIN login is disabled. 4-digit PIN authentication is restricted to local offline device unlock only.',
      'PIN_LOGIN_DISABLED'
    );
  });

  /**
   * POST /api/v1/auth/biometric/register
   * Registers a fingerprint / FaceID WebAuthn passkey credential
   */
  app.post('/biometric/register', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getDatabase();
    const body = request.body as any;

    if (!body || !body.credentialId || !body.publicKey) {
      throw AppError.badRequest('credentialId and publicKey are required', 'MISSING_BIOMETRIC_DATA');
    }

    const credential = await AuthService.registerBiometric(db, request.user!.sub, {
      credentialId: body.credentialId,
      publicKey: body.publicKey,
      deviceName: body.deviceName,
    });

    return reply.status(201).send({
      status: 'success',
      message: 'Biometric credential registered successfully',
      credentialId: credential.credential_id,
    });
  });

  /**
   * POST /api/v1/auth/biometric/verify
   * Verifies biometric assertion and authenticates vendor with 1-tap
   */
  app.post('/biometric/verify', async (request, reply) => {
    const db = getDatabase();
    const body = request.body as any;

    if (!body || !body.credentialId) {
      throw AppError.badRequest('credentialId is required', 'MISSING_CREDENTIAL_ID');
    }

    const cred = await AuthService.verifyBiometric(db, body.credentialId);

    const accessToken = await signJoseAccessToken(
      {
        sub: cred.id,
        phone: cred.phone,
        businessName: cred.business_name,
        role: 'owner',
        edition: cred.edition as any,
      },
      jwtConfig,
    );

    const refreshToken = await RefreshTokenService.createRefreshToken(db, cred.id);
    setSessionCookies(reply, accessToken, refreshToken.refreshToken);

    return reply.status(200).send({
      status: 'success',
      message: 'Biometric verification successful',
      vendor: {
        id: cred.id,
        phone: cred.phone,
        businessName: cred.business_name,
      },
      token: accessToken,
    });
  });

  /**
   * GET /api/v1/auth/me
   * Retrieves active profile of the authenticated session
   */
  app.get('/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getDatabase();
    const vendor = await db
      .selectFrom('vendors')
      .selectAll()
      .where('id', '=', request.user!.sub)
      .executeTakeFirst();

    if (!vendor) {
      throw AppError.notFound('Vendor profile not found', 'VENDOR_NOT_FOUND');
    }

    return reply.status(200).send({
      id: vendor.id,
      phone: vendor.phone,
      businessName: vendor.business_name,
      ownerName: vendor.owner_name,
      businessType: vendor.business_type,
      city: vendor.city,
      edition: vendor.edition,
      subscriptionStatus: vendor.subscription_status,
      subscriptionExpiresAt: vendor.subscription_expires_at,
      hasQuickPin: !!vendor.quick_pin_hash,
      role: request.user!.role,
    });
  });
};
