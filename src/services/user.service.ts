import { env } from '../config/env.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { userRepository } from '../repositories/user.repository.js';
import { LoginRequest, RegisterRequest } from '../dtos/auth.dto.js';
import { User } from '../dtos/user.dto.js';

export class UserService {
  async register({ username, password, email, displayName }: RegisterRequest): Promise<User> {
    const existing = await userRepository.findByUsername(username);
    if (existing) throw new Error('User already exists');

    const hashed = await bcrypt.hash(password, 10);
    return userRepository.createUser({username, password: hashed, email, displayName});
  }

  async login({ username, password }: LoginRequest): Promise<string> {
    const user = await userRepository.findByUsername(username);
    if (!user) throw new Error('Invalid credentials');

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new Error('Invalid credentials');

    const secret = env.jwtSecret;
    return jwt.sign({ sub: user.id }, secret, { expiresIn: '1h' });
  }

  async getUser(id: number): Promise<User | null> {
    return userRepository.findById(id);
  }
}

export const userService = new UserService();
