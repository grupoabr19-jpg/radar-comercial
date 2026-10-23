import { hashPassword } from './auth.js';

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error('Uso: npm run hash-password -- "uma-senha-com-12-ou-mais-caracteres"');
  process.exitCode = 1;
} else {
  console.log(await hashPassword(password));
}
