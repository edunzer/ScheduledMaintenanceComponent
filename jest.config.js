const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');

module.exports = {
    ...jestConfig,
    moduleNameMapper: {
        '^@salesforce/customPermission/(.*)$': '<rootDir>/jest-mocks/customPermission/$1'
    },
    modulePathIgnorePatterns: ['<rootDir>/.localdevserver']
};
