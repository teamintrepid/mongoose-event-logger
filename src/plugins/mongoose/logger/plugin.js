if (!global._babelPolyfill) {
  require('babel-polyfill');
}
const winston = require('winston');

import {
  getSpath,
  setSpath,
  getDelta,
  pathsLoggedAlways,
  loggableObject,
  setActor,
  setAttributes,
  getTrace
} from './util';

// reexporting for specs
export {
  getDelta,
  pathsLoggedAlways,
  loggableObject,
  setActor,
  setAttributes
};

export const Action = {
  deleted: 'deleted',
  created: 'created',
  updated: 'updated',
};

export const Actor = {
  user: 'user',
  system: 'system',
};

export const Behaviour = {
  snapshot: 'snapshot',
  delta: 'delta',
  snapshotAndDelta: 'snapshotAndDelta',
  id: 'id',
};

const _options = { if: {}, skip: ['updated_at', 'updatedAt'], objectTypePrefix: '' };
setSpath(_options, `if.${Action.deleted}.by.${Actor.user}`, Behaviour.snapshot);
setSpath(_options, `if.${Action.deleted}.by.${Actor.system}`, Behaviour.snapshot);
setSpath(_options, `if.${Action.created}.by.${Actor.user}`, Behaviour.snapshot);
setSpath(_options, `if.${Action.created}.by.${Actor.system}`, Behaviour.snapshot);
setSpath(_options, `if.${Action.updated}.by.${Actor.user}`, Behaviour.delta);
setSpath(_options, `if.${Action.updated}.by.${Actor.system}`, Behaviour.delta);

export function mergeOptions(defaults, current) {
  const res = {};
  res.logger = current.logger || defaults.logger;
  for (const action of Object.keys(Action)) {
    for (const actor of Object.keys(Actor)) {
      const spath = `if.${action}.by.${actor}`;
      const value = getSpath(current, spath) || getSpath(defaults, spath);
      setSpath(res, spath, value);
    }
  }
  res.skip = current.skip || defaults.skip;
  res.objectTypePrefix = current.objectTypePrefix || defaults.objectTypePrefix;
  return res;
}

function cleanUpdateQuery(update) {
    if (!update) return {};

    let cleaned = {};
    Object.keys(update).forEach(key => {
      if (key === '$set') {
        // if using set, pull it out of the inner object
        cleaned = {
          ...cleaned,
          ...update[key],
        };
      }
      // filter out mongo fields starting with $
      if (key.charAt(0) !== '$') {
        cleaned[key] = update[key];
      }
    });
    return cleaned;
}

/**
 * Creates a Mongoose promise.
 */
function createMongoosePromise(mongooseInstance, resolver) {
  let promise;

  // mongoose 4.1.x and up
  if (mongooseInstance.Promise.ES6) {
    promise = new mongooseInstance.Promise.ES6(resolver);
  } else { // backward compatibility
    promise = new mongooseInstance.Promise;
    resolver(promise.resolve.bind(promise, null), promise.reject.bind(promise));
  }

  return promise;
}
export function patchQueryPrototype(mongooseInstance) {
  //  hack to ensure mongoose-deep-populate patch is applied first
  
  require('mongoose-deep-populate')(mongooseInstance);  
  const Mongoose = Object.getPrototypeOf(mongooseInstance);
  const Query = mongooseInstance.Query;
  const _exec = Query.prototype.exec;

  if (!Query.prototype._klLoggerPatched) {    
    Query.prototype.by = function setQueryActor(actor) {
      this._klLoggerActor = actor;
      return this;
    };

      /**
     * Monkey-patches `exec` to add logger hook.
     * @param op the operation to be executed.
     * @param cb the callback.
     * @return {Promise}
     */
    Query.prototype.exec = function klLoggerPluginPatchedExec(_op, _cb) {
      const klLoggerActor = this._klLoggerActor;
      const klLoggerAttributes = this._klLoggerAttributes;
      if (!klLoggerActor && !klLoggerAttributes) {
        return _exec.call(this, _op, _cb);
      }

      let cb = _cb;
      let op = _op;

      if (typeof op === 'function') {
        cb = op;
        op = null;
      } else {
        cb = cb || (() => {});
      }
      const promise = createMongoosePromise(mongooseInstance, (resolve, reject) => {
        
        _exec.call(this, op, (err, result) => {
          if (err) {
            cb(err);
            reject(err);
            return;
          }
          if (!result) {
            cb(null, result);
            resolve(result);
            return;
          }
          try {
            if (Array.isArray(result)) {
              result.forEach(doc => {
                if (!doc instanceof Mongoose.Model) {
                  winston.warn(
                    'Query result is not model.' +
                    ' lean() results aren\'t supported by log attribution,' +
                    ' consider not using it');
                }
                if (klLoggerActor) {
                  setActor(doc, klLoggerActor, 0, mongooseInstance);
                }
                if (klLoggerAttributes) {
                  setAttributes(doc, klLoggerAttributes, 0, mongooseInstance);
                }
              });
            } else {
              if (klLoggerActor) {
                setActor(result, klLoggerActor, 0, mongooseInstance);
              }
              if (klLoggerAttributes) {
                setAttributes(result, klLoggerAttributes, 0, mongooseInstance);
              }
            }
            cb(null, result);
            resolve(result);
          } catch (error) {
            cb(err);
            reject(err);
          }
        });
      });
      return promise;
    };
  }
  Query.prototype._klLoggerLoggerPatched = true;
}
export function patchDocumentPrototype(mongooseInstance) {
  const Document = mongooseInstance.Model;

  if (!Document.prototype._klLoggerPatched) {
    Document.prototype._klLoggerPatched = true;    
    const origRegisterHooksFromSchema = Document.prototype.$__registerHooksFromSchema;
    Document.prototype.$__registerHooksFromSchema = function klLoggerPluginPatchedHooksRegistration(...args) {
      
      const registerHooksFromSchemaReturn = origRegisterHooksFromSchema.call(this, ...args);
      if (!this._klLoggerLoggerPatched) {
        this._klLoggerLoggerPatched = true;
        const origSave = this.save;
        const origRemove = this.remove;
        const origFindOneAndUpdate = Document.findOneAndUpdate;
        this.save = function klLoggerPluginPatchedSave(_op, _cb) {
          let cb = _cb;
          let op = _op;

          if (typeof op === 'function') {
            cb = op;
            op = null;
          }
          const calls = getTrace();
          if (calls.length && !this._klLoggerStaticContext) {
            this._klLoggerSaveCallStack = calls;
          }
          
          const promise = createMongoosePromise(mongooseInstance, (resolve, reject) => {
            origSave.call(this, op).then((savedDoc) => {
              if (calls.length) {
                savedDoc._klLoggerSaveCallStack = calls;
              }
              if (cb) {
                cb(undefined, savedDoc);
              }
              
              resolve(savedDoc);
            }).catch(error => {
              if (cb) {
                cb(error);
              }
              reject(error);
            });
          });
          return promise;
        };
        this.remove = function klLoggerPluginPatchedRemove(...removeArgs) {
          const calls = getTrace();
          if (calls.length) {
            this._klLoggerRemoveCallStack = calls;
          }
          return origRemove.call(this, ...removeArgs);
        };

        Document.findOneAndUpdate = function klLoggerPluginPatchedFindOneAndUpdate(...args) {
          const calls = getTrace();
          if (calls.length) {
            // Save the callstack to the querys options because 'this' refers to the model
            if (!args[2]) args[2] = {};
            args[2]._klLoggerSaveCallStack = calls;
          }
          return origFindOneAndUpdate.call(this, ...args);
        };
      }
      return registerHooksFromSchemaReturn;
    };
  }
}

export function plugin(mongooseInstance) {
  return (schema, options) => {
    const mOptions = mergeOptions(_options, options);
    const Logger = mOptions.logger;

    if (!Logger) {
      throw new Error('Logger must be set');
    }
    if (typeof Logger.log !== 'function') {
      throw new Error(
        'Logger must have a static function' +
        ' log(object, objectType, action, actor, when)'
      );
    }
    schema._klLoggerLogger = Logger;
    schema._klLoggerOptions = mOptions;


    function postSave(savedDoc, done)  {
      const opts = savedDoc._klLoggerOptions || savedDoc.schema._klLoggerOptions || _options;
      const when = new Date();
      const modelName = savedDoc.constructor.modelName;
      const objectType = `${opts.objectTypePrefix}${modelName}`;
      const modifiedPaths = savedDoc._klLoggerModifiedPaths;
      const attributes = loggableObject(savedDoc._klLoggerAttributes, undefined, mongooseInstance);
      const callStack = savedDoc._klLoggerSaveCallStack;
      const actor = loggableObject(savedDoc._klLoggerActor, undefined, mongooseInstance);

      let actorType = Actor.system;
      if (actor && actor.providerData) {
        delete actor.providerData;
        delete actor.apikey;
        actorType = Actor.user;
      }
      if (!actor) {
        winston.warn(`[save] actor not set for ${savedDoc}. Stack: ${callStack}`);
      }
      let action;
      let objectToLog;
      let logBehaviour;
      if (savedDoc._klLoggerIsNew) {
        action = Logger.action.created;
        logBehaviour = opts.if[action].by[actorType];
        if (!Object.keys(Behaviour).includes(logBehaviour)) {
          const defaultBehavior = _options.if[action].by[actorType];
          winston.error(
            `Unknown log Behaviour type [${logBehaviour}].` +
            ` Using default [${defaultBehavior}] instead`);
          logBehaviour = defaultBehavior;
        }
        objectToLog = savedDoc.loggableObject(pathsLoggedAlways, mongooseInstance);
        if (Behaviour.id !== logBehaviour) {
          // only 'snapshot' or 'id' are supported for creation event
          logBehaviour = Behaviour.snapshot;
          objectToLog.__snapshot = savedDoc.loggableObject();
        }
      } else {
        action = Logger.action.updated;
        logBehaviour = opts.if[action].by[actorType];
        if (!Object.keys(Behaviour).includes(logBehaviour)) {
          const defaultBehavior = _options.if[action].by[actorType];
          winston.error(
            `Unknown log Behaviour type [${logBehaviour}].` +
            ` Using default [${defaultBehavior}] instead`);
          logBehaviour = defaultBehavior;
        }
        //  see if anything has been changed
        const currentObject = savedDoc.loggableObject();
        const skip = [];
        Array.prototype.push.apply(skip, opts.skip);
        Array.prototype.push.apply(skip, pathsLoggedAlways);
        const delta = getDelta(savedDoc._klLoggerInitialDoc, currentObject, [], [], skip);
        if (!Object.keys(delta).length) {
          return done();
        }
        objectToLog = savedDoc.loggableObject(pathsLoggedAlways);
        switch (logBehaviour) {
          case Behaviour.snapshot: {
            objectToLog.__snapshot = savedDoc.loggableObject();
            break;
          }
          case Behaviour.delta: {
            objectToLog.__delta = getDelta(
              savedDoc._klLoggerInitialDoc, currentObject,
              pathsLoggedAlways, modifiedPaths, [], mongooseInstance);
          }
            break;
          case Behaviour.snapshotAndDelta: {
            objectToLog.__snapshot = savedDoc.loggableObject();
            objectToLog.__delta = getDelta(
              savedDoc._klLoggerInitialDoc, currentObject,
              pathsLoggedAlways, modifiedPaths, [], mongooseInstance);
          }
            break;
          case Behaviour.id:
            break;
          default: {
            return done(new Error(`(SNH) Unknown log behaviour is used [${logBehaviour}]`));
          }
        }
      }
      objectToLog.__logBehaviour = logBehaviour;
      savedDoc._klLoggerInitialDoc = savedDoc.loggableObject();
      return opts.logger.log({
        object: objectToLog, objectType, action, actor, when, attributes, callStack,
      }, done);
    }

    schema.pre('save', function preSave(next) {
      this._klLoggerModifiedPaths = this.modifiedPaths();
      this._klLoggerIsNew = this.isNew;
      next();
    });

    schema.pre('findOneAndUpdate', async function preUpdate(next) {
      const search = this._conditions || {};
      const options = this.options || {};
      const updated = cleanUpdateQuery(this._update);
      
      const callstack = options._klLoggerSaveCallStack;
      delete options._klLoggerSaveCallStack;      

      const existing = await this.findOne(search);
      if (existing) {
        this._klLoggerInitialDoc = existing.loggableObject();
      }

      this._klLoggerIsNew = !existing && options.upsert;
      this._klLoggerQuery = {
        ...search,
        ...updated,
      };
      this._klLoggerReturnsNew = options.new;
      this._klLoggerSaveCallStack = callstack;
      next();
    });

    schema.post('findOneAndUpdate', async function(result, done) {
      try {
        if (!this._klLoggerReturnsNew) {
          result = await this.findOne(this._klLoggerQuery);
        }
      
        if (!result) return done();
      
        result._klLoggerIsNew = this._klLoggerIsNew;
        result._klLoggerInitialDoc = this._klLoggerInitialDoc;
        result._klLoggerActor = this._klLoggerActor;
        result._klLoggerSaveCallStack = this._klLoggerSaveCallStack;

        postSave(result, done);
      } catch (err) {
        return done(err);
      }
    });  
    schema.post('save', postSave);
    schema.post('remove', (removedDoc, done) => {
      const opts = removedDoc.loggingOptions() || removedDoc.schema._klLoggerOptions || _options;
      const when = new Date();
      const modelName = removedDoc.constructor.modelName;
      const objectType = `${opts.objectTypePrefix}${modelName}`;
      const attributes = loggableObject(removedDoc._klLoggerAttributes, undefined, mongooseInstance);
      const actor = loggableObject(removedDoc._klLoggerActor, undefined, mongooseInstance);
      const callStack = removedDoc._klLoggerRemoveCallStack;
      let actorType = Actor.system;
      if (actor && actor.providerData) {
        delete actor.providerData;
        delete actor.apikey;
        actorType = Actor.user;
      }
      if (!actor) {
        winston.warn(`[remove] actor not set for ${removedDoc}`);
      }
      let logBehaviour = opts.if[Action.deleted].by[actorType];
      if (!Object.keys(Behaviour).includes(logBehaviour)) {
        const defaultBehavior = _options.if[Action.deleted].by[actorType];
        winston.error(
            `Unknown log Behaviour type [${logBehaviour}].` +
            ` Using default [${defaultBehavior}] instead`);
        logBehaviour = defaultBehavior;
      }
      const objectToLog = removedDoc.loggableObject(pathsLoggedAlways);
      if (Behaviour.id !== logBehaviour) {
        objectToLog.__snapshot = removedDoc.loggableObject();
      }
      objectToLog.__logBehaviour = logBehaviour;
      opts.logger.log({
        object: objectToLog, objectType, action: Logger.action.deleted,
        actor, when, attributes, callStack,
      }, done);
    });
    schema.post('init', function postInit(initiatedDoc, done) {
      this._klLoggerInitialDoc = initiatedDoc.loggableObject();
      done();
    });
    schema.methods.loggableObject = function getLoggableObject(pathsToLog) {
      return loggableObject(this._doc, pathsToLog, mongooseInstance);
    };
    schema.methods.by = function setModelActor(actor) {
      setActor(this, actor);
      this._klLoggerActor = actor;
      return this;
    };
    schema.methods.attr = function setModelAttributes(attributes) {
      setAttributes(this, attributes);
      return this;
    };
    schema.statics.setLoggingOptions = function modelStaticSetLoggingOptions(opts) {
      const moptions = mergeOptions(this.schema._klLoggerOptions || _options, opts);
      this.schema._klLoggerOptions = moptions;
    };
    schema.statics.loggingOptions = function modelStaticLoggingOptions() {
      const opts = this._klLoggerOptions || _options;
      return opts;
    };
    schema.loggingOptions = function schemaLoggingOptions() {
      const opts = this._klLoggerOptions || _options;
      return opts;
    };
    schema.setLoggingOptions = function schemaSetLoggingOptions(opts) {
      const moptions = mergeOptions(this._klLoggerOptions || _options, opts);
      this._klLoggerOptions = moptions;
    };
    schema.methods.setLoggingOptions = function documentSetLoggingOptions(opts) {
      const moptions = mergeOptions(
        this._klLoggerOptions || this.schema._klLoggerOptions || _options, opts);
      this._klLoggerOptions = moptions;
    };
    schema.methods.loggingOptions = function documentLoggingOptions() {
      const opts = this._klLoggerOptions || this.schema._klLoggerOptions || _options;
      return opts;
    };
  };
}

export function klLoggerPlugin(mongooseInstance) {
  patchDocumentPrototype(mongooseInstance);
  patchQueryPrototype(mongooseInstance);
  return plugin(mongooseInstance);
}
