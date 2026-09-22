import * as cdk from "aws-cdk-lib";
import { Mixins, RemovalPolicies } from "aws-cdk-lib";

import {
  BlocksStack,
  Hosting,
  SandboxDisableDeletionProtection,
} from "@aws-blocks/blocks/cdk";
import { BlocksPresets } from "@aws-blocks/blocks/cdk";
import { getSandboxId, getStackId } from "@aws-blocks/blocks/scripts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = new cdk.App();

const sandboxMode = app.node.tryGetContext("sandboxMode") === "true";
const projectRoot = app.node.tryGetContext("projectRoot") || process.cwd();

const stackName = sandboxMode
  ? `${getStackId(projectRoot)}-${getSandboxId(projectRoot)}`
  : `${getStackId(projectRoot)}-prod`;
export const blocksStack = await BlocksStack.create(app, stackName, {
  backendHandlerPath: join(__dirname, "index.handler.ts"),
  backendCDKPath: join(__dirname, "index.ts"),
  defaults: sandboxMode ? BlocksPresets.sandbox : BlocksPresets.production,
});

if (sandboxMode) {
  // Make all resources deletable so sandbox:destroy can clean up the entire stack.
  // This overrides removal policies and deletion protection (e.g. RDS) for every
  // resource in the stack, including any you add below.
  // Remove these lines if you want to manage teardown behavior yourself.
  RemovalPolicies.of(blocksStack).destroy();
  Mixins.of(blocksStack).apply(new SandboxDisableDeletionProtection());

  // Tell the runtime that cookies need cross-domain attributes (frontend on
  // localhost, API on API Gateway — different registrable domains).
  blocksStack.handler.addEnvironment("BLOCKS_SANDBOX", "true");
}

// Add static site hosting only when deploying (not in sandbox mode)
if (!sandboxMode) {
  new Hosting(blocksStack, "Hosting", {
    root: join(__dirname, ".."),
    // BLOCKS_API_URL is a COMPILE-TIME constant (String.fromEnvironment), so it has
    // to be passed here — without it the bundle falls back to
    // localBlocksApiUrl(), which on web is hard-coded to localhost:3001, and the
    // deployed frontend can never reach its own backend.
    //
    // The value is same-origin on purpose. The deployed API's hostname is a
    // CloudFormation attribute that does not exist until the stack is created,
    // while this build runs during synth — so an absolute URL is impossible to
    // inject here. Passing `api` below makes CloudFront proxy /aws-blocks/api to
    // API Gateway on this same distribution, so the relative path resolves
    // against whatever origin the app is served from.
    buildCommand:
      "flutter build web --release --dart-define=BLOCKS_API_URL=/aws-blocks/api",
    buildOutputDir: "build/web",
    api: blocksStack,
  });
}
