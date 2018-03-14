/*  global describe, it, before, after, beforeEach, afterEach */
/*  eslint-disable func-names */
/*  eslint-disable no-loop-func */
const should = require('should');
import { MongoClient } from 'mongodb';
import { pathsLoggedAlways, Actor, Behaviour, Action } from '../../index';
import { Sample, SampleItem, SampleSubItem, runSuite } from '../test';
import { lineNumber, fileName } from '../../plugins/mongoose/logger/util';
import { w } from '../util';
const config = require('../../config/config');
const collection = config.collection;

const ignoredObjectFields = ['__logBehaviour'];
const defaultTimeout = 1000;
const loggerInterval = 100;

function shouldHaveOnlyAllowedKeys(object, allowed) {
  const keys = Object.keys(object);
  const notAllowedKeys = keys.filter(key =>
    !pathsLoggedAlways.includes(key) &&
    !allowed.includes(key) &&
    !ignoredObjectFields.includes(key)
  );
  notAllowedKeys.should.have.lengthOf(0);
}
function shouldHavePathsLoggedAlways(object) {
  for (const path of pathsLoggedAlways) {
    object.should.have.a.property(path);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
const currentFileName = fileName();

describe('Events logging', function () {
  this.timeout(defaultTimeout);
  let db;
  beforeEach('Open connection', w(async () => {
    db = await MongoClient.connect(config.url);
  }));
  afterEach('Close connection', w(async () => {
    await db.close();
  }));
  runSuite('Document changes', () => {
    it('should log complete deleted object when document is removed', w(async () => {
      const sample = await new Sample({ name: 'some' }).by('specs').save();
      await sample.remove();
      const line = lineNumber();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'deleted',
          actor: 'specs',
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const event = loggedEvents[0];
      const object = event.object.__snapshot;
      object.should.have.a.property('name', sample.name);
      object.should.have.a.property('createdAt', sample.createdAt);
      event.should.have.a.property('callStack');
      event.callStack[0].includes(`${currentFileName}:${line - 1}`).should.be.ok();
    }));
    it('should log complete created object when document is created', w(async () => {
      const sample = await new Sample({ name: 'some' }).by('specs').save();
      const line = lineNumber();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'created',
          actor: 'specs',
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const event = loggedEvents[0];
      const object = event.object.__snapshot;
      object.should.have.a.property('name', sample.name);
      object.should.have.a.property('createdAt', sample.createdAt);
      event.should.have.a.property('callStack');
      event.callStack[0].includes(`${currentFileName}:${line - 1}`).should.be.ok();
    }));
    it('should not log an event when no document fields were updated', w(async () => {
      const sample = await new Sample({ name: 'some' }).by('specs').save();
      const when = new Date();
      await sleep(1);
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(0);
    }));
    it('should log only updated fields if scalar value has been updated', w(async () => {
      const sample = await new Sample({ name: 'some' }).by('specs').save();
      const when = new Date();
      await sleep(1);
      sample.name = 'some 2';
      await sample.save();
      const line = lineNumber();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const updateEvent = loggedEvents[0];
      const object = updateEvent.object.__delta;
      shouldHaveOnlyAllowedKeys(object, ['name']);
      object.should.have.a.property('name', sample.name);
      updateEvent.should.have.a.property('callStack');
      updateEvent.callStack[0].includes(`${currentFileName}:${line - 1}`).should.be.ok();
    }));
    it('should log only updated fields if scalar property has been unset', w(async () => {
      const sample = await new Sample({ name: 'some' }).by('specs').save();
      const when = new Date();
      await sleep(1);
      delete sample._doc.name;
      await sample.save();
      const line = lineNumber();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const updateEvent = loggedEvents[0];
      const object = updateEvent.object.__delta;
      shouldHaveOnlyAllowedKeys(object, ['name', '__deletedKeys']);
      object.should.have.a.property('__deletedKeys');
      object.__deletedKeys.should.have.lengthOf(1);
      object.__deletedKeys[0].should.be.equal('name');
      object.should.have.a.property('name');
      object.name.should.be.equal('$DELETED');
      updateEvent.should.have.a.property('callStack');
      updateEvent.callStack[0].includes(`${currentFileName}:${line - 1}`).should.be.ok();
    }));
    it('should log only updated fields if removed one array item', w(async () => {
      const sample = await new Sample({
        name: 'some',
        strings: ['A', 'B', 'C'],
      }).by('specs').save();
      const when = new Date();
      await sleep(1);
      sample.strings.pop();
      await sample.save();
      const line = lineNumber();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const updateEvent = loggedEvents[0];
      const object = updateEvent.object.__delta;
      shouldHaveOnlyAllowedKeys(object, ['strings']);
      object.strings.should.have.lengthOf(2);
      updateEvent.should.have.a.property('callStack');
      updateEvent.callStack[0].includes(`${currentFileName}:${line - 1}`).should.be.ok();
    }));
    it('should log only updated fields if added one array item', w(async () => {
      const sample = await new Sample({
        name: 'some',
        strings: ['A', 'B', 'C'],
      }).by('specs').save();
      const when = new Date();
      await sleep(1);
      sample.strings.push('D');
      await sample.save();
      const line = lineNumber();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const updateEvent = loggedEvents[0];
      const object = updateEvent.object.__delta;
      shouldHaveOnlyAllowedKeys(object, ['strings']);
      object.strings.should.have.lengthOf(4);
      updateEvent.should.have.a.property('callStack');
      updateEvent.callStack[0].includes(`${currentFileName}:${line - 1}`).should.be.ok();
    }));
    it('should log only updated fields if updated an array element', w(async () => {
      const sample = await new Sample({
        name: 'some',
        strings: ['A', 'B', 'C'],
      }).by('specs').save();
      const when = new Date();
      await sleep(1);
      sample.strings[0] = 'Z';
      await sample.save();
      const line = lineNumber();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const updateEvent = loggedEvents[0];
      const object = updateEvent.object.__delta;
      shouldHaveOnlyAllowedKeys(object, ['strings']);
      object.strings.toString().should.be.equal(sample.strings.toString());
      updateEvent.should.have.a.property('callStack');
      updateEvent.callStack[0].includes(`${currentFileName}:${line - 1}`).should.be.ok();
    }));
    it('should log only updated fields if completely replaced an array', w(async () => {
      const sample = await new Sample({
        name: 'some',
        strings: ['A', 'B', 'C'],
      }).by('specs').save();
      const when = new Date();
      await sleep(1);
      sample.strings = ['D', 'E', 'F'];
      await sample.save();
      const line = lineNumber();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const updateEvent = loggedEvents[0];
      const object = updateEvent.object.__delta;
      shouldHaveOnlyAllowedKeys(object, ['strings']);
      object.strings.toString().should.be.equal(sample.strings.toString());
      updateEvent.should.have.a.property('callStack');
      updateEvent.callStack[0].includes(`${currentFileName}:${line - 1}`).should.be.ok();
    }));
    it('should not log if replaced array with the same array', w(async () => {
      const sample = await new Sample({
        name: 'some',
        strings: ['A', 'B', 'C'],
      }).by('specs').save();
      const when = new Date();
      await sleep(1);
      sample.strings = ['A', 'B', 'C'];
      await sample.save();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(0);
    }));
    it('should log if replaced array with different array', w(async () => {
      const sample = await new Sample({
        name: 'some',
        strings: ['A', 'B', 'C'],
      }).by('specs').save();
      const when = new Date();
      await sleep(1);
      sample.strings = ['D', 'E', 'F'];
      await sample.save();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const updateEvent = loggedEvents[0];
      const object = updateEvent.object.__delta;
      shouldHaveOnlyAllowedKeys(object, ['strings']);
      object.strings.toString().should.be.equal(sample.strings.toString());
    }));
  });
  runSuite('Document changes using findOneAndUpdate', () => {
    let sample;
    it('should log object snapshot if created using findOneAndUpdate without new doc', w(async () => {
        const when = new Date();
        await sleep(1);
        const line = lineNumber();
        await Sample.findOneAndUpdate(
          { code: 'xxxxx' },
          {
            code: 'asasas',
            name: 'some name',
          },
          { upsert: true, new: false }
        ).by('specs').exec();
        sample = await Sample.findOne({ code: 'asasas' });
        await sample.remove();
        await sleep(loggerInterval);

        const loggedEvents = await db.collection(collection)
          .find({
            'object._id': sample._id,
            objectType: 'Sample',
            action: 'created',
            actor: 'specs',
            when: { $gte: when },
          }).toArray();
        
        loggedEvents.should.have.lengthOf(1);
        const updateEvent = loggedEvents[0];
        shouldHavePathsLoggedAlways(updateEvent.object);
        updateEvent.object.should.have.a.property('__logBehaviour', Behaviour.snapshot);
        updateEvent.object.should.have.a.property('__snapshot');
        updateEvent.object.should.not.have.a.property('__delta');
        const object = updateEvent.object.__snapshot;
        object.should.have.a.property('code', 'asasas')
        updateEvent.should.have.a.property('callStack');
        updateEvent.callStack[0].includes(`${currentFileName}:${line + 1}`).should.be.ok();
      }));
      it('should log object snapshot if created using findOneAndUpdate', w(async () => {
        const when = new Date();
        await sleep(1);
        const line = lineNumber();
        const sample = await Sample.findOneAndUpdate(
          { code: 'xxxxx' },
          {
            code: 'asasas',
            name: 'some name',
          },
          { upsert: true, new: true }
        ).by('specs').exec();
        await sample.by('specs').remove();
        await sleep(loggerInterval);

        const loggedEvents = await db.collection(collection)
          .find({
            'object._id': sample._id,
            objectType: 'Sample',
            action: 'created',
            actor: 'specs',
            when: { $gte: when },
          }).toArray();
        
        loggedEvents.should.have.lengthOf(1);
        const updateEvent = loggedEvents[0];
        shouldHavePathsLoggedAlways(updateEvent.object);
        updateEvent.object.should.have.a.property('__logBehaviour', Behaviour.snapshot);
        updateEvent.object.should.have.a.property('__snapshot');
        updateEvent.object.should.not.have.a.property('__delta');
        const object = updateEvent.object.__snapshot;
        object.should.have.a.property('code', 'asasas')
        updateEvent.should.have.a.property('callStack');
        updateEvent.callStack[0].includes(`${currentFileName}:${line + 1}`).should.be.ok();
      }));
      it('should log object delta if updated using findOneAndUpdate', w(async () => {
        const sample = await new Sample({ code: 'xxxxxx', name: 'blah' }).by('specs').save();
        const when = new Date();
        await sleep(1);
        const line = lineNumber();
        await Sample.findOneAndUpdate(
          { _id: sample._id },
          {
            code: 'asasas',
            name: 'blah',
          },
          { upsert: false, new: true }
        ).by('specs').exec();
        await sample.by('specs').remove();
        await sleep(loggerInterval);

        const loggedEvents = await db.collection(collection)
          .find({
            'object._id': sample._id,
            objectType: 'Sample',
            action: 'updated',
            actor: 'specs',
            when: { $gte: when },
          }).toArray();
        
        loggedEvents.should.have.lengthOf(1);
        const updateEvent = loggedEvents[0];
        shouldHavePathsLoggedAlways(updateEvent.object);
        updateEvent.object.should.have.a.property('__logBehaviour', Behaviour.delta);
        updateEvent.object.should.have.a.property('__delta');
        const object = updateEvent.object.__delta;
        object.should.have.a.property('code', 'asasas')
        object.should.not.have.a.property('name')
        updateEvent.should.have.a.property('callStack');
        updateEvent.callStack[0].includes(`${currentFileName}:${line + 1}`).should.be.ok();
      }));
  });
  runSuite('Logging options', () => {
    it('should set logging options', w(async () => {
      const sample = await new Sample({ name: 'some' }).by('specs').save();
      sample.setLoggingOptions({ skip: ['name'] });
      const options = sample.loggingOptions();
      options.should.have.a.property('skip');
      options.skip[0].should.be.equal('name');
    }));
  });
  runSuite('with log behaviour [delta]', () => {
    let sample;
    beforeEach('create sample', w(async () => {
      sample = await new Sample({
        name: 'some',
        strings: ['A', 'B', 'C'],
      }).by('specs').save();
      const options = sample.loggingOptions();
      options.if[Action.updated].by[Actor.system] = Behaviour.delta;
      options.if[Action.created].by[Actor.system] = Behaviour.delta;
      options.if[Action.deleted].by[Actor.system] = Behaviour.delta;
      sample.setLoggingOptions(options);
    }));
    it('should not log when only skipped properties are changed', w(async () => {
      sample.setLoggingOptions({ skip: ['name'] });
      sample.name = 'some1';
      const when = new Date();
      await sleep(1);
      await sample.save();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(0);
    }));
    it('should log all properties that are changed including skipped if at least one non-skipped property was changed', w(async () => {
      sample.setLoggingOptions({ skip: ['name'] });
      sample.name = 'some1';
      sample.code = 'FFCC0A';
      const when = new Date();
      await sleep(1);
      await sample.save();
      const line = lineNumber();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const updateEvent = loggedEvents[0];
      shouldHavePathsLoggedAlways(updateEvent.object);
      updateEvent.object.should.have.a.property('__logBehaviour', Behaviour.delta);
      updateEvent.object.should.have.a.property('__delta');
      updateEvent.object.should.not.have.a.property('__snapshot');
      const object = updateEvent.object.__delta;
      shouldHaveOnlyAllowedKeys(object, ['name', 'code']);
      object.should.have.a.property('name', sample.name);
      object.should.have.a.property('code', sample.code);
      updateEvent.should.have.a.property('callStack');
      updateEvent.callStack[0].includes(`${currentFileName}:${line - 1}`).should.be.ok();
    }));
  });
  runSuite('with log behaviour [snapshot]', () => {
    let sample;
    beforeEach('create sample', w(async () => {
      sample = await new Sample({
        name: 'some1',
        strings: ['A', 'B', 'C'],
      }).by('specs').save();
      const options = sample.loggingOptions();
      options.if[Action.updated].by[Actor.system] = Behaviour.snapshot;
      options.if[Action.created].by[Actor.system] = Behaviour.snapshot;
      options.if[Action.deleted].by[Actor.system] = Behaviour.snapshot;
      sample.setLoggingOptions(options);
    }));
    it('should not log when only skipped properties are changed', w(async () => {
      sample.setLoggingOptions({ skip: ['name'] });
      sample.name = 'some';
      const when = new Date();
      await sleep(1);
      await sample.save();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(0);
    }));
    it('should log object snapshot if at least one non-skipped property was changed', w(async () => {
      sample.setLoggingOptions({ skip: ['name'] });
      sample.name = 'some1';
      sample.code = 'FFCC0A';
      const when = new Date();
      await sleep(1);
      await sample.save();
      const line = lineNumber();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const updateEvent = loggedEvents[0];
      shouldHavePathsLoggedAlways(updateEvent.object);
      updateEvent.object.should.have.a.property('__logBehaviour', Behaviour.snapshot);
      updateEvent.object.should.have.a.property('__snapshot');
      updateEvent.object.should.not.have.a.property('__delta');
      const object = updateEvent.object.__snapshot;
      for (const key of Object.keys(sample._doc)) {
        object.should.have.a.property(key);
        should(object[key].toString()).be.equal(sample._doc[key].toString());
      }
      updateEvent.should.have.a.property('callStack');
      updateEvent.callStack[0].includes(`${currentFileName}:${line - 1}`).should.be.ok();
    }));
    it('should not log when only skipped properties are changed', w(async () => {
      sample.setLoggingOptions({ skip: ['name'] });
      sample.name = 'some1';
      const when = new Date();
      await sleep(1);
      await sample.save();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(0);
    }));
    it('should log object snapshot if at least one non-skipped property was changed', w(async () => {
      sample.setLoggingOptions({ skip: ['name'] });
      sample.name = 'some';
      sample.code = 'FFCC0B';
      const when = new Date();
      await sleep(1);
      await sample.save();
      const line = lineNumber();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const updateEvent = loggedEvents[0];
      shouldHavePathsLoggedAlways(updateEvent.object);
      updateEvent.object.should.have.a.property('__logBehaviour', Behaviour.snapshot);
      updateEvent.object.should.have.a.property('__snapshot');
      updateEvent.object.should.not.have.a.property('__delta');
      const object = updateEvent.object.__snapshot;
      for (const key of Object.keys(sample._doc)) {
        object.should.have.a.property(key);
        should(object[key].toString()).be.equal(sample._doc[key].toString());
      }
      updateEvent.should.have.a.property('callStack');
      updateEvent.callStack[0].includes(`${currentFileName}:${line - 1}`).should.be.ok();
    }));
    it('should log object snapshot when it was deleted', w(async () => {
      const when = new Date();
      await sleep(1);
      await sample.remove();
      const line = lineNumber();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'deleted',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const event = loggedEvents[0];
      shouldHavePathsLoggedAlways(event.object);
      event.object.should.have.a.property('__logBehaviour', Behaviour.snapshot);
      event.object.should.have.a.property('__snapshot');
      event.object.should.not.have.a.property('__delta');
      const object = event.object.__snapshot;
      for (const key of Object.keys(sample._doc)) {
        object.should.have.a.property(key);
        should(object[key].toString()).be.equal(sample._doc[key].toString());
      }
      event.should.have.a.property('callStack');
      event.callStack[0].includes(`${currentFileName}:${line - 1}`).should.be.ok();
    }));
    it('should log object snapshot when it is created', w(async () => {
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'created',
          actor: 'specs',
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const event = loggedEvents[0];
      shouldHavePathsLoggedAlways(event.object);
      event.object.should.have.a.property('__logBehaviour', Behaviour.snapshot);
      event.object.should.have.a.property('__snapshot');
      event.object.should.not.have.a.property('__delta');
      const object = event.object.__snapshot;
      for (const key of Object.keys(sample._doc)) {
        object.should.have.a.property(key);
        should(object[key].toString()).be.equal(sample._doc[key].toString());
      }
    }));
    let newSample = {};
    it('should log object snapshot if created using findOneAndUpdate', w(async () => {
      const when = new Date();
      await sleep(1);
      const line = lineNumber();      
      newSample = await Sample.findOneAndUpdate(
        { code: 'AF1239' },
        { code: 'FF1122' },
        { upsert: true, new: true }
      ).by('specs').exec();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': newSample._id,
          objectType: 'Sample',
          action: 'created',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const updateEvent = loggedEvents[0];
      shouldHavePathsLoggedAlways(updateEvent.object);
      updateEvent.object.should.have.a.property('__logBehaviour', Behaviour.snapshot);
      updateEvent.object.should.have.a.property('__snapshot');
      updateEvent.object.should.not.have.a.property('__delta');
      const object = updateEvent.object.__snapshot;
      for (const key of Object.keys(newSample._doc)) {
        object.should.have.a.property(key);
        should(object[key].toString()).be.equal(newSample._doc[key].toString());
      }
      updateEvent.should.have.a.property('callStack');
      updateEvent.callStack[0].includes(`${currentFileName}:${line + 1}`).should.be.ok();
    }));
    it('should log object snapshot if updated using findOneAndUpdate', w(async () => {
      const when = new Date();
      await sleep(1);
      const line = lineNumber();      
      newSample = await Sample.findOneAndUpdate(
        { _id: newSample._id },
        { code: 'FF1123' },
        { upsert: true, new: true }
      ).by('specs').exec();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': newSample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const updateEvent = loggedEvents[0];
      shouldHavePathsLoggedAlways(updateEvent.object);
      updateEvent.object.should.have.a.property('__logBehaviour', Behaviour.snapshot);
      updateEvent.object.should.have.a.property('__snapshot');
      updateEvent.object.should.not.have.a.property('__delta');
      const object = updateEvent.object.__snapshot;
      for (const key of Object.keys(newSample._doc)) {
        object.should.have.a.property(key);
        should(object[key].toString()).be.equal(newSample._doc[key].toString());
      }
      updateEvent.should.have.a.property('callStack');
      updateEvent.callStack[0].includes(`${currentFileName}:${line + 1}`).should.be.ok();
    }));
  });
  runSuite('with log behaviour [snapshotAndDelta]', () => {
    let sample;
    beforeEach('create sample', w(async () => {
      sample = await new Sample({
        name: 'some',
        strings: ['A', 'B', 'C'],
      }).by('specs').save();
      const options = sample.loggingOptions();
      options.if[Action.updated].by[Actor.system] = Behaviour.snapshotAndDelta;
      options.if[Action.created].by[Actor.system] = Behaviour.snapshotAndDelta;
      options.if[Action.deleted].by[Actor.system] = Behaviour.snapshotAndDelta;
      sample.setLoggingOptions(options);
      Sample.setLoggingOptions(options);
    }));
    it('should not log when only skipped properties are changed', w(async () => {
      sample.setLoggingOptions({ skip: ['name'] });
      sample.name = 'some1';
      const when = new Date();
      await sleep(1);
      await sample.save();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(0);
    }));
    it('should log object snapshot and delta if at least one non-skipped property was changed', w(async () => {
      sample.setLoggingOptions({ skip: ['name'] });
      sample.name = 'some1';
      sample.code = 'FFCC0A';
      const when = new Date();
      await sleep(1);
      await sample.save();
      const line = lineNumber();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const updateEvent = loggedEvents[0];
      shouldHavePathsLoggedAlways(updateEvent.object);
      updateEvent.object.should.have.a.property('__logBehaviour', Behaviour.snapshotAndDelta);
      updateEvent.object.should.have.a.property('__snapshot');
      updateEvent.object.should.have.a.property('__delta');
      const snapshot = updateEvent.object.__snapshot;
      for (const key of Object.keys(sample._doc)) {
        snapshot.should.have.a.property(key);
        should(snapshot[key].toString()).be.equal(sample._doc[key].toString());
      }
      const delta = updateEvent.object.__delta;
      shouldHaveOnlyAllowedKeys(delta, ['name', 'code']);
      delta.should.have.a.property('name', sample.name);
      delta.should.have.a.property('code', sample.code);
      updateEvent.should.have.a.property('callStack');
      updateEvent.callStack[0].includes(`${currentFileName}:${line - 1}`).should.be.ok();
    }));
    it('should log object delta if updated using findOneAndUpdate', w(async () => {
      const when = new Date();
      await sleep(1);
      const line = lineNumber();      
      sample = await Sample.findOneAndUpdate(
        { _id: sample._id },
        { code: 'FF1123' },
        { upsert: true, new: true }
      ).by('specs').exec();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const updateEvent = loggedEvents[0];
      shouldHavePathsLoggedAlways(updateEvent.object);
      updateEvent.object.should.have.a.property('__logBehaviour', Behaviour.snapshotAndDelta);
      updateEvent.object.should.have.a.property('__snapshot');
      updateEvent.object.should.have.a.property('__delta');
      const snapshot = updateEvent.object.__snapshot;
      for (const key of Object.keys(sample._doc)) {
        snapshot.should.have.a.property(key);
        should(snapshot[key].toString()).be.equal(sample._doc[key].toString());
      }
      const delta = updateEvent.object.__delta;
      shouldHaveOnlyAllowedKeys(delta, ['code']);
      delta.should.have.a.property('code', sample.code);
      updateEvent.should.have.a.property('callStack');
      updateEvent.callStack[0].includes(`${currentFileName}:${line + 1}`).should.be.ok();
    }));
  });
  runSuite('with log behaviour [id]', () => {
    let sample;
    beforeEach('create sample', w(async () => {
      sample = await new Sample({
        name: 'some',
        strings: ['A', 'B', 'C'],
      }).by('specs').save();
      const options = sample.loggingOptions();
      options.if[Action.updated].by[Actor.system] = Behaviour.id;
      options.if[Action.deleted].by[Actor.system] = Behaviour.id;
      options.if[Action.created].by[Actor.system] = Behaviour.id;
      sample.setLoggingOptions(options);
      Sample.setLoggingOptions(options);
    }));
    it('should not log when only skipped properties are changed', w(async () => {
      sample.setLoggingOptions({ skip: ['name'] });
      sample.name = 'some1';
      const when = new Date();
      await sleep(1);
      await sample.save();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(0);
    }));
    it('should log object id if at least one non-skipped property was changed', w(async () => {
      sample.setLoggingOptions({ skip: ['name'] });
      sample.name = 'some1';
      sample.code = 'FFCC0A';
      const when = new Date();
      await sleep(1);
      await sample.save();
      const line = lineNumber();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const updateEvent = loggedEvents[0];
      shouldHavePathsLoggedAlways(updateEvent.object);
      updateEvent.object.should.have.a.property('__logBehaviour', Behaviour.id);
      updateEvent.should.have.a.property('callStack');
      updateEvent.callStack[0].includes(`${currentFileName}:${line - 1}`).should.be.ok();
    }));
    it('should only log object id when the document was deleted', w(async () => {
      const when = new Date();
      await sleep(1);
      await sample.remove();
      const line = lineNumber();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'deleted',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const event = loggedEvents[0];
      shouldHavePathsLoggedAlways(event.object);
      shouldHaveOnlyAllowedKeys(event.object, []);
      event.object.should.have.a.property('__logBehaviour', Behaviour.id);
      event.should.have.a.property('callStack');
      event.callStack[0].includes(`${currentFileName}:${line - 1}`).should.be.ok();
    }));
    it('should only log object id when it is created', w(async () => {
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'created',
          actor: 'specs',
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const event = loggedEvents[0];
      shouldHavePathsLoggedAlways(event.object);
      shouldHaveOnlyAllowedKeys(event.object, []);
      event.object.should.have.a.property('__logBehaviour', Behaviour.id);
    }));
    it('should log object id if updated using findOneAndUpdate', w(async () => {
      const when = new Date();
      await sleep(1);
      const line = lineNumber();      
      sample = await Sample.findOneAndUpdate(
        { _id: sample._id },
        { code: 'FF1123' },
        { upsert: true, new: true }
      ).by('specs').exec();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sample._id,
          objectType: 'Sample',
          action: 'updated',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const updateEvent = loggedEvents[0];
      updateEvent.object.should.have.a.property('__logBehaviour', Behaviour.id);
      updateEvent.object.should.not.have.a.property('__snapshot');
      updateEvent.object.should.not.have.a.property('__delta');
      shouldHavePathsLoggedAlways(updateEvent.object);
      shouldHaveOnlyAllowedKeys(updateEvent.object, []);

      updateEvent.object.should.have.a.property('_id');
      updateEvent.object._id.toString().should.be.equal(sample._id.toString());
      updateEvent.should.have.a.property('callStack');
      updateEvent.callStack[0].includes(`${currentFileName}:${line + 1}`).should.be.ok();
    }));
  });
  runSuite('with object type prefix', () => {
    it('should use prefix set when applying plugin', w(async () => {
      const when = new Date();
      const sampleItem = await new SampleItem({ name: 'some' }).by('specs').save();
      const line = lineNumber();
      const modelOpts = sampleItem.loggingOptions();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sampleItem._id,
          objectType: `${modelOpts.objectTypePrefix}SampleItem`,
          action: 'created',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const event = loggedEvents[0];
      event.should.have.a.property('callStack');
      event.callStack[0].includes(`${currentFileName}:${line - 1}`).should.be.ok();
    }));
    it('should use prefix set on the document level', w(async () => {
      const sampleItem = new SampleItem({ name: 'some' }).by('specs');
      const modelOpts = sampleItem.loggingOptions();
      modelOpts.objectTypePrefix = 'X';
      sampleItem.setLoggingOptions(modelOpts);
      const when = new Date();
      await sampleItem.save();
      const line = lineNumber();
      await sleep(loggerInterval);
      const loggedEvents = await db.collection(collection)
        .find({
          'object._id': sampleItem._id,
          objectType: `${modelOpts.objectTypePrefix}SampleItem`,
          action: 'created',
          actor: 'specs',
          when: { $gte: when },
        }).toArray();
      loggedEvents.should.have.lengthOf(1);
      const event = loggedEvents[0];
      event.should.have.a.property('callStack');
      event.callStack[0].includes(`${currentFileName}:${line - 1}`).should.be.ok();
    }));
  });
});

describe('Model functions', () => {
  runSuite('Creating', () => {
    it('should create a document', w(async () => {
      const doc = new Sample({}).by('specs');
      const sample = await doc.save();
      sample.should.have.a.property('_klLoggerActor', 'specs');
      should(sample).not.be.undefined();
    }));
  });
  runSuite('Fetching', () => {
    it('should fetch a document with findById', w(async () => {
      const sample = await (new Sample({}).by('specs').save());
      sample.should.have.a.property('_klLoggerActor', 'specs');
      const retrieved = await Sample.findById(sample._id).by('specs').exec();
      should(retrieved).not.be.undefined();
      retrieved.should.have.a.property('_id', sample._id);
      retrieved.should.have.a.property('_klLoggerActor', 'specs');
    }));
    it('should fetch the document with findOne', w(async () => {
      const name = Math.random().toFixed(4);
      const sample = await (new Sample({ name }).by('specs').save());
      sample.should.have.a.property('_klLoggerActor', 'specs');
      const retrieved = await Sample.findOne({ name }).by('specs').exec();
      should(retrieved).not.be.undefined();
      retrieved.should.have.a.property('_id', sample._id);
      retrieved.should.have.a.property('_klLoggerActor', 'specs');
    }));
    it('should fetch the document with find', w(async () => {
      const name = Math.random().toFixed(4);
      await (new Sample({ name }).by('specs').save());
      const retrieved = await Sample.find({ name }).by('specs').exec();
      (retrieved.length > 0).should.be.ok();
      for (const item of retrieved) {
        item.should.have.a.property('_klLoggerActor', 'specs');
      }
    }));
    it('should fetch the document with population', w(async () => {
      const name = Math.random().toFixed(4);
      const sampleItem = await (new SampleItem(
        { name: Math.random().toFixed(4) }
        ).by('specs').save());
      sampleItem.should.have.a.property('_klLoggerActor', 'specs');
      const sample = await (new Sample({ name, items: [sampleItem] }).by('specs').save());
      sample.should.have.a.property('_klLoggerActor', 'specs');
      const promise = Sample.findById(sample._id).populate('items').by('specs').exec();
      const retrieved = await promise;
      should(retrieved).be.ok();
      retrieved.should.have.a.property('_klLoggerActor', 'specs');
      should(retrieved.items).have.lengthOf(1);
      const retrievedItem = retrieved.items[0];
      retrievedItem.should.have.property('name', sampleItem.name);
      retrievedItem.should.have.a.property('_klLoggerActor', 'specs');
    }));
    it('should fetch document with deep population', w(async () => {
      const name = Math.random().toFixed(4);
      const sampleSubItem = await (new SampleSubItem(
        { name: Math.random().toFixed(4) }
        ).by('specs').save());
      sampleSubItem.should.have.a.property('_klLoggerActor', 'specs');
      const sampleItem = await (new SampleItem(
        { name: Math.random().toFixed(4), items: [sampleSubItem] }
        ).by('specs').save());
      sampleItem.should.have.a.property('_klLoggerActor', 'specs');
      const sample = await (new Sample({ name, items: [sampleItem] }).by('specs').save());
      sample.should.have.a.property('_klLoggerActor', 'specs');
      const promise = Sample.findById(sample._id).deepPopulate('items.items').by('specs').exec();
      const retrieved = await promise;
      should(retrieved).be.ok();
      retrieved.should.have.a.property('_klLoggerActor', 'specs');
      should(retrieved.items).have.lengthOf(1);
      const retrievedItem = retrieved.items[0];
      retrievedItem.should.have.a.property('_klLoggerActor', 'specs');
      should(retrievedItem.items).have.lengthOf(1);
      const retrievedSubItem = retrievedItem.items[0];
      retrievedSubItem.should.have.property('name', sampleSubItem.name);
      retrievedSubItem.should.have.a.property('_klLoggerActor', 'specs');
    }));
  });
  runSuite('Removing', () => {
    it('should remove a document', w(async () => {
      const doc = new Sample({}).by('specs');
      const sample = await doc.save();
      await sample.remove();
      const fetchSample = await Sample.findById(sample._id).exec();
      should(fetchSample).be.equal(null);
    }));
  });
});

describe('Caller logging', () => {
  runSuite('Creating', () => {
    it('should set caller to the document being saved', w(async () => {
      const doc = new Sample({}).by('specs');
      await doc.save();
      const line = lineNumber();
      doc.should.have.a.property('_klLoggerSaveCallStack');
      doc._klLoggerSaveCallStack[0].includes(`${currentFileName}:${line - 1}:17`).should.be.ok();
    }));
    it('should set caller to the saved document', w(async () => {
      const doc = new Sample({}).by('specs');
      const sample = await doc.save();
      const line = lineNumber();
      sample.should.have.a.property('_klLoggerSaveCallStack');
      sample._klLoggerSaveCallStack[0].includes(`${currentFileName}:${line - 1}:32`).should.be.ok();
    }));
  });
  runSuite('Removing', () => {
    it('should set caller to the document being removed', w(async () => {
      const doc = new Sample({}).by('specs');
      const sample = await doc.save();
      const promise = sample.remove();
      const line = lineNumber();
      await promise;
      sample.should.have.a.property('_klLoggerRemoveCallStack');
      sample._klLoggerRemoveCallStack[0].includes(`${currentFileName}:${line - 1}:30`).should.be.ok();
    }));
  });
});

