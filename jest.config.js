const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');

module.exports = {
    ...jestConfig,
    moduleNameMapper: {
        '^@salesforce/community/Id$': '<rootDir>/jest-mocks/community/Id',
        '^@salesforce/customPermission/(.*)$': '<rootDir>/jest-mocks/customPermission/$1'
    },
    modulePathIgnorePatterns: ['<rootDir>/.localdevserver']
};
