import { createLambdaHandler } from '@aws-blocks/blocks/lambda-handler';

// Lazy factory: Blocks config is loaded into process.env before the backend
// module is imported. See createLambdaHandler docs in @aws-blocks/core.
export const handler = createLambdaHandler(() => import('./index.js'));
