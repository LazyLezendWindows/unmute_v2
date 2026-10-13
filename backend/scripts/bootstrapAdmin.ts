/**
 * Safe, one-time CLI bootstrap command to create the initial Super Administrator
 * or promote an existing account after explicit verification.
 *
 * Usage:
 *   # Via environment variables:
 *   ADMIN_EMAIL="admin@unmute.chat" ADMIN_NAME="Super Admin" ADMIN_PASSWORD="SecurePassword123!" npm --prefix backend run admin:bootstrap
 *
 *   # Via interactive CLI arguments:
 *   npm --prefix backend run admin:bootstrap -- admin@unmute.chat "Super Admin"
 *
 *   # Promote an existing user:
 *   npm --prefix backend run admin:bootstrap -- --promote user@example.com
 */
import readline from 'readline';
import crypto from 'crypto';
import { initDatabase, getDatabase } from '../src/config/database';
import { AdminAuthService } from '../src/services/adminAuthService';

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let asked = false;
    out._writeToOutput = (s: string) => {
      if (!asked) {
        out.output.write(s);
        asked = true;
      } else if (s.includes('\n')) out.output.write('\n');
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

(async () => {
  await initDatabase();
  const db = getDatabase();

  const args = process.argv.slice(2);
  const isForce = args.includes('--force');
  const isPromote = args.includes('--promote');

  // Check if a super admin already exists to prevent accidental duplicate bootstrap
  const existingSuper = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM admins WHERE role = 'super_admin' AND is_active = 1");
  if (Number(existingSuper?.n ?? 0) > 0 && !isForce) {
    console.error('[-] An active Super Administrator already exists in this database.');
    console.error('[-] To add additional administrators, sign in to /admin/roles or re-run with --force.');
    process.exit(1);
  }

  if (isPromote) {
    const emailIndex = args.indexOf('--promote') + 1;
    let targetEmail = args[emailIndex] || process.env.ADMIN_EMAIL;
    if (!targetEmail) {
      targetEmail = await ask('Enter the email of the existing account to promote: ');
    }
    targetEmail = targetEmail.toLowerCase().trim();

    const user = await db.get<{ id: string; email: string }>('SELECT id, email FROM users WHERE email = ?', [targetEmail]);
    if (!user) {
      console.error(`[-] User with email "${targetEmail}" was not found.`);
      process.exit(1);
    }

    const existingAdmin = await db.get<{ id: string }>('SELECT id FROM admins WHERE email = ?', [targetEmail]);
    if (existingAdmin) {
      await db.run("UPDATE admins SET role = 'super_admin', is_active = 1 WHERE id = ?", [existingAdmin.id]);
      console.log(`[+] Existing admin account for ${targetEmail} promoted to Super Administrator.`);
    } else {
      const password = process.env.ADMIN_PASSWORD || (await askHidden('Set a secure password for admin panel sign-in (10+ characters): '));
      if (password.length < 10) {
        console.error('[-] Password must be at least 10 characters long.');
        process.exit(1);
      }
      const profile = await db.get<{ display_name: string }>('SELECT display_name FROM profiles WHERE user_id = ?', [user.id]);
      const name = profile?.display_name || targetEmail.split('@')[0];
      await AdminAuthService.createAdmin(targetEmail, name, password, 'super_admin');
      console.log(`[+] User ${targetEmail} provisioned as initial Super Administrator.`);
    }
    process.exit(0);
  }

  // Create standard first admin
  const nonFlagArgs = args.filter((a) => !a.startsWith('--'));
  const email = (nonFlagArgs[0] || process.env.ADMIN_EMAIL || (await ask('Admin Email: '))).toLowerCase().trim();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    console.error('[-] Invalid email address.');
    process.exit(1);
  }

  const name = nonFlagArgs.slice(1).join(' ') || process.env.ADMIN_NAME || (await ask('Admin Name: ')) || email.split('@')[0];
  const password = process.env.ADMIN_PASSWORD || (await askHidden('Admin Password (10+ characters): '));
  if (password.length < 10) {
    console.error('[-] Admin password must be at least 10 characters.');
    process.exit(1);
  }

  try {
    const id = await AdminAuthService.createAdmin(email, name, password, 'super_admin');
    await db.run(
      'INSERT INTO admin_actions (id, admin_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))',
      [crypto.randomUUID(), id, null, 'super_admin_bootstrapped', `Initial bootstrap of Super Admin ${email}`]
    );
    console.log(`[+] Super Administrator provisioned successfully: ${email} (${name})`);
    console.log('[+] You may now sign in at /admin/login');
    process.exit(0);
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      console.error('[-] An administrator with that email already exists.');
    } else {
      console.error('[-] Error provisioning admin:', err.message);
    }
    process.exit(1);
  }
})();
