# Task 05: Brownfield CDK Integration

## Prompt

I have an existing CDK project with pre-deployed AWS resources that I don't want to recreate. Integrate AWS Blocks into this project so I can access these existing resources through a typed Blocks API:

- **DynamoDB table** named `prod-orders` with partition key `orderId` (String) and sort key `timestamp` (String)
- **S3 bucket** named `company-uploads-prod`

I need API methods to:
1. Query orders by orderId
2. Create a new order
3. Generate a presigned upload URL for the S3 bucket
4. List recent uploads

Do NOT recreate these resources — they already exist in AWS and are managed by another team.

## Starting State

An existing CDK project with a stack. The `aws-blocks/index.ts` file is empty.

## Expected Output

- `aws-blocks/index.ts` — backend using `fromExisting()` to wrap the pre-deployed resources + API methods

## Verification

- `fromExisting()` used for DynamoDB table and/or S3 bucket
- OR `BlocksBackend` used to integrate into existing CDK
- API methods for order queries and file operations
- Resources are NOT re-created (no `new DistributedTable(scope, ...)` without fromExisting)
