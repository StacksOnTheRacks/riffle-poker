import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  connGsiSk,
  connPk,
  META_SK,
  tableGsiPk,
  tablePk,
} from './keys.js';
import type { ConnectionRecord, RuntimeEnv, TableRecord } from './types.js';

export interface MatchStore {
  putConnection(connectionId: string): Promise<void>;
  deleteConnection(connectionId: string): Promise<void>;
  getConnection(connectionId: string): Promise<ConnectionRecord | null>;
  createTable(tableId: string, createdAt: string): Promise<TableRecord>;
  bindConnectionToTable(connectionId: string, tableId: string): Promise<void>;
  getTable(tableId: string): Promise<TableRecord | null>;
  incrementTableVersion(tableId: string, expectedVersion: number): Promise<TableRecord | null>;
  listConnectionsForTable(tableId: string): Promise<string[]>;
}

export function createMatchStore(
  client: DynamoDBDocumentClient,
  env: RuntimeEnv,
): MatchStore {
  const tableName = env.tableName;

  return {
    async putConnection(connectionId) {
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            PK: connPk(connectionId),
            SK: META_SK,
            connectionId,
          },
        }),
      );
    },

    async deleteConnection(connectionId) {
      await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: {
            PK: connPk(connectionId),
            SK: META_SK,
          },
        }),
      );
    },

    async getConnection(connectionId) {
      const result = await client.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            PK: connPk(connectionId),
            SK: META_SK,
          },
        }),
      );

      if (!result.Item) {
        return null;
      }

      return {
        connectionId: String(result.Item.connectionId),
        tableId: result.Item.tableId ? String(result.Item.tableId) : undefined,
      };
    },

    async createTable(tableId, createdAt) {
      const table: TableRecord = {
        tableId,
        version: 1,
        status: 'open',
        createdAt,
      };

      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            PK: tablePk(tableId),
            SK: META_SK,
            ...table,
          },
        }),
      );

      return table;
    },

    async bindConnectionToTable(connectionId, tableId) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: {
            PK: connPk(connectionId),
            SK: META_SK,
          },
          UpdateExpression:
            'SET tableId = :tableId, GSI1PK = :gsiPk, GSI1SK = :gsiSk',
          ExpressionAttributeValues: {
            ':tableId': tableId,
            ':gsiPk': tableGsiPk(tableId),
            ':gsiSk': connGsiSk(connectionId),
          },
        }),
      );
    },

    async getTable(tableId) {
      const result = await client.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            PK: tablePk(tableId),
            SK: META_SK,
          },
        }),
      );

      if (!result.Item) {
        return null;
      }

      return {
        tableId: String(result.Item.tableId),
        version: Number(result.Item.version),
        status: 'open',
        createdAt: String(result.Item.createdAt),
      };
    },

    async incrementTableVersion(tableId, expectedVersion) {
      try {
        const result = await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: {
              PK: tablePk(tableId),
              SK: META_SK,
            },
            UpdateExpression: 'SET #version = :nextVersion',
            ConditionExpression: '#version = :expectedVersion',
            ExpressionAttributeNames: {
              '#version': 'version',
            },
            ExpressionAttributeValues: {
              ':expectedVersion': expectedVersion,
              ':nextVersion': expectedVersion + 1,
            },
            ReturnValues: 'ALL_NEW',
          }),
        );

        if (!result.Attributes) {
          return null;
        }

        return {
          tableId: String(result.Attributes.tableId),
          version: Number(result.Attributes.version),
          status: 'open',
          createdAt: String(result.Attributes.createdAt),
        };
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'name' in error &&
          error.name === 'ConditionalCheckFailedException'
        ) {
          return null;
        }
        throw error;
      }
    },

    async listConnectionsForTable(tableId) {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: 'byTable',
          KeyConditionExpression: 'GSI1PK = :gsiPk',
          ExpressionAttributeValues: {
            ':gsiPk': tableGsiPk(tableId),
          },
        }),
      );

      return (result.Items ?? []).map((item) => String(item.connectionId));
    },
  };
}
