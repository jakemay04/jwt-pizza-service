const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { Role } = require('../model/model.js');

// Mock mysql2/promise before importing DB
jest.mock('mysql2/promise');
jest.mock('bcrypt');
jest.mock('../config.js', () => ({
  db: {
    connection: {
      host: 'localhost',
      user: 'root',
      password: 'password',
      database: 'pizza',
      connectTimeout: 60000,
    },
    listPerPage: 10,
  },
}));
jest.mock('./dbModel.js', () => ({
  tableCreateStatements: [],
}));

const { DB } = require('./database.js');

describe('Database - User Management', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      end: jest.fn(),
    };
    mysql.createConnection.mockResolvedValue(mockConnection);
  });

  describe('addUser', () => {
    test('should add a new user with hashed password', async () => {
      const user = { name: 'John Doe', email: 'john@test.com', password: 'password123', roles: [{ role: Role.Diner }] };
      const hashedPassword = 'hashed_password_123';

      bcrypt.hash.mockResolvedValue(hashedPassword);
      mockConnection.execute.mockResolvedValueOnce([[{ insertId: 1 }]]);
      mockConnection.execute.mockResolvedValueOnce([[{ insertId: 1 }]]);
      mockConnection.query.mockResolvedValueOnce([[]]);

      const result = await DB.addUser(user);

      expect(result).toEqual({
        name: 'John Doe',
        email: 'john@test.com',
        id: 1,
        password: undefined,
        roles: [{ role: Role.Diner }],
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(mockConnection.end).toHaveBeenCalled();
    });

    test('should insert user role after creating user', async () => {
      const user = { name: 'Jane Doe', email: 'jane@test.com', password: 'pass', roles: [{ role: Role.Franchisee }] };
      const hashedPassword = 'hashed';

      bcrypt.hash.mockResolvedValue(hashedPassword);
      mockConnection.execute.mockResolvedValueOnce([[{ insertId: 2 }]]);
      mockConnection.execute.mockResolvedValueOnce([[{ insertId: 1 }]]);
      mockConnection.query.mockResolvedValueOnce([[]]);

      await DB.addUser(user);

      expect(mockConnection.execute).toHaveBeenCalled();
    });
  });

  describe('getUser', () => {
    test('should retrieve user by email and password', async () => {
      const storedUser = { id: 1, name: 'John', email: 'john@test.com', password: 'hashed_pass' };
      const roles = [{ userId: 1, role: Role.Diner, objectId: 0 }];

      mockConnection.execute.mockResolvedValueOnce([[storedUser]]);
      mockConnection.execute.mockResolvedValueOnce([roles]);
      bcrypt.compare.mockResolvedValue(true);

      const result = await DB.getUser('john@test.com', 'password');

      expect(result).toMatchObject({
        id: 1,
        name: 'John',
        email: 'john@test.com',
        password: undefined,
        roles: [{ role: Role.Diner }],
      });
      expect(bcrypt.compare).toHaveBeenCalledWith('password', 'hashed_pass');
    });

    test('should throw 404 error for unknown user', async () => {
      mockConnection.execute.mockResolvedValueOnce([[]]);

      await expect(DB.getUser('unknown@test.com', 'password')).rejects.toMatchObject({
        message: 'unknown user',
        statusCode: 404,
      });
    });

    test('should throw 404 error for incorrect password', async () => {
      const storedUser = { id: 1, name: 'John', email: 'john@test.com', password: 'hashed_pass' };
      mockConnection.execute.mockResolvedValueOnce([[storedUser]]);
      bcrypt.compare.mockResolvedValue(false);

      await expect(DB.getUser('john@test.com', 'wrongpassword')).rejects.toMatchObject({
        message: 'unknown user',
        statusCode: 404,
      });
    });

    test('should retrieve user without password check', async () => {
      const storedUser = { id: 1, name: 'John', email: 'john@test.com', password: 'hashed_pass' };
      const roles = [{ userId: 1, role: Role.Diner, objectId: 0 }];

      mockConnection.execute.mockResolvedValueOnce([[storedUser]]);
      mockConnection.execute.mockResolvedValueOnce([roles]);

      const result = await DB.getUser('john@test.com');

      expect(result.password).toBeUndefined();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
  });

  describe('updateUser', () => {
    test('should update user with new password', async () => {
      const newHashedPassword = 'new_hashed_pass';

      bcrypt.hash.mockResolvedValue(newHashedPassword);
      mockConnection.execute.mockResolvedValueOnce([[]]);
      mockConnection.execute.mockResolvedValueOnce([[{ id: 1, name: 'John', email: 'john@test.com', password: newHashedPassword }]]);
      mockConnection.execute.mockResolvedValueOnce([[]]);

      await DB.updateUser(1, 'John', 'john@test.com', 'newpassword');

      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword', 10);
      expect(mockConnection.end).toHaveBeenCalled();
    });
  });

  describe('loginUser and logout', () => {
    test('should store login token', async () => {
      mockConnection.execute.mockResolvedValueOnce([[]]);

      await DB.loginUser(1, 'token.signature.here');

      expect(mockConnection.execute).toHaveBeenCalled();
      expect(mockConnection.end).toHaveBeenCalled();
    });

    test('should check if user is logged in', async () => {
      mockConnection.execute.mockResolvedValueOnce([[{ userId: 1 }]]);

      const result = await DB.isLoggedIn('token.signature.here');

      expect(result).toBe(true);
    });

    test('should return false if token not found', async () => {
      mockConnection.execute.mockResolvedValueOnce([[]]);

      const result = await DB.isLoggedIn('unknown.token.here');

      expect(result).toBe(false);
    });

    test('should logout user by removing token', async () => {
      mockConnection.execute.mockResolvedValueOnce([[]]);

      await DB.logoutUser('token.signature.here');

      expect(mockConnection.execute).toHaveBeenCalled();
      expect(mockConnection.end).toHaveBeenCalled();
    });
  });
});

describe('Database - Menu Management', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      end: jest.fn(),
    };
    mysql.createConnection.mockResolvedValue(mockConnection);
  });

  describe('getMenu', () => {
    test('should retrieve all menu items', async () => {
      const menuItems = [
        { id: 1, title: 'Pizza', description: 'Delicious', image: 'pizza.jpg', price: 10.99 },
        { id: 2, title: 'Salad', description: 'Fresh', image: 'salad.jpg', price: 8.99 },
      ];

      mockConnection.execute.mockResolvedValueOnce([menuItems]);

      const result = await DB.getMenu();

      expect(result).toEqual(menuItems);
      expect(mockConnection.end).toHaveBeenCalled();
    });
  });

  describe('addMenuItem', () => {
    test('should add a new menu item', async () => {
      const item = { title: 'Burger', description: 'Tasty', image: 'burger.jpg', price: 12.99 };

      mockConnection.execute.mockResolvedValueOnce([[{ insertId: 3 }]]);

      const result = await DB.addMenuItem(item);

      expect(result).toEqual({ ...item, id: 3 });
      expect(mockConnection.end).toHaveBeenCalled();
    });
  });
});

describe('Database - Order Management', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      end: jest.fn(),
    };
    mysql.createConnection.mockResolvedValue(mockConnection);
  });

  describe('getOrders', () => {
    test('should retrieve user orders with pagination', async () => {
      const user = { id: 1, name: 'John', email: 'john@test.com', roles: [{ role: Role.Diner }] };
      const orders = [
        { id: 1, franchiseId: 1, storeId: 1, date: '2024-01-01', items: [] },
        { id: 2, franchiseId: 1, storeId: 2, date: '2024-01-02', items: [] },
      ];
      const items = [];

      mockConnection.execute.mockResolvedValueOnce([orders]);
      mockConnection.execute.mockResolvedValueOnce([items]);
      mockConnection.execute.mockResolvedValueOnce([items]);

      const result = await DB.getOrders(user, 1);

      expect(result).toMatchObject({
        dinerId: 1,
        orders: orders,
        page: 1,
      });
      expect(mockConnection.end).toHaveBeenCalled();
    });
  });

  describe('addDinerOrder', () => {
    test('should create a new diner order', async () => {
      const user = { id: 1 };
      const order = { franchiseId: 1, storeId: 1, items: [{ menuId: 1, description: 'Pizza', price: 10.99 }] };

      mockConnection.execute.mockResolvedValueOnce([[{ insertId: 1 }]]);
      mockConnection.execute.mockResolvedValueOnce([[{ id: 1 }]]);
      mockConnection.execute.mockResolvedValueOnce([[]]);

      const result = await DB.addDinerOrder(user, order);

      expect(result).toMatchObject({
        franchiseId: 1,
        storeId: 1,
        id: 1,
      });
      expect(mockConnection.end).toHaveBeenCalled();
    });
  });
});

describe('Database - Franchise Management', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      end: jest.fn(),
    };
    mysql.createConnection.mockResolvedValue(mockConnection);
  });

  describe('createFranchise', () => {
    test('should create a new franchise with admins', async () => {
      const franchise = {
        name: 'Franchise A',
        admins: [{ email: 'admin@test.com' }],
      };

      mockConnection.execute.mockResolvedValueOnce([[{ id: 1, name: 'Admin User' }]]);
      mockConnection.execute.mockResolvedValueOnce([[{ insertId: 1 }]]);
      mockConnection.execute.mockResolvedValueOnce([[]]);

      const result = await DB.createFranchise(franchise);

      expect(result).toMatchObject({
        name: 'Franchise A',
        id: 1,
      });
      expect(mockConnection.end).toHaveBeenCalled();
    });

    test('should throw error if admin user not found', async () => {
      const franchise = {
        name: 'Franchise B',
        admins: [{ email: 'unknown@test.com' }],
      };

      mockConnection.execute.mockResolvedValueOnce([[]]);

      await expect(DB.createFranchise(franchise)).rejects.toMatchObject({
        message: expect.stringContaining('unknown user'),
        statusCode: 404,
      });
    });
  });

  describe('deleteFranchise', () => {
    test('should delete a franchise and related data', async () => {
      mockConnection.beginTransaction.mockResolvedValueOnce(undefined);
      mockConnection.execute.mockResolvedValue([[]]);
      mockConnection.commit.mockResolvedValueOnce(undefined);

      await DB.deleteFranchise(1);

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.end).toHaveBeenCalled();
    });

    test('should rollback transaction on delete error', async () => {
      mockConnection.beginTransaction.mockResolvedValueOnce(undefined);
      mockConnection.execute.mockRejectedValueOnce(new Error('DB Error'));
      mockConnection.rollback.mockResolvedValueOnce(undefined);

      await expect(DB.deleteFranchise(1)).rejects.toMatchObject({
        message: 'unable to delete franchise',
        statusCode: 500,
      });

      expect(mockConnection.rollback).toHaveBeenCalled();
    });
  });

  describe('getFranchises', () => {
    test('should retrieve franchises with pagination', async () => {
      const franchises = [{ id: 1, name: 'Franchise A' }];

      mockConnection.execute.mockResolvedValueOnce([franchises]);
      mockConnection.execute.mockResolvedValueOnce([[]]);

      const result = await DB.getFranchises(null, 0, 10, '*');

      expect(result[0]).toEqual(franchises);
      expect(result[1]).toBe(false);
      expect(mockConnection.end).toHaveBeenCalled();
    });
  });

  describe('createStore', () => {
    test('should create a new store for a franchise', async () => {
      const store = { name: 'Store A' };

      mockConnection.execute.mockResolvedValueOnce([[{ insertId: 1 }]]);

      const result = await DB.createStore(1, store);

      expect(result).toMatchObject({
        id: 1,
        franchiseId: 1,
        name: 'Store A',
      });
      expect(mockConnection.end).toHaveBeenCalled();
    });
  });

  describe('deleteStore', () => {
    test('should delete a store from a franchise', async () => {
      mockConnection.execute.mockResolvedValueOnce([[]]);

      await DB.deleteStore(1, 1);

      expect(mockConnection.execute).toHaveBeenCalled();
      expect(mockConnection.end).toHaveBeenCalled();
    });
  });
});

describe('Database - Token Management', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      execute: jest.fn(),
      end: jest.fn(),
    };
    mysql.createConnection.mockResolvedValue(mockConnection);
  });

  describe('getTokenSignature', () => {
    test('should extract token signature from JWT', () => {
      const token = 'header.payload.signature';
      const sig = DB.getTokenSignature(token);

      expect(sig).toBe('signature');
    });

    test('should handle malformed token', () => {
      const token = 'no_signature_here';
      const sig = DB.getTokenSignature(token);

      expect(sig).toBe('');
    });
  });
});

describe('Database - Utility Methods', () => {
  describe('getOffset', () => {
    test('should calculate correct offset for pagination', () => {
      const offset1 = DB.getOffset(1, 10);
      const offset2 = DB.getOffset(2, 10);
      const offset3 = DB.getOffset(3, 10);

      expect(offset1).toBe(0);
      expect(offset2).toBe([10]);
      expect(offset3).toBe([20]);
    });
  });
});
