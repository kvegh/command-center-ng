import { setPassword } from './auth.mjs';
import { emitKeypressEvents } from 'node:readline';

async function hidden(prompt) {
  process.stdout.write(prompt);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const done = (error) => { process.stdin.off('keypress', key); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); error ? reject(error) : resolve(value); };
    const key = (text, event = {}) => {
      if (event.ctrl && event.name === 'c') return done(new Error('Cancelled.'));
      if (event.name === 'return') return done();
      if (event.name === 'backspace') value = value.slice(0, -1);
      else if (text && !event.ctrl && !event.meta) value += text;
    };
    process.stdin.on('keypress', key);
  });
}

try {
  let password;
  if (process.argv.includes('--stdin')) {
    let input = ''; for await (const chunk of process.stdin) { input += chunk; if (input.length > 4096) throw new Error('Password input is too long.'); }
    password = input.replace(/\r?\n$/, '');
  } else {
    if (!process.stdin.isTTY) throw new Error('Use an interactive terminal or --stdin.');
    password = await hidden('New application password: ');
    if (password !== await hidden('Confirm password: ')) throw new Error('Passwords do not match.');
  }
  await setPassword(password);
  console.log('Application password saved securely outside the checkout.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
