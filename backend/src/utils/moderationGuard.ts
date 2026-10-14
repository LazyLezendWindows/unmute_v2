import { getDatabase } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export async function assertUserNotSuspendedOrDeactivated(user: {
  id: string;
  is_active: number;
  suspended_until?: string | null;
  disabled_reason?: string | null;
}): Promise<void> {
  const db = getDatabase();
  if (user.suspended_until) {
    const until = new Date(user.suspended_until);
    if (until <= new Date()) {
      // Suspension expired: auto-restore
      await db.run(
        'UPDATE users SET is_active = 1, suspended_until = NULL, disabled_reason = NULL, moderation_notes = NULL WHERE id = ?',
        [user.id]
      );
      user.is_active = 1;
      user.suspended_until = null;
      user.disabled_reason = null;
    } else {
      const formatted = until.toUTCString();
      const reasonPart = user.disabled_reason ? ` Reason: ${user.disabled_reason}.` : '';
      throw new AppError(
        `Your account has been temporarily suspended until ${formatted}.${reasonPart} If you believe this is an error, please contact support@unmute.app.`,
        403
      );
    }
  }

  if (!user.is_active) {
    const reasonPart = user.disabled_reason ? ` Reason: ${user.disabled_reason}.` : '';
    throw new AppError(
      `Your account has been deactivated or disabled.${reasonPart} Please contact support@unmute.app for assistance.`,
      401
    );
  }
}

