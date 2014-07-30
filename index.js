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
    firstCommitAdditionInMinutes: 2 * 60
};

function main() {
    parseArgs();
    config = mergeDefaultsWithArgs(config);

    commits('.').then(function(commits) {
        var work = {
            total: {
                hours: estimateHours(_.pluck(commits, 'date')),
                commits: commits.length
            }
        };

        console.log(JSON.stringify(work, undefined, 2));
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
            '-b, --branches [branches]',
            'list of branches to calculate commits from e.g. master,dev. Default: all local branches',
            list
        )
        .option(
            '-d, --max-commit-diff [max-commit-diff]',
            'maximum difference in minutes between commits counted to one session. Default: ' + config.maxCommitDiffInMinutes,
            int
        )
        .option(
            '-a, --first-commit-add [first-commit-add]',
            'how many minutes first commit of session should add to total. Default: ' + config.firstCommitAdditionInMinutes,
            int
        );

    program.on('--help', function() {
        console.log('  Examples:');
        console.log('');
        console.log('   - Estimate hours of project');
        console.log('');
        console.log('       $ git-hours');
        console.log('');
        console.log('   - Estimate hours of development branch');
        console.log('');
        console.log('       $ git-hours --branches development');
        console.log('');
        console.log('   - Estimate hours in repository where developers commit more seldom: they might have 4h(240min) pause between commits');
        console.log('');
        console.log('       $ git-hours --max-commit-diff 240');
        console.log('');
        console.log('   - Estimate hours in repository where developer works 5 hours before first commit in day');
        console.log('');
        console.log('       $ git-hours --first-commit-add 300');
        console.log('');
        console.log('  For more details, visit https://github.com/kimmobrunfeldt/git-hours');
        console.log('');
    });

    program.parse(process.argv);
}

function mergeDefaultsWithArgs(config) {
    return {
        branches: program.branches || [],
        maxCommitDiffInMinutes: program.maxCommitDiff || config.maxCommitDiffInMinutes,
        firstCommitAdditionInMinutes: program.firstCommitAdd || config.firstCommitAdditionInMinutes
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
    // Promisifing nodegit did not work.
    return new Promise(function(resolve, reject) {
        git.Repo.open(gitPath, function(err, repo) {
            if (err) {
                reject(err);
                return;
            }

            var branchNames = config.branches;
            if (_.isEmpty(branchNames)) {
                // If no command line parameters set, get all branches
                branchNames = getBranchNames(gitPath);
            }

            Promise.map(branchNames, function(branchName) {
                return getBranch(repo, branchName);
            }).map(function(branch) {
                return getBranchCommits(branch);
            }).reduce(function(allCommits, branchCommits) {
                _.each(branchCommits, function(commit) {
                    allCommits.push(commit);
                });

                return allCommits;
            }, []).then(function(commits) {
                var uniqueCommits = _.uniq(commits, function(item, key, a) {
                    return item.sha;
                });

                resolve(uniqueCommits);
            }).catch(reject);
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

function getBranch(repo, name) {
    return new Promise(function(resolve, reject) {
        repo.getBranch(name, function(err, branch) {
            if (err) {
                reject(err);
                return;
            }

            resolve(branch);
        });
    });
}

function getBranchCommits(branch) {
    return new Promise(function(resolve, reject) {
        var history = branch.history();
        var commits = [];

        history.on("commit", function(commit) {
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

            commits.push(commitData);
        });

        history.on("end", function() {
            resolve(commits);
        });

        history.on("error", function(err) {
            reject(err);
        });

        // Start emitting events.
        history.start();
    });
}

main();
