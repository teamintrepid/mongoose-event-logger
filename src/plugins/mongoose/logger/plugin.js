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

  if (!Query.prototype._eventLoggerPatched) {    
    Query.prototype.by = function setQueryActor(actor) {
      this._eventLoggerActor = actor;
      return this;
    };

      /**
     * Monkey-patches `exec` to add logger hook.
     * @param op the operation to be executed.
     * @param cb the callback.
     * @return {Promise}
     */
    Query.prototype.exec = function eventLoggerPluginPatchedExec(_op, _cb) {
      const eventLoggerActor = this._eventLoggerActor;
      const eventLoggerAttributes = this._eventLoggerAttributes;
      if (!eventLoggerActor && !eventLoggerAttributes) {
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
                if (eventLoggerActor) {
                  setActor(doc, eventLoggerActor, 0, mongooseInstance);
                }
                if (eventLoggerAttributes) {
                  setAttributes(doc, eventLoggerAttributes, 0, mongooseInstance);
                }
              });
            } else {
              if (eventLoggerActor) {
                setActor(result, eventLoggerActor, 0, mongooseInstance);
              }
              if (eventLoggerAttributes) {
                setAttributes(result, eventLoggerAttributes, 0, mongooseInstance);
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
  Query.prototype._eventLoggerLoggerPatched = true;
}
export function patchDocumentPrototype(mongooseInstance) {
  const Document = mongooseInstance.Model;

  if (!Document.prototype._eventLoggerPatched) {
    Document.prototype._eventLoggerPatched = true;    
    const origRegisterHooksFromSchema = Document.prototype.$__registerHooksFromSchema;
    Document.prototype.$__registerHooksFromSchema = function eventLoggerPluginPatchedHooksRegistration(...args) {
      
      const registerHooksFromSchemaReturn = origRegisterHooksFromSchema.call(this, ...args);
      if (!this._eventLoggerLoggerPatched) {
        this._eventLoggerLoggerPatched = true;
        const origSave = this.save;
        const origRemove = this.remove;
        const origFindOneAndUpdate = Document.findOneAndUpdate;
        this.save = function eventLoggerPluginPatchedSave(_op, _cb) {
          let cb = _cb;
          let op = _op;

          if (typeof op === 'function') {
            cb = op;
            op = null;
          }
          const calls = getTrace();
          if (calls.length && !this._eventLoggerStaticContext) {
            this._eventLoggerSaveCallStack = calls;
          }
          
          const promise = createMongoosePromise(mongooseInstance, (resolve, reject) => {
            origSave.call(this, op).then((savedDoc) => {
              if (calls.length) {
                savedDoc._eventLoggerSaveCallStack = calls;
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
        this.remove = function eventLoggerPluginPatchedRemove(...removeArgs) {
          const calls = getTrace();
          if (calls.length) {
            this._eventLoggerRemoveCallStack = calls;
          }
          return origRemove.call(this, ...removeArgs);
        };

        Document.findOneAndUpdate = function eventLoggerPluginPatchedFindOneAndUpdate(...args) {
          const calls = getTrace();
          if (calls.length) {
            // Save the callstack to the querys options because 'this' refers to the model
            if (!args[2]) args[2] = {};
            args[2]._eventLoggerSaveCallStack = calls;
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
    schema._eventLoggerLogger = Logger;
    schema._eventLoggerOptions = mOptions;


    function postSave(savedDoc, done)  {
      const opts = savedDoc._eventLoggerOptions || savedDoc.schema._eventLoggerOptions || _options;
      const when = new Date();
      const modelName = savedDoc.constructor.modelName;
      const objectType = `${opts.objectTypePrefix}${modelName}`;
      const modifiedPaths = savedDoc._eventLoggerModifiedPaths;
      const attributes = loggableObject(savedDoc._eventLoggerAttributes, undefined, mongooseInstance);
      const callStack = savedDoc._eventLoggerSaveCallStack;
      const actor = loggableObject(savedDoc._eventLoggerActor, undefined, mongooseInstance);

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
      if (savedDoc._eventLoggerIsNew) {
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
        const delta = getDelta(savedDoc._eventLoggerInitialDoc, currentObject, [], [], skip);
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
              savedDoc._eventLoggerInitialDoc, currentObject,
              pathsLoggedAlways, modifiedPaths, [], mongooseInstance);
          }
            break;
          case Behaviour.snapshotAndDelta: {
            objectToLog.__snapshot = savedDoc.loggableObject();
            objectToLog.__delta = getDelta(
              savedDoc._eventLoggerInitialDoc, currentObject,
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
      savedDoc._eventLoggerInitialDoc = savedDoc.loggableObject();
      return opts.logger.log({
        object: objectToLog, objectType, action, actor, when, attributes, callStack,
      }, done);
    }

    schema.pre('save', function preSave(next) {
      this._eventLoggerModifiedPaths = this.modifiedPaths();
      this._eventLoggerIsNew = this.isNew;
      next();
    });

    schema.pre('findOneAndUpdate', async function preUpdate(next) {
      const search = this._conditions || {};
      const options = this.options || {};
      const updated = cleanUpdateQuery(this._update);
      
      const callstack = options._eventLoggerSaveCallStack;
      delete options._eventLoggerSaveCallStack;      

      const existing = await this.findOne(search);
      if (existing) {
        this._eventLoggerInitialDoc = existing.loggableObject();
      }

      this._eventLoggerIsNew = !existing && options.upsert;
      this._eventLoggerQuery = {
        ...search,
        ...updated,
      };
      this._eventLoggerReturnsNew = options.new;
      this._eventLoggerSaveCallStack = callstack;
      next();
    });

    schema.post('findOneAndUpdate', async function(result, done) {
      try {
        if (!this._eventLoggerReturnsNew) {
          result = await this.findOne(this._eventLoggerQuery);
        }
      
        if (!result) return done();
      
        result._eventLoggerIsNew = this._eventLoggerIsNew;
        result._eventLoggerInitialDoc = this._eventLoggerInitialDoc;
        result._eventLoggerActor = this._eventLoggerActor;
        result._eventLoggerSaveCallStack = this._eventLoggerSaveCallStack;

        postSave(result, done);
      } catch (err) {
        return done(err);
      }
    });  
    schema.post('save', postSave);
    schema.post('remove', (removedDoc, done) => {
      const opts = removedDoc.loggingOptions() || removedDoc.schema._eventLoggerOptions || _options;
      const when = new Date();
      const modelName = removedDoc.constructor.modelName;
      const objectType = `${opts.objectTypePrefix}${modelName}`;
      const attributes = loggableObject(removedDoc._eventLoggerAttributes, undefined, mongooseInstance);
      const actor = loggableObject(removedDoc._eventLoggerActor, undefined, mongooseInstance);
      const callStack = removedDoc._eventLoggerRemoveCallStack;
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
      this._eventLoggerInitialDoc = initiatedDoc.loggableObject();
      done();
    });
    schema.methods.loggableObject = function getLoggableObject(pathsToLog) {
      return loggableObject(this._doc, pathsToLog, mongooseInstance);
    };
    schema.methods.by = function setModelActor(actor) {
      setActor(this, actor);
      this._eventLoggerActor = actor;
      return this;
    };
    schema.methods.attr = function setModelAttributes(attributes) {
      setAttributes(this, attributes);
      return this;
    };
    schema.statics.setLoggingOptions = function modelStaticSetLoggingOptions(opts) {
      const moptions = mergeOptions(this.schema._eventLoggerOptions || _options, opts);
      this.schema._eventLoggerOptions = moptions;
    };
    schema.statics.loggingOptions = function modelStaticLoggingOptions() {
      const opts = this._eventLoggerOptions || _options;
      return opts;
    };
    schema.loggingOptions = function schemaLoggingOptions() {
      const opts = this._eventLoggerOptions || _options;
      return opts;
    };
    schema.setLoggingOptions = function schemaSetLoggingOptions(opts) {
      const moptions = mergeOptions(this._eventLoggerOptions || _options, opts);
      this._eventLoggerOptions = moptions;
    };
    schema.methods.setLoggingOptions = function documentSetLoggingOptions(opts) {
      const moptions = mergeOptions(
        this._eventLoggerOptions || this.schema._eventLoggerOptions || _options, opts);
      this._eventLoggerOptions = moptions;
    };
    schema.methods.loggingOptions = function documentLoggingOptions() {
      const opts = this._eventLoggerOptions || this.schema._eventLoggerOptions || _options;
      return opts;
    };
  };
}

export function eventLoggerPlugin(mongooseInstance) {
  patchDocumentPrototype(mongooseInstance);
  patchQueryPrototype(mongooseInstance);
  return plugin(mongooseInstance);
}
