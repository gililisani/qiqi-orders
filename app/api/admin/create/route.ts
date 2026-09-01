import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';
import { sendMail } from '../../../../lib/emailService';
import { adminWelcomeEmailTemplate } from '../../../../lib/emailTemplates';
import { createPasswordSetupLink, deletePasswordSetupToken } from '../../../../lib/passwordSetupTokens';
import { DEFAULT_ADMIN_PERMISSIONS } from '../../../../lib/permissions';

/**
 * POST /api/admin/create  { name, email, enabled? }
 *
 * Creates an admin the same way clients are created (2026-09-01 — the
 * creating admin no longer types the new admin's password): random password
 * the new admin never sees, our own hashed setup token (Supabase magic links
 * get pre-consumed by corporate email scanners), welcome email with the
 * set-password link. All-or-nothing: if any step fails, the auth user and
 * profile are rolled back so a retry starts clean.
 */
export async function POST(request: NextRequest) {
  const supabaseAdmin = createServiceRoleClient();

  let authUserId: string | null = null;
  let profileCreated = false;
  let setupToken: string | null = null;

  const rollback = async (reason: string) => {
    try {
      if (profileCreated && authUserId) {
        await supabaseAdmin.from('admins').delete().eq('id', authUserId);
      }
      if (authUserId) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      }
    } catch (cleanupErr: any) {
      console.error('[ADMIN_CREATE] Rollback failure after:', reason, cleanupErr?.message);
    }
  };

  try {
    const creator = await requireAdminWithPermission(request, 'admins:manage');

    const { name, email, enabled } = await request.json();

    if (!name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Random password the new admin never sees — they set their own via the link.
    const randomPassword = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: randomPassword,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        return NextResponse.json(
          { error: 'An admin with this email already exists. Please use a different email.' },
          { status: 400 }
        );
      }
      throw authError;
    }
    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create admin account' }, { status: 500 });
    }
    authUserId = authData.user.id;

    // Admin profile. New admins get the full permission set — an empty array
    // would strand them on /forbidden.
    const { error: profileError } = await supabaseAdmin.from('admins').insert([
      {
        id: authUserId,
        name,
        email,
        enabled: enabled ?? true,
        permissions: DEFAULT_ADMIN_PERMISSIONS,
      },
    ]);

    if (profileError) {
      await rollback('profile_insert_failed');
      authUserId = null;
      throw profileError;
    }
    profileCreated = true;

    // Setup link via OUR token system (hashed at rest, 24h expiry).
    let setupLink: { url: string };
    try {
      setupLink = await createPasswordSetupLink(supabaseAdmin, {
        userId: authUserId,
        createdBy: creator.id,
      });
      setupToken = setupLink.url.split('token=')[1] || null;
    } catch (linkErr: any) {
      console.error('[ADMIN_CREATE] Setup link failed:', linkErr?.message);
      await rollback('setup_link_failed');
      return NextResponse.json(
        { error: 'Failed to generate password setup link. Admin was not created.' },
        { status: 500 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const emailTemplate = adminWelcomeEmailTemplate({
      userName: name,
      userEmail: email,
      setupLink: setupLink.url,
      siteUrl,
    });

    const emailResult = await sendMail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    if (!emailResult.success) {
      console.error('[ADMIN_CREATE] Welcome email failed:', emailResult.error);
      if (setupToken) await deletePasswordSetupToken(supabaseAdmin, setupToken);
      await rollback('welcome_email_failed');
      return NextResponse.json(
        { error: 'Failed to send the setup email. Admin was not created. Please retry.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      admin: {
        id: authUserId,
        name,
        email,
        enabled: enabled ?? true,
      },
      message: 'Admin created and setup email sent',
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Error creating admin:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create admin' },
      { status: 500 }
    );
  }
}
