import * as cdk from 'aws-cdk-lib';
import { RemovalPolicies, Mixins } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

import {
  BlocksStack,
  SandboxDisableDeletionProtection,
  registerConfig
} from '@aws-blocks/blocks/cdk';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getStackId, getSandboxId } from '@aws-blocks/blocks/scripts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = new cdk.App();

const sandboxMode = app.node.tryGetContext('sandboxMode') === 'true';
const projectRoot = app.node.tryGetContext('projectRoot') || process.cwd();

const stackName = sandboxMode ? `${getStackId(projectRoot)}-${getSandboxId(projectRoot)}` : `${getStackId(projectRoot)}-prod`;
export const blocksStack = await BlocksStack.create(app, stackName, {
  backendHandlerPath: join(__dirname, 'index.handler.ts'),
  backendCDKPath: join(__dirname, 'index.ts')
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
  blocksStack.handler.addEnvironment('BLOCKS_SANDBOX', 'true');
}

// Add static site hosting only when deploying (not in sandbox mode)
if (!sandboxMode) {
  const root = join(__dirname, '..');
  const nodeOptions = (process.env.NODE_OPTIONS || '')
    .split(/\s+/)
    .filter((option) => option !== '--conditions=cdk')
    .join(' ');

  execFileSync('npm', ['run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: nodeOptions }
  });

  const hostingBucket = new s3.Bucket(blocksStack, 'HostingBucket', {
    autoDeleteObjects: true,
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    encryption: s3.BucketEncryption.S3_MANAGED,
    enforceSSL: true,
    removalPolicy: cdk.RemovalPolicy.DESTROY
  });

  const spaFallback = new cloudfront.Function(blocksStack, 'SpaFallback', {
    runtime: cloudfront.FunctionRuntime.JS_2_0,
    code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);

  if (uri === '/' || uri.charAt(uri.length - 1) === '/' || lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }

  return request;
}
`)
  });

  const apiBaseUrl = cdk.Fn.select(0, cdk.Fn.split('/aws-blocks', blocksStack.apiUrl));
  const apiWithoutScheme = cdk.Fn.select(1, cdk.Fn.split('https://', apiBaseUrl));
  const apiHostname = cdk.Fn.select(0, cdk.Fn.split('/', apiWithoutScheme));
  const apiStage = cdk.Fn.select(1, cdk.Fn.split('/', apiWithoutScheme));
  const apiOrigin = new origins.HttpOrigin(apiHostname, {
    originPath: `/${apiStage}`
  });

  const staticOrigin = origins.S3BucketOrigin.withOriginAccessControl(hostingBucket);
  const apiBehavior: cloudfront.BehaviorOptions = {
    origin: apiOrigin,
    allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
    cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
    originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
  };

  const distribution = new cloudfront.Distribution(blocksStack, 'HostingDistribution', {
    defaultRootObject: 'index.html',
    priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    defaultBehavior: {
      origin: staticOrigin,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      functionAssociations: [{
        function: spaFallback,
        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST
      }]
    },
    additionalBehaviors: {
      '/.blocks-sandbox/*': {
        origin: staticOrigin,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      '/aws-blocks': apiBehavior,
      '/aws-blocks/*': apiBehavior,
      '/aws-blocks-auth': apiBehavior,
      '/aws-blocks-auth/*': apiBehavior
    }
  });

  new s3deploy.BucketDeployment(blocksStack, 'HostingDeployment', {
    sources: [
      s3deploy.Source.asset(join(root, 'dist'), {
        exclude: ['.blocks-sandbox/config.json']
      }),
      s3deploy.Source.jsonData('.blocks-sandbox/config.json', {
        apiUrl: '/aws-blocks/api',
        environment: 'production'
      })
    ],
    destinationBucket: hostingBucket,
    distribution,
    distributionPaths: ['/*'],
    prune: true,
    retainOnDelete: false
  });

  const hostingUrl = `https://${distribution.distributionDomainName}`;
  registerConfig(blocksStack, 'BLOCKS_PUBLIC_ORIGIN', hostingUrl);
  registerConfig(blocksStack, 'CORS_HOSTING_ORIGINS', hostingUrl);

  new cdk.CfnOutput(blocksStack, 'HostingUrl', {
    value: hostingUrl,
    description: 'CloudFront URL for the tabletop app'
  });
}
