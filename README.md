# Git hours

[![Build Status](https://travis-ci.org/kimmobrunfeldt/git-hours.svg)](https://travis-ci.org/kimmobrunfeldt/git-hours)

Estimate time spent on a git repository.

**For example time spent on [Twitter's Bootstrap](https://github.com/twbs/bootstrap)**

```javascript
➜  bootstrap git:(master) git hours
{

  ...

  "total": {
    "hours": 9959,
    "commits": 11470
  }
}
```

From a person working 8 hours per day, it would take more than 3 years to build Bootstrap.

*Please note that the information might not be accurate enough to be used in billing.*

## Install

    $ npm install -g git-hours

**NOTE: Use node version >=0.12.x.** *You can try to get nodegit working
with older versions too but 0.12.x was the easiest. With older node versions,
you might need to `npm install -g nodegit` too.*

`git-hours` depends on [nodegit](https://github.com/nodegit/nodegit).
It might be a bit tricky to install. If installing git-hours fails for some
reason, probably it was because nodegit couldn't be installed.
Check [their documentation](https://github.com/nodegit/nodegit#getting-started) for troubleshooting.

*Nodegit library has been a bit unstable and it might crash randomly.
They have fixed a lot of issues lately though.*

If the installation is too troublesome, you can try to [install with Vagrant](#install-with-vagrant). It should work out of the box once you get the Vagrant
correctly installed to your machine.

## How it works

The algorithm for estimating hours is quite simple. For each author in the commit history, do the following:

<br><br>

![](docs/step0.png)

*Go through all commits and compare the difference between
them in time.*

<br><br><br>

![](docs/step1.png)

*If the difference is smaller or equal then a given threshold, group the commits
to a same coding session.*

<br><br><br>

![](docs/step2.png)

*If the difference is bigger than a given threshold, the coding session is finished.*

<br><br><br>

![](docs/step3.png)

*To compensate the first commit whose work is unknown, we add extra hours to the coding session.*

<br><br><br>

![](docs/step4.png)

*Continue until we have determined all coding sessions and sum the hours
made by individual authors.*

<br>

The algorithm in [~30 lines of code](https://github.com/kimmobrunfeldt/git-hours/blob/master/index.js#L101-L130).

## Usage

In root of a git repository run:

    $ git hours

**Note: repository is not detected if you are not in the root of repository!**

Help

    Usage: githours [options]

    Options:

      -h, --help                                 output usage information
      -V, --version                              output the version number
      -d, --max-commit-diff [max-commit-diff]    maximum difference in minutes between commits counted to one session. Default: 120
      -a, --first-commit-add [first-commit-add]  how many minutes first commit of session should add to total. Default: 120

    Examples:

     - Estimate hours of project

         $ git hours

     - Estimate hours in repository where developers commit more seldom: they might have 4h(240min) pause between commits

         $ git hours --max-commit-diff 240

     - Estimate hours in repository where developer works 5 hours before first commit in day

         $ git hours --first-commit-add 300

    For more details, visit https://github.com/kimmobrunfeldt/git-hours


## Install with Vagrant

If you prefer to use vagrant, here's how:

[Vagrant](https://docs.vagrantup.com/v2/getting-started/) can be used to automatically
set up a disposable Virtual Machine with the required environment and install the
program.

```
$ git clone https://github.com/kimmobrunfeldt/git-hours
$ cd git-hours
$ vagrant up && vagrant ssh
```

And that's it, you can now test out git-hours. For example:

```
$ git clone https://github.com/twbs/bootstrap
$ cd bootstrap
$ git hours
{
  "total": {
    "hours": 6417,
    "commits": 9779
  }
}
```

Then when you are done playing around you can cleanly
[remove](https://docs.vagrantup.com/v2/cli/destroy.html) the vm from your
system by running:

```
$ exit
$ vagrant destroy -f
```

# For contributors

Documentation for git-hours developers.

## Release

* Commit all changes
* Run `grunt release`, which will create new tag and publish code to GitHub
* Edit GitHub release notes
* Release to NPM

        $ git checkout x.x.x
        $ npm publish


To see an example how to release minor/major, check https://github.com/geddski/grunt-release

## Test

Tests can be run with command

    $ grunt test

or

    $ npm test

You need to have *mocha* installed globally with `npm install -g mocha`.
