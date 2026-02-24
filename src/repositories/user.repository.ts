import { prisma } from '../config/db.js';
import { UserCreateInput, UserModel } from '../generated/prisma/models.js';

export class UserRepository {
  async findByUsername(username: string): Promise<UserModel | null> {
    return prisma.user.findUnique({
      where: { username },
    });
  }

  async createUser(data: UserCreateInput): Promise<UserModel> {
    return prisma.user.create({
      data,
    });
  }

  async findById(id: number): Promise<UserModel | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }
}

export const userRepository = new UserRepository();
