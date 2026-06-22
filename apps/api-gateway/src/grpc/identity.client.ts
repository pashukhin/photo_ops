import { ChannelCredentials, credentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { Injectable } from '@nestjs/common';
import { join } from 'node:path';

export interface AuthSessionDto {
  sessionId: string;
  userId: string;
  email: string;
  displayName: string;
  expiresAt: string;
}

export interface IdentityGatewayClient {
  signUp(input: { email: string; password: string; displayName: string }): Promise<AuthSessionDto>;
  login(input: { email: string; password: string }): Promise<AuthSessionDto>;
  validateSession(input: { sessionId: string }): Promise<AuthSessionDto>;
  logout(input: { sessionId: string }): Promise<unknown>;
  getCurrentUser(input: { sessionId: string }): Promise<unknown>;
}

type Callback<T> = (error: Error | null, value: T) => void;

interface GrpcIdentityServiceClient {
  SignUp(input: { email: string; password: string; displayName: string }, callback: Callback<AuthSessionDto>): void;
  Login(input: { email: string; password: string }, callback: Callback<AuthSessionDto>): void;
  ValidateSession(input: { sessionId: string }, callback: Callback<AuthSessionDto>): void;
  Logout(input: { sessionId: string }, callback: Callback<unknown>): void;
  GetCurrentUser(input: { sessionId: string }, callback: Callback<unknown>): void;
}

@Injectable()
export class IdentityClient implements IdentityGatewayClient {
  private readonly client: GrpcIdentityServiceClient;

  constructor() {
    const protoPath = join(process.cwd(), '../../proto/identity/v1/identity_service.proto');
    const packageDefinition = loadSync(protoPath, { keepCase: false, longs: String, enums: Number, defaults: true, oneofs: true, includeDirs: [join(process.cwd(), '../../proto')] });
    const loaded = loadPackageDefinition(packageDefinition) as unknown as {
      photoops: { identity: { v1: { IdentityService: new (target: string, channelCredentials: ChannelCredentials) => GrpcIdentityServiceClient } } };
    };
    const target = process.env.IDENTITY_SERVICE_GRPC_URL ?? 'identity-service:50055';
    this.client = new loaded.photoops.identity.v1.IdentityService(target, credentials.createInsecure());
  }

  signUp(input: { email: string; password: string; displayName: string }): Promise<AuthSessionDto> {
    return this.call<AuthSessionDto>((callback) => this.client.SignUp(input, callback));
  }

  login(input: { email: string; password: string }): Promise<AuthSessionDto> {
    return this.call<AuthSessionDto>((callback) => this.client.Login(input, callback));
  }

  validateSession(input: { sessionId: string }): Promise<AuthSessionDto> {
    return this.call<AuthSessionDto>((callback) => this.client.ValidateSession(input, callback));
  }

  logout(input: { sessionId: string }) {
    return this.call((callback) => this.client.Logout(input, callback));
  }

  getCurrentUser(input: { sessionId: string }) {
    return this.call((callback) => this.client.GetCurrentUser(input, callback));
  }

  private call<T>(invoke: (callback: Callback<T>) => void): Promise<T> {
    return new Promise((resolve, reject) => invoke((error, value) => (error ? reject(error) : resolve(value))));
  }
}
