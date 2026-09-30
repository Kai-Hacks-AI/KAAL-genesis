import fs from "node:fs";

// Leaves a mark where it is told to whenever it is called, so whether the case calling it ran can be seen.
export const mark = (): boolean => {
  if (process.env.KAAL_WAVE_MARK) fs.writeFileSync(process.env.KAAL_WAVE_MARK, "called\n");
  return true;
};
