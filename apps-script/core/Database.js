/**
 * SmartQMS – Database.js
 * JDBC wrapper for Google Cloud SQL (MySQL 8.0).
 * Provides a single connection per script execution with automatic cleanup.
 */

'use strict';

const Database = (() => {
  let _conn = null;

  function _getConnection() {
    if (_conn) {
      try {
        // Test if connection is still alive
        _conn.createStatement().executeQuery('SELECT 1');
        return _conn;
      } catch (e) {
        _conn = null;
      }
    }

    const cfg = Config.get().db;
    const jdbcUrl = `jdbc:mysql://${cfg.host}:3306/${cfg.name}?useSSL=true&requireSSL=true`;

    _conn = Jdbc.getConnection(jdbcUrl, cfg.user, cfg.pass);
    _conn.setAutoCommit(true);
    return _conn;
  }

  /**
   * Executes a parameterized SELECT query and returns rows as an array of plain objects.
   * @param {string} sql  – SQL with ? placeholders
   * @param {Array}  params – Values to bind (string | number | boolean | null)
   * @returns {Object[]}
   */
  function query(sql, params = []) {
    const conn = _getConnection();
    const stmt = conn.prepareStatement(sql);
    _bindParams(stmt, params);

    const rs = stmt.executeQuery();
    const meta = rs.getMetaData();
    const colCount = meta.getColumnCount();
    const rows = [];

    while (rs.next()) {
      const row = {};
      for (let i = 1; i <= colCount; i++) {
        row[meta.getColumnLabel(i)] = rs.getObject(i);
      }
      rows.push(row);
    }

    rs.close();
    stmt.close();
    return rows;
  }

  /**
   * Executes a parameterized INSERT / UPDATE / DELETE.
   * @returns {{ affectedRows: number, insertId: number | null }}
   */
  function execute(sql, params = []) {
    const conn = _getConnection();
    const stmt = conn.prepareStatement(sql, 1 /* RETURN_GENERATED_KEYS */);
    _bindParams(stmt, params);
    const affectedRows = stmt.executeUpdate();

    let insertId = null;
    const keys = stmt.getGeneratedKeys();
    if (keys.next()) insertId = keys.getLong(1);
    keys.close();
    stmt.close();

    return { affectedRows, insertId };
  }

  /**
   * Runs a callback inside a transaction.
   * Automatically commits on success and rolls back on error.
   */
  function transaction(fn) {
    const conn = _getConnection();
    conn.setAutoCommit(false);
    try {
      const result = fn();
      conn.commit();
      return result;
    } catch (e) {
      conn.rollback();
      throw e;
    } finally {
      conn.setAutoCommit(true);
    }
  }

  function _bindParams(stmt, params) {
    params.forEach((p, i) => {
      if (p === null || p === undefined) {
        stmt.setNull(i + 1, 0);
      } else if (typeof p === 'number') {
        Number.isInteger(p) ? stmt.setInt(i + 1, p) : stmt.setDouble(i + 1, p);
      } else if (typeof p === 'boolean') {
        stmt.setBoolean(i + 1, p);
      } else {
        stmt.setString(i + 1, String(p));
      }
    });
  }

  return { query, execute, transaction };
})();
