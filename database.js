// db.js
const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'early_warning',
  password: 'Ferissa47',
  port: 5432,
});

module.exports = pool;
