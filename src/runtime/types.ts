export type TableStatus = 'open';

export interface TableRecord {
  tableId: string;
  version: number;
  status: TableStatus;
  createdAt: string;
}

export interface ConnectionRecord {
  connectionId: string;
  tableId?: string;
}

export interface ClientMessage {
  action: string;
  tableId?: string;
}

export interface TableCreatedMessage {
  type: 'table_created';
  tableId: string;
}

export interface TableSnapshotMessage {
  type: 'table_snapshot';
  tableId: string;
  version: number;
  status: TableStatus;
  createdAt: string;
}

export interface ErrorMessage {
  type: 'error';
  code: string;
}

export type OutboundMessage = TableCreatedMessage | TableSnapshotMessage | ErrorMessage;

export interface WebSocketEvent {
  requestContext: {
    routeKey: string;
    connectionId: string;
    domainName: string;
    stage: string;
  };
  body?: string | null;
}

export interface LambdaContext {
  functionName?: string;
}

export interface RuntimeEnv {
  tableName: string;
  awsRegion?: string;
}
