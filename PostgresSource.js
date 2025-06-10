import Source from './Source.js';
import pkg from 'pg';
const { Pool } = pkg;

/**
 * PostgresSource: searches PostgreSQL database for matching email_norm entries.
 */
export default class PostgresSource extends Source {
  /**
   * @param {Object} config - PostgreSQL connection configuration
   * @param {string} config.connectionString - PostgreSQL connection string
   * @param {string} [config.tableName] - Table name to query (default: 'breaches')
   * @param {string} [config.emailColumn] - Email column name (default: 'email_norm')
   */  constructor(config) {
    super();
    
    if (!config || !config.connectionString) {
      throw new Error('PostgreSQL connection string is required');
    }
    
    this.pool = new Pool({
      connectionString: config.connectionString,
      // Connection pool settings
      max: 10, // maximum number of clients in the pool
      idleTimeoutMillis: 30000, // close idle clients after 30 seconds
      connectionTimeoutMillis: 10000, // return an error after 10 seconds if connection could not be established
    });
    this.tableName = config.tableName || 'breaches';
    this.emailColumn = config.emailColumn || 'email_norm';
    this.isClosed = false;
  }

  async search(email) {
    const emailNorm = email.trim().toLowerCase();
    
    try {
      const client = await this.pool.connect();
      
      try {
        // Query the database for matching records
        const query = `
          SELECT email_norm, password, source, is_hash, hash_type 
          FROM ${this.tableName} 
          WHERE ${this.emailColumn} = $1
        `;
        
        const result = await client.query(query, [emailNorm]);
        
        // Transform results to match the expected format
        return result.rows.map(row => ({
          email: row.email_norm,
          password: row.password,
          source: 'DB - ' + row.source || 'PostgreSQL',
          is_hash: row.is_hash || false,
          hash_type: row.hash_type || 'plaintext',
        }));
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('PostgreSQL search error:', error);
      // Return empty array on error to not break the overall lookup
      return [];
    }
  }
  /**
   * Close the connection pool when shutting down
   */
  async close() {
    if (!this.isClosed) {
      await this.pool.end();
      this.isClosed = true;
    }
  }
}
