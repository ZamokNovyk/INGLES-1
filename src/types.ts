export interface Student {
  id: string;
  name: string;
  genre: 'women' | 'men';
  elo: number;
  wins: number;
  losses: number;
  createdAt?: any; // Can be serializable or Firestore Timestamp
  perfilPhotoUrl?: string;
  actualizadoEn?: string;
  coronas?: number;
  crushes?: number;
}

export interface CountdownConfig {
  id: string;
  targetDate: string; // ISO string e.g., "2026-06-15T12:00:00.000Z"
  isActive: boolean;
  isCompleted?: boolean;
  lastResetAt?: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}
