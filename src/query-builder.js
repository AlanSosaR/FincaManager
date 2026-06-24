import db from './db.js';
import { supabaseFetch } from './sync.js';

function isOnline() {
  return navigator.onLine;
}

export default class QueryBuilder {
  constructor(tableName) {
    this.tableName = tableName;
    this._filters = [];
    this._orderField = null;
    this._orderDir = 'asc';
    this._single = false;
    this._maybeSingle = false;
    this._count = null;
    this._head = false;
    this._selectColumns = '*';
    this._joins = [];
    this._insertData = null;
    this._updateData = null;
    this._deleteMode = false;
    this._rangeFrom = null;
    this._rangeTo = null;
  }

  select(columns, options = {}) {
    this._selectColumns = columns || '*';
    if (options.count === 'exact') this._count = 'exact';
    if (options.head) this._head = true;
    this._parseJoins();
    return this;
  }

  _parseJoins() {
    if (!this._selectColumns || this._selectColumns === '*') return;
    const joinPattern = /(\w+:\w+|\w+)\(([^)]*)\)/g;
    let match;
    while ((match = joinPattern.exec(this._selectColumns)) !== null) {
      const full = match[0];
      const aliasIdx = full.indexOf(':');
      let alias, tableName, fkField, fieldsStr;
      if (aliasIdx !== -1) {
        alias = full.slice(0, aliasIdx);
        const rest = full.slice(aliasIdx + 1);
        fkField = rest.split('(')[0];
        tableName = fkField.endsWith('_id') ? fkField.slice(0, -3) : fkField;
        fieldsStr = rest.slice(fkField.length + 1, -1);
      } else {
        alias = null;
        tableName = full.split('(')[0];
        fkField = `${tableName.replace(/s$/, '')}_id`;
        fieldsStr = full.slice(tableName.length + 1, -1);
      }
      const fields = fieldsStr ? fieldsStr.split(',').map(f => f.trim()).filter(Boolean) : ['*'];
      this._joins.push({ alias: alias || tableName, tableName, fkField, fields });
    }
  }

  eq(field, value) {
    this._filters.push({ type: 'eq', field, value });
    return this;
  }

  gt(field, value) {
    this._filters.push({ type: 'gt', field, value });
    return this;
  }

  neq(field, value) {
    this._filters.push({ type: 'neq', field, value });
    return this;
  }

  in(field, values) {
    this._filters.push({ type: 'in', field, values });
    return this;
  }

  ilike(field, pattern) {
    this._filters.push({ type: 'ilike', field, pattern });
    return this;
  }

  or(filterStr) {
    this._filters.push({ type: 'or', filterStr });
    return this;
  }

  order(field, dir = { ascending: false }) {
    this._orderField = field;
    this._orderDir = dir.ascending ? 'asc' : 'desc';
    return this;
  }

  range(from, to) {
    this._rangeFrom = from;
    this._rangeTo = to;
    return this;
  }

  single() {
    this._single = true;
    return this;
  }

  maybeSingle() {
    this._maybeSingle = true;
    return this;
  }

  insert(data) {
    this._insertData = data;
    return this._executeInsert();
  }

  update(data) {
    this._updateData = data;
    return this;
  }

  delete() {
    this._deleteMode = true;
    return this;
  }

  async _executeInsert() {
    const table = db.table(this.tableName);
    const data = this._insertData;
    const records = Array.isArray(data) ? data : [data];
    const now = new Date().toISOString();
    const results = [];
    for (const record of records) {
      if (!record.id) record.id = crypto.randomUUID();
      if (!record.created_at) record.created_at = now;

      if (isOnline()) {
        try {
          const body = { ...record };
          const res = await supabaseFetch(`/rest/v1/${this.tableName}`, {
            method: 'POST',
            body: JSON.stringify(body),
          });
          const serverRecords = await res.json();
          const serverRecord = Array.isArray(serverRecords) ? serverRecords[0] : serverRecords;
          await table.put(serverRecord);
          results.push(serverRecord);
          continue;
        } catch (e) {
          console.warn(`online insert failed for ${this.tableName}, fallback to local:`, e);
        }
      }

      await table.put(record);
      results.push(record);
      await this._enqueueSync('insert', record.id, record);
    }
    return { data: Array.isArray(data) ? results : results[0], error: null };
  }

  async _executeUpdate() {
    const table = db.table(this.tableName);
    const updateData = this._updateData;
    const eqFilter = this._filters.find(f => f.type === 'eq');
    if (!eqFilter) return { data: null, error: 'update requires eq filter' };
    const existing = await table.where(eqFilter.field).equals(eqFilter.value).first();
    if (!existing) return { data: null, error: null };

    const updated = { ...existing, ...updateData, updated_at: new Date().toISOString() };

    if (isOnline()) {
      try {
        const body = { ...updated };
        delete body.id;
        delete body.created_at;
        delete body.updated_at;
        const res = await supabaseFetch(
          `/rest/v1/${this.tableName}?id=eq.${encodeURIComponent(eqFilter.value)}`,
          { method: 'PATCH', body: JSON.stringify(body) }
        );
        const serverRecords = await res.json();
        const serverRecord = Array.isArray(serverRecords) ? serverRecords[0] : serverRecords;
        await table.put({ ...updated, ...serverRecord });
        return { data: { ...updated, ...serverRecord }, error: null };
      } catch (e) {
        console.warn(`online update failed for ${this.tableName}, fallback to local:`, e);
      }
    }

    await table.put(updated);
    await this._enqueueSync('update', eqFilter.value, updated);
    return { data: updated, error: null };
  }

  async _executeDelete() {
    const table = db.table(this.tableName);
    const eqFilter = this._filters.find(f => f.type === 'eq');
    if (!eqFilter) return { data: null, error: 'delete requires eq filter' };
    const items = await table.where(eqFilter.field).equals(eqFilter.value).toArray();

    if (isOnline()) {
      try {
        await supabaseFetch(
          `/rest/v1/${this.tableName}?id=eq.${encodeURIComponent(eqFilter.value)}`,
          { method: 'DELETE' }
        );
        await table.where(eqFilter.field).equals(eqFilter.value).delete();
        return { data: items, error: null };
      } catch (e) {
        console.warn(`online delete failed for ${this.tableName}, will retry via queue:`, e);
      }
    }

    // Offline or online failure: keep local, enqueue for later sync
    for (const item of items) {
      await this._enqueueSync('delete', item.id, null);
    }
    return { data: items, error: null };
  }

  async _enqueueSync(action, recordId, data) {
    try {
      await db._sync_queue.add({
        table: this.tableName,
        action,
        record_id: recordId,
        data: data ? JSON.parse(JSON.stringify(data)) : null,
        timestamp: new Date().toISOString(),
      });
      if (typeof window !== 'undefined' && window.__syncPending) {
        window.__syncPending();
      }
    } catch (e) {
      console.warn('sync queue error:', e);
    }
  }

  async then(resolve, reject) {
    try {
      const result = await this._execute();
      resolve(result);
    } catch (err) {
      reject(err);
    }
    return this;
  }

  async _execute() {
    if (this._deleteMode) return this._executeDelete();
    if (this._updateData) return this._executeUpdate();

    const table = db.table(this.tableName);
    let results = await table.toArray();

    for (const filter of this._filters) {
      if (filter.type === 'eq') {
        results = results.filter(r => r[filter.field] === filter.value);
      } else if (filter.type === 'neq') {
        results = results.filter(r => r[filter.field] !== filter.value);
      } else if (filter.type === 'gt') {
        results = results.filter(r => (r[filter.field] ?? -Infinity) > filter.value);
      } else if (filter.type === 'in') {
        results = results.filter(r => filter.values.includes(r[filter.field]));
      } else if (filter.type === 'ilike') {
        const needle = filter.pattern.replace(/%/g, '').toLowerCase();
        results = results.filter(r => {
          const val = r[filter.field];
          return val != null && String(val).toLowerCase().includes(needle);
        });
      } else if (filter.type === 'or') {
        const conds = filter.filterStr.split(',');
        results = results.filter(r => {
          return conds.some(cond => {
            const parts = cond.split('.');
            if (parts.length < 3) return false;
            const field = parts[0];
            const op = parts[1];
            let valPattern = parts.slice(2).join('.');
            const needle = valPattern.replace(/%/g, '').toLowerCase();
            const actual = r[field];
            if (actual == null) return false;
            if (op === 'ilike') return String(actual).toLowerCase().includes(needle);
            return String(actual).toLowerCase() === needle;
          });
        });
      }
    }

    if (this._orderField) {
      const f = this._orderField;
      const dir = this._orderDir;
      results.sort((a, b) => {
        const av = a[f], bv = b[f];
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = av > bv ? 1 : av < bv ? -1 : 0;
        return dir === 'asc' ? cmp : -cmp;
      });
    }

    const totalCount = results.length;

    if (this._rangeFrom != null && this._rangeTo != null) {
      results = results.slice(this._rangeFrom, this._rangeTo + 1);
    }

    for (const join of this._joins) {
      results = await this._applyJoin(results, join);
    }

    if (this._count === 'exact' && this._head) {
      return { data: null, count: totalCount, error: null };
    }
    if (this._single || this._maybeSingle) {
      return { data: results[0] || null, error: null };
    }
    return { data: results, count: this._count ? totalCount : undefined, error: null };
  }

  async _applyJoin(results, join) {
    const { alias, tableName, fkField, fields } = join;
    const relTable = db.table(tableName);
    const allRel = await relTable.toArray();
    const relMap = new Map(allRel.map(r => [r.id, r]));

    return results.map(r => {
      const fkVal = r[fkField];
      const related = fkVal ? relMap.get(fkVal) : null;
      if (!related) {
        r[alias] = null;
        return r;
      }
      if (fields.length === 1 && fields[0] === '*') {
        r[alias] = related;
      } else {
        const subset = {};
        for (const f of fields) {
          if (related[f] !== undefined) subset[f] = related[f];
        }
        r[alias] = subset;
      }
      return r;
    });
  }
}
