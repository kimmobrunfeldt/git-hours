#!/bin/bash
# NOTE: Run this only from project root!

# Run all commands and if one fails, return exit status of the last failed
# command

EXIT_STATUS=0

echo -e "\n--> Linting code..\n"
npm run jscs || EXIT_STATUS=$?
npm run eslint || EXIT_STATUS=$?

echo -e "\n--> Running tests..\n"
npm test || EXIT_STATUS=$?

exit $EXIT_STATUS
