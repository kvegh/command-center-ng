import { BeadsTasks } from './beads.mjs';

try { console.log(await new BeadsTasks().checkAvailable(process.cwd())); }
catch (error) { console.error(error.message); process.exitCode = 1; }
