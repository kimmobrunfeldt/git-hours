# Contribution documentation

Pull requests and contributions are warmly welcome.
Please follow existing code style and commit message conventions. Also remember to keep documentation
updated.

**Pull requests:** You don't need to bump version numbers or modify anything related to releasing. That stuff is fully automated, just write the functionality.

## Get started with development

* [Install local environment](#install-environment).

## General project stuff

This package uses npm/node tools just in the developer environment. NPM scripts
are used to run tasks.

#### Versioning

Versioning follows [Semantic Versioning 2.0.0](http://semver.org/).
All versions are pushed as git tags.

## Install environment

Install tools needed for development:

    npm install


## Test

Tests are written with [Mocha](http://mochajs.org/).

Running tests:

    npm test

## Release

**Before releasing, make sure there are no uncommitted files,
and CI passes.**

Creating a new release of the package is simple:

1. Commit and push all changes
2. Run local tests and linters with `npm run ci`
3. Make sure Travis passes tests too.
4. Run `releasor`, which will create new tag and publish code to GitHub and NPM.
5. Edit GitHub release notes

By default, patch release is done. You can specify the version bump as a parameter:

    releasor --bump minor

Valid version bump values: `major`, `minor`, `patch`.
