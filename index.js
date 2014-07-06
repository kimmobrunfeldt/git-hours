var Promise = require('bluebird');
var git = require('nodegit');
var moment = require('moment');
var _ = require('lodash');

var config = {
    // Maximum time diff between 2 subsequent commits in minutes which are
    // counted to be in the same coding "session"
    maxCommitDiffInMinutes: 240,

    // How many minutes should be added for the first commit of coding session
    firstCommitAdditionInMinutes: 60
}

function main() {
    commits('.').then(function(commits) {
        var work = {
            total: {
                hours: estimateHours(_.pluck(commits, 'date')),
                commits: commits.length
            }
        };

        console.log(JSON.stringify(work));
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
    var sortedDates = dates.sort().reverse();
    var hours = _.reduce(dates, function(hours, date, index) {
        var previousDate = dates[index - 1];
        var diffInMinutes = (date - previousDate) / 1000 / 60;

        // Check if commits are counted to be in same coding session
        if (diffInMinutes < config.maxCommitDiffInMinutes) {
            return hours + (diffInMinutes / 60);
        }

        // The date difference is too big to be inside single coding session
        // The work of first commit of a session cannot be seen in git history,
        // so we make a blunt estimate of it
        return hours + (config.firstCommitAdditionInMinutes / 60);
    }, 0);

    return hours;
}


// Promisify nodegit's API of getting all commits in repository
function commits(gitPath) {
    return new Promise(function(resolve, reject) {
        git.Repo.open(gitPath, function(err, repo) {
            if (err) {
                reject(err);
                return;
            }

            repo.getMaster(function(err, branch) {
                if (err) {
                    reject(err);
                    return;
                }

                var history = branch.history();
                var commits = [];

                history.on("commit", function(commit) {
                    var commitData = {
                        sha: commit.sha(),
                        date: commit.date(),
                        message: commit.message(),
                        author: {
                            name: commit.author().name(),
                            email: commit.author().email()
                        }
                    }

                    commits.push(commitData);
                });

                history.on("end", function() {
                    resolve(commits);
                });

                // Start emitting events.
                history.start();
            });
        });
    });
}

main();
