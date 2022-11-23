#!/usr/bin/env node

const Promise = require('bluebird');
const _ = require('lodash');
const fs = require('fs');
const git = require('nodegit');
const moment = require('moment');
const program = require('commander');

const DATE_FORMAT = 'YYYY-MM-DD';

let config = {
  // Maximum time diff between 2 subsequent commits in minutes which are
  // counted to be in the same coding "session"
  maxCommitDiffInMinutes: 2 * 60,

  // How many minutes should be added for the first commit of coding session
  firstCommitAdditionInMinutes: 2 * 60,

  // Include commits since time x
  since: 'always',
  until: 'always',

  // Include merge requests
  mergeRequest: true,

  // Git repo
  gitPath: '.',

  // Aliases of emails for grouping the same activity as one person
  emailAliases: {
    'linus@torvalds.com': 'linus@linux.com',
  },
  branch: null,
};

// Estimates spent working hours based on commit dates
function estimateHours(dates) {
  if (dates.length < 2) {
    return 0;
  }

  // Oldest commit first, newest last
  const sortedDates = dates.sort((a, b) => a - b);
  const allButLast = _.take(sortedDates, sortedDates.length - 1);

  const totalHours = _.reduce(allButLast, (hours, date, index) => {
    const nextDate = sortedDates[index + 1];
    const diffInMinutes = (nextDate - date) / 1000 / 60;

    // Check if commits are counted to be in same coding session
    if (diffInMinutes < config.maxCommitDiffInMinutes) {
      return hours + diffInMinutes / 60;
    }

    // The date difference is too big to be inside single coding session
    // The work of first commit of a session cannot be seen in git history,
    // so we make a blunt estimate of it
    return hours + config.firstCommitAdditionInMinutes / 60;
  }, 0);

  return Math.round(totalHours);
}

function getBranchCommits(branchLatestCommit) {
  return new Promise((resolve, reject) => {
    const history = branchLatestCommit.history();
    const commits = [];

    history.on('commit', (commit) => {
      let author = null;
      if (!_.isNull(commit.author())) {
        author = {
          name: commit.author().name(),
          email: commit.author().email(),
        };
      }

      const commitData = {
        sha: commit.sha(),
        date: commit.date(),
        message: commit.message(),
        author,
      };

      let isValidSince = true;
      const sinceAlways = config.since === 'always' || !config.since;
      if (sinceAlways || moment(commitData.date.toISOString()).isAfter(config.since)) {
        isValidSince = true;
      } else {
        isValidSince = false;
      }

      let isValidUntil = true;
      const untilAlways = config.until === 'always' || !config.until;
      if (untilAlways || moment(commitData.date.toISOString()).isBefore(config.until)) {
        isValidUntil = true;
      } else {
        isValidUntil = false;
      }

      if (isValidSince && isValidUntil) {
        commits.push(commitData);
      }
    });
    history.on('end', () => resolve(commits));
    history.on('error', reject);

    // Start emitting events.
    history.start();
  });
}

function getBranchLatestCommit(repo, branchName) {
  return repo.getBranch(branchName).then((reference) => repo.getBranchCommit(reference.name()));
}

function getAllReferences(repo) {
  return repo.getReferenceNames(git.Reference.TYPE.ALL);
}

// Promisify nodegit's API of getting all commits in repository
function getCommits(gitPath, branch) {
  return git.Repository.open(gitPath)
    .then((repo) => {
      const allReferences = getAllReferences(repo);
      let filterPromise;

      if (branch) {
        filterPromise = Promise.filter(allReferences, (reference) => (reference === `refs/heads/${branch}`));
      } else {
        filterPromise = Promise.filter(allReferences, (reference) => reference.match(/refs\/heads\/.*/));
      }

      return filterPromise.map((branchName) => getBranchLatestCommit(repo, branchName))
        .map((branchLatestCommit) => getBranchCommits(branchLatestCommit))
        .reduce((allCommits, branchCommits) => {
          _.each(branchCommits, (commit) => {
            allCommits.push(commit);
          });

          return allCommits;
        }, [])
        .then((commits) => {
          // Multiple branches might share commits, so take unique
          const uniqueCommits = _.uniq(commits, (item) => item.sha);

          return uniqueCommits.filter((commit) => {
            // Exclude all commits starting with "Merge ..."
            if (!config.mergeRequest && commit.message.startsWith('Merge ')) {
              return false;
            }
            return true;
          });
        });
    });
}

function parseEmailAlias(value) {
  if (value.indexOf('=') > 0) {
    const email = value.substring(0, value.indexOf('=')).trim();
    const alias = value.substring(value.indexOf('=') + 1).trim();
    if (config.emailAliases === undefined) {
      config.emailAliases = {};
    }
    config.emailAliases[email] = alias;
  } else {
    console.error(`ERROR: Invalid alias: ${value}`);
  }
}

function mergeDefaultsWithArgs(conf) {

  const options = program.opts();
  return {
    range: options.range,
    maxCommitDiffInMinutes: options.maxCommitDiff || conf.maxCommitDiffInMinutes,
    firstCommitAdditionInMinutes: options.firstCommitAdd || conf.firstCommitAdditionInMinutes,
    since: options.since || conf.since,
    until: options.until || conf.until,
    gitPath: options.path || conf.gitPath,
    mergeRequest: options.mergeRequest !== undefined ? (options.mergeRequest === 'true') : conf.mergeRequest,
    branch: options.branch || conf.branch,
  };
}

function parseInputDate(inputDate) {
  switch (inputDate) {
    case 'today':
      return moment().startOf('day');
    case 'yesterday':
      return moment().startOf('day').subtract(1, 'day');
    case 'thisweek':
      return moment().startOf('week');
    case 'lastweek':
      return moment().startOf('week').subtract(1, 'week');
    case 'always':
      return 'always';
    default:
      // XXX: Moment tries to parse anything, results might be weird
      return moment(inputDate, DATE_FORMAT);
  }
}

function parseSinceDate(since) {
  return parseInputDate(since);
}

function parseUntilDate(until) {
  return parseInputDate(until);
}

function parseArgs() {
  function int(val) {
    return parseInt(val, 10);
  }

  program
    .version(require('../package.json').version)
    .usage('[options]')
    .option(
      '-d, --max-commit-diff [max-commit-diff]',
      `maximum difference in minutes between commits counted to one session. Default: ${config.maxCommitDiffInMinutes}`,
      int,
    )
    .option(
      '-a, --first-commit-add [first-commit-add]',
      `how many minutes first commit of session should add to total. Default: ${config.firstCommitAdditionInMinutes}`,
      int,
    )
    .option(
      '-s, --since [since-certain-date]',
      `Analyze data since certain date. [always|yesterday|today|lastweek|thisweek|yyyy-mm-dd] Default: ${config.since}`,
      String,
    )
    .option(
      '-e, --email [emailOther=emailMain]',
      'Group person by email address. Default: none',
      String,
    )
    .option(
      '-u, --until [until-certain-date]',
      `Analyze data until certain date. [always|yesterday|today|lastweek|thisweek|yyyy-mm-dd] Default: ${config.until}`,
      String,
    )
    .option(
      '-m, --merge-request [false|true]',
      `Include merge requests into calculation. Default: ${config.mergeRequest}`,
      String,
    )
    .option(
      '-p, --path [git-repo]',
      `Git repository to analyze. Default: ${config.gitPath}`,
      String,
    )
    .option(
      '-b, --branch [branch-name]',
      `Analyze only data on the specified branch. Default: ${config.branch}`,
      String,
    );

  program.on('--help', () => {
    console.log([
      '  Examples:',
      '   - Estimate hours of project',
      '       $ git-hours',
      '   - Estimate hours in repository where developers commit more seldom: they might have 4h(240min) pause between commits',
      '       $ git-hours --max-commit-diff 240',
      '   - Estimate hours in repository where developer works 5 hours before first commit in day',
      '       $ git-hours --first-commit-add 300',
      '   - Estimate hours work in repository since yesterday',
      '       $ git-hours --since yesterday',
      '   - Estimate hours work in repository since 2015-01-31',
      '       $ git-hours --since 2015-01-31',
      '   - Estimate hours work in repository on the "master" branch',
      '       $ git-hours --branch master',
      '  For more details, visit https://github.com/kimmobrunfeldt/git-hours',
    ].join('\n\n'));
  });

  program.parse(process.argv);
}

function exitIfShallow() {
  if (fs.existsSync('.git/shallow')) {
    console.log('Cannot analyze shallow copies!');
    console.log('Please run git fetch --unshallow before continuing!');
    process.exit(1);
  }
}

function main() {
  exitIfShallow();

  parseArgs();
  config = mergeDefaultsWithArgs(config);
  config.since = parseSinceDate(config.since);
  config.until = parseUntilDate(config.until);

  // Poor man`s multiple args support
  // https://github.com/tj/commander.js/issues/531
  for (let i = 0; i < process.argv.length; i += 1) {
    const k = process.argv[i];
    let n = i <= process.argv.length - 1 ? process.argv[i + 1] : undefined;
    if (k === '-e' || k === '--email') {
      parseEmailAlias(n);
    } else if (k.startsWith('--email=')) {
      n = k.substring(k.indexOf('=') + 1);
      parseEmailAlias(n);
    }
  }

  getCommits(config.gitPath, config.branch).then((commits) => {
    const commitsByEmail = _.groupBy(commits, (commit) => {
      let email = commit.author.email || 'unknown';
      if (config.emailAliases !== undefined && config.emailAliases[email] !== undefined) {
        email = config.emailAliases[email];
      }
      return email;
    });

    const authorWorks = _.map(commitsByEmail, (authorCommits, authorEmail) => ({
      email: authorEmail,
      name: authorCommits[0].author.name,
      hours: estimateHours(_.map(authorCommits, 'date')),
      commits: authorCommits.length,
    }));

    // XXX: This relies on the implementation detail that json is printed
    // in the same order as the keys were added. This is anyway just for
    // making the output easier to read, so it doesn't matter if it
    // isn't sorted in some cases.
    const sortedWork = {};

    _.each(_.sortBy(authorWorks, 'hours'), (authorWork) => {
      sortedWork[authorWork.email] = _.omit(authorWork, 'email');
    });

    const totalHours = _.reduce(sortedWork, (sum, authorWork) => sum + authorWork.hours, 0);

    sortedWork.total = {
      hours: totalHours,
      commits: commits.length,
    };

    console.log(JSON.stringify(sortedWork, undefined, 2));
  }).catch((e) => {
    console.error(e.stack);
  });
}

main();
