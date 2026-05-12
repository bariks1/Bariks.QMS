/**
 * SmartQMS – DB Mock Factory
 *
 * Creates a lightweight in-memory JDBC connection mock.
 * Supports pre-canned query responses, insert ID tracking, and
 * call recording for assertions.
 *
 * Usage:
 *   const db = createDbMock();
 *   db.setQueryResult('SELECT * FROM users WHERE email = ?', [userRow]);
 *   db.setInsertId(42);
 *   Jdbc._setMockConnection(db.connection);
 *   // ... run code ...
 *   expect(db.executedStatements).toContainEqual(expect.stringContaining('INSERT INTO'));
 */

'use strict';

function createDbMock() {
  const executedStatements = [];
  const queryResults       = new Map(); // sql fragment → rows[]
  let   nextInsertId       = 1;
  let   nextAffectedRows   = 1;

  // JDBC PreparedStatement mock
  function makePreparedStatement(sql, returnGeneratedKeys) {
    const params = [];
    let _insertId = nextInsertId;

    return {
      setString:  (i, v) => { params[i - 1] = v; },
      setInt:     (i, v) => { params[i - 1] = v; },
      setDouble:  (i, v) => { params[i - 1] = v; },
      setBoolean: (i, v) => { params[i - 1] = v; },
      setNull:    (i, _t) => { params[i - 1] = null; },

      executeQuery() {
        executedStatements.push({ sql, params: [...params] });

        // Find the LONGEST matching fragment (most-specific-wins).
        // This prevents a short fragment from matching SQL that has a
        // more specific registered key.
        let rows = [];
        let bestLen = -1;
        for (const [fragment, result] of queryResults.entries()) {
          if (sql.includes(fragment) && fragment.length > bestLen) {
            rows = result;
            bestLen = fragment.length;
          }
        }

        let idx = 0;
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        return {
          next:          () => idx < rows.length ? (idx++, true) : false,
          getObject:     (i) => rows[idx - 1]?.[columns[i - 1]] ?? null,
          getMetaData:   () => ({
            getColumnCount: () => columns.length,
            getColumnLabel: (i) => columns[i - 1],
          }),
          close: () => {},
        };
      },

      executeUpdate() {
        executedStatements.push({ sql, params: [...params] });
        _insertId = nextInsertId++;
        return nextAffectedRows;
      },

      getGeneratedKeys() {
        let fetched = false;
        return {
          next:    () => !fetched ? (fetched = true) : false,
          getLong: (_i) => _insertId,
          close:   () => {},
        };
      },

      close: () => {},
    };
  }

  // JDBC Connection mock
  const connection = {
    _autoCommit: true,
    prepareStatement: (sql, flags) => makePreparedStatement(sql, flags),
    createStatement:  () => ({
      executeQuery: () => ({ next: () => false, close: () => {} }),
    }),
    setAutoCommit: (v)  => { connection._autoCommit = v; },
    commit:        ()   => {},
    rollback:      ()   => {},
    close:         ()   => {},
  };

  return {
    connection,
    executedStatements,

    /** Pre-set rows returned when a query contains `sqlFragment`. */
    setQueryResult(sqlFragment, rows) {
      queryResults.set(sqlFragment, rows);
    },

    /** Override what INSERT ID the next executeUpdate() returns. */
    setInsertId(id) { nextInsertId = id; },

    /** Override how many rows the next executeUpdate() reports. */
    setAffectedRows(n) { nextAffectedRows = n; },

    /** Clear all query results and execution history. */
    reset() {
      executedStatements.length = 0;
      queryResults.clear();
      nextInsertId     = 1;
      nextAffectedRows = 1;
    },
  };
}

module.exports = { createDbMock };
