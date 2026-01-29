const request = require('supertest');
const app = require('./service');

// Mock the database module - adjust this path to match your actual DB module
jest.mock('./database.js', () => ({
  query: jest.fn(),
  getConnection: jest.fn(),
  // Add other database methods you use
}));

// Mock the routers with actual route handlers for testing
jest.mock('./routes/orderRouter.js', () => {
  const express = require('express');
  const router = express.Router();
  const db = require('./database.js');
  
  // Example: GET /api/order - get all orders
  router.get('/', async (req, res, next) => {
    try {
      const orders = await db.query('SELECT * FROM orders');
      res.json(orders);
    } catch (err) {
      next(err);
    }
  });
  
  // Example: POST /api/order - create new order
  router.post('/', async (req, res, next) => {
    try {
      const { items, total } = req.body;
      const result = await db.query(
        'INSERT INTO orders (items, total) VALUES (?, ?)',
        [items, total]
      );
      res.status(201).json({ id: result.insertId, items, total });
    } catch (err) {
      next(err);
    }
  });
  
  // Example: GET /api/order/:id - get specific order
  router.get('/:id', async (req, res, next) => {
    try {
      const orders = await db.query(
        'SELECT * FROM orders WHERE id = ?',
        [req.params.id]
      );
      if (orders.length === 0) {
        const error = new Error('Order not found');
        error.statusCode = 404;
        throw error;
      }
      res.json(orders[0]);
    } catch (err) {
      next(err);
    }
  });
  
  router.docs = [
    { method: 'GET', path: '/api/order', description: 'Get all orders' },
    { method: 'POST', path: '/api/order', description: 'Create order' },
    { method: 'GET', path: '/api/order/:id', description: 'Get order by ID' }
  ];
  
  return router;
});

jest.mock('./routes/franchiseRouter.js', () => {
  const router = require('express').Router();
  router.docs = [{ method: 'GET', path: '/api/franchise', description: 'Get franchises' }];
  return router;
});

jest.mock('./routes/userRouter.js', () => {
  const router = require('express').Router();
  router.docs = [{ method: 'GET', path: '/api/user', description: 'Get users' }];
  return router;
});

jest.mock('./routes/authRouter.js', () => ({
  authRouter: require('express').Router(),
  setAuthUser: jest.fn((req, res, next) => next())
}));

const { authRouter } = require('./routes/authRouter.js');
authRouter.docs = [{ method: 'POST', path: '/api/auth/login', description: 'Login' }];

jest.mock('./version.json', () => ({ version: '1.0.0' }));
jest.mock('./config.js', () => ({
  factory: { url: 'http://factory.test' },
  db: { connection: { host: 'localhost' } }
}));

// Get the mocked database
const db = require('./database.js');

describe('JWT Pizza Service with Database Mocking', () => {
  // Clear all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /', () => {
    it('should return welcome message', async () => {
      const res = await request(app).get('/');
      
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        message: 'welcome to JWT Pizza',
        version: '1.0.0'
      });
    });
  });

  describe('Database-backed Order Routes', () => {
    describe('GET /api/order', () => {
      it('should return all orders from database', async () => {
        // Mock the database response
        const mockOrders = [
          { id: 1, items: 'Pizza', total: 15.99 },
          { id: 2, items: 'Burger', total: 10.99 }
        ];
        db.query.mockResolvedValue(mockOrders);

        const res = await request(app).get('/api/order');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockOrders);
        expect(db.query).toHaveBeenCalledWith('SELECT * FROM orders');
        expect(db.query).toHaveBeenCalledTimes(1);
      });

      it('should handle database errors', async () => {
        // Mock a database error
        db.query.mockRejectedValue(new Error('Database connection failed'));

        const res = await request(app).get('/api/order');

        expect(res.status).toBe(500);
        expect(res.body.message).toBe('Database connection failed');
      });
    });

    describe('POST /api/order', () => {
      it('should create a new order in database', async () => {
        // Mock the database insert response
        db.query.mockResolvedValue({ insertId: 123 });

        const newOrder = { items: 'Salad', total: 8.99 };
        const res = await request(app)
          .post('/api/order')
          .send(newOrder)
          .set('Content-Type', 'application/json');

        expect(res.status).toBe(201);
        expect(res.body).toEqual({ id: 123, ...newOrder });
        expect(db.query).toHaveBeenCalledWith(
          'INSERT INTO orders (items, total) VALUES (?, ?)',
          ['Salad', 8.99]
        );
      });

      it('should handle database errors on insert', async () => {
        db.query.mockRejectedValue(new Error('Insert failed'));

        const res = await request(app)
          .post('/api/order')
          .send({ items: 'Pasta', total: 12.99 });

        expect(res.status).toBe(500);
        expect(res.body.message).toBe('Insert failed');
      });
    });

    describe('GET /api/order/:id', () => {
      it('should return a specific order from database', async () => {
        const mockOrder = { id: 5, items: 'Tacos', total: 9.99 };
        db.query.mockResolvedValue([mockOrder]);

        const res = await request(app).get('/api/order/5');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockOrder);
        expect(db.query).toHaveBeenCalledWith(
          'SELECT * FROM orders WHERE id = ?',
          ['5']
        );
      });

      it('should return 404 when order not found', async () => {
        db.query.mockResolvedValue([]); // Empty array = not found

        const res = await request(app).get('/api/order/999');

        expect(res.status).toBe(404);
        expect(res.body.message).toBe('Order not found');
      });
    });
  });

  describe('404 handler', () => {
    it('should return 404 for unknown endpoints', async () => {
      const res = await request(app).get('/unknown-route');
      
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'unknown endpoint' });
    });
  });

  describe('CORS headers', () => {
    it('should set CORS headers', async () => {
      const res = await request(app)
        .get('/')
        .set('Origin', 'http://example.com');
      
      expect(res.headers['access-control-allow-origin']).toBe('http://example.com');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });
});