/* global describe, it, before, after */
/* eslint-disable func-names, prefer-arrow-callback*/
process.env.NODE_ENV = 'test';
require('source-map-support').install();
if (!global._babelPolyfill) {
  require('babel-polyfill');
}

import { w } from './util';
import { MongoClient } from 'mongodb';
import { Logger } from '../index';
const mongoose = require('mongoose');
const config = require('../config/config');

export let Sample;
export let SampleItem;
export let SampleSubItem;
export async function cleanDb(url) {
  const database = await MongoClient.connect(url);
  await database.dropDatabase();
  await database.createCollection('events');
  await database.close();
}
async function resetDb() {
  await cleanDb(config.url);
  const connection = mongoose.createConnection(config.url);
  const deps = { db: connection };
  require('./models/sample.model')(deps);
  require('./models/sampleItem.model')(deps);
  require('./models/sampleSubItem.model')(deps);
  Sample = connection.model('Sample');
  SampleItem = connection.model('SampleItem');
  SampleSubItem = connection.model('SampleSubItem');
  return connection;
}
export const runSuite = function (name, tests, options) {
  describe(name, function () {
    if (options && options.timeout) {
      this.timeout(options.timeout);
    }
    let connection;
    before(w(async () => {
      connection = await resetDb();
    }));
    after(w(async () => {
      if (connection) {
        await connection.close();
        connection.models = {};
      }
      Logger.init(config);
    }));
    w(tests());
  });
};

require('./spec/logger.plugin.spec');
require('./spec/logger.util.spec');
require('./spec/logger.spec');
after('Stop logger', w(async () => {
  await Logger.stop();
}));
