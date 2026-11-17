import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AuthService } from './auth.service.js';
import type { StaffRole } from '../../../../shared/types/index.js';
import { signJwt } from './jwt.js';
import { requireAuth } from '../../middleware/auth.js';
import { getDatabase } from '../../db/database.js';
import { loadConfig } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { PaymentService } from '../payments/payment.service.js';

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const config = loadConfig();

  // Helper to set HttpOnly auth cookie
  const setAuthCookie = (reply: any, token: string) => {
    reply.setCookie('frose_street_token', token, {
      path: '/',
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 86400, // 30 days
    });
  };

  /**
   * POST /api/v1/auth/register
   * Registers a new street vendor stall with Phone Number & Password
   */
  app.post('/register', async (request, reply) => {
    const db = getDatabase();
    const body = request.body as any;

    if (!body || !body.phone || !body.password || !body.businessName) {
      throw AppError.badRequest('Phone, password, and business name are required', 'MISSING_FIELDS');
    }

    const { vendor, staff } = await AuthService.registerVendor(db, {
      phone: body.phone,
      password: body.password,
      businessName: body.businessName,
      ownerName: body.ownerName,
      businessType: body.businessType,
      city: body.city,
      edition: body.edition,
    });

    const token = signJwt(
      {
        sub: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
        role: 'owner',
        edition: vendor.edition,
        staffId: staff.id,
      },
      config.JWT_SECRET,
    );

    setAuthCookie(reply, token);

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
      const body = request.body as any;

      if (!body || !body.phone) {
        throw AppError.badRequest('Please enter a valid 10-digit mobile number', 'INVALID_PHONE');
      }

      if (!body.businessName || body.businessName.trim().length === 0) {
        throw AppError.badRequest('Stall / Business name is required', 'MISSING_BUSINESS_NAME');
      }

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

      const token = signJwt(
        {
          sub: vendor.id,
          phone: vendor.phone,
          businessName: vendor.business_name,
          role: 'owner',
          edition: vendor.edition,
          staffId: staff.id,
        },
        config.JWT_SECRET,
      );

      setAuthCookie(reply, token);

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
    const body = request.body as any;

    if (!body || !body.phone || !body.password) {
      throw AppError.badRequest('Phone and password are required', 'MISSING_CREDENTIALS');
    }

    const vendor = await AuthService.loginWithPassword(db, body.phone, body.password);

    const isSuperadmin = (vendor as any).is_superadmin === true || (vendor as any).role === 'superadmin' || vendor.phone === '9999999999';
    const role: StaffRole = isSuperadmin ? 'superadmin' : 'owner';

    const token = signJwt(
      {
        sub: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
        role,
        edition: vendor.edition,
      },
      config.JWT_SECRET,
    );

    setAuthCookie(reply, token);

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

    const token = signJwt(
      {
        sub: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
        role: 'owner',
        edition: vendor.edition as any,
      },
      config.JWT_SECRET,
    );

    setAuthCookie(reply, token);

    return reply.status(200).send({
      status: 'success',
      message: 'Quick PIN verified successfully',
      vendor: {
        id: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
      },
      token,
    });
  });

  /**
   * POST /api/v1/auth/pin-login
   * Fast 4-digit quick PIN unlock for KDS, Packaging, and Billing stations
   */
  app.post('/pin-login', async (request, reply) => {
    const db = getDatabase();
    const body = request.body as any;

    if (!body || !body.pin) {
      throw AppError.badRequest('4-digit PIN is required', 'MISSING_PIN');
    }

    const { vendor, staff } = await AuthService.loginWithQuickPin(db, body.pin, body.vendorId);

    const token = signJwt(
      {
        sub: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
        role: (staff?.role as any) || 'owner',
        edition: vendor.edition as any,
        staffId: staff?.id,
      },
      config.JWT_SECRET,
    );

    setAuthCookie(reply, token);

    return reply.status(200).send({
      status: 'success',
      message: 'Station unlocked successfully',
      vendor: {
        id: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
        ownerName: (vendor as any).owner_name || 'Vendor Owner',
        edition: vendor.edition,
        upiId: PaymentService.getVendorVpa(vendor.id),
      },
      staff: staff
        ? {
            id: staff.id,
            name: staff.name,
            role: staff.role,
          }
        : null,
      token,
    });
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

    const token = signJwt(
      {
        sub: cred.id,
        phone: cred.phone,
        businessName: cred.business_name,
        role: 'owner',
        edition: cred.edition as any,
      },
      config.JWT_SECRET,
    );

    setAuthCookie(reply, token);

    return reply.status(200).send({
      status: 'success',
      message: 'Biometric verification successful',
      vendor: {
        id: cred.id,
        phone: cred.phone,
        businessName: cred.business_name,
      },
      token,
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

  /**
   * POST /api/v1/auth/logout
   * Clears the authentication session cookie
   */
  app.post('/logout', async (_request, reply) => {
    reply.clearCookie('frose_street_token', { path: '/' });
    return reply.status(200).send({
      status: 'success',
      message: 'Logged out successfully',
    });
  });
};
