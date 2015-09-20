#!/usr/bin/env node

var fs = require('fs');

var Promise = require('bluebird');
var git = require('nodegit');
var program = require('commander');
var _ = require('lodash');

var exec = Promise.promisify(require('child_process').exec);

var config = {
    // Maximum time diff between 2 subsequent commits in minutes which are
    // counted to be in the same coding "session"
    maxCommitDiffInMinutes: 2 * 60,

    // How many minutes should be added for the first commit of coding session
    firstCommitAdditionInMinutes: 2 * 60,

    //Since data
    since: 'always'
};

function main() {
    parseArgs();
    config = mergeDefaultsWithArgs(config);
    parseSinceDate(config);

    commits('.').then(function(commits) {
        var commitsByEmail = _.groupBy(commits, function(commit) {
            return commit.author.email || 'unknown';
        });
        var authorWorks = _.map(commitsByEmail, function(authorCommits, authorEmail) {
            return {
                email: authorEmail,
                name: authorCommits[0].author.name,
                hours: estimateHours(_.pluck(authorCommits, 'date')),
                commits: authorCommits.length
            };
        });

        // XXX: This relies on the implementation detail that json is printed
        // in the same order as the keys were added. This is anyway just for
        // making the output easier to read, so it doesn't matter if it
        // isn't sorted in some cases.
        var sortedWork = {};
        _.each(_.sortBy(authorWorks, 'hours'), function(authorWork) {
            sortedWork[authorWork.email] = _.omit(authorWork, 'email');
        });

        var totalHours = _.reduce(sortedWork, function(sum, authorWork) {
            return sum + authorWork.hours;
        }, 0);
        sortedWork.total = {
            hours: totalHours,
            commits: commits.length
        };

        console.log(JSON.stringify(sortedWork, undefined, 2));
    }).catch(function(e) {
        console.error(e.stack);
    });
}

function parseArgs() {
    function list(val) {
        return val.split(',');
    }

    function int(val) {
        return parseInt(val, 10);
    }

    program
        .version(require('./package.json').version)
        .usage('[options]')
        .option(
            '-d, --max-commit-diff [max-commit-diff]',
            'maximum difference in minutes between commits counted to one session. Default: ' + config.maxCommitDiffInMinutes,
            int
        )
        .option(
            '-a, --first-commit-add [first-commit-add]',
            'how many minutes first commit of session should add to total. Default: ' + config.firstCommitAdditionInMinutes,
            int
        )
        .option(
            '-s, --since [since-certain-date]',
            'Analyze data since certain date. [always|yesterday|tonight|lastweek|yyyy-mm-dd] Default: ' + config.since,
            String
        );

    program.on('--help', function() {
        console.log('  Examples:');
        console.log('');
        console.log('   - Estimate hours of project');
        console.log('');
        console.log('       $ git hours');
        console.log('');
        console.log('   - Estimate hours in repository where developers commit more seldom: they might have 4h(240min) pause between commits');
        console.log('');
        console.log('       $ git hours --max-commit-diff 240');
        console.log('');
        console.log('   - Estimate hours in repository where developer works 5 hours before first commit in day');
        console.log('');
        console.log('       $ git hours --first-commit-add 300');
        console.log('');
        console.log('   - Estimate hours work in repository since yesterday');
        console.log('');
        console.log('       $ git hours --since yesterday');
        console.log('');
        console.log('   - Estimate hours work in repository since 2015-01-31');
        console.log('');
        console.log('       $ git hours --since 2015-01-31');
        console.log('');
        console.log('  For more details, visit https://github.com/kimmobrunfeldt/git-hours');
        console.log('');
    });

    program.parse(process.argv);
}

function parseSinceDate(options){
  switch(options.since){
    case 'tonight':
      var justNow = new Date();
      var tonight = new Date(justNow.getFullYear(), justNow.getMonth(), justNow.getUTCDate());
      config.since = tonight;
      break;
    case 'yesterday':
      var justNow = new Date();
      var tonight = new Date(justNow.getFullYear(), justNow.getMonth(), justNow.getUTCDate()-1);
      config.since = tonight;
      break;
    case 'lastweek':
      var justNow = new Date();
      var lastweek = new Date(justNow.getFullYear(), justNow.getMonth(), justNow.getUTCDate()-7);
      config.since = lastweek;
      break;
    case 'always':
      break;
    default:
      var paramDate = new Date(String(config.since));
      if(paramDate === undefined){
        config.since = 'always';
      }else{
        config.since = paramDate;
      }
  }
}

function mergeDefaultsWithArgs(config) {
    return {
        range: program.range,
        maxCommitDiffInMinutes: program.maxCommitDiff || config.maxCommitDiffInMinutes,
        firstCommitAdditionInMinutes: program.firstCommitAdd || config.firstCommitAdditionInMinutes,
        since: program.since || config.since
    };
}

// Estimates spent working hours based on commit dates
function estimateHours(dates) {
    if (dates.length < 2) {
        return 0;
    }

    // Oldest commit first, newest last
    var sortedDates = dates.sort(function(a, b) {
        return a - b;
    });
    var allButLast = _.take(sortedDates, sortedDates.length - 1);

    var hours = _.reduce(allButLast, function(hours, date, index) {
        var nextDate = sortedDates[index + 1];
        var diffInMinutes = (nextDate - date) / 1000 / 60;

        // Check if commits are counted to be in same coding session
        if (diffInMinutes < config.maxCommitDiffInMinutes) {
            return hours + (diffInMinutes / 60);
        }

        // The date difference is too big to be inside single coding session
        // The work of first commit of a session cannot be seen in git history,
        // so we make a blunt estimate of it
        return hours + (config.firstCommitAdditionInMinutes / 60);

    }, 0);

    return Math.round(hours);
}

// Promisify nodegit's API of getting all commits in repository
function commits(gitPath) {
    return git.Repository.open(gitPath)
    .then(function(repo) {
        var branchNames = getBranchNames(gitPath);

        return Promise.map(branchNames, function(branchName) {
            return getBranchLatestCommit(repo, branchName);
        })
        .map(function(branchLatestCommit) {
            return getBranchCommits(branchLatestCommit);
        })
        .reduce(function(allCommits, branchCommits) {
            _.each(branchCommits, function(commit) {
                allCommits.push(commit);
            });

            return allCommits;
        }, [])
        .then(function(commits) {
            // Multiple branches might share commits, so take unique
            var uniqueCommits = _.uniq(commits, function(item, key, a) {
                return item.sha;
            });

            return uniqueCommits;
        });
    });
}

function getBranchNames(gitPath) {
    var cmd = "git branch --no-color | awk -F ' +' '! /\\(no branch\\)/ {print $2}'";
    return new Promise(function(resolve, reject) {
        exec(cmd, {cwd: gitPath}, function(err, stdout, stderr) {
            if (err) {
                reject(err);
            }

            resolve(stdout
                    .split('\n')
                    .filter(function(e) { return e; })  // Remove empty
                    .map(function(str) { return str.trim(); })  // Trim whitespace
            );
        });
    });
}

function getBranches(repo, names) {
    var branches = [];
    for (var i = 0; i < names.length; ++i) {
        branches.push(getBranch(repo, names[i]));
    }

    return Promise.all(branches);
}

function getBranchLatestCommit(repo, branchName) {
    var type = git.Reference.TYPE.SYMBOLIC;

    return repo.getBranch(branchName).then(function(reference) {
        return repo.getBranchCommit(reference.name());
    });
}

function getBranchCommits(branchLatestCommit) {
    return new Promise(function(resolve, reject) {
        var history = branchLatestCommit.history();
        var commits = [];

        history.on('commit', function(commit) {
            var author = null;
            if (!_.isNull(commit.author())) {
                author = {
                    name: commit.author().name(),
                    email: commit.author().email()
                };
            }

            var commitData = {
                sha: commit.sha(),
                date: commit.date(),
                message: commit.message(),
                author: author
            };

            if(commitData.date > config.since || config.since === 'always'){
              commits.push(commitData);
            }
        });

        history.on('end', function() {
            resolve(commits);
        });

        history.on('error', function(err) {
            reject(err);
        });

        // Start emitting events.
        history.start();
    });
}

main();
