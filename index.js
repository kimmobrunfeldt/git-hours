#!/usr/bin/env node

var Promise = require('bluebird');
var git = require('nodegit');
var moment = require('moment');
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

            // Get all commits for all branches
            getBranchNames(gitPath).map(function(branchName) {
                console.log(branchName);
                return getBranch(repo, branchName);
            }).map(function(branch) {
                console.log(branch);
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
    var cmd = "git branch --no-color | awk -F ' +' '! /\(no branch\)/ {print $2}'";
    return exec(cmd, {cwd: gitPath}).then(function(stdout, stderr) {
        if (stderr) {
            throw new Error(stderr);
        }

        return stdout
                .filter(function(e) { return e; })  // Remove empty
                .map(function(str) { return str.trim(); });  // Trim whitespace
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
            reject(err)
        });

        // Start emitting events.
        history.start();
    });
}

main();
