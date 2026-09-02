// Guard: this app is frontend-only until Module 01 scaffolds the backend.
//
// `app/` deliberately ships without an `aws-blocks/` folder, so `npm run dev` and
// `npm run typecheck` would otherwise fail with errors that say nothing about the
// real cause ("tsc: No inputs were found in config file ..."). Both scripts run
// this first so the message names the missing step instead.
import { existsSync } from "node:fs";

if (!existsSync("aws-blocks/scripts/server.ts")) {
  console.error(
    [
      "",
      "⚠  No backend yet — this app is frontend-only until you scaffold it.",
      "  Run the Module 01 step first (see workshop/01-scaffold/README.md):",
      "    npm create @aws-blocks/blocks-app@latest . -- --template react",
      "    cp ../01-scaffold/solution/index.ts aws-blocks/index.ts",
      "    cp ../01-scaffold/solution/index.handler.ts aws-blocks/index.handler.ts",
      "    cp ../01-scaffold/solution/server.ts aws-blocks/scripts/server.ts",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
