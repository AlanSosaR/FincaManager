import db from './db.js';
import QueryBuilder from './query-builder.js';

function from(tableName) {
  return new QueryBuilder(tableName);
}

const supabase = {
  from,
  db,
};

export { supabase, db };
export default supabase;
