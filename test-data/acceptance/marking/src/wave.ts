import fs from "node:fs";

// Leaves a mark where it is told to whenever it is loaded, so whether a case reaching it ran can be seen.
if (process.env.KAAL_WAVE_MARK) fs.writeFileSync(process.env.KAAL_WAVE_MARK, "loaded\n");

export const wave = (name: string): string => `bye ${name}`;
