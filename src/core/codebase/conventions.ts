export type TestFramework = 'vitest' | 'jest' | 'mocha' | 'pytest' | 'unknown';

export interface CodebaseProfile {
  testFramework: TestFramework;
  testStyle: string[];
  codeStyle: {
    functionStyle: 'arrow' | 'declaration' | 'mixed';
    errorHandling: string;
    naming: string;
  };
  structure: {
    testsLocation: string;
    utilsLocation: string;
  };
  headSha: string;
}

export const EMPTY_PROFILE: CodebaseProfile = {
  testFramework: 'unknown',
  testStyle: [],
  codeStyle: { functionStyle: 'mixed', errorHandling: 'try/catch', naming: 'camelCase' },
  structure: { testsLocation: 'colocated', utilsLocation: 'src/utils' },
  headSha: ''
};
