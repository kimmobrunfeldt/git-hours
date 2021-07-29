const assert = require('assert');
const { exec } = require('child_process');

let totalHoursCount;

describe('git-hours', () => {
  it('should output json', (done) => {
    exec('node ./src/index.js', (err, stdout, stderr) => {
      if (err !== null) {
        throw new Error(stderr);
      }
      const work = JSON.parse(stdout);
      assert.notEqual(work.total.hours.length, 0);
      assert.notEqual(work.total.commits.length, 0);
      totalHoursCount = work.total.hours;
      done();
    });
  });

  it('Should analyse since today', (done) => {
    exec('node ./src/index.js --since today', (err, stdout) => {
      assert.ifError(err);
      const work = JSON.parse(stdout);
      assert.strictEqual(typeof work.total.hours, 'number');
      done();
    });
  });

  it('Should analyse since yesterday', (done) => {
    exec('node ./src/index.js --since yesterday', (err, stdout) => {
      assert.ifError(err);
      const work = JSON.parse(stdout);
      assert.strictEqual(typeof work.total.hours, 'number');
      done();
    });
  });

  it('Should analyse since last week', (done) => {
    exec('node ./src/index.js --since lastweek', (err, stdout) => {
      assert.ifError(err);
      const work = JSON.parse(stdout);
      assert.strictEqual(typeof work.total.hours, 'number');
      done();
    });
  });

  it('Should analyse since a specific date', (done) => {
    exec('node ./src/index.js --since 2015-01-01', (err, stdout) => {
      assert.ifError(err);
      const work = JSON.parse(stdout);
      assert.notEqual(work.total.hours, 0);
      done();
    });
  });

  it('Should analyse as without param', (done) => {
    exec('node ./src/index.js --since always', (err, stdout) => {
      assert.ifError(err);
      const work = JSON.parse(stdout);
      assert.equal(work.total.hours, totalHoursCount);
      done();
    });
  });
});
