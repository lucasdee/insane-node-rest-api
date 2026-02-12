import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import * as apiSpec from './swagger.json' with { type: 'json' };

// const swaggerDocument = {
//   openapi: '3.0.0',
//   info: {
//     title: 'memotag API',
//     version: '1.0.0',
//     description: 'REST API built with Node.js, TypeScript, Express, Prisma, JWT',
//   },

//   servers: [
//     {
//       url: 'http://localhost:3000',
//       description: 'Local server',
//     },
//   ],

//   components: {
//     securitySchemes: {
//       bearerAuth: {
//         type: 'http',
//         scheme: 'bearer',
//         bearerFormat: 'JWT',
//       },
//     },

//     schemas: {
//       LoginRequest: {
//         type: 'object',
//         required: ['username', 'password'],
//         properties: {
//           username: { type: 'string', example: 'admin' },
//           password: { type: 'string', example: 'admin' },
//         },
//       },

//       RegisterRequest: {
//         type: 'object',
//         required: ['username', 'password'],
//         properties: {
//           username: { type: 'string', example: 'newuser' },
//           password: { type: 'string', example: 'secret123' },
//         },
//       },

//       AuthResponse: {
//         type: 'object',
//         properties: {
//           token: { type: 'string' },
//         },
//       },

//       UserProfile: {
//         type: 'object',
//         properties: {
//           id: { type: 'number', example: 1 },
//           username: { type: 'string', example: 'admin' },
//         },
//       },
//     },
//   },

//   paths: {
//     '/auth/register': {
//       post: {
//         summary: 'Register a new user',
//         tags: ['Auth'],
//         requestBody: {
//           required: true,
//           content: {
//             'application/json': {
//               schema: { $ref: '#/components/schemas/RegisterRequest' },
//             },
//           },
//         },
//         responses: {
//           201: {
//             description: 'User created',
//             content: {
//               'application/json': {
//                 schema: { $ref: '#/components/schemas/UserProfile' },
//               },
//             },
//           },
//           400: {
//             description: 'User already exists',
//           },
//         },
//       },
//     },

//     '/auth/login': {
//       post: {
//         summary: 'Login and receive JWT token',
//         tags: ['Auth'],
//         requestBody: {
//           required: true,
//           content: {
//             'application/json': {
//               schema: { $ref: '#/components/schemas/LoginRequest' },
//             },
//           },
//         },
//         responses: {
//           200: {
//             description: 'Successful login',
//             content: {
//               'application/json': {
//                 schema: { $ref: '#/components/schemas/AuthResponse' },
//               },
//             },
//           },
//           401: {
//             description: 'Invalid credentials',
//           },
//         },
//       },
//     },

//     '/users/me': {
//       get: {
//         summary: 'Get authenticated user profile',
//         tags: ['Users'],
//         security: [{ bearerAuth: [] }],
//         responses: {
//           200: {
//             description: 'User profile',
//             content: {
//               'application/json': {
//                 schema: { $ref: '#/components/schemas/UserProfile' },
//               },
//             },
//           },
//           401: {
//             description: 'Unauthorized',
//           },
//         },
//       },
//     },
//   },
// };

export const swaggerRouter = Router().use('/', swaggerUi.serve, swaggerUi.setup(apiSpec));
