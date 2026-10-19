import "server-only";
import fs from "node:fs";
import path from "node:path";

/** True when the official Narxoz logo was placed in public/brand/narxoz-logo.png. */
export const hasOfficialLogo = () => fs.existsSync(path.join(process.cwd(), "public", "brand", "narxoz-logo.png"));
