/*  global describe, it, before, after, beforeEach, afterEach */
/*  eslint-disable func-names */
/*  eslint-disable no-loop-func */

const should = require('should');
const config = require('../../config/config');
const clone = require('clone');
import { MongoClient } from 'mongodb';
import { Logger } from '../../index';
import { runSuite, cleanDb } from '../test';
import { w, sleep } from '../util';

describe('Logger', () => {
  runSuite('configuration', () => {
    it('should throw error when initalised without configuration', () => {
      let error;
      try {
        Logger.init();
      } catch (e) {
        error = e;
      } finally {
        should(error).not.be.undefined();
      }
    });
    it('should throw error when used without configuration', done => {
      Logger._configuration = undefined;
      Logger.log({
        object: { a: 'b' },
        objectType: 'Test',
        action: 'create', actor: 'specs',
        when: new Date(),
      }, error => {
        should(error).not.be.undefined();
        done();
      });
    });
    it('should throw error when set empty configuration', () => {
      let error;
      try {
        Logger.configuration = undefined;
      } catch (e) {
        error = e;
      } finally {
        should(error).not.be.undefined();
      }
    });
  });
  runSuite('reconfiguration', () => {
    it('should not loose events during reconfiguration', w(async () => {
      const config1 = clone(config);
      config1.url += '1';
      const config2 = clone(config);
      config2.url += '2';
      let stopLogging = false;
      const errors = [];
      const logPromises = [];
      let logCount = 0;
      await cleanDb(config1.url);
      await cleanDb(config2.url);
      function logWithInterval(interval, stopped) {
        logCount++;
        logPromises.push(new Promise(resolve => {
          Logger.log({
            object: { a: 'consistenceTest', logCount },
            objectType: 'Test',
            action: 'create',
            actor: 'specs',
            when: new Date(),
          }, error => {
            if (error) {
              errors.push(error);
            }
            resolve();
          });
        }));
        setTimeout(() => {
          if (stopLogging) {
            process.nextTick(() => stopped());
          } else {
            process.nextTick(() => logWithInterval(interval, stopped));
          }
        }, interval);
      }
      function logWithIntervalP(interval) {
        return new Promise((resolve) => {
          logWithInterval(interval, resolve);
        });
      }
      Logger.init(config1);
      const logPromise = logWithIntervalP(2);
      await sleep(100);
      Logger.init(config2);
      await sleep(100);
      stopLogging = true;
      await logPromise;
      await Promise.all(logPromises);
      should(errors).have.lengthOf(0);
      let db = await MongoClient.connect(config1.url);
      let collection = config1.collection;
      const events1Count = await db.collection(collection)
        .count({ 'object.a': 'consistenceTest' });
      await db.close();
      db = await MongoClient.connect(config2.url);
      collection = config2.collection;
      const events2Count = await db.collection(collection)
        .count({ 'object.a': 'consistenceTest' });
      await db.close();
      should(events1Count + events2Count).be.equal(logCount);
    }));
  }, { timeout: 4000 });
  runSuite('stopping', () => {
    it('should not loose events during stopping', w(async () => {
      let stopLogging = false;
      const errors = [];
      const logPromises = [];
      let logCount = 0;
      function logWithInterval(interval, stopped) {
        logCount++;
        logPromises.push(new Promise(resolve => {
          Logger.log({
            object: { a: 'stoppingTest', logCount },
            objectType: 'Test',
            action: 'create',
            actor: 'specs',
            when: new Date() }, error => {
            if (error) {
              errors.push(error);
            }
            resolve();
          });
        }));
        setTimeout(() => {
          if (stopLogging) {
            process.nextTick(() => stopped());
          } else {
            process.nextTick(() => logWithInterval(interval, stopped));
          }
        }, interval);
      }
      function logWithIntervalP(interval) {
        return new Promise((resolve) => {
          logWithInterval(interval, resolve);
        });
      }
      const logPromise = logWithIntervalP(2);
      await sleep(200);
      stopLogging = true;
      const stopPromise = Logger.stop();
      await Promise.all([logPromise, stopPromise]);
      should(errors).have.lengthOf(0);
      const db = await MongoClient.connect(config.url);
      const eventsCount = await db.collection(config.collection)
        .count({ 'object.a': 'stoppingTest' });
      await db.close();
      should(eventsCount).be.equal(logCount);
    }));
  }, { timeout: 4000 });
});
