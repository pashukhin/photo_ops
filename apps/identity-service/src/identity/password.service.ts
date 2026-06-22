import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PasswordServicePort } from './identity.service';

@Injectable()
export class PasswordService implements PasswordServicePort {
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}
