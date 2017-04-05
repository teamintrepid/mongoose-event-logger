/* global describe, it  */
/* eslint-disable func-names, prefer-arrow-callback*/

const STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
const ARGUMENT_NAMES = /([^\s,]+)/g;
function getParamNames(func) {
  const fnStr = func.toString().replace(STRIP_COMMENTS, '');
  let result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
  if (result === null) {
    result = [];
  }
  return result;
}
export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
export const w = (fn) => {
  return async (done) => {
    try {
      const fnParams = getParamNames(fn);
      if (fnParams.length) {
        await fn(done);
      } else {
        await fn();
        done();
      }
    } catch (err) {
      done(err);
    }
  };
};
