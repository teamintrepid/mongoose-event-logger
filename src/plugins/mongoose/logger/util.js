const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const winston = require('winston');
const clone = require('clone');
const stackTrace = require('stack-trace');

function isDocument(doc, mongooseInstance = mongoose) {
  const Document = Object.getPrototypeOf(mongooseInstance).Document;
  return doc && doc._doc &&
    (
      doc.constructor.name === 'Document' ||
      doc.constructor.name === 'EmbeddedDocument' ||
      doc instanceof Document
    );
}

function isModel(doc, mongooseInstance = mongoose) {
  const Model = Object.getPrototypeOf(mongooseInstance).Model;
  return doc && doc._id && doc._doc &&
    (
      doc instanceof Model ||
      doc instanceof Model.prototype.model ||
      doc.constructor.name === 'model'
    );
}

function isAttributable(doc, mongooseInstance = mongoose) {
  const Model = Object.getPrototypeOf(mongooseInstance).Model;
  const Document = Object.getPrototypeOf(mongooseInstance).Document;
  return (doc && doc._doc &&
    (
      doc instanceof Model ||
      doc instanceof Document ||
      doc instanceof Model.prototype.model ||
      doc.constructor.name === 'model' ||
      doc.constructor.name === 'EmbeddedDocument' ||
      doc.constructor.name === 'Document'
    )
  );
}

export const pathsLoggedAlways = ['_id', '__v'];

/**
 * Returns difference between two version of the same objects
 * @param ev1 previous object version
 * @param ev2 current object version
 * @param pathsToInclude keys from current version that needs to be
   included in the result regardless of them being changed or not
 * @param modifiedPaths keys from current version that needs to be
   included in the result because it is known that they have been updated
 * @param skippedPaths keys that could be skipped during comparison
   and should not appear in the result. Useful for ignoring trivial changes
 * @return {Object}
 */
export function getDelta(
  ev1, ev2, pathsToInclude = pathsLoggedAlways,
  modifiedPaths = [], skippedPaths = [], mongooseInstance) {
  if (isAttributable(ev1, mongooseInstance)) {
    return getDelta(ev1._doc, ev2._doc, pathsToInclude);
  }
  const diff = {};
  const ev1Keys = Object.keys(ev1);
  const ev2Keys = Object.keys(ev2);
  const addedKeys = ev2Keys.filter(key => !ev1Keys.includes(key));
  const deletedKeys = ev1Keys.filter(key => !ev2Keys.includes(key));
  const existingKeys = ev1Keys.filter(key => ev2Keys.includes(key));
  for (const key of existingKeys) {
    if (skippedPaths.includes(key)) {
      continue;
    }
    if (pathsToInclude.includes(key)) {
      diff[key] = ev2[key];
      continue;
    }
    if (modifiedPaths.includes(key)) {
      diff[key] = ev2[key];
      if (JSON.stringify(ev2[key]) === JSON.stringify(ev1[key])) {
        winston.warn(
          `Logging [${key}] since it's in modifiedPaths although the value did not change`);
      }
      continue;
    }
    if (ev1[key] === ev2[key]) {
      continue;
    }
    if (ev2[key] === undefined) {
      deletedKeys.push(key);
      continue;
    }
    if (ev1[key] === undefined) {
      addedKeys.push(key);
      continue;
    }
    if (JSON.stringify(ev2[key]) !== JSON.stringify(ev1[key])) {
      if (ev1[key] === null) {
        diff[key] = ev2[key];
        continue;
      }
      if (ev2[key] === null) {
        diff[key] = null;
        continue;
      }
      if (ev1[key].constructor.name !== ev2[key].constructor.name) {
        diff[key] = ev2[key];
        continue;
      }
      if (ev1[key] instanceof ObjectId) {
        if (!ev1[key].equals(ev2[key])) {
          diff[key] = ev2[key];
        }
        continue;
      }
      if (isAttributable(ev1[key], mongooseInstance)) {
        const delta = getDelta(ev1[key]._doc, ev2[key]._doc, pathsLoggedAlways, [], [], mongooseInstance);
        if (Object.keys(delta).length) {
          diff[key] = delta;
        }
        continue;
      }
      if (!Array.isArray(ev1[key]) && typeof ev1[key] === 'object') {
        const delta = getDelta(ev1[key], ev2[key], pathsToInclude, [], [], mongooseInstance);
        if (Object.keys(delta).length) {
          diff[key] = delta;
        }
        continue;
      }
      diff[key] = ev2[key];
    }
  }
  for (const key of addedKeys) {
    diff[key] = ev2[key];
  }
  for (const key of deletedKeys) {
    diff[key] = '$DELETED';
  }
  if (deletedKeys.length) {
    diff.__deletedKeys = deletedKeys;
  }
  // console.log('=>', diff);
  return diff;
}

export function loggableObject(doc, pathsToLog, mongooseInstance = mongoose) {
  mongooseInstance = mongooseInstance || mongoose;
  if (!doc) {
    return undefined;
  }
  if (isDocument(doc, mongooseInstance) || isModel(doc, mongooseInstance)) {
    return loggableObject(doc._doc, pathsToLog, mongooseInstance);
  }
  if (typeof doc === 'string' || typeof doc === 'number' || typeof doc === 'boolean') {
    return clone(doc);
  }
  //  TODO: use `depopulate` after upgrading to mongoose 4.2
  //  https://github.com/Automattic/mongoose/commit/29f49d50c997ec20eae4233c3607f115d90b470c
  const logable = {};
  for (const propertyName of Object.keys(doc)) {
    if (propertyName[0] === '$') {
      winston.warn(`Skipping property ${propertyName} since it starts with $`);
      continue;
    }
    if (pathsToLog && !pathsToLog.includes(propertyName)) {
      continue;
    }
    const propertyValue = doc[propertyName];
    if (isModel(propertyValue, mongooseInstance)) {
      logable[propertyName] = clone(propertyValue._id, true);
    } else if (isDocument(propertyValue, mongooseInstance)) {
      const loggableValue = loggableObject(propertyValue._doc, undefined, mongooseInstance);
      logable[propertyName] = clone(loggableValue, true);
    } else if (Array.isArray(propertyValue)) {
      logable[propertyName] = [];
      for (const item of propertyValue) {
        if (!item || typeof item !== 'object') {
          logable[propertyName].push(clone(item, true));
        } else if (isModel(item, mongooseInstance)) {
          logable[propertyName].push(clone(item._id, true));
        } else if (isDocument(item, mongooseInstance)) {
          const logableItem = loggableObject(item._doc, undefined, mongooseInstance);
          logable[propertyName].push(logableItem);
        } else if (typeof item === 'object') {
          logable[propertyName].push(loggableObject(item, undefined, mongooseInstance));
        } else {
          logable[propertyName].push(clone(item, true));
        }
      }
    } else {
      try {
        logable[propertyName] = clone(propertyValue, true);
      } catch (error) {
        try {
          winston.log('verbose',
            `Context: ${propertyName},` +
            ` ${JSON.stringify(propertyValue, null, '')},` +
            ` ${typeof propertyValue} ${propertyValue.constructor.name}`);
          logable[propertyName] = JSON.parse(JSON.stringify(propertyValue));
        } catch (error2) {
          winston.error(
            `Can not get loggableObject from ${propertyName}` +
            ` of ${typeof propertyValue} ${propertyValue.constructor.name},` +
            ` stack ${error2.stack}`);
          throw error2;
        }
      }
    }
  }
  return logable;
}

export function mergeAttributes(currentAttributes, newAttributes) {
  if (!newAttributes) {
    return currentAttributes;
  }
  if (typeof newAttributes !== 'object') {
    throw new Error('Expected new attributes to be Object or Array,' +
    ` instead got [${typeof newAttributes}]`);
  }
  if (Array.isArray(newAttributes) && !newAttributes.length) {
    return currentAttributes;
  }
  if (typeof newAttributes === 'object' && !newAttributes.name) {
    return currentAttributes;
  }
  const attributes = currentAttributes || [];
  const attributesToMerge = !Array.isArray(newAttributes) ? [newAttributes] : newAttributes;
  for (const attribute of attributesToMerge) {
    const current = attributes.filter(attr => attr.name === attribute.name)[0];
    if (current) {
      current.value = attribute.value;
    } else {
      attributes.push(attribute);
    }
  }
  return attributes;
}
export function updateAttributes(model, spath, attributes) {
  setSpath(model, spath, mergeAttributes(getSpath(model, spath), attributes));
}

export function getSpath(object, spath) {
  if (spath === undefined || !spath.length) {
    return object;
  }
  const components = spath.split('.');
  let currentObject = object;
  for (let i = 0; i < components.length; i++) {
    if (Array.isArray(currentObject)) {
      currentObject = currentObject.map(item => getSpath(item, components.slice(i).join('.')));
      return currentObject;
    }
    if (currentObject[components[i]] === undefined) {
      return undefined;
    }
    if (currentObject[components[i]] === null) {
      return null;
    }
    currentObject = currentObject[components[i]];
  }
  return currentObject;
}

export function setSpath(object, spath, value) {
  if (spath === undefined) {
    throw new Error('spath is required');
  }
  const components = spath.split('.');
  if (!components.length) {
    return value;
  }
  let currentObject = object;
  for (let i = 0; i < components.length; i++) {
    if (Array.isArray(currentObject)) {
      const itemPath = components.slice(i).join('.');
      for (let j = 0; j < currentObject.length; j++) {
        const item = currentObject[j];
        const itemValue = Array.isArray(value) ? value[Math.min(j, value.length - 1)] : value;
        const resItem = setSpath(item, itemPath, itemValue);
        currentObject[j] = resItem;
      }
      return currentObject;
    }
    if (i === components.length - 1) {
      currentObject[components[components.length - 1]] = value;
      continue;
    }
    if (currentObject[components[i]] === undefined) {
      currentObject[components[i]] = {};
    }
    currentObject = currentObject[components[i]];
  }
  return object;
}


export function setProperty(
  model,
  spath,
  value,
  setValue = setSpath,
  getValue = getSpath,
  level = 0,
  mongooseInstance = mongoose) {
  if (level > 5) {
    winston.error('Maximum stack level reached in setProperty');
    return;
  }
  if (!model) {
    return;
  }
  if (isAttributable(model, mongooseInstance)) {
    setValue(model, spath, value);
  }
  const doc = model._doc;
  if (!doc) {
    return;
  }
  for (const propertyName of Object.keys(doc)) {
    const propertyValue = doc[propertyName];
    if (!propertyValue || typeof propertyValue !== 'object') {
      continue;
    }
    if (isAttributable(propertyValue, mongooseInstance) &&
      getValue(propertyValue, spath) === undefined
      ) {
      setProperty(propertyValue, spath, value, setValue, getValue, level + 1, mongooseInstance);
    } else if (Array.isArray(propertyValue)) {
      for (const item of propertyValue) {
        if (!item || typeof item !== 'object') {
          continue;
        }
        if (isAttributable(item, mongooseInstance) &&
          getValue(item, spath) === undefined) {
          setProperty(item, spath, value, setValue, getValue, level + 1, mongooseInstance);
        }
      }
    }
  }
}
export function setActor(model, actor, level = 0, mongooseInstance = mongoose) {
  return setProperty(model, '_klLoggerActor', actor, setSpath, getSpath, level, mongooseInstance);
}
export function setAttributes(model, attributes, level = 0, mongooseInstance = mongoose) {
  return setProperty(
    model, '_klLoggerAttributes', attributes,
    updateAttributes, getSpath, level, mongooseInstance);
}

export function meaningfulTrace(trace) {
  // console.log('aa', trace);
  return trace.fileName &&
  // no node_modules except starting with 'kal-'
  (trace.fileName.indexOf('node_modules') === -1 ||
    /^(?:(?!node_modules\/(?!kal-)).)*$/m.exec(trace.fileName)) &&
  trace.fileName.indexOf('plugins/mongoose/logger/') === -1 &&
  trace.fileName.indexOf('mongoose-kl-logger') === -1 &&
  // trace.fileName.indexOf('events-logger') === -1 &&
  trace.fileName !== 'node.js' &&
  trace.fileName !== 'timers.js' &&
  trace.fileName.indexOf('stream_readable.js') === -1 &&
  (!trace.typeName || trace.typeName !== 'Query') &&
  trace.native === false;
}

export function getTrace() {
  const traces = stackTrace.parse(new Error);
  const filteredTraces = traces.filter(meaningfulTrace);
  const calls = filteredTraces.map(trace => {
    const func = trace.methodName ?
    `${trace.typeName}.${trace.methodName}` :
    trace.functionName;
    return `${func}@${trace.fileName}:${trace.lineNumber}:${trace.columnNumber}`;
  });
  return calls;
}

export function lineNumber() {
  const traces = stackTrace.parse(new Error);
  const filteredTraces = traces.filter(meaningfulTrace);
  return filteredTraces[0].lineNumber;
}

export function fileName() {
  const traces = stackTrace.parse(new Error);
  const filteredTraces = traces.filter(meaningfulTrace);
  return filteredTraces[0].fileName;
}
