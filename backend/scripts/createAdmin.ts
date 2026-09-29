/**
 * Creates an admin for the admin panel (/admin).
 *   npm --prefix backend run admin:create -- admin@example.com "Your Name"
 * The password is asked for (typing is hidden), or taken from ADMIN_PASSWORD.
 */
import readline from 'readline';
import { initDatabase } from '../src/config/database';
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
      resolve(answer);
    });
  });
}

(async () => {
  const [email, ...nameParts] = process.argv.slice(2);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    console.error('Usage: npm --prefix backend run admin:create -- admin@example.com "Your Name"');
    process.exit(1);
  }
  const name = nameParts.join(' ') || email.split('@')[0];
  const password = process.env.ADMIN_PASSWORD || (await askHidden('Admin password (10+ characters): '));
  await initDatabase();
  try {
    await AdminAuthService.createAdmin(email, name, password);
    console.log(`Admin ${email} created. Sign in at /admin`);
    process.exit(0);
  } catch (err: any) {
    console.error(err?.code === 'ER_DUP_ENTRY' ? 'An admin with that email already exists.' : err.message);
    process.exit(1);
  }
})();
