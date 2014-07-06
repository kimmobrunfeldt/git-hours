var Promise = require('bluebird');
var git = require('nodegit');
var moment = require('moment');
var _ = require('lodash');

function main() {
    commits('.').then(function(commits) {
        console.log(commits);

        var work = {
            total: {
                hours: estimateHours(_.pluck(commits, 'date'))
            }
        };

        console.log(JSON.stringify(work));
    }).catch(function(e) {
        console.error(e.stack);
    });
}

// Estimates spent working hours based on commit dates
function estimateHours(dates) {
    var sortedDates = dates.map(moment).sort();
    console.log(sortedDates);
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
