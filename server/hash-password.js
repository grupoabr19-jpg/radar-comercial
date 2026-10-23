import { hashPassword, isValidPassword, MIN_PASSWORD_LENGTH } from './auth.js';

const password = process.argv[2];
if (!isValidPassword(password)) {
  console.error(`Uso: npm run hash-password -- "senha-livre-com-${MIN_PASSWORD_LENGTH}-ou-mais-caracteres"`);
  process.exitCode = 1;
} else {
  console.log(await hashPassword(password));
}
