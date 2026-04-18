module.exports = {
  preset: 'jest-preset-angular',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jsdom',
  testTimeout: 30000,
  testMatch: ['**/src/**/*.spec.ts', '**/tests/unit/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'html'],
  collectCoverageFrom: [
    'src/app/**/*.ts',
    '!src/app/**/*.spec.ts',
    '!src/app/**/index.ts',
    '!src/app/workers/*.ts',
    '!src/app/features/canvas/canvas-editor.component.ts',
    '!src/app/features/admin/admin-panel.component.ts',
    '!src/app/features/reviewer/reviewer-panel.component.ts',
    '!src/app/features/diagnostics/diagnostics.component.ts',
    '!src/app/features/backup/backup.component.ts',
    '!src/app/features/projects/project-list.component.ts',
    '!src/app/features/auth/login.component.ts',
    '!src/app/app.component.ts',
    '!src/app/app.routes.ts',
    '!src/app/app.config.ts',
    '!src/app/shared/components/*.ts'
  ],
  coverageDirectory: '.tmp/coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  transform: {
    '^.+\\.(ts|mjs|js|html)$': ['jest-preset-angular', {
      tsconfig: '<rootDir>/tsconfig.spec.json',
      stringifyContentPathRegex: '\\.(html|svg)$'
    }]
  },
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$|@angular|rxjs|idb)']
};
