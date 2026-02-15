import { prisma } from '../config/db.js';
import { User } from '../generated/prisma/client.js';

export class UserRepository {
  async findByUsername(username: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { username },
    });
  }

  async createUser(username: string, password: string, email: string, displayName: string | null = null): Promise<User> {
    return prisma.user.create({
      data: { username, password, email, displayName },
    });
  }

  async findByUuid(uuid: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { uuid },
    });
  }
}

export const userRepository = new UserRepository();
