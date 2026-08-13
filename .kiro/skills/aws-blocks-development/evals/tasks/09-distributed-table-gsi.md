# Task 09: E-commerce Orders Table with GSI

## Prompt

Create a data model for an e-commerce orders system with these requirements:

- Each order has: orderId, customerId, timestamp, items (array), totalAmount, status
- Primary access pattern: look up an order by orderId + timestamp
- Secondary access pattern: list all orders for a specific customer (sorted by timestamp, newest first)
- Orders older than 90 days should be automatically deleted
- I need API methods to:
  1. Create a new order
  2. Get an order by ID and timestamp
  3. List all orders for a customer (with pagination)
  4. Update order status

## Starting State

Bare Blocks project with an empty `aws-blocks/index.ts`.

## Expected Output

- `aws-blocks/index.ts` — backend with a properly indexed table and API methods

## Verification

- DistributedTable with partition key (orderId) and sort key (timestamp)
- An index (GSI) defined for querying by customerId
- TTL configuration for 90-day expiry
- API methods for CRUD + customer query
- Query using the index name (not field name)
