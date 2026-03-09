import { prisma } from '../config/db';
import { UserCreateInput, UserModel } from '../generated/prisma/models';

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
