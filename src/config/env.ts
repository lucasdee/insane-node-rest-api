import dotenv from 'dotenv';

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in environment variables');
}

if (!process.env.PORT) {
  throw new Error('PORT is not defined in environment variables');
}

if (!process.env.DATABASE_USER) {
  throw new Error('DATABASE_USER is not defined in environment variables');
}

if (!process.env.DATABASE_PASSWORD) {
  throw new Error('DATABASE_PASSWORD is not defined in environment variables');
}

if (!process.env.DATABASE_HOST) {
  throw new Error('DATABASE_HOST is not defined in environment variables');
}

if (!process.env.DATABASE_NAME) {
  throw new Error('DATABASE_NAME is not defined in environment variables');
}

if (!process.env.SHADOW_DATABASE_NAME) {
  throw new Error('SHADOW_DATABASE_NAME is not defined in environment variables');
}

if (!process.env.DATABASE_PORT) {
  throw new Error('DATABASE_PORT is not defined in environment variables');
}

export const env = {
  port: process.env.PORT,
  jwtSecret: process.env.JWT_SECRET,
  db: {
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    host: process.env.DATABASE_HOST,
    name: process.env.DATABASE_NAME,
    shadowName: process.env.SHADOW_DATABASE_NAME,
    port: parseInt(process.env.DATABASE_PORT),
  },
};
