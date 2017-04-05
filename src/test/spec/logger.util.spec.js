/*  global describe, it, before, after, beforeEach, afterEach */
/*  eslint-disable func-names */
/*  eslint-disable no-loop-func */
import { Types } from 'mongoose';
const ObjectId = Types.ObjectId;
const clone = require('clone');
require('should');
const defaultTimeout = 1000;

import { w } from '../util';
import { getDelta } from '../../index';
import { Sample, runSuite } from '../test';

describe('Logger mongoose plugin', function () {
  this.timeout(defaultTimeout);
  describe('getDelta', () => {
    runSuite('for objects containing only scalars', () => {
      it('should return empty result for the same objects', done => {
        const a = { a1: 'a1', a2: 'a2' };
        const diff = getDelta(a, a, []);
        Object.keys(diff).should.have.lengthOf(0);
        done();
      });
      it('should return empty result for cloned objects', done => {
        const a = { a1: 'a1', a2: 'a2' };
        const diff = getDelta(a, clone(a, false), []);
        Object.keys(diff).should.have.lengthOf(0);
        done();
      });
      it('should return empty result for identical objects', done => {
        const a = { a1: 'a1', a2: 'a2' };
        const b = { a1: 'a1', a2: 'a2' };
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(0);
        done();
      });
      it('should return property that has been changed and it\'s new value', done => {
        const a = { a1: 'a1', a2: 'a2' };
        const b = clone(a, false);
        b.a1 = 'a11';
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(1);
        diff.should.have.a.property('a1', 'a11');
        done();
      });
      it('should return property that has been added and it\'s value', done => {
        const a = { a1: 'a1', a2: 'a2' };
        const b = clone(a, false);
        b.a3 = 'a3';
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(1);
        diff.should.have.a.property('a3', 'a3');
        done();
      });
      it('should return property that has been deleted with a flag \'$DELETED\' as it\'s name and in __deletedKeys array', done => {
        const a = { a1: 'a1', a2: 'a2' };
        const b = clone(a, false);
        delete b.a1;
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(2);
        diff.should.have.a.property('a1', '$DELETED');
        diff.should.have.a.property('__deletedKeys');
        diff.__deletedKeys.should.have.lengthOf(1);
        diff.__deletedKeys[0].should.be.equal('a1');
        done();
      });
    });
    runSuite('for objects containing arrays', () => {
      it('should return empty result for the same objects', done => {
        const a = { a1: ['a1'], a2: ['a2', ['a3']] };
        const diff = getDelta(a, a, []);
        Object.keys(diff).should.have.lengthOf(0);
        done();
      });
      it('should return empty result for cloned objects', done => {
        const a = { a1: ['a1'], a2: ['a2', ['a3']] };
        const diff = getDelta(a, clone(a, false), []);
        Object.keys(diff).should.have.lengthOf(0);
        done();
      });
      it('should return empty result for identical objects', done => {
        const a = { a1: ['a1'], a2: ['a2', ['a3']] };
        const b = { a1: ['a1'], a2: ['a2', ['a3']] };
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(0);
        done();
      });
      it('if modified an array element should return array property that has been changed and it\'s new value', done => {
        const a = { a1: ['a1'], a2: ['a2', ['a3']] };
        const b = clone(a, false);
        b.a1[0] = 'a11';
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(1);
        diff.should.have.a.property('a1');
        diff.a1.toString().should.be.equal(b.a1.toString());
        done();
      });
      it('if modified a subarray element should return array property that has been changed and it\'s new value', done => {
        const a = { a1: ['a1'], a2: ['a2', ['a3']] };
        const b = clone(a, false);
        b.a2[1][0] = 'a31';
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(1);
        diff.should.have.a.property('a2');
        diff.a2.toString().should.be.equal(b.a2.toString());
        done();
      });
      it('should return property that has been added and it\'s value', done => {
        const a = { a1: ['a1'], a2: ['a2', ['a3']] };
        const b = clone(a, false);
        b.a3 = ['a3'];
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(1);
        diff.should.have.a.property('a3');
        diff.a3.toString().should.be.equal(b.a3.toString());
        done();
      });
      it('should return property that has been deleted with a flag \'$DELETED\' as it\'s name and in __deletedKeys array', done => {
        const a = { a1: ['a1'], a2: ['a2', ['a3']] };
        const b = clone(a, true);
        delete b.a1;
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(2);
        diff.should.have.a.property('a1', '$DELETED');
        diff.should.have.a.property('__deletedKeys');
        diff.__deletedKeys.should.have.lengthOf(1);
        diff.__deletedKeys[0].should.be.equal('a1');
        done();
      });
    });
    runSuite('for objects containing other objects', () => {
      it('should return empty result for the same objects', done => {
        const a = { a1: { a11: 'a11' }, a2: ['a2', { a3: 'a3' }] };
        const diff = getDelta(a, a, []);
        Object.keys(diff).should.have.lengthOf(0);
        done();
      });
      it('should return empty result for cloned objects', done => {
        const a = { a1: { a11: 'a11' }, a2: ['a2', { a3: 'a3' }] };
        const diff = getDelta(a, clone(a, false), []);
        Object.keys(diff).should.have.lengthOf(0);
        done();
      });
      it('should return empty result for identical objects', done => {
        const a = { a1: { a11: 'a11' }, a2: ['a2', { a3: 'a3' }] };
        const b = { a1: { a11: 'a11' }, a2: ['a2', { a3: 'a3' }] };
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(0);
        done();
      });
      it('if modified an array element of subproperty should return array subproperty that has been changed and it\'s new value', done => {
        const a = { a1: { a11: 'a11' }, a2: ['a2', { a3: 'a3' }] };
        const b = clone(a, false);
        b.a2[1].a3 = 'a31';
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(1);
        diff.should.have.a.property('a2');
        diff.a2.toString().should.be.equal(b.a2.toString());
        done();
      });
      it('should return sub property that has been deleted with a flag \'$DELETED\' as it\'s name and in __deletedKeys array', done => {
        const a = { a1: { a11: 'a11' }, a2: ['a2', { a3: 'a3' }] };
        const b = clone(a, false);
        delete b.a1.a11;
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(1);
        diff.should.have.a.property('a1');
        Object.keys(diff.a1).should.have.lengthOf(2);
        diff.a1.should.have.a.property('__deletedKeys');
        diff.a1.should.have.a.property('a11', '$DELETED');
        diff.a1.__deletedKeys.should.have.lengthOf(1);
        diff.a1.__deletedKeys[0].should.be.equal('a11');
        done();
      });
      it('if modified a subarray element of subproperty should return array sub property that has been changed and it\'s new value', done => {
        const a = { a1: { a11: 'a11' }, a2: { a21: ['a211', 'a222'] } };
        const b = clone(a, false);
        b.a2.a21[1] = 'a223';
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(1);
        diff.should.have.a.property('a2');
        Object.keys(diff.a2).should.have.lengthOf(1);
        diff.a2.should.have.a.property('a21');
        diff.a2.a21.toString().should.be.equal(b.a2.a21.toString());
        done();
      });
    });
    runSuite('for objects containing ObjectIds', () => {
      it('should return empty result for the same objects', done => {
        const a = { a1: new ObjectId(), a2: new ObjectId() };
        const diff = getDelta(a, a, []);
        Object.keys(diff).should.have.lengthOf(0);
        done();
      });
      it('should return empty result for cloned objects', done => {
        const a = { a1: new ObjectId(), a2: new ObjectId() };
        const diff = getDelta(a, clone(a, true), []);
        Object.keys(diff).should.have.lengthOf(0);
        done();
      });
      it('should return empty result for identical objects', done => {
        const a = { a1: new ObjectId('111111111111111111111111'), a2: new ObjectId('222222222222222222222222') };
        const b = { a1: new ObjectId('111111111111111111111111'), a2: new ObjectId('222222222222222222222222') };
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(0);
        done();
      });
      it('should return property that has been changed and it\'s new value', done => {
        const a = { a1: new ObjectId('111111111111111111111111'), a2: new ObjectId('222222222222222222222222') };
        const b = clone(a, false);
        b.a1 = new ObjectId('333333333333333333333333');
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(1);
        diff.should.have.a.property('a1');
        diff.a1.toString().should.be.equal(b.a1.toString());
        done();
      });
      it('should return property that has been added and it\'s value', done => {
        const a = { a1: new ObjectId('111111111111111111111111'), a2: new ObjectId('222222222222222222222222') };
        const b = clone(a, false);
        b.a3 = new ObjectId('333333333333333333333333');
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(1);
        diff.should.have.a.property('a3');
        diff.a3.toString().should.be.equal(b.a3.toString());
        done();
      });
      it('should return property that has been deleted with a flag \'$DELETED\' as it\'s name and in __deletedKeys array', done => {
        const a = { a1: new ObjectId('111111111111111111111111'), a2: new ObjectId('222222222222222222222222') };
        const b = clone(a, false);
        delete b.a1;
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(2);
        diff.should.have.a.property('a1', '$DELETED');
        diff.should.have.a.property('__deletedKeys');
        diff.__deletedKeys.should.have.lengthOf(1);
        diff.__deletedKeys[0].should.be.equal('a1');
        done();
      });
    });
    runSuite('for mongoose models', () => {
      it('should return empty result for the same objects', done => {
        const a = new Sample({ name: 'a1' });
        const diff = getDelta(a, a, []);
        Object.keys(diff).should.have.lengthOf(0);
        done();
      });
      it('should return empty result for identical objects', done => {
        const a = new Sample({ name: 'a1' });
        const b = new Sample({ name: 'a1' });
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(1);
        diff.should.have.a.property('_id');
        done();
      });
      it('should return property that has been changed and it\'s new value', w(async () => {
        const a = await new Sample({ name: 'a1' }).by('specs').save();
        const b = await Sample.findById(a._id).by('specs').exec();
        b.name = 'a2';
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(1);
        diff.should.have.a.property('name', 'a2');
      }));
      it('should return property that has been added and it\'s value', done => {
        const a = {
          a1: new ObjectId('111111111111111111111111'),
          a2: new ObjectId('222222222222222222222222'),
        };
        const b = clone(a, true);
        b.a3 = new ObjectId('333333333333333333333333');
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(1);
        diff.should.have.a.property('a3');
        diff.a3.toString().should.be.equal(b.a3.toString());
        done();
      });
      it('should return property that has been deleted with a flag \'$DELETED\' as it\'s name and in __deletedKeys array', done => {
        const a = {
          a1: new ObjectId('111111111111111111111111'),
          a2: new ObjectId('222222222222222222222222'),
        };
        const b = clone(a, true);
        delete b.a1;
        const diff = getDelta(a, b, []);
        Object.keys(diff).should.have.lengthOf(2);
        diff.should.have.a.property('a1', '$DELETED');
        diff.should.have.a.property('__deletedKeys');
        diff.__deletedKeys.should.have.lengthOf(1);
        diff.__deletedKeys[0].should.be.equal('a1');
        done();
      });
    });
    runSuite('diff options', () => {
      it('should not return skipped path if it is changed', done => {
        const a = { a1: 'a11', a2: 'a21', a3: 'a31' };
        const b = clone(a, false);
        b.a2 = 'a22';
        const diff = getDelta(a, b, [], [], ['a2']);
        Object.keys(diff).should.have.lengthOf(0);
        done();
      });
    });
  });
});
