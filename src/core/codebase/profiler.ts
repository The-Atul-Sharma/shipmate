import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CodebaseProfile, EMPTY_PROFILE, TestFramework } from './conventions';
import { getCached, setCached } from './cache';
import { git } from '../git/ops';
import { logger } from '../logger';

function readPkg(root: string): any {
  const file = path.join(root, 'package.json');
  if (!fs.existsSync(file)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function detectFramework(deps: Record<string, string>, root: string): TestFramework {
  if (deps.vitest) return 'vitest';
  if (deps.jest) return 'jest';
  if (deps.mocha) return 'mocha';
  if (fs.existsSync(path.join(root, 'pytest.ini')) || fs.existsSync(path.join(root, 'setup.cfg'))) {
    return 'pytest';
  }
  return 'unknown';
}

function detectTestStyle(deps: Record<string, string>): string[] {
  const style: string[] = [];
  if (deps['@testing-library/react']) style.push('RTL');
  if (deps.msw) style.push('msw');
  if (deps['@faker-js/faker']) style.push('faker');
  return style;
}

async function headSha(): Promise<string> {
  try {
    return (await git().revparse(['HEAD'])).trim();
  } catch {
    return 'no-head';
  }
}

export async function profileCodebase(
  ctx: vscode.ExtensionContext,
  force = false
): Promise<CodebaseProfile> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    return EMPTY_PROFILE;
  }
  const sha = await headSha();
  if (!force) {
    const cached = getCached(ctx, sha);
    if (cached) {
      return cached;
    }
  }

  const pkg = readPkg(root);
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

  const profile: CodebaseProfile = {
    testFramework: detectFramework(deps, root),
    testStyle: detectTestStyle(deps),
    codeStyle: {
      functionStyle: 'arrow',
      errorHandling: 'try/catch',
      naming: 'camelCase'
    },
    structure: {
      testsLocation: fs.existsSync(path.join(root, 'tests')) ? 'tests/' : 'colocated',
      utilsLocation: fs.existsSync(path.join(root, 'src/utils')) ? 'src/utils' : 'src/lib'
    },
    headSha: sha
  };

  await setCached(ctx, profile);
  logger.info(`Codebase profiled: ${profile.testFramework}, style=[${profile.testStyle.join(', ')}]`);
  return profile;
}
