const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');

module.exports = {
    ...jestConfig,
    moduleNameMapper: {
        '^@salesforce/community/Id$': '<rootDir>/jest-mocks/community/Id'
    },
    modulePathIgnorePatterns: ['<rootDir>/.localdevserver']
};
