import { prisma } from '../config/db.js';
import { User } from '../generated/prisma/client.js';

export class UserRepository {
  async findByUsername(username: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { username },
    });
  }

  async createUser(username: string, password: string): Promise<User> {
    return prisma.user.create({
      data: { username, password },
    });
  }

  async findById(id: number): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }
}

export const userRepository = new UserRepository();
