import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { resetDatabase } from './helpers.js';

const app = createApp();

const alice = {
  name: 'Alice',
  email: 'Alice@Example.com',
  password: 'correct horse battery',
};

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** The session cookie set by a response, ready to send back. */
function cookieFrom(response: request.Response) {
  const header = response.headers['set-cookie'] as unknown as string[];
  return header[0].split(';')[0];
}

describe('register', () => {
  it('creates the account, logs in and never returns the password', async () => {
    const response = await request(app).post('/api/auth/register').send(alice);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: 'Alice',
      email: 'alice@example.com',
      isAdmin: false,
    });
    expect(response.body).not.toHaveProperty('passwordHash');

    const cookie = response.headers['set-cookie'] as unknown as string[];
    expect(cookie[0]).toMatch(/gpugrid_session=.+; .*HttpOnly/i);
    expect(cookie[0]).toMatch(/SameSite=Strict/i);
  });

  it('stores a salted hash, never the password', async () => {
    await request(app).post('/api/auth/register').send(alice);
    await request(app)
      .post('/api/auth/register')
      .send({ ...alice, email: 'bob@example.com' });

    const users = await prisma.user.findMany();
    expect(users[0].passwordHash).not.toContain(alice.password);
    // Same password, different salt: different hashes
    expect(users[0].passwordHash).not.toBe(users[1].passwordHash);
  });

  it('rejects an email that already has an account', async () => {
    await request(app).post('/api/auth/register').send(alice);
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...alice, email: 'alice@example.com' });

    expect(response.status).toBe(409);
  });

  it('rejects short passwords and admin self-registration', async () => {
    const short = await request(app)
      .post('/api/auth/register')
      .send({ ...alice, password: '123' });
    const admin = await request(app)
      .post('/api/auth/register')
      .send({ ...alice, isAdmin: true });

    expect(short.status).toBe(400);
    expect(admin.status).toBe(400);
  });
});

describe('login and session', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(alice);
  });

  it('logs in with the right password and identifies the user', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: alice.password });

    expect(login.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set('Cookie', cookieFrom(login));
    expect(me.body).toMatchObject({ name: 'Alice', isAdmin: false });
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'wrong password' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever123' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('rejects requests without a session or with a forged one', async () => {
    const anonymous = await request(app).get('/api/auth/me');
    const forged = await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'gpugrid_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.invalid');

    expect(anonymous.status).toBe(401);
    expect(forged.status).toBe(401);
  });

  it('logs out by removing the cookie', async () => {
    const response = await request(app).post('/api/auth/logout');

    expect(response.status).toBe(204);
    expect((response.headers['set-cookie'] as unknown as string[])[0]).toMatch(/gpugrid_session=;/);
  });
});
