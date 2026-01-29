// Mock dependencies BEFORE requiring database
jest.mock('mysql2/promise');
jest.mock('bcrypt');
jest.mock('../config.js', () => ({
  db: {
    connection: { host: 'localhost', user: 'test', password: 'test', database: 'testdb', connectTimeout: 60000 },
    listPerPage: 10
  }
}));
jest.mock('../endpointHelper.js', () => ({
  StatusCodeError: class extends Error {
    constructor(message, statusCode) {
      super(message);
      this.statusCode = statusCode;
    }
  }
}));
jest.mock('../model/model.js', () => ({ Role: { Admin: 'admin', Diner: 'diner', Franchisee: 'franchisee' } }));
jest.mock('./dbModel.js', () => ({ tableCreateStatements: ['CREATE TABLE user', 'CREATE TABLE franchise'] }));

const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

// Setup initial mocks for database initialization
const mockInitConnection = {
  execute: jest.fn().mockResolvedValue([[]]), // Database doesn't exist check
  query: jest.fn().mockResolvedValue([]),
  end: jest.fn()
};
mysql.createConnection = jest.fn().mockResolvedValue(mockInitConnection);

// Suppress console.error during initialization
const originalError = console.error;
console.error = jest.fn();

const { DB } = require('./database');

// Restore console.error after import
console.error = originalError;

describe('Database', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      query: jest.fn(),
      execute: jest.fn(),
      end: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn()
    };

    mysql.createConnection.mockResolvedValue(mockConnection);
    bcrypt.hash.mockResolvedValue('hashed_password');
    bcrypt.compare.mockResolvedValue(true);
  });

  describe('Menu', () => {
    test('getMenu returns all items', async () => {
      const mockMenu = [{ id: 1, title: 'Pizza', price: 10 }];
      mockConnection.execute.mockResolvedValue([mockMenu]);

      const result = await DB.getMenu();

      expect(result).toEqual(mockMenu);
      expect(mockConnection.end).toHaveBeenCalled();
    });

    test('addMenuItem creates new item', async () => {
      mockConnection.execute.mockResolvedValue([{ insertId: 5 }]);

      const result = await DB.addMenuItem({ title: 'Burger', price: 8 });

      expect(result.id).toBe(5);
      expect(mockConnection.end).toHaveBeenCalled();
    });
  });

  describe('Users', () => {
    test('addUser creates user with hashed password', async () => {
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 10 }]);
      mockConnection.execute.mockResolvedValueOnce([{}]);

      const result = await DB.addUser({
        name: 'John',
        email: 'john@test.com',
        password: 'pass123',
        roles: [{ role: 'diner' }]
      });

      expect(result.id).toBe(10);
      expect(result.password).toBeUndefined();
      expect(bcrypt.hash).toHaveBeenCalledWith('pass123', 10);
    });

    test('getUser returns user with valid password', async () => {
      mockConnection.execute.mockResolvedValueOnce([[{ id: 1, email: 'test@test.com', password: 'hash' }]]);
      mockConnection.execute.mockResolvedValueOnce([[{ role: 'diner', objectId: 0 }]]);

      const result = await DB.getUser('test@test.com', 'password');

      expect(result.id).toBe(1);
      expect(result.password).toBeUndefined();
      expect(bcrypt.compare).toHaveBeenCalled();
    });

    test('getUser throws error for invalid user', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      await expect(DB.getUser('bad@test.com', 'pass')).rejects.toThrow('unknown user');
    });

    test('getUser throws error for wrong password', async () => {
      mockConnection.execute.mockResolvedValue([[{ id: 1, password: 'hash' }]]);
      bcrypt.compare.mockResolvedValue(false);

      await expect(DB.getUser('test@test.com', 'wrong')).rejects.toThrow('unknown user');
    });

    test('updateUser updates all fields', async () => {
      mockConnection.execute.mockResolvedValueOnce([{}]);
      mockConnection.execute.mockResolvedValueOnce([[{ id: 1, email: 'new@test.com' }]]);
      mockConnection.execute.mockResolvedValueOnce([[]]);

      await DB.updateUser(1, 'NewName', 'new@test.com', 'newpass');

      expect(bcrypt.hash).toHaveBeenCalled();
    });
  });

  describe('Authentication', () => {
    test('loginUser stores token', async () => {
      mockConnection.execute.mockResolvedValue([{}]);

      await DB.loginUser(1, 'header.payload.signature');

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO auth'),
        ['signature', 1]
      );
    });

    test('isLoggedIn returns true for valid token', async () => {
      mockConnection.execute.mockResolvedValue([[{ userId: 1 }]]);

      const result = await DB.isLoggedIn('a.b.signature');

      expect(result).toBe(true);
    });

    test('isLoggedIn returns false for invalid token', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      const result = await DB.isLoggedIn('invalid');

      expect(result).toBe(false);
    });

    test('logoutUser removes token', async () => {
      mockConnection.execute.mockResolvedValue([{}]);

      await DB.logoutUser('a.b.signature');

      expect(mockConnection.execute).toHaveBeenCalledWith(
        'DELETE FROM auth WHERE token=?',
        ['signature']
      );
    });
  });

  describe('Orders', () => {
    test('getOrders returns orders with items', async () => {
      mockConnection.execute.mockResolvedValueOnce([[{ id: 1, franchiseId: 1 }]]);
      mockConnection.execute.mockResolvedValueOnce([[{ id: 1, description: 'Pizza', price: 10 }]]);

      const result = await DB.getOrders({ id: 5 }, 1);

      expect(result.dinerId).toBe(5);
      expect(result.orders[0].items).toHaveLength(1);
    });

    test('addDinerOrder creates order', async () => {
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 20 }]);
      mockConnection.execute.mockResolvedValueOnce([[{ id: 1 }]]);
      mockConnection.execute.mockResolvedValueOnce([{}]);

      const result = await DB.addDinerOrder(
        { id: 1 },
        { franchiseId: 1, storeId: 1, items: [{ menuId: 1, description: 'Pizza', price: 10 }] }
      );

      expect(result.id).toBe(20);
    });
  });

  describe('Franchises', () => {
    test('createFranchise creates franchise with admin', async () => {
      mockConnection.execute.mockResolvedValueOnce([[{ id: 2, name: 'Admin' }]]);
      mockConnection.execute.mockResolvedValueOnce([{ insertId: 15 }]);
      mockConnection.execute.mockResolvedValueOnce([{}]);

      const result = await DB.createFranchise({
        name: 'Pizza Co',
        admins: [{ email: 'admin@test.com' }]
      });

      expect(result.id).toBe(15);
      expect(result.admins[0].id).toBe(2);
    });

    test('createFranchise throws error for unknown admin', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      await expect(DB.createFranchise({ name: 'Test', admins: [{ email: 'bad@test.com' }] }))
        .rejects.toThrow('unknown user');
    });

    test('deleteFranchise deletes with transaction', async () => {
      mockConnection.execute.mockResolvedValue([{}]);

      await DB.deleteFranchise(5);

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    test('deleteFranchise rolls back on error', async () => {
      mockConnection.execute.mockRejectedValue(new Error('Failed'));

      await expect(DB.deleteFranchise(5)).rejects.toThrow('unable to delete franchise');
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    test('getFranchises returns list with pagination', async () => {
      mockConnection.execute.mockResolvedValueOnce([[{ id: 1, name: 'Test' }]]);
      mockConnection.execute.mockResolvedValueOnce([[]]);

      const [franchises, more] = await DB.getFranchises(null, 0, 10, '*');

      expect(franchises).toHaveLength(1);
      expect(more).toBe(false);
    });

    test('getUserFranchises returns user franchises', async () => {
      mockConnection.execute.mockResolvedValueOnce([[{ objectId: 1 }]]);
      mockConnection.execute.mockResolvedValueOnce([[{ id: 1, name: 'Test' }]]);
      mockConnection.execute.mockResolvedValue([[]]);

      const result = await DB.getUserFranchises(1);

      expect(result).toHaveLength(1);
    });

    test('getFranchise populates admins and stores', async () => {
      mockConnection.execute.mockResolvedValueOnce([[{ id: 1, name: 'Admin' }]]);
      mockConnection.execute.mockResolvedValueOnce([[{ id: 1, name: 'Store' }]]);

      const result = await DB.getFranchise({ id: 1 });

      expect(result.admins).toHaveLength(1);
      expect(result.stores).toHaveLength(1);
    });
  });

  describe('Stores', () => {
    test('createStore creates new store', async () => {
      mockConnection.execute.mockResolvedValue([{ insertId: 25 }]);

      const result = await DB.createStore(1, { name: 'New Store' });

      expect(result.id).toBe(25);
      expect(result.franchiseId).toBe(1);
    });

    test('deleteStore removes store', async () => {
      mockConnection.execute.mockResolvedValue([{}]);

      await DB.deleteStore(1, 5);

      expect(mockConnection.execute).toHaveBeenCalledWith(
        'DELETE FROM store WHERE franchiseId=? AND id=?',
        [1, 5]
      );
    });
  });

  describe('Helpers', () => {
    test('getOffset calculates pagination offset', () => {
      expect(DB.getOffset(1, 10)).toBe(0);
      expect(DB.getOffset(2, 10)).toBe(10);
      expect(DB.getOffset(3, 10)).toBe(20);
    });

    test('getTokenSignature extracts signature from JWT', () => {
      expect(DB.getTokenSignature('a.b.c')).toBe('c');
      expect(DB.getTokenSignature('invalid')).toBe('');
    });
  });

  describe('Error Handling', () => {
    test('closes connection on error', async () => {
      mockConnection.execute.mockRejectedValue(new Error('DB error'));

      await expect(DB.getMenu()).rejects.toThrow('DB error');
      expect(mockConnection.end).toHaveBeenCalled();
    });
  });
});