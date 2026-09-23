/**
 * connection.test.js
 * Verifies withTransaction()'s commit/rollback contract — the mechanism
 * every atomic operation in the codebase (product creation, decreaseStock/
 * increaseStock, activity log writes inside a transaction) relies on.
 */

jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(),
}));

const mysql = require('mysql2/promise');

const fakeConn = {
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  release: jest.fn(),
};
const fakePool = {
  getConnection: jest.fn().mockResolvedValue(fakeConn),
};
mysql.createPool.mockReturnValue(fakePool);

const { withTransaction } = require('../../../../src/shared/db/connection');

describe('withTransaction()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('begins, runs the work function with the acquired connection, commits, and releases on success', async () => {
    const result = await withTransaction(async (conn) => {
      expect(conn).toBe(fakeConn);
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(fakeConn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(fakeConn.commit).toHaveBeenCalledTimes(1);
    expect(fakeConn.rollback).not.toHaveBeenCalled();
    expect(fakeConn.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back, releases, and rethrows if the work function throws (atomicity on failure)', async () => {
    const boom = new Error('boom');

    await expect(
      withTransaction(async () => {
        throw boom;
      })
    ).rejects.toThrow('boom');

    expect(fakeConn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(fakeConn.rollback).toHaveBeenCalledTimes(1);
    expect(fakeConn.commit).not.toHaveBeenCalled();
    expect(fakeConn.release).toHaveBeenCalledTimes(1);
  });

  it('always releases the connection, even if commit() itself fails', async () => {
    fakeConn.commit.mockRejectedValueOnce(new Error('commit failed'));

    await expect(withTransaction(async () => 'ok')).rejects.toThrow('commit failed');

    expect(fakeConn.rollback).toHaveBeenCalledTimes(1);
    expect(fakeConn.release).toHaveBeenCalledTimes(1);
  });
});
