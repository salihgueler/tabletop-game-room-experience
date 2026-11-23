import { createLambdaHandler } from 'aws-cdk-blocks/lambda-handler';

// Lazy factory: Blocks config is loaded into process.env before the backend
// module is imported. See createLambdaHandler docs in @aws-cdk-blocks/core.
export const handler = createLambdaHandler(() => import('./index.js'));
