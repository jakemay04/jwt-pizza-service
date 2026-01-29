const request = require('supertest');

// Mock the database module so tests don't require a live MySQL instance.
jest.mock('./database/database.js', () => {
  const users = [];
  let nextId = 1;
  const tokens = new Set();

  const Role = { Admin: 'admin', Diner: 'diner', Franchisee: 'franchisee' };

  return {
    Role,
    DB: {
      async addUser(user) {
        const id = nextId++;
        const stored = { id, name: user.name, email: user.email, password: user.password, roles: user.roles };
        users.push(stored);
        return { ...stored, password: undefined };
      },
      async getUser(email, password) {
        const u = users.find((x) => x.email === email);
        if (!u || (password && u.password !== password)) {
          const err = new Error('unknown user');
          err.statusCode = 404;
          throw err;
        }
        return { id: u.id, name: u.name, email: u.email, roles: u.roles, password: undefined };
      },
      async loginUser(userId, token) {
        // store signature portion
        const sig = token.split('.')?.[2] ?? token;
        tokens.add(sig);
      },
      async isLoggedIn(token) {
        const sig = token.split('.')?.[2] ?? token;
        return tokens.has(sig);
      },
      async logoutUser(token) {
        const sig = token.split('.')?.[2] ?? token;
        tokens.delete(sig);
      },
    },
  };
});

const app = require('./service');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
});

test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);

  const { password, ...user } = { ...testUser, roles: [{ role: 'diner' }] };
  expect(loginRes.body.user).toMatchObject(user);
});
