// Imported by every *.spec.ts file as its first line so that
// jest-preset-angular's test-framework wiring runs AFTER Jest's
// describe/it globals are installed. (Jest 29 rejects the
// `setupFilesAfterEach` config key here, so we do it inline.)
import 'jest-preset-angular/setup-jest';
