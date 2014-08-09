#!/usr/bin/env node

var Promise = require('bluebird');
var program = require('commander');
var _ = require('lodash');

var fs = Promise.promisifyAll(require('fs'));
var path = require('path');
var exec = Promise.promisify(require('child_process').exec);

var EXEC_CONCURRENCY = 10;

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
        var authors = _.uniq(_.pluck(commits, 'author').concat(_.pluck(commits, 'committer')));

        var work = {
            total: {
                hours: estimateHours(_.pluck(commits, 'authorDate').concat(_.pluck(commits, 'committerDate'))),
                commits: commits.length
            }
        };

        authors.forEach(function (author) {
            var authorCommits = _.filter(commits, function (commit) { return commit.author === author; });
            var committerCommits = _.filter(commits, function (commit) { return commit.committer === author; });
            var dates = [].concat(
                _.pluck(authorCommits, 'authorDate'),
                _.pluck(committerCommits, 'committerDate'));

            work[author] = {
                hours: estimateHours(dates),
                commits: authorCommits.length
            };
        });

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
        console.log('       $ git hours');
        console.log('');
        console.log('   - Estimate hours of development branch');
        console.log('');
        console.log('       $ git hours --branches development');
        console.log('');
        console.log('   - Estimate hours in repository where developers commit more seldom: they might have 4h(240min) pause between commits');
        console.log('');
        console.log('       $ git hours --max-commit-diff 240');
        console.log('');
        console.log('   - Estimate hours in repository where developer works 5 hours before first commit in day');
        console.log('');
        console.log('       $ git hours --first-commit-add 300');
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

function verifyPack(packIdxFile) {
    // we have over 10M outputs from big projects!
    return exec("git verify-pack -v " + packIdxFile, { maxBuffer: 1024 * 1024 * 100 })
        .then(function (contents) {
            return contents.toString().match(/^[0-9a-z]{40} commit/mg).map(function (commit) {
                return commit.substr(0, 40);
            });
        });
}

function getObjects(gitPath) {
    var objectsPath = path.join(gitPath, ".git", "objects");

    return fs.readdirAsync(objectsPath).then(function (files) {
        var objectsDirs = files.filter(function (d) { return d.length == 2; });

        var objectsPromises = Promise.all(objectsDirs.map(function (prefix) {
            return fs.readdirAsync(path.join(objectsPath, prefix))
                .then(function (suffixes) {
                    return suffixes.map(function (suffix) { return prefix + suffix; });
                });
        }));

        var packs = [];

        if (_.contains(files, 'pack')) {
            packs = fs.readdirAsync(path.join(objectsPath, 'pack'))
                .then(function (packFiles) {
                    packFiles = packFiles
                        .filter(function (file) { return file.match(/\.idx$/); })
                        .map(function (file) { return path.join(objectsPath, 'pack', file); });
                    return Promise.all(packFiles.map(verifyPack));
                });
        }

        return Promise.join(objectsPromises, packs, function (o, p) {
            return _.flatten([o, p]);
        });
    });
}

function parseCommit(commit) {
    var author, committer;
    var authorDate, committerDate;
    var lines = commit.toString().split(/\n/);

    lines.forEach(function (line) {
        var m;

        // author
        m = line.match(/^author (.*) (\d+) ([-+]\d+)$/);
        if (m) {
            author = m[1];
            authorDate = new Date(m[2] * 1000);
            return;
        }

        // committer
        m = line.match(/^committer (.*) (\d+) ([-+]\d+)$/);
        if (m) {
            committer = m[1];
            committerDate = new Date(m[2] * 1000);
            return;
        }
    });

    return {
        author: author,
        committer: committer,
        authorDate: authorDate,
        committerDate: committerDate,
    };
}

function commits(gitPath) {
    return getObjects(gitPath)
        .filter(function (objectHash) {
            // This can be done in a single pass with "git cat-file --batch-check, requires providing stdin"
            return exec('git cat-file -t ' + objectHash).then(function (type) {
                return type[0].match(/^commit/);
            });
        }, { concurrency: EXEC_CONCURRENCY })
        .then(function (hashes) {
            return _.chain(hashes).sortBy().uniq(true).value();
        })
        .map(function (objectHash) {
            // This also can be done in a single pass with "git cat-file --batch"
            return exec('git cat-file -p ' + objectHash).then(parseCommit);
        }, { concurrency: EXEC_CONCURRENCY });
}

main();
