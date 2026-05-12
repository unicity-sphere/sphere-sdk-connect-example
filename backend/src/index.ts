import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import { authRoutes } from './auth.js';

const server = Fastify({ logger: true });

await server.register(cors, { origin: true });
await server.register(fastifyJwt, { secret: process.env.JWT_SECRET ?? 'dev-secret-change-me' });

await server.register(authRoutes);

const PORT = Number(process.env.PORT ?? 4000);
await server.listen({ port: PORT, host: '0.0.0.0' });
console.log(`Backend listening on http://localhost:${PORT}`);
