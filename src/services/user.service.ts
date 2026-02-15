import { env } from '../config/env.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { userRepository } from '../repositories/user.repository.js';

export class UserService {
  async register(username: string, password: string, email: string, displayName: string | null = null) {
    const existing = await userRepository.findByUsername(username);
    if (existing) throw new Error('User already exists');

    const hashed = await bcrypt.hash(password, 10);
    return userRepository.createUser(username, hashed, email, displayName);
  }

  async login(username: string, password: string) {
    const user = await userRepository.findByUsername(username);
    if (!user) throw new Error('Invalid credentials');

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new Error('Invalid credentials');

    const secret = env.jwtSecret;
    return jwt.sign({ sub: user.uuid }, secret, { expiresIn: '1h' });
  }

  async getUser(uuid: string) {
    // return userRepository.findById(id);
    return userRepository.findByUuid(uuid);
  }
}

export const userService = new UserService();
