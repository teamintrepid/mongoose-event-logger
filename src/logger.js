const MongoWritableStream = require('mongo-writable-stream');
const through2 = require('through2');
const winston = require('winston');
const fs = require('fs');
import * as defaultConfig from './config/config';

export const loggerSyncIntervalMS = 10;

// function sleep(ms) {
//   return new Promise((resolve) => {
//     setTimeout(resolve, ms);
//   });
// }

// periodically checks for condition and calls callback once condition is true
function waitUntil(condition, callback, interval = loggerSyncIntervalMS) {
  if (condition()) {
    process.nextTick(() => callback());
  } else {
    setTimeout(() => {
      if (condition()) {
        callback();
      } else {
        process.nextTick(() => waitUntil(condition, callback, interval));
      }
    }, interval).unref();
  }
}
const signals = ['SIGTERM', 'SIGINT'];
export class Logger {
  static signalListeners = new Map();
  constuctor() {
    throw new Error('Logger can not be instantiated, use static methods');
  }
  static init(config) {
    if (!config) {
      throw new Error('Logger should be initialised with config');
    }
    this.configuration = config;
  }
  // calls callback when stream is available
  static waitUntilAvailable(callback) {
    if (this.available) {
      process.nextTick(callback);
    } else {
      if (!this._availablePromise) {
        this._availablePromise = new Promise(resolve => {
          waitUntil(() => this.available, () => {
            winston.log('verbose', 'Logger stream is now available');
            resolve();
          });
        });
        winston.log('verbose', 'Set an availability promise');
      }
      this._availablePromise.then(callback).catch(callback);
    }
  }
  // calls callback when stream is drained
  static waitUntilDrained(callback) {
    if (!this.waitForDrain) {
      process.nextTick(callback);
    } else {
      if (!this._drainPromise) {
        this._drainPromise = new Promise(resolve => {
          this.stream.once('drain', () => {
            winston.log('verbose', 'Logger stream has drained');
            resolve();
          });
        });
        winston.log('verbose', 'Set a drain promise');
      }
      this._drainPromise.then(callback).catch(callback);
    }
  }
  static set configuration(config) {
    if (!config) {
      throw new Error('Logger should be initialised with config');
    }
    this._configuration = config;
    this.postConfig();
  }
  static get configuration() {
    return this._configuration;
  }
  static postConfig() {
    const currentStream = this._stream;
    // if there is an existing stream and logger configuration has just changed
    // we need to pause all future writes by setting availabe to false
    // then wait until stream is drained and finished
    // then make stream available again (this will trigger waiting writes)
    if (currentStream) {
      winston.log('verbose', 'Logger stream is temporarily not available due to config switching');
      this.available = false;
      this.waitUntilDrained(() => {
        currentStream.once('finish', () => {
          this._stream = undefined;
          winston.log('verbose', 'Logger stream is now available after config switching');
          this.available = true;
        });
        currentStream.end();
      });
    } else {
      this.available = true;
    }
  }
  static attachSignalListeners() {
    this.detachSignalListeners();
    if (this.configuration.attachSignalListeners === false) {
      return;
    }
    signals.forEach(signal => {
      const listener = this.gracefulStop(signal);
      process.on(signal, listener);
      this.signalListeners.set(signal, listener);
    });
  }
  static detachSignalListeners() {
    for (const signal of this.signalListeners.keys()) {
      process.removeListener(signal, this.signalListeners.get(signal));
    }
  }
  /**
   * Stops the Logger service ensuring no logs are lost
   *
   * @return {Promise} That will be resolved once stopping is comple
   */
  static stop() {
    this.detachSignalListeners();
    winston.info('Logger service is stopping');
    const stopPromise = new Promise((resolve, reject) => {
      if (!this._stream) {
        winston.info('Logger service stopped');
        resolve();
      } else {
        this.waitUntilDrained(() => {
          winston.log('verbose', 'Logger waited for stream to drain');
          winston.log('verbose', `Logger service is waiting for ${this.logPromises.length} queued logs to complete`);
          Promise.all(this.logPromises).then(() => {
            // if stream has already ended, resolve
            if (!this._stream || (this._stream._writableState && this._stream._writableState.ended)) {
              resolve();
              winston.info('Logger service stopped since stream was already ended');
            } else {
              // wait for stream to finish
              this._stream.on('finish', () => {
                this._stream = undefined;
                resolve();
                winston.info('Logger service stopped after waiting for queued logs to complete');
              });
              this._stream.end();
            }
          }
          ).catch(error => {
            this.handleError(error);
            reject(error);
          });
        });
      }
    });
    return stopPromise;
  }
  static gracefulStop(signal) {
    return () => {
      winston.info(`Graceful stopping Logger service due to signal ${signal}`);
      const promise = this.stop();
      promise.then(() => {
        if (this.configuration.shutdownOnSignal) {
          winston.info('Logger service shuts down the process');
          process.kill(process.pid, signal);
        }
        winston.info('Logger service is ready for app shutdown');
      }).catch(error => {
        winston.info(`Logger service is ready for app shutdown despite error ${error}`);
      });
    };
  }
  static get action() {
    return {
      updated: 'updated',
      created: 'created',
      deleted: 'deleted',
      fetched: 'fetched',
    };
  }
  static handleError(error) {
    winston.error(error);
  }
  static get stream() {
    if (!this._stream) {
      if (!this.configuration) {
        throw new Error('Logger should be initialised before use');
      }
      const debug = this.configuration.debug;
      let writeStream;
      if (debug) {
        try {
          fs.accessSync('logged.json');
          fs.unlinkSync('logged.json');
        } catch (e) {
          //  ignore(e)
        }
        writeStream = fs.createWriteStream('logged.json', { flags: 'a' });
        winston.info('Event logger uses logged.json for output in debug mode');
      } else {
        writeStream = new MongoWritableStream({
          url: this.configuration.url,
          collection: this.configuration.collection,
        });
        writeStream.on('error', this.handleError);
        winston.info('Event logger connected to DB', this.configuration.url);
      }
  
      this._stream = through2.obj(function prepare(event, enc, callback) {
        if (!event.actor) {
          event.actor = null;
        }
        if (!event.when) {
          event.when = new Date();
        }
        if (debug) {
          const s = `${JSON.stringify(event, null, ' ')}\n`;
          this.push(s);
        } else {
          this.push(event);
        }
        callback();
      }).pipe(writeStream);
      this._stream.on('error', this.handleError);
      this.attachSignalListeners();
    }
    return this._stream;
  }

  // stream.write wrapper that respects drain signals
  // and pauses writes until stream has drained
  static write(...args) {
    if (this.waitForDrain) {
      this.waitUntilDrained(() => {
        this.waitForDrain = !this.stream.write(...args);
      });
    } else {
      this.waitForDrain = !this.stream.write(...args);
    }
  }
  // logs event with respect to stream availability
  static log(payload, callback) {
    payload.actor = payload.actor || null;
    payload.when = payload.when || new Date();
    const promise = new Promise((resolve, reject) => {
      this.waitUntilAvailable(() => {
        let errorHappened = false;
        const handler = error => {
          reject(error);
          errorHappened = true;
        };
        try {
          this.stream.once('error', handler);

          this.write(payload, null, (error) => {
            if (!errorHappened) {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            }
          });

        } catch (error) {
          if (!errorHappened) {
            reject(error);
          }
        } finally {
          if (this._stream) {
            this._stream.removeListener('error', handler);
          }
        }
      });
    });
    this.logPromises.push(promise);
    promise.then(() => {
      const idx = this.logPromises.indexOf(promise);
      if (idx !== -1) {
        this.logPromises.splice(idx, 1);
      }
      if (callback) callback();
    }).catch(error => {
      const idx = this.logPromises.indexOf(promise);
      if (idx !== -1) {
        this.logPromises.splice(idx, 1);
      }
      if (callback) callback(error);
    });
    return promise;
  }
}
Logger.logPromises = [];
Logger.available = true;
Logger.init(defaultConfig);
